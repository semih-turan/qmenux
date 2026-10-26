'use client';
import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Segmented, Switch, buttonClass, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { api, isProblem, useApi, useSubmit } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ExportJob } from '@/lib/types';

type ExportType = ExportJob['exportType'];

const TYPE_LABELS: Record<ExportType, string> = { MENU_A4: 'A4 menü', ALLERGEN_A4: 'A4 alerjen tablosu' };
const TYPE_HINTS: Record<ExportType, string> = {
  MENU_A4: 'Yayındaki menünün yazdırılabilir hâli: kategoriler, ürünler ve fiyatlar.',
  ALLERGEN_A4: 'Ürün başına 14 alerjenlik tablo. Onaylamadığınız veya girmediğiniz bilgiler “doğrulanmadı” olarak basılır; boş alan “içermez” anlamına gelmez.',
};

const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  QUEUED: { label: 'Sırada', tone: 'neutral' },
  RUNNING: { label: 'Hazırlanıyor', tone: 'info' },
  READY: { label: 'Hazır', tone: 'success' },
  FAILED: { label: 'Başarısız', tone: 'danger' },
};

// Jobs run on the external worker (T049). Poll gently while something is pending, then stop.
const POLL_MS = 5_000;
const MAX_POLLS = 24;

export default function ExportsPage() {
  const allowed = useCan('exports.create');
  const q = useApi<{ exports: ExportJob[] }>(allowed ? 'admin/exports' : null);
  const [polls, setPolls] = useState(0);
  const [tick, setTick] = useState(0);
  const pending = q.data?.exports.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING') ?? false;
  const { reload } = q;

  useEffect(() => {
    if (!pending || polls >= MAX_POLLS) return;
    const t = setTimeout(() => {
      // A hidden tab neither fetches nor spends the poll budget; it just checks again later.
      if (document.visibilityState !== 'visible') return setTick((n) => n + 1);
      setPolls((p) => p + 1);
      void reload();
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [pending, polls, tick, reload]);

  return (
    <Page title="PDF menüler" back="/more">
      {!allowed ? (
        <NoAccess title="Bu bölüm sahip ve yöneticilere açık" />
      ) : (
        <>
          <RequestCard
            onRequested={() => {
              setPolls(0);
              void reload();
            }}
          />
          <Loadable q={q} rows={3}>
            {({ exports }) => (
              <section className="qx-stack qx-stack--tight" aria-labelledby="jobs">
                <h2 id="jobs" className="qx-section__title">
                  Son talepler
                </h2>
                {exports.length === 0 ? (
                  <Card>
                    <EmptyState icon={<FileText size={28} />} title="Henüz PDF talebi yok">
                      Yazdırmak, masaya koymak veya denetimde göstermek için A4 menü ya da alerjen tablosu oluşturun.
                    </EmptyState>
                  </Card>
                ) : (
                  <Card flush>
                    <ul className="qx-list" aria-label="PDF talepleri" aria-live="polite">
                      {exports.map((j) => {
                        const s = STATUS[j.status] ?? { label: j.status, tone: 'neutral' as const };
                        return (
                          <li key={j.id} className="qx-item">
                            <span className="qx-item__body">
                              <strong>{TYPE_LABELS[j.exportType]}</strong>
                              <span className="qx-small qx-muted qx-num">
                                {formatDateTime(j.createdAt)}
                                {j.revisionNo !== null && ` · Sürüm ${j.revisionNo}`}
                                {!j.includeSoldOut && ' · Tükenenler hariç'}
                              </span>
                              {j.status === 'FAILED' && <span className="qx-small qx-error">Oluşturulamadı. Yeniden talep edin.</span>}
                            </span>
                            {j.ready ? (
                              // Plain GET through the BFF: the cookie session authorises it and the API sets Content-Disposition.
                              <a className={buttonClass('secondary', 'sm')} href={`/bff/admin/exports/${j.id}/file`}>
                                <Download size={16} aria-hidden="true" />
                                <span className="qx-btn__label">İndir</span>
                              </a>
                            ) : (
                              <Badge tone={s.tone}>{s.label}</Badge>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
                {pending && (
                  <p className="qx-small qx-muted">
                    {polls >= MAX_POLLS ? 'Hazırlanması uzun sürüyor. Bu sayfaya daha sonra dönebilirsiniz.' : 'Hazırlanan dosyalar birkaç dakika içinde burada görünür.'}
                  </p>
                )}
              </section>
            )}
          </Loadable>
        </>
      )}
    </Page>
  );
}

function RequestCard({ onRequested }: { onRequested: () => void }) {
  const toast = useToast();
  const { busy, errors, run } = useSubmit();
  const [type, setType] = useState<ExportType>('MENU_A4');
  const [includeSoldOut, setIncludeSoldOut] = useState(true);

  async function request() {
    await run(async () => {
      try {
        await api('admin/exports', { json: { exportType: type, includeSoldOut } });
      } catch (e) {
        if (isProblem(e, 'CONFLICT')) throw new Error('Önce menüyü yayınlayın. PDF, yayındaki menüden oluşturulur.');
        throw e;
      }
      toast({ message: `${TYPE_LABELS[type]} sıraya alındı.` });
      onRequested();
    });
  }

  return (
    <Card className="qx-stack">
      <div className="qx-stack qx-stack--tight">
        <Segmented<ExportType>
          label="Belge"
          value={type}
          onChange={setType}
          options={[
            { value: 'MENU_A4', label: 'Menü' },
            { value: 'ALLERGEN_A4', label: 'Alerjen tablosu' },
          ]}
        />
        <p className="qx-small qx-muted">{TYPE_HINTS[type]}</p>
      </div>
      <Switch checked={includeSoldOut} onCheckedChange={setIncludeSoldOut} label="Tükenen ürünleri de ekle" description="Basılı menü uzun süre kullanılacaksa açık bırakın." />
      {errors._ && (
        <p className="qx-error" role="alert">
          {errors._}
        </p>
      )}
      <Button variant="primary" block loading={busy} onClick={request}>
        PDF oluştur
      </Button>
    </Card>
  );
}
