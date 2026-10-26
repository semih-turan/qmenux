'use client';
import { useState, type FormEvent } from 'react';
import { Banner, Button, Sheet, TextareaField, useFocusFirstError } from '@qmenux/ui';
import { useSubmit } from '@/lib/api';

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  /** What is about to happen, in one or two sentences; the operator reads it before typing a reason. */
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  reasonLabel?: string;
  onClose: () => void;
  /** Throws an ApiProblem on failure; the message is shown inline. */
  onConfirm: (reason: string) => Promise<void>;
}

const MAX = 500;

/**
 * Every privileged decision (approve, reject, revoke, suspend) is recorded with a written reason
 * (MANUAL_ACTIVATION: "reason and audit"). The reason is required, trimmed and capped like the API schema.
 */
export function ReasonDialog({ open, title, description, confirmLabel, tone = 'danger', reasonLabel = 'Gerekçe', onClose, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError<HTMLFormElement>(errors);

  const close = () => {
    if (busy) return;
    setReason('');
    setErrors({});
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = reason.trim();
    if (!r) {
      setErrors({ reason: 'Gerekçe yazın; denetim kaydına işlenir.' });
      return;
    }
    await run(async () => {
      await onConfirm(r);
      setReason('');
    });
  }

  return (
    <Sheet open={open} onClose={close} title={title} dismissible={!busy} description={description}>
      <form ref={formRef} onSubmit={submit} className="qx-stack" noValidate>
        {errors._ && (
          <Banner tone="danger" live="alert" title="İşlem yapılamadı">
            {errors._}
          </Banner>
        )}
        <TextareaField
          label={reasonLabel}
          name="reason"
          hint="Denetim kaydında görünür; işletmeye gösterilmez."
          error={errors.reason ?? null}
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, MAX))}
          counter={`${reason.length}/${MAX}`}
          rows={3}
          required
          autoFocus
        />
        <div className="qx-row-actions">
          <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
