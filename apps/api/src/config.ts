import { DEFAULT_APEX_DOMAINS } from '@qmenux/contracts';

export interface OidcClientConfig {
  clientId: string;
  clientSecret?: string;
}

export interface AppleClientConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export interface ApiConfig {
  isProduction: boolean;
  databaseUrl: string;
  rootDomain: string;
  apexDomains: string[];
  /** Exact origins of the first-party BFFs (OIDC redirect URIs are derived from these). */
  origins: { admin: string; ops: string; api: string };
  graceDays: number;
  tokenPepper: Buffer;
  dataKey: Buffer;
  devIdp: boolean;
  google?: OidcClientConfig;
  microsoft?: OidcClientConfig & { tenant: string };
  apple?: AppleClientConfig;
  sessions: { adminTtlS: number; adminIdleS: number; opsTtlS: number; opsIdleS: number };
  mediaDir: string;
  publicMediaBaseUrl: string | null;
  /**
   * Shared secret between the first-party Next.js servers (BFFs) and the API. Only a request
   * carrying it may state the end-user IP for rate limiting (all BFF traffic shares one egress IP).
   */
  bffKey: Buffer | null;
}

export class ConfigError extends Error {}

function key(env: NodeJS.ProcessEnv, name: string): Buffer {
  const raw = env[name];
  const buf = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  if (buf.length !== 32) throw new ConfigError(`${name} must be 32 random bytes, base64 encoded`);
  return buf;
}

function missing(name: string): never {
  throw new ConfigError(`${name} is required in production`);
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const v = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isInteger(v) || v < min || v > max) throw new ConfigError(`${name} must be an integer in [${min}, ${max}]`);
  return v;
}

/** Fails closed: missing keys or a dev IdP in production stop the process at startup. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const isProduction = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new ConfigError('DATABASE_URL is not set');

  const rootDomain = env.QX_ROOT_DOMAIN || (isProduction ? 'qmenux.com' : 'qmenux.localhost');
  if (!(DEFAULT_APEX_DOMAINS as readonly string[]).includes(rootDomain)) throw new ConfigError(`unsupported QX_ROOT_DOMAIN ${rootDomain}`);
  const local = rootDomain.endsWith('.localhost');
  const origin = (sub: string, port: number) => (local ? `http://${sub}.${rootDomain}:${port}` : `https://${sub}.${rootDomain}`);

  const devIdp = env.QX_DEV_IDP === '1';
  if (devIdp && isProduction) throw new ConfigError('QX_DEV_IDP must never be enabled in production');

  const google = env.GOOGLE_CLIENT_ID ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : undefined;
  const microsoft = env.MICROSOFT_CLIENT_ID
    ? { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tenant: env.MICROSOFT_TENANT || 'consumers' }
    : undefined;
  const apple =
    env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY
      ? { clientId: env.APPLE_CLIENT_ID, teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n') }
      : undefined;

  return {
    isProduction,
    databaseUrl,
    rootDomain,
    apexDomains: [rootDomain],
    origins: {
      admin: env.QX_ADMIN_ORIGIN || origin('admin', 3001),
      ops: env.QX_OPS_ORIGIN || origin('superman', 3002),
      api: env.QX_API_ORIGIN || origin('api', 4000),
    },
    graceDays: int(env, 'QX_LICENSE_GRACE_DAYS', 7, 0, 60),
    tokenPepper: key(env, 'QX_TOKEN_PEPPER'),
    dataKey: key(env, 'QX_DATA_KEY'),
    devIdp,
    google,
    microsoft,
    apple,
    sessions: {
      adminTtlS: 30 * 86400,
      adminIdleS: 7 * 86400,
      // Operator sessions are short and expire quickly when idle.
      opsTtlS: 12 * 3600,
      opsIdleS: 30 * 60,
    },
    mediaDir: env.QX_MEDIA_DIR || '.local/media',
    publicMediaBaseUrl: env.R2_PUBLIC_BASE_URL || null,
    bffKey: env.QX_BFF_SHARED_KEY ? key(env, 'QX_BFF_SHARED_KEY') : isProduction ? missing('QX_BFF_SHARED_KEY') : null,
  };
}
