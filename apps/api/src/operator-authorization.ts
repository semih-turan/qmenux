import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database } from './database.js';
import { secretHash } from './identity-store.js';
import { OperatorAccess, type AccessIdentity } from './operator-access.js';

export type AuthorizedOperator = Readonly<{ id: string; role: 'PLATFORM_ADMIN' }>;
// Trusted server adapter only; OperatorPasskeys supplies verified evidence, never browser claims.
export type OperatorMfaPolicy = (identity: AccessIdentity) => Promise<boolean>;
const validToken = (token: unknown): token is string => typeof token === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(token);

@Injectable()
export class OperatorAuthorization {
  constructor(private readonly access: OperatorAccess, private readonly database: Database) {}

  private async identity(assertion: unknown, mfa: OperatorMfaPolicy): Promise<AccessIdentity> {
    if (typeof mfa !== 'function') throw new ForbiddenException();
    const identity = await this.access.verify(assertion);
    try {
      if (await mfa(identity) === true) return identity;
    } catch { throw new ServiceUnavailableException({ status: 'unavailable' }); }
    throw new ForbiddenException();
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.begin();
    let clean = false;
    try {
      const result = await work(client);
      await client.query('COMMIT'); clean = true;
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); clean = true; } catch { /* Discard an unresettable client. */ }
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally { client.release(!clean); }
  }

  async signIn(assertion: unknown, mfa: OperatorMfaPolicy, previous?: unknown): Promise<string> {
    if (previous !== undefined && !validToken(previous)) throw new ForbiddenException();
    const identity = await this.identity(assertion, mfa);
    const token = randomBytes(32).toString('base64url');
    await this.transaction(async (client) => {
      const { rows } = await client.query<{ id: string | null }>('SELECT qmenux_operator.create_session($1,$2,$3,$4,$5) AS id',
        [identity.issuer, identity.subject, identity.audience, secretHash(token), previous ? secretHash(previous) : null]);
      if (!rows[0]?.id) throw new ForbiddenException();
    });
    return token;
  }

  async run<T>(assertion: unknown, token: unknown, permission: 'platform:read', mfa: OperatorMfaPolicy,
    work: (client: PoolClient, operator: AuthorizedOperator) => Promise<T>): Promise<T> {
    if (!validToken(token) || permission !== 'platform:read') throw new ForbiddenException();
    const identity = await this.identity(assertion, mfa);
    return this.transaction(async (client) => {
      const { rows } = await client.query<AuthorizedOperator>('SELECT * FROM qmenux_operator.read_session($1,$2,$3,$4)',
        [identity.issuer, identity.subject, identity.audience, secretHash(token)]);
      if (!rows[0] || rows[0].role !== 'PLATFORM_ADMIN') throw new ForbiddenException();
      return work(client, Object.freeze(rows[0]));
    });
  }

  async signOut(assertion: unknown, token: unknown): Promise<void> {
    if (!validToken(token)) throw new ForbiddenException();
    const identity = await this.access.verify(assertion);
    await this.transaction(async (client) => {
      await client.query('SELECT qmenux_operator.revoke_session($1,$2,$3,$4)', [identity.issuer, identity.subject, identity.audience, secretHash(token)]);
    });
  }
}
