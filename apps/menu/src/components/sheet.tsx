'use client';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Accessible name for the dialog when the visible title is not enough on its own. */
  label?: string;
}

/**
 * Guest-side bottom sheet (centered dialog from 640px), themed by the --t-* tokens. Native <dialog> +
 * showModal() gives the focus trap, Esc, inert background and focus return. Content stays mounted while
 * the sheet slides out, so the parent keeps the last item until it opens another one.
 */
export function Sheet({ open, onClose, title, children, footer, label }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Start reading at the top of the new content, not where the previous item was scrolled to.
      d.querySelector('.m-sheet__body')?.scrollTo(0, 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, []);

  // iOS Safari does not shrink the layout viewport for the keyboard; lift the sheet by the overlap.
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    const d = ref.current;
    if (!open || !vv || !d) return;
    const sync = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      d.style.setProperty('--kb', `${Math.round(overlap)}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      d.style.removeProperty('--kb');
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="m-sheet"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onClick={(e) => {
        // A click whose target is the dialog itself landed on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="m-sheet__grip" aria-hidden="true" />
      <div className="m-sheet__head">
        <h2 className="m-sheet__title" id={titleId}>
          {title}
        </h2>
        <button type="button" className="m-sheet__close" aria-label="Kapat" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="m-sheet__body">{children}</div>
      {footer && <div className="m-sheet__foot">{footer}</div>}
    </dialog>
  );
}
