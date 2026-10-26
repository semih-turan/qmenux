'use client';
import { RotateCw } from 'lucide-react';

/** A full reload, so the service worker gets another chance to fetch the menu or serve the saved copy. */
export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  return (
    <button type="button" className="m-btn m-btn--primary" onClick={() => (onRetry ? onRetry() : location.reload())}>
      <RotateCw size={20} aria-hidden="true" />
      Tekrar dene
    </button>
  );
}
