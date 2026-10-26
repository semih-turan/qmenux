'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Badge, Banner, Button, Card, EmptyState, Segmented, SelectField, buttonClass, useToast } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { ApiProblem, api, isProblem, useApi } from '@/lib/api';
import { formatCount, formatDateTime } from '@/lib/format';
import type { ImportBatchSummary, ImportPreview } from '@/lib/types';

const FIELDS = [
  { key: 'category', label: 'Kategori', required: true },
  { key: 'name', label: 'Ürün adı', required: true },
  { key: 'price', label: 'Fiyat', required: true },
  { key: 'description', label: 'Açıklama', required: false },
  { key: 'tags', label: 'Etiketler', required: false },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

const MAX_BYTES = 2 * 1024 * 1024;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  VALIDATED: { label: 'Önizleme', tone: 'info' },
  APPLIED: { label: 'Taslağa aktarıldı', tone: 'success' },
  DISCARDED: { label: 'Vazgeçildi', tone: 'neutral' },
};

/** CSV/XLSX staged import (T027): upload → mapping → dry run → draft commit. Nothing is published here. */
export default function ImportPage() {
  const allowed = useCan('catalog.write');
  const list = useApi<{ imports: ImportBatchSummary[] }>(allowed ? 'admin/imports' : null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  return (
    <Page title="Menü içe aktar" back="/more">
      {!allowed ? (
        <NoAccess />
      ) : preview ? (
        <PreviewView
          preview={preview}
          onChange={setPreview}
          onDone={() => {
            setPreview(null);
            void list.reload();
          }}
        />
      ) : (
        <>
          <UploadCard onPreview={setPreview} />
          <Loadable q={list} rows={2}>
            {({ imports }) =>
              imports.length === 0 ? null : (
                <section className="qx-stack qx-stack--tight" aria-labelledby="history">
                  <h2 id="history" className="qx-section__title">
                    Son içe aktarmalar
                  </h2>
                  <Card flush>
                    <ul className="qx-list" aria-label="Son içe aktarmalar">
                      {imports.map((b) => {
                        const s = STATUS[b.status] ?? { label: b.status, tone: 'neutral' as const };
                        const applied = b.summary.applied as { createdProducts?: number; updatedProducts?: number } | undefined;
                        return (
                          <li key={b.id} className="qx-item">
                            <span className="qx-item__body">
                              <strong className="qx-break">{b.filename}</strong>
                              <span className="qx-small qx-muted">
                                {formatDateTime(b.createdAt)} · {formatCount(Number(b.summary.rowCount ?? 0))} satır
                                {applied ? ` · ${applied.createdProducts ?? 0} yeni, ${applied.updatedProducts ?? 0} güncellenen ürün` : ''}
                              </span>
                            </span>
                            {b.status === 'VALIDATED' ? (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  setPreview(await api<ImportPreview>(`admin/imports/${b.id}`));
                                }}
                              >
                                Devam et
                              </Button>
                            ) : (
                              <Badge tone={s.tone}>{s.label}</Badge>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </section>
              )
            }
          </Loadable>
        </>
      )}
    </Page>
  );
}

function UploadCard({ onPreview }: { onPreview: (p: ImportPreview) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    const ext = file.name.toLowerCase().split('.').pop();
    const type = ext === 'xlsx' ? XLSX : ext === 'csv' || ext === 'txt' ? 'text/csv' : null;
    if (!type) return setError('Yalnızca .csv veya .xlsx dosyası yükleyebilirsiniz.');
    if (file.size > MAX_BYTES) return setError('Dosya en fazla 2 MB olabilir.');
    setBusy(true);
    try {
      const p = await api<ImportPreview>(`admin/imports?filename=${encodeURIComponent(file.name)}`, { body: new Blob([await file.arrayBuffer()], { type }), contentType: type });
      onPreview(p);
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : 'Dosya yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="qx-stack">
      <EmptyState icon={<FileSpreadsheet size={28} />} title="Excel ya da CSV'den menü yükleyin">
        Sütunlar: Kategori, Ürün, Açıklama, Fiyat, Etiketler. Fiyatı “12,50” gibi yazın. Önce önizleme görürsünüz; hiçbir şey otomatik yayınlanmaz.
      </EmptyState>
      {error && (
        <Banner tone="danger" live="alert" title="Yüklenemedi">
          {error}
        </Banner>
      )}
      <input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="qx-visually-hidden" onChange={pick} aria-label="Dosya seç" />
      <Button variant="primary" block icon={<Upload size={16} />} loading={busy} onClick={() => inputRef.current?.click()}>
        Dosya seç
      </Button>
      <a className={buttonClass('ghost', 'md', true)} href="/bff/admin/imports/template.csv">
        <Download size={16} aria-hidden="true" />
        <span className="qx-btn__label">Örnek şablonu indir</span>
      </a>
    </Card>
  );
}

function PreviewView({ preview, onChange, onDone }: { preview: ImportPreview; onChange: (p: ImportPreview) => void; onDone: () => void }) {
  const toast = useToast();
  const [policy, setPolicy] = useState<'update' | 'skip'>('update');
  const [busy, setBusy] = useState<'map' | 'apply' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const problems = (preview.summary.mappingProblems as string[]) ?? [];
  const errorRows = preview.results.filter((r) => r.errors.length > 0);
  const canApply = problems.length === 0 && Number(preview.summary.validCount) > 0 && preview.status === 'VALIDATED';

  async function remap(field: FieldKey, value: string) {
    const mapping: Record<string, number> = { ...preview.mapping };
    if (value === '') delete mapping[field];
    else mapping[field] = Number(value);
    setBusy('map');
    setError(null);
    try {
      onChange(await api<ImportPreview>(`admin/imports/${preview.id}/mapping`, { method: 'PATCH', json: mapping }));
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : 'Eşleme kaydedilemedi.');
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy('apply');
    setError(null);
    try {
      const r = await api<{ result: { createdCategories: number; createdProducts: number; updatedProducts: number; skipped: number; invalid: number } }>(`admin/imports/${preview.id}/apply`, { json: { duplicates: policy } });
      toast({ message: `Taslağa aktarıldı: ${r.result.createdProducts} yeni, ${r.result.updatedProducts} güncellenen ürün, ${r.result.createdCategories} yeni kategori.` });
      onDone();
    } catch (err) {
      if (isProblem(err, 'LICENSE_INACTIVE')) setError('Lisans etkin olmadığı için taslağa yazılamıyor. Önizleme kaydedildi; lisans tanımlanınca “Devam et” ile sürdürebilirsiniz.');
      else setError(err instanceof ApiProblem ? err.message : 'Aktarılamadı.');
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    setBusy('discard');
    try {
      await api(`admin/imports/${preview.id}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.message : 'Vazgeçilemedi.');
      setBusy(null);
    }
  }

  return (
    <>
      <Card className="qx-stack qx-stack--tight">
        <div className="qx-between">
          <strong className="qx-break">{preview.filename}</strong>
          <Badge tone={STATUS[preview.status]?.tone ?? 'neutral'}>{STATUS[preview.status]?.label ?? preview.status}</Badge>
        </div>
        <dl className="qx-dl">
          <div>
            <dt>Satır</dt>
            <dd className="qx-num">{formatCount(Number(preview.summary.rowCount))}</dd>
          </div>
          <div>
            <dt>Aktarılabilir</dt>
            <dd className="qx-num">{formatCount(Number(preview.summary.validCount))}</dd>
          </div>
          <div>
            <dt>Hatalı</dt>
            <dd className="qx-num">{formatCount(Number(preview.summary.errorCount))}</dd>
          </div>
          <div>
            <dt>Kategori</dt>
            <dd className="qx-num">{formatCount((preview.summary.categories as string[]).length)}</dd>
          </div>
        </dl>
      </Card>

      <section className="qx-stack qx-stack--tight" aria-labelledby="mapping">
        <h2 id="mapping" className="qx-section__title">
          Sütun eşleme
        </h2>
        <p className="qx-small qx-muted">Dosyadaki başlıklar otomatik eşlendi; yanlışsa değiştirin. Kategori, ürün adı ve fiyat zorunlu.</p>
        <Card className="qx-stack qx-stack--tight">
          {FIELDS.map((f) => (
            <SelectField key={f.key} label={f.label} required={f.required} optional={!f.required} value={preview.mapping[f.key] ?? ''} onChange={(e) => remap(f.key, e.target.value)} disabled={busy !== null || preview.status !== 'VALIDATED'}>
              <option value="">— Seçilmedi —</option>
              {preview.headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || `Sütun ${i + 1}`}
                </option>
              ))}
            </SelectField>
          ))}
          {problems.length > 0 && (
            <Banner tone="warning" title="Eşleme tamamlanmadı">
              {problems.join(' ')}
            </Banner>
          )}
        </Card>
      </section>

      <section className="qx-stack qx-stack--tight" aria-labelledby="sample">
        <h2 id="sample" className="qx-section__title">
          İlk satırlar
        </h2>
        <Card flush>
          <div className="qx-scroll-x">
            <table className="qx-table">
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} scope="col">
                      {h || `Sütun ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {errorRows.length > 0 && (
        <section className="qx-stack qx-stack--tight" aria-labelledby="errors">
          <div className="qx-between">
            <h2 id="errors" className="qx-section__title">
              Hatalı satırlar ({formatCount(errorRows.length)})
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setShowErrors((v) => !v)} aria-expanded={showErrors}>
              {showErrors ? 'Gizle' : 'Göster'}
            </Button>
          </div>
          <p className="qx-small qx-muted">Hatalı satırlar atlanır; düzeltip dosyayı yeniden yükleyebilirsiniz.</p>
          {showErrors && (
            <Card flush>
              <ul className="qx-list" aria-label="Hatalı satırlar">
                {errorRows.slice(0, 50).map((r) => (
                  <li key={r.line} className="qx-item">
                    <span className="qx-item__body">
                      <strong>
                        Satır {r.line}
                        {r.name ? ` · ${r.name}` : ''}
                      </strong>
                      <span className="qx-small qx-error qx-break">
                        <CircleAlert size={12} aria-hidden="true" /> {r.errors.join(' ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {preview.status === 'VALIDATED' && (
        <Card className="qx-stack">
          <Segmented<'update' | 'skip'>
            label="Aynı adlı ürün zaten varsa"
            value={policy}
            onChange={setPolicy}
            options={[
              { value: 'update', label: 'Fiyatı güncelle' },
              { value: 'skip', label: 'Atla' },
            ]}
          />
          <p className="qx-small qx-muted">Aynı kategoride aynı adla ürün varsa fiyat, açıklama ve etiketler dosyadakiyle değiştirilir; görsel ve alerjen bilgileri korunur.</p>
          {error && (
            <Banner tone="danger" live="alert" title="Aktarılamadı">
              {error}
            </Banner>
          )}
          <Button variant="primary" block icon={<CircleCheck size={16} />} loading={busy === 'apply'} disabled={!canApply || busy !== null} onClick={apply}>
            {formatCount(Number(preview.summary.validCount))} satırı taslağa aktar
          </Button>
          <p className="qx-small qx-muted">
            Aktarım taslağa yazılır; müşteriler <Link href="/menu/publish">yayınlayana</Link> kadar değişikliği görmez.
          </p>
          <Button variant="ghost" block loading={busy === 'discard'} disabled={busy !== null} onClick={discard}>
            Vazgeç
          </Button>
        </Card>
      )}
    </>
  );
}
