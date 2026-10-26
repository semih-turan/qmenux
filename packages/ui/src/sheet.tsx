'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './primitives';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** When false (e.g. while saving), Esc, backdrop and the close button are ignored. */
  dismissible?: boolean;
  description?: ReactNode;
}

/**
 * Bottom sheet on phones, centered dialog from 640px. Built on native <dialog> + showModal(), which
 * gives a real focus trap, Esc handling, inert background and top-layer stacking without libraries.
 */
export function Sheet({ open, onClose, title, children, footer, dismissible = true, description }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dismissRef.current) closeRef.current();
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
      d.style.setProperty('--qx-kb', `${Math.round(overlap)}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      d.style.removeProperty('--qx-kb');
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="qx-sheet"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        // A click whose target is the dialog itself landed on the backdrop.
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div className="qx-sheet__grip" aria-hidden="true" />
      <div className="qx-sheet__head">
        <h2 className="qx-sheet__title" id={titleId}>
          {title}
        </h2>
        <IconButton label="Kapat" onClick={onClose} disabled={!dismissible}>
          <X size={20} aria-hidden="true" />
        </IconButton>
      </div>
      {open && (
        <div className="qx-sheet__body">
          {description && (
            <p className="qx-muted" id={descId}>
              {description}
            </p>
          )}
          {children}
        </div>
      )}
      {open && footer && <div className="qx-sheet__foot">{footer}</div>}
    </dialog>
  );
}

export interface ConfirmProps {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** Confirmation for irreversible actions. The confirm button names the action, never just "OK". */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Vazgeç', tone = 'danger', onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Sheet>
  );
}
