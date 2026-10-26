'use client';
import { useEffect } from 'react';
import { clientEventId, cleanLandingUrl, landingFrom, landingKey } from '@/lib/landing';
import { firstInTab, post } from '@/lib/beacon';

/**
 * Counts one landing per tab (QR scan totals, amendment 2026-10-25) and then strips `?t=`/`?src=` from
 * the address bar, so a reload, a shared link or a bookmark is not counted as another scan.
 */
export function ScanBeacon() {
  useEffect(() => {
    const l = landingFrom(location.search);
    const first = firstInTab(landingKey(l));
    // A QR landing also counts as "landed", so a later direct reload in this tab adds nothing.
    if (l.source !== 'direct') firstInTab('qx_landed');
    if (first) {
      post('/api/scan', l.source === 'table' ? { clientEventId: clientEventId(), source: 'table', tableToken: l.tableToken } : { clientEventId: clientEventId(), source: l.source });
    }
    if (l.source !== 'direct' || /[?&](t|src)=/.test(location.search)) {
      history.replaceState(history.state, '', cleanLandingUrl(location.pathname, location.search, location.hash));
    }
  }, []);
  return null;
}
