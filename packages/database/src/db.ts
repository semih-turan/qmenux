import pg from 'pg';

/**
 * Every unit of work runs in ONE explicit transaction that first switches to a
 * least-privilege role with `SET LOCAL ROLE` and sets transaction-local context
 * via `set_config(..., true)`. Nothing leaks across pooled connections (Neon
 * transaction pooling safe): COMMIT/ROLLBACK resets role and settings.
 */
export type DbRole = 'app' | 'auth' | 'platform' | 'public' | 'worker';

const ROLE_NAMES: Record<DbRole, string> = {
  app: 'qmenux_app',
  auth: 'qmenux_auth',
  platform: 'qmenux_platform',
  public: 'qmenux_public',
  worker: 'qmenux_worker',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface Tx {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export interface TenantContext {
  tenantId: string;
  userId: string | null;
}

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

export interface DbOptions {
  connectionString: string;
  max?: number;
  statementTimeoutMs?: number;
  ssl?: boolean;
}

export class Db {
  readonly pool: pg.Pool;
  private readonly statementTimeoutMs: number;

  constructor(opts: DbOptions) {
    this.pool = new pg.Pool({
      connectionString: opts.connectionString,
      max: opts.max ?? 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: opts.ssl ? { rejectUnauthorized: true } : undefined,
    });
    this.statementTimeoutMs = opts.statementTimeoutMs ?? 10_000;
  }

  /** Tenant-scoped work. RLS restricts every row to `ctx.tenantId`. */
  withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID_RE.test(ctx.tenantId)) throw new TenantContextError('invalid tenant context');
    if (ctx.userId !== null && !UUID_RE.test(ctx.userId)) throw new TenantContextError('invalid user context');
    return this.run('app', { 'app.tenant_id': ctx.tenantId, 'app.user_id': ctx.userId ?? '' }, fn);
  }

  /** Identity/session work for the given (optional) user. No tenant rows are visible. */
  withAuth<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (userId !== null && !UUID_RE.test(userId)) throw new TenantContextError('invalid user context');
    return this.run('auth', { 'app.user_id': userId ?? '' }, fn);
  }

  /** Platform operator work. Callers MUST have verified operator role + MFA first. */
  withPlatform<T>(operatorUserId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID_RE.test(operatorUserId)) throw new TenantContextError('invalid operator context');
    return this.run('platform', { 'app.user_id': operatorUserId }, fn);
  }

  /** Anonymous guest work: only EXECUTE on SECURITY DEFINER read-model functions. */
  withPublic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run('public', {}, fn);
  }

  withWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run('worker', {}, fn);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async run<T>(role: DbRole, settings: Record<string, string>, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let released = false;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${ROLE_NAMES[role]}`);
      await client.query(`SET LOCAL statement_timeout = ${Math.trunc(this.statementTimeoutMs)}`);
      // Explicitly clear every context key so a value can never survive from elsewhere.
      const all = { 'app.tenant_id': '', 'app.user_id': '', ...settings };
      for (const [key, value] of Object.entries(all)) {
        await client.query('SELECT set_config($1, $2, true)', [key, value]);
      }
      const tx: Tx = { query: (text, values) => client.query(text, values as unknown[]) };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        client.release(true);
        released = true;
      }
      throw err;
    } finally {
      if (!released) client.release();
    }
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
