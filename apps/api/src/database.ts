import { Injectable, Optional, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

@Injectable()
export class Database implements OnModuleDestroy {
  constructor(@Optional() private pool?: Pool) {}

  async begin(): Promise<PoolClient> {
    let client: PoolClient | undefined;
    try {
      if (!this.pool) {
        const url = new URL(process.env.DATABASE_URL ?? '');
        if (!['postgres:', 'postgresql:'].includes(url.protocol)
          || decodeURIComponent(url.username) !== 'qmenux_runtime'
          || !/^ep-[a-z0-9-]+-pooler\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)
          || !url.password || url.port || url.hash
          || url.searchParams.size !== 2
          || url.searchParams.get('sslmode') !== 'verify-full'
          || url.searchParams.get('channel_binding') !== 'require'
          || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Invalid runtime configuration');
        this.pool = new Pool({ connectionString: url.href, max: 2, idleTimeoutMillis: 5000,
          connectionTimeoutMillis: 5000, query_timeout: 5000, allowExitOnIdle: true, enableChannelBinding: true });
        attachDatabasePool(this.pool);
        // Request failures return 503; idle pool errors must not crash a Function.
        this.pool.on('error', () => {});
      }
      client = await this.pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query<{ safe: boolean }>(`SELECT
        current_user = 'qmenux_runtime' AND NOT (rolsuper OR rolbypassrls OR rolcreatedb
          OR rolcreaterole OR rolreplication OR rolinherit)
        AND NOT EXISTS (SELECT FROM pg_catalog.pg_auth_members WHERE member = roles.oid)
        AND NULLIF(pg_catalog.current_setting('app.tenant_id', true), '') IS NULL AS safe
        FROM pg_catalog.pg_roles AS roles WHERE rolname = current_user`);
      if (rows.length !== 1 || rows[0]?.safe !== true) throw new Error('Unsafe runtime connection');
      return client;
    } catch {
      client?.release(true);
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }

  async isReady(): Promise<boolean> {
    let client: PoolClient | undefined;
    let clean = false;
    try {
      client = await this.begin();
      await client.query('ROLLBACK');
      clean = true;
      return true;
    } catch {
      return false;
    } finally {
      client?.release(!clean);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
