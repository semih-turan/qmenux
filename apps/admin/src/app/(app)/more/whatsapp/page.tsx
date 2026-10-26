'use client';
import { useState, type FormEvent } from 'react';
import { formatPhone } from '@qmenux/contracts';
import { Button, Card, Switch, TextField, TextareaField, useFocusFirstError, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { api, useApi, useSubmit } from '@/lib/api';
import { cleanPhone, noWrap, toIntlPhone } from '@/lib/format';
import type { Branch } from '@/lib/types';

export default function WhatsappPage() {
  const allowed = useCan('settings.write');
  const q = useApi<Branch>(allowed ? 'admin/branch' : null);

  return (
    <Page title="WhatsApp düğmesi" back="/more">
      {!allowed ? (
        <NoAccess />
      ) : (
        <Loadable q={q} rows={3}>
          {(b) => <WhatsappForm key={b.branch.id} whatsapp={b.whatsapp} />}
        </Loadable>
      )}
    </Page>
  );
}

// Opt-in only (off by default). The button is a plain wa.me link: QMenuX sends, reads and stores no messages.
function WhatsappForm({ whatsapp }: { whatsapp: Branch['whatsapp'] }) {
  const toast = useToast();
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError(errors);
  const [enabled, setEnabled] = useState(whatsapp.enabled);
  const [phone, setPhone] = useState(formatPhone(whatsapp.phone ?? ''));
  const [message, setMessage] = useState(whatsapp.message ?? '');
  const intl = phone.trim() ? toIntlPhone(phone) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (enabled && !phone.trim()) return setErrors({ phone: 'WhatsApp numarasını girin.' });
    if (enabled && !intl) return setErrors({ phone: `Numarayı ülke koduyla girin, örneğin ${noWrap('+90 532 123 45 67')}.` });
    await run(async () => {
      await api('admin/branch/whatsapp', { method: 'PUT', json: { enabled, phone: intl, message: message.trim() } });
      if (intl) setPhone(formatPhone(intl));
      toast({ message: enabled ? 'Kaydedildi. Düğme menüde görünür.' : 'Kaydedildi. Düğme menüde gizli.' });
    });
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <Card>
        <Switch checked={enabled} onCheckedChange={setEnabled} label="Menüde WhatsApp düğmesi göster" description="Müşteri dokununca kendi WhatsApp uygulamasında size yazar." />
      </Card>

      {enabled && (
        <Card className="qx-stack">
          <TextField
            label="WhatsApp numarası"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            placeholder="0532 123 45 67"
            value={phone}
            maxLength={24}
            onChange={(e) => setPhone(e.target.value)}
            // The hint below re-checks the number live; once it is valid a stale error would contradict it.
            error={intl ? undefined : errors.phone}
            hint={intl && intl !== cleanPhone(phone) ? `Şu numaraya kaydedilecek: ${noWrap(formatPhone(intl))}` : 'İşletmenin WhatsApp kullanan numarası.'}
            required
          />
          <TextareaField
            label="Hazır mesaj"
            hint="Müşterinin mesaj kutusuna önceden yazılır; müşteri değiştirebilir."
            placeholder="Merhaba, menünüzden yazıyorum."
            value={message}
            maxLength={200}
            rows={2}
            onChange={(e) => setMessage(e.target.value)}
            error={errors.message}
            counter={`${message.length}/200`}
            optional
          />
        </Card>
      )}

      <p className="qx-small qx-muted">QMenuX mesaj göndermez, okumaz veya saklamaz. Yalnızca düğmeye dokunma sayısı, kimlik bilgisi olmadan raporlara yansır.</p>
      {errors._ && (
        <p className="qx-error" role="alert">
          {errors._}
        </p>
      )}
      <Button type="submit" variant="primary" block loading={busy}>
        Kaydet
      </Button>
    </form>
  );
}
