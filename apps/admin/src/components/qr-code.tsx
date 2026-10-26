'use client';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Copy, Download, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { Button, useToast } from '@qmenux/ui';

const QUIET = 4; // modules of white border required by the QR spec

/** Module matrix for `text`; rendered as React SVG so no generated markup is injected into the DOM. */
export function qrMatrix(text: string) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, dark: (r: number, c: number) => modules.data[r * modules.size + c] === 1 };
}

function qrPath(m: ReturnType<typeof qrMatrix>) {
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  return d;
}

/** Turkish-aware, filesystem-safe name: "Masa 5 — Bahçe" → "masa-5-bahce". */
export function fileSlug(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  const out = s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (ch) => map[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return out || 'qr';
}

async function renderPng(m: ReturnType<typeof qrMatrix>, caption: string): Promise<Blob> {
  const total = m.size + QUIET * 2;
  const scale = Math.max(8, Math.floor(1024 / total));
  const side = total * scale;
  const captionH = caption ? Math.round(scale * 7) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side + captionH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale);
  if (caption) {
    ctx.font = `600 ${Math.round(scale * 3.2)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, side / 2, side + captionH / 2 - scale, side - scale * 4);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
}

export function QrImage({ value, label }: { value: string; label: string }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const total = m.size + QUIET * 2;
  return (
    <div className="qx-qr">
      <svg viewBox={`0 0 ${total} ${total}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <rect width={total} height={total} fill="#fff" />
        <path d={qrPath(m)} fill="#000" />
      </svg>
    </div>
  );
}

const noop = () => () => {};
const hasShare = () => typeof navigator.share === 'function';

/** QR + URL + save/share/copy. `caption` is printed under the code in the PNG (e.g. the table name). */
export function QrCard({ value, caption, label }: { value: string; caption: string; label: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const canShare = useSyncExternalStore(noop, hasShare, () => false);

  async function save() {
    setBusy(true);
    try {
      const blob = await renderPng(qrMatrix(value), caption);
      const name = `qmenux-${fileSlug(caption)}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: caption });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      toast({ message: 'Görsel oluşturulamadı.' });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast({ message: 'Bağlantı kopyalandı.' });
    } catch {
      toast({ message: 'Kopyalanamadı. Bağlantıyı basılı tutarak kopyalayın.' });
    }
  }

  return (
    <div className="qx-stack qx-stack--tight">
      <QrImage value={value} label={label} />
      <div className="qx-url">{value}</div>
      <div className="qx-row-actions">
        <Button variant="primary" size="sm" loading={busy} icon={canShare ? <Share2 size={16} /> : <Download size={16} />} onClick={save}>
          {canShare ? 'Paylaş / kaydet' : 'PNG indir'}
        </Button>
        <Button size="sm" icon={<Copy size={16} />} onClick={copy}>
          Bağlantıyı kopyala
        </Button>
      </div>
    </div>
  );
}
