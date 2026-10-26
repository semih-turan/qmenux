import { scanEventSchema } from '@qmenux/contracts';
import { fromBot, guestWrite, json, problem } from '@/lib/route';
import { upstream } from '@/lib/upstream';

/** One QR/table landing. Aggregated per day by the API; nothing here identifies the guest. */
export async function POST(req: Request) {
  const g = await guestWrite(req, scanEventSchema);
  if (g instanceof Response) return g;
  if (fromBot(req)) return json(202, { accepted: true });
  try {
    const res = await upstream(`/v1/public/menus/${g.slug}/scans`, { method: 'POST', body: g.body, reqHeaders: req.headers });
    return json(res.status === 202 ? 202 : res.status, { accepted: res.status === 202 });
  } catch {
    return problem(502, 'UPSTREAM_UNAVAILABLE');
  }
}
