import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const origin = 'https://admin.qmenux.com';
const api = 'https://api.qmenux.com';
export const proofPattern = /^[A-Za-z0-9_-]{43}$/;
export const sessionName = '__Host-qmenux_admin_session';
export const csrfName = '__Host-qmenux_admin_csrf';

export class AuthError extends Error {
  constructor(readonly status: number) { super('Auth request failed'); }
}
export function fail(status: number): never { throw new AuthError(status); }
export const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export function cookie(req: Request, name: string): string | undefined {
  const entries = (req.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.split('=')[0] === name);
  if (!entries.length) return undefined;
  if (entries.length !== 1) fail(400);
  const value = entries[0]!.slice(name.length + 1);
  if (!proofPattern.test(value)) fail(400);
  return value;
}
export function setCookie(res: NextResponse, name: string, value: string, maxAge: number, httpOnly = true) {
  res.cookies.set(name, value, { secure: true, httpOnly, sameSite: 'lax', path: '/', maxAge });
}
export function config(kind: 'auth' | 'onboarding' = 'auth'): string {
  const key = process.env[kind === 'auth' ? 'ADMIN_BFF_SECRET' : 'ADMIN_ONBOARDING_SECRET'];
  if (process.env.ADMIN_AUTH_ENABLED !== 'true' || process.env.VERCEL_ENV === 'preview' || !key || !proofPattern.test(key)
    || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    || (kind === 'onboarding' && (process.env.ADMIN_ONBOARDING_ENABLED !== 'true'
      || key === process.env.ADMIN_BFF_SECRET || key === process.env.CRON_SECRET))) fail(503);
  return key;
}

export async function boundedJson(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal, flat = false): Promise<unknown> {
  if (!body) fail(400);
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      if (signal.aborted) fail(503);
      const part = await reader.read();
      if (signal.aborted) fail(503);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) fail(413);
      chunks.push(part.value);
    }
    try {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const value: unknown = JSON.parse(raw);
      if (flat) {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || Object.values(value).some(item => typeof item !== 'string' && (typeof item !== 'number' || !Number.isFinite(item)))) fail(400);
        const keys = new Set<string>();
        for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"\s*:?/g)) {
          const token = match[0].trim();
          if (!token.endsWith(':')) continue;
          const key = JSON.parse(token.slice(0,-1)) as string;
          if (keys.has(key)) fail(400);
          keys.add(key);
        }
      }
      return value;
    } catch { fail(400); }
  } finally {
    signal.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(503);
  return value as Record<string, unknown>;
}
export async function call(key: string, path: string, body?: Record<string, string | number>, kind: 'auth' | 'onboarding' = 'auth'): Promise<Record<string, unknown>> {
  try {
    const signal = AbortSignal.timeout(10_000);
    const res = await fetch(`${api}/v1/${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', signal,
      headers: body ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      fail((kind === 'onboarding' ? [400,401,404,409] : [401]).includes(res.status) ? res.status : 503);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(res.headers.get('content-type') ?? '')) {
      void res.body?.cancel().catch(() => {}); fail(503);
    }
    return object(await boundedJson(res.body, kind === 'auth' ? 16_384 : 32_768, signal));
  } catch (error) {
    if (error instanceof AuthError && (kind === 'onboarding' ? [400,401,404,409] : [401]).includes(error.status)) throw error;
    fail(503);
  }
}

export function mutationHeaders(req: Request) {
  if (req.headers.get('origin') !== origin || req.headers.get('x-qmenux-request') !== '1'
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type') ?? '')
    || req.headers.has('content-encoding')) fail(400);
}
export function csrfProof(req: Request): string {
  const csrf = cookie(req, csrfName), supplied = req.headers.get('x-csrf-token');
  if (!csrf || !supplied || !proofPattern.test(supplied)
    || !timingSafeEqual(Buffer.from(csrf), Buffer.from(supplied))) fail(400);
  return csrf;
}
