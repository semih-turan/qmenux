'use client';
import { useState, type FormEvent } from 'react';
import { formatPhone } from '@qmenux/contracts';
import { Button, Card, TextField, TextareaField, useFocusFirstError, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { api, useApi, useSubmit } from '@/lib/api';
import { PHONE_RE, cleanPhone, noWrap } from '@/lib/format';
import type { Branch } from '@/lib/types';

export default function BranchPage() {
  const allowed = useCan('settings.write');
  const q = useApi<Branch>(allowed ? 'admin/branch' : null);

  return (
    <Page title="Şube bilgileri" back="/more">
      {!allowed ? (
        <NoAccess />
      ) : (
        <Loadable q={q} rows={4}>
          {(b) => <BranchForm key={b.branch.id} branch={b.branch} />}
        </Loadable>
      )}
    </Page>
  );
}

function BranchForm({ branch }: { branch: Branch['branch'] }) {
  const toast = useToast();
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError(errors);
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? '');
  const [phone, setPhone] = useState(formatPhone(branch.phone ?? ''));
  const [hoursText, setHoursText] = useState(branch.hoursText ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const p = cleanPhone(phone);
    const next: Record<string, string> = {};
    if (!n) next.name = 'Şube adını girin.';
    if (p && !PHONE_RE.test(p)) next.phone = `Telefonu ${noWrap('0212 123 45 67')} veya ${noWrap('+90 212 123 45 67')} biçiminde girin.`;
    if (Object.keys(next).length) return setErrors(next);
    await run(async () => {
      await api('admin/branch', { method: 'PUT', json: { name: n, address: address.trim(), phone: p || null, hoursText: hoursText.trim() } });
      setPhone(formatPhone(p));
      toast({ message: 'Kaydedildi. Müşteri menüsü hemen güncellenir.' });
    });
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <Card className="qx-stack">
        <TextField label="Şube adı" hint="Tek şubeniz varsa işletme adınızı yazabilirsiniz." value={name} maxLength={80} enterKeyHint="next" onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <TextareaField
          label="Adres"
          value={address}
          maxLength={240}
          rows={3}
          autoComplete="street-address"
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
          counter={`${address.length}/240`}
          optional
        />
        <TextField
          label="Telefon"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          placeholder="0212 123 45 67"
          value={phone}
          maxLength={24}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          hint="Menüde dokununca aranabilir."
          optional
        />
        <TextareaField
          label="Çalışma saatleri"
          placeholder={'Hafta içi 08:00–22:00\nHafta sonu 09:00–23:00'}
          value={hoursText}
          maxLength={240}
          rows={3}
          onChange={(e) => setHoursText(e.target.value)}
          error={errors.hoursText}
          counter={`${hoursText.length}/240`}
          optional
        />
      </Card>
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
