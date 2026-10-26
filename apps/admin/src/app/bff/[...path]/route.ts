import { NextResponse, type NextRequest } from 'next/server';
import { csrfOk, forwardableContentType, MAX_BODY_BYTES, upstreamPath } from '@/lib/bff-policy';
import { serverEnv } from '@/lib/env';
import { upstream } from '@/lib/upstream';

type Ctx = { params: Promise<{ path: string[] }> };

const problem = (status: number, code: string, title: string) =>
  NextResponse.json({ code, title }, { status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } });

/**
 * Same-origin proxy: the browser never sees the session token or talks to the API directly,
 * so the API needs no CORS and no browser-held credentials.
 */
async function proxy(req: NextRequest, ctx: Ctx) {
  const env = serverEnv();
  const path = upstreamPath((await ctx.params).path);
  if (!path) return problem(404, 'NOT_FOUND', 'Bulunamadı');
  if (!csrfOk(req.method, req.headers.get('origin'), req.headers.get('x-qx-bff'), env.adminOrigin)) return problem(403, 'CSRF', 'İstek reddedildi');

  let body: ArrayBuffer | null = null;
  let contentType: string | undefined;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return problem(413, 'PAYLOAD_TOO_LARGE', 'Dosya çok büyük');
    const kind = forwardableContentType(req.headers.get('content-type'));
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) return problem(413, 'PAYLOAD_TOO_LARGE', 'Dosya çok büyük');
    if (buf.byteLength > 0) {
      if (!kind) return problem(415, 'UNSUPPORTED_MEDIA', 'Desteklenmeyen içerik türü');
      body = buf;
      contentType = req.headers.get('content-type')!.split(';')[0]!.trim().toLowerCase();
    }
  }

  const res = await upstream(`${path}${req.nextUrl.search}`, {
    method: req.method,
    body,
    contentType,
    token: req.cookies.get(env.cookies.session)?.value ?? null,
    reqHeaders: req.headers,
  });
  const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status });
  const ct = res.headers.get('content-type');
  if (ct) out.headers.set('content-type', ct);
  const retry = res.headers.get('retry-after');
  if (retry) out.headers.set('retry-after', retry);
  // PDF exports: keep the API's file name so the browser saves "menu-v4.pdf", not "file".
  const disposition = res.headers.get('content-disposition');
  if (disposition) out.headers.set('content-disposition', disposition);
  out.headers.set('cache-control', 'no-store');
  if (res.status === 401) out.cookies.delete(env.cookies.session);
  return out;
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
