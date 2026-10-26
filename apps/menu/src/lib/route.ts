import 'server-only';
import { isLikelyBot } from '@qmenux/contracts';
import type { ZodType } from 'zod';
import { serverEnv } from './env';
import { menuSlug, readJson, sameOrigin } from './policy';

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const problem = (status: number, code: string) => json(status, { code });

/**
 * Shared front door for the guest write routes: the tenant comes from Host, the request must come
 * from a page on that same host, and the small JSON body must match the contract before anything
 * is forwarded.
 */
export async function guestWrite<T>(req: Request, schema: ZodType<T>): Promise<{ slug: string; body: T } | Response> {
  const host = req.headers.get('host');
  const slug = menuSlug(host, serverEnv().rootDomain);
  if (!slug) return problem(404, 'NOT_FOUND');
  if (!sameOrigin(req.headers.get('origin'), host)) return problem(403, 'FORBIDDEN_ORIGIN');
  const raw = await readJson(req);
  if (!raw.ok) return problem(raw.status, raw.status === 413 ? 'PAYLOAD_TOO_LARGE' : raw.status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'BAD_REQUEST');
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) return problem(422, 'VALIDATION_FAILED');
  return { slug, body: parsed.data };
}

/** Crawlers and link previews are answered as if counted, but nothing is forwarded (OD-11). */
export const fromBot = (req: Request) => isLikelyBot(req.headers.get('user-agent'));

export { json };
