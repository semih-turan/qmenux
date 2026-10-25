import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database } from './database.js';

export const secretHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type IdentityProvider = 'google' | 'microsoft' | 'apple';
const issuers = { google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0', apple: 'https://appleid.apple.com' };
const issuerFor = (provider: IdentityProvider): string => {
  if (!Object.hasOwn(issuers, provider)) throw new ForbiddenException();
  return issuers[provider];
};
export type RegisteredUser = Readonly<{ id: string; status: 'REGISTERED' }>;
export type TenantMembership = Readonly<{ userId: string; role: 'OWNER' | 'EDITOR' }>;

@Injectable()
export class IdentityStore {
  constructor(private readonly database: Database) {}

  private async query<T extends import('pg').QueryResultRow>(sql: string, values: (string | null)[]): Promise<T[]> {
    const client = await this.database.begin();
    let clean = false;
    try {
      const { rows } = await client.query<T>(sql, values);
      await client.query('COMMIT');
      clean = true;
      return rows;
    } catch {
      try { await client.query('ROLLBACK'); clean = true; } catch { /* Discard unresettable clients. */ }
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally { client.release(!clean); }
  }

  async begin(state: string, browser: string, verifier: string, nonce: string): Promise<void> {
    await this.query('SELECT qmenux_identity.begin_login($1,$2,$3,$4)', [secretHash(state), secretHash(browser), verifier, nonce]);
  }

  async consume(state: string, browser: string): Promise<{ verifier: string; nonce: string } | undefined> {
    // Commit consumption before contacting the provider: failed callbacks cannot be replayed.
    return (await this.query<{ verifier: string; nonce: string }>('SELECT * FROM qmenux_identity.consume_login($1,$2)',
      [secretHash(state), secretHash(browser)]))[0];
  }

  async createSession(subject: string, token: string, previous?: string): Promise<string | null> {
    return (await this.query<{ id: string | null }>('SELECT qmenux_identity.create_session($1,$2,$3) AS id',
      [subject, secretHash(token), previous ? secretHash(previous) : null]))[0]!.id;
  }

  async beginMicrosoft(state: string, browser: string, verifier: string, nonce: string): Promise<void> {
    await this.query('SELECT qmenux_identity.begin_microsoft_login($1,$2,$3,$4)',
      [secretHash(state), secretHash(browser), verifier, nonce]);
  }

  async consumeMicrosoft(state: string, browser: string): Promise<{ verifier: string; nonce: string } | undefined> {
    return (await this.query<{ verifier: string; nonce: string }>('SELECT * FROM qmenux_identity.consume_microsoft_login($1,$2)',
      [secretHash(state), secretHash(browser)]))[0];
  }

  async createMicrosoftSession(subject: string, token: string, previous?: string): Promise<string | null> {
    return (await this.query<{ id: string | null }>('SELECT qmenux_identity.create_microsoft_session($1,$2,$3) AS id',
      [subject, secretHash(token), previous ? secretHash(previous) : null]))[0]!.id;
  }

  async beginApple(state: string, browser: string, nonce: string): Promise<void> {
    await this.query('SELECT qmenux_identity.begin_apple_login($1,$2,$3)',
      [secretHash(state), secretHash(browser), nonce]);
  }

  async consumeApple(state: string, browser: string): Promise<{ nonce: string } | undefined> {
    return (await this.query<{ nonce: string }>('SELECT * FROM qmenux_identity.consume_apple_login($1,$2)',
      [secretHash(state), secretHash(browser)]))[0];
  }

  async createAppleSession(subject: string, token: string, previous?: string): Promise<string | null> {
    return (await this.query<{ id: string | null }>('SELECT qmenux_identity.create_apple_session($1,$2,$3) AS id',
      [subject, secretHash(token), previous ? secretHash(previous) : null]))[0]!.id;
  }

  async beginAdmin(provider: IdentityProvider, state: string, browser: string, verifier: string | null, nonce: string): Promise<void> {
    await this.query('SELECT qmenux_identity.begin_admin_login($1,$2,$3,$4,$5)',
      [issuerFor(provider), secretHash(state), secretHash(browser), verifier, nonce]);
  }

  async consumeAdmin(provider: IdentityProvider, state: string, browser: string): Promise<{ verifier: string | null; nonce: string } | undefined> {
    return (await this.query<{ verifier: string | null; nonce: string }>('SELECT * FROM qmenux_identity.consume_admin_login($1,$2,$3)',
      [issuerFor(provider), secretHash(state), secretHash(browser)]))[0];
  }

  async createAdminSession(provider: IdentityProvider, subject: string, token: string, csrf: string, previous?: string): Promise<string | null> {
    return (await this.query<{ id: string | null }>('SELECT qmenux_identity.create_admin_session($1,$2,$3,$4,$5) AS id',
      [issuerFor(provider), subject, secretHash(token), secretHash(csrf), previous ? secretHash(previous) : null]))[0]!.id;
  }

  async readAdminSession(token: string): Promise<RegisteredUser | undefined> {
    return (await this.query<RegisteredUser>('SELECT * FROM qmenux_identity.read_admin_session($1)', [secretHash(token)]))[0];
  }

  async revokeAdminSession(token: string, csrf: string): Promise<boolean> {
    return (await this.query<{ revoked: boolean }>('SELECT qmenux_identity.revoke_admin_session($1,$2) AS revoked',
      [secretHash(token), secretHash(csrf)]))[0]!.revoked;
  }

  async readSession(token: string): Promise<RegisteredUser | undefined> {
    return (await this.query<RegisteredUser>('SELECT * FROM qmenux_identity.read_session($1)', [secretHash(token)]))[0];
  }

  async revokeSession(token: string): Promise<void> {
    await this.query('SELECT qmenux_identity.revoke_session($1)', [secretHash(token)]);
  }

  async adminTenantMembership(client: PoolClient, token: string, csrf?: string): Promise<TenantMembership | undefined> {
    return (await client.query<TenantMembership>('SELECT * FROM qmenux_identity.admin_tenant_membership($1,$2)',
      [secretHash(token), csrf === undefined ? null : secretHash(csrf)])).rows[0];
  }

  async tenantMembership(client: PoolClient, token: string): Promise<TenantMembership | undefined> {
    // Use the caller's checked-out tenant transaction, never a second pooled query.
    return (await client.query<TenantMembership>('SELECT * FROM qmenux_identity.tenant_membership($1)', [secretHash(token)])).rows[0];
  }
}
