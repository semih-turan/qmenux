import { type NextResponse } from 'next/server';
import { AuthError, boundedJson, call, config, cookie, csrfProof, fail, json, mutationHeaders, object, origin, sessionName } from './admin-server';
import { parseApplication, uuidPattern } from './onboarding-model';

export async function handleOnboarding(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const base = '/api/onboarding/applications';
    const match = url.pathname.match(/^\/api\/onboarding\/applications\/([0-9a-f-]+)(\/submit)?$/i);
    const id = match?.[1]?.toLowerCase();
    if (url.pathname !== base && (!id || !uuidPattern.test(id))) fail(404);
    const submit = !!match?.[2];
    const allowed = id ? [submit ? 'POST' : 'PATCH'] : ['GET', 'POST'];
    if (!allowed.includes(req.method)) {
      const res = json({ status: 'invalid_request' }, 405);
      res.headers.set('Allow', allowed.join(', '));
      return res;
    }
    const key = config('onboarding');
    if (url.origin !== origin || req.headers.get('host') !== 'admin.qmenux.com' || url.hash) fail(400);
    const session = cookie(req, sessionName);
    if (!session) fail(401);
    if (req.method === 'GET') {
      const after = url.searchParams.get('after');
      if ([...url.searchParams.keys()].some(name => name !== 'after') || url.searchParams.getAll('after').length > 1
        || (after !== null && !uuidPattern.test(after))) fail(400);
      const data = await call(key, 'internal/admin-onboarding/list', { session, limit: 20, ...(after ? { after } : {}) }, 'onboarding');
      if (!Array.isArray(data.items) || data.items.length > 20) fail(503);
      const items = data.items.map(parseApplication);
      if (new Set(items.map(item => item.id)).size !== items.length
        || (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || !uuidPattern.test(data.nextCursor)
          || items.length !== 20 || data.nextCursor !== items.at(-1)?.id))) fail(503);
      return json({ items, nextCursor: data.nextCursor });
    }
    if (url.search) fail(400);
    mutationHeaders(req);
    const csrf = csrfProof(req);
    const body = object(await boundedJson(req.body, 2048, AbortSignal.timeout(5_000), true));
    const fields = id ? (submit ? ['revision'] : ['name', 'revision']) : ['name', 'idempotencyKey'];
    if (Object.keys(body).length !== fields.length || fields.some(field => !Object.hasOwn(body, field))) fail(400);
    if (!submit && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200 || /[\x00-\x1f\x7f]/.test(body.name))) fail(400);
    if (id ? !Number.isInteger(body.revision) || (body.revision as number) < 1 || (body.revision as number) > 2147483647
      : typeof body.idempotencyKey !== 'string' || !uuidPattern.test(body.idempotencyKey)) fail(400);
    const path = id ? `drafts/${id}/${submit ? 'submit' : 'edit'}` : 'drafts';
    const data = await call(key, `internal/admin-onboarding/${path}`, { session, csrf, ...body as Record<string, string | number> }, 'onboarding');
    const application = parseApplication(data.application);
    if (id && (application.id !== id || !(submit ? ['PENDING_APPROVAL','REJECTED','APPROVED'] : ['DRAFT']).includes(application.status))) fail(503);
    return json({ application });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return json({ status: status === 503 ? 'unavailable' : status === 401 ? 'unauthorized'
      : status === 404 ? 'not_found' : status === 409 ? 'conflict' : 'invalid_request' }, status);
  }
}
