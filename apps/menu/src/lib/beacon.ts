/**
 * Fire-and-forget aggregate events from the guest's browser to this host's route handlers.
 * Bodies carry only the event name and, where useful, a public item/category id. No query text, no
 * identifiers, no cookies; a failure is silent because analytics must never get in the guest's way.
 */
export type Metric = 'item_view' | 'category_view' | 'search' | 'wifi_reveal' | 'whatsapp_click' | 'pdf_download';

export function post(path: string, body: unknown): void {
  try {
    void fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* fetch unavailable */
  }
}

/** True the first time `key` is seen in this tab. Blocked storage counts every time rather than never. */
export function firstInTab(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    /* private mode / storage disabled */
  }
  return true;
}

export function sendMetric(metric: Metric, entityId?: string, oncePerTab = false): void {
  if (oncePerTab && !firstInTab(`qx_m:${metric}:${entityId ?? ''}`)) return;
  post('/api/metric', entityId ? { metric, entityId } : { metric });
}
