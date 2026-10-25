import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Database } from './database.js';

const reserved = new Set(['admin', 'superman', 'api', 'www', 'auth', 'assets', 'qmenux', 'workspace', 'control']);
export type TenantContext = Readonly<{ id: string; slug: string }>;

export function tenantSlug(host: unknown): string {
  if (typeof host !== 'string' || host.length > 74 || /[^a-zA-Z0-9.-]/.test(host)) throw new NotFoundException();
  const match = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)\.qmenux\.com$/.exec(host.toLowerCase());
  const slug = match?.[1];
  if (!slug || reserved.has(slug) || slug.startsWith('xn--')) throw new NotFoundException();
  return slug;
}

@Injectable()
export class TenantTransactions {
  constructor(private readonly database: Database) {}

  // authorize is trusted server policy (membership/license or published-public-read), never request data.
  async run<T>(host: unknown,
    authorize: (tenant: TenantContext, client: PoolClient) => Promise<boolean>,
    work: (client: PoolClient, tenant: TenantContext) => Promise<T>): Promise<T> {
    const slug = tenantSlug(host);
    if (typeof authorize !== 'function') throw new ForbiddenException();
    const client = await this.database.begin();
    let clean = false;
    try {
      const { rows } = await client.query<{ id: string | null }>('SELECT qmenux.resolve_tenant_slug($1) AS id', [slug]);
      const id = rows[0]?.id;
      if (!id) throw new NotFoundException();
      const tenant = Object.freeze({ id, slug });
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
      if (await authorize(tenant, client) !== true) throw new ForbiddenException();
      const result = await work(client, tenant);
      await client.query('COMMIT');
      clean = true;
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); clean = true; } catch { /* Destroy an unresettable connection. */ }
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally {
      client.release(!clean);
    }
  }
}
