'use client';
import { useCallback, useEffect, useState } from 'react';
import { problemMessage } from './messages';

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    title: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(problemMessage(code, title));
  }
  /** Field errors from VALIDATION_FAILED, keyed by the first path segment. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    const errs = (this.body.errors ?? []) as { path: string; message: string }[];
    for (const e of errs) {
      const key = String(e.path ?? '').split('.')[0] || '_';
      out[key] ??= e.message;
    }
    return out;
  }
}

type Init = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; json?: unknown; body?: Blob; contentType?: string };

/**
 * Calls the API through the same-origin BFF (/bff/…). The session cookie never leaves the server
 * side; the custom header plus Origin is the CSRF defence for unsafe methods.
 */
export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-qx-bff': '1', accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.body) {
    headers['content-type'] = init.contentType ?? init.body.type;
    body = init.body;
  }
  const method = init.method ?? (body ? 'POST' : 'GET');
  let res: Response;
  try {
    res = await fetch(`/bff/${path.replace(/^\//, '')}`, { method, headers, body, cache: 'no-store', credentials: 'same-origin' });
  } catch {
    throw new ApiProblem(0, 'NETWORK', 'Bağlantı kurulamadı');
  }
  if (res.status === 401) {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiProblem(401, 'UNAUTHENTICATED', 'Oturum sona erdi');
  }
  if (res.ok && method !== 'GET') cache.clear();
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiProblem(res.status, String(data.code ?? 'HTTP_ERROR'), String(data.title ?? 'Bir hata oluştu'), data);
  return data as T;
}

// Tiny stale-while-revalidate cache so tab switches render instantly; any successful write clears it.
const cache = new Map<string, unknown>();

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<ApiProblem | null>(null);
  const [loading, setLoading] = useState(path !== null && !cache.has(path));

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path);
      cache.set(path, d);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiProblem ? e : new ApiProblem(0, 'UNKNOWN', 'Bir hata oluştu'));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const cached = cache.get(path) as T | undefined;
    if (cached !== undefined) setData(cached);
    void load();
  }, [path, load]);

  return { data, error, loading: loading && data === undefined, refreshing: loading, reload: load, setData };
}

export const isProblem = (e: unknown, code?: string): e is ApiProblem => e instanceof ApiProblem && (code === undefined || e.code === code);

/**
 * Form submit state. Forms validate in Turkish before sending, so a server VALIDATION_FAILED is rare;
 * its field messages come from the schema library, so a neutral Turkish line is shown instead.
 */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setErrors({});
    try {
      await fn();
    } catch (err) {
      if (isProblem(err, 'VALIDATION_FAILED')) {
        const out: Record<string, string> = {};
        for (const k of Object.keys(err.fieldErrors())) out[k] = 'Bu alanı kontrol edin.';
        setErrors(Object.keys(out).length ? out : { _: err.message });
      } else setErrors({ _: err instanceof Error ? err.message : 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, errors, setErrors, run };
}
