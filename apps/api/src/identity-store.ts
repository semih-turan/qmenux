import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Database } from './database.js';

export const secretHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type RegisteredUser = Readonly<{ id: string; status: 'REGISTERED' }>;

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

  async readSession(token: string): Promise<RegisteredUser | undefined> {
    return (await this.query<RegisteredUser>('SELECT * FROM qmenux_identity.read_session($1)', [secretHash(token)]))[0];
  }

  async revokeSession(token: string): Promise<void> {
    await this.query('SELECT qmenux_identity.revoke_session($1)', [secretHash(token)]);
  }
}
