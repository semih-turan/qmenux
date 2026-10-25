import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

@Injectable()
export class DatabaseReadiness implements OnModuleDestroy {
  private pool?: Pool;

  async isReady(): Promise<boolean> {
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
          || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return false;
        this.pool = new Pool({ connectionString: url.href, max: 1, idleTimeoutMillis: 5000,
          connectionTimeoutMillis: 5000, query_timeout: 5000, allowExitOnIdle: true, enableChannelBinding: true });
        attachDatabasePool(this.pool);
        // Request failures return 503; idle pool errors must not crash a Function.
        this.pool.on('error', () => {});
      }
      const { rows } = await this.pool.query<{ safe: boolean }>(`SELECT
        current_user = 'qmenux_runtime' AND NOT (rolsuper OR rolbypassrls OR rolcreatedb
          OR rolcreaterole OR rolreplication OR rolinherit)
        AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member = pg_roles.oid)
        AND NULLIF(current_setting('app.tenant_id', true), '') IS NULL AS safe
        FROM pg_roles WHERE rolname = current_user`);
      return rows.length === 1 && rows[0]?.safe === true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
