'use client';
import { useEffect } from 'react';

/** Offline copy of the last menu (public/sw.js). Production only, so development never serves stale pages. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* unsupported or blocked: the menu still works online */
    });
  }, []);
  return null;
}
