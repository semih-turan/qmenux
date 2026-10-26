import { uuid } from '@qmenux/contracts';
import { z } from 'zod';
import { fromBot, guestWrite, json, problem } from '@/lib/route';
import { upstream } from '@/lib/upstream';

// Same contract the API enforces. Search terms are never sent, only that a search happened.
const metricSchema = z.object({
  metric: z.enum(['item_view', 'category_view', 'search', 'wifi_reveal', 'whatsapp_click', 'pdf_download']),
  entityId: uuid.optional(),
});

export async function POST(req: Request) {
  const g = await guestWrite(req, metricSchema);
  if (g instanceof Response) return g;
  if (fromBot(req)) return json(202, { accepted: true });
  try {
    const res = await upstream(`/v1/public/menus/${g.slug}/metrics`, { method: 'POST', body: g.body, reqHeaders: req.headers });
    return json(res.status === 202 ? 202 : res.status, { accepted: res.status === 202 });
  } catch {
    return problem(502, 'UPSTREAM_UNAVAILABLE');
  }
}
