import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type PDFDocumentType from 'pdfkit';
import { ALLERGEN_CODES, ALLERGEN_LABELS_TR } from '@qmenux/contracts';
import type { MenuSnapshot } from '@qmenux/database';

export type ExportType = 'MENU_A4' | 'ALLERGEN_A4';

export interface PdfInput {
  exportType: ExportType;
  includeSoldOut: boolean;
  tenantName: string;
  branchName: string | null;
  revisionNo: number;
  publishedAt: Date;
  snapshot: MenuSnapshot;
  /** Price formatting is a presentation choice; prices themselves are business-owned facts from the snapshot. */
  currency?: string;
}

// pdfkit is CommonJS; require() yields the class the same way under Node and the test runner.
const PDFDocument = createRequire(import.meta.url)('pdfkit') as typeof PDFDocumentType;

// Geist (SIL OFL) ships with Next.js; the PDF standard fonts have no ş/ğ/İ glyphs.
const FONT = readFileSync(fileURLToPath(new URL('../assets/Geist-Regular.ttf', import.meta.url)));

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const SHORT: Record<string, string> = {
  GLUTEN: 'Gluten',
  CRUSTACEANS: 'Kabuklu',
  EGGS: 'Yumurta',
  FISH: 'Balık',
  PEANUTS: 'Y. fıstığı',
  SOY: 'Soya',
  MILK: 'Süt',
  TREE_NUTS: 'Kuruyemiş',
  CELERY: 'Kereviz',
  MUSTARD: 'Hardal',
  SESAME: 'Susam',
  SULPHITES: 'Sülfit',
  LUPIN: 'Acı bakla',
  MOLLUSCS: 'Yumuşakça',
};

export const formatPrice = (minor: number, currency = 'TRY') => `${(minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'TRY' ? '₺' : currency}`;

const fmtDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

/** Renders the A4 PDF for a published snapshot and resolves with the bytes. Pure: no DB, no network. */
export function renderPdf(input: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, info: { Title: `${input.tenantName} – ${input.exportType === 'MENU_A4' ? 'Menü' : 'Alerjen tablosu'}`, Producer: 'QMenuX' }, pdfVersion: '1.5' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('body', FONT);
    doc.font('body');
    try {
      if (input.exportType === 'MENU_A4') renderMenu(doc, input);
      else renderAllergens(doc, input);
      footer(doc, input);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

type Doc = InstanceType<typeof PDFDocumentType>;

function items(input: PdfInput) {
  // Snapshot items carry a "sold-out" tag from the catalog; HIDDEN products never reach the snapshot.
  return input.snapshot.categories.map((c) => ({ ...c, items: c.items.filter((i) => input.includeSoldOut || !i.tags.includes('sold_out')) })).filter((c) => c.items.length > 0);
}

function header(doc: Doc, input: PdfInput, subtitle: string) {
  doc.fontSize(22).text(input.tenantName, { align: 'center' });
  if (input.branchName && input.branchName !== input.tenantName) doc.fontSize(11).fillColor('#555').text(input.branchName, { align: 'center' });
  doc.fontSize(11).fillColor('#555').text(subtitle, { align: 'center' });
  doc.fillColor('#000').moveDown(1);
}

function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > A4.height - MARGIN - 24) doc.addPage();
}

function renderMenu(doc: Doc, input: PdfInput) {
  header(doc, input, 'Menü');
  const cats = items(input);
  if (cats.length === 0) {
    doc.fontSize(12).text('Menüde gösterilecek ürün yok.', { align: 'center' });
    return;
  }
  const priceX = A4.width - MARGIN - 90;
  for (const c of cats) {
    ensureSpace(doc, 60);
    doc.fontSize(15).text(c.name);
    if (c.description) doc.fontSize(9.5).fillColor('#555').text(c.description).fillColor('#000');
    doc.moveDown(0.4);
    for (const it of c.items) {
      ensureSpace(doc, 34);
      const y = doc.y;
      const soldOut = it.tags.includes('sold_out');
      doc.fontSize(11.5).text(it.name + (soldOut ? ' (tükendi)' : ''), MARGIN, y, { width: priceX - MARGIN - 8 });
      doc.fontSize(11.5).text(formatPrice(it.priceMinor, input.currency), priceX, y, { width: 90, align: 'right' });
      const nameBottom = doc.y;
      if (it.description) doc.fontSize(9).fillColor('#555').text(it.description, MARGIN, nameBottom, { width: priceX - MARGIN - 8 }).fillColor('#000');
      const present = it.allergens.filter((a) => a.status === 'CONTAINS').map((a) => SHORT[a.code] ?? a.code);
      const unknown = it.allergens.some((a) => a.status === 'UNKNOWN');
      const meta: string[] = [];
      if (present.length) meta.push(`Alerjen: ${present.join(', ')}`);
      if (unknown) meta.push('Bazı alerjen bilgileri doğrulanmadı');
      if (it.kcal !== null) meta.push(`${it.kcal} kcal`);
      if (meta.length) doc.fontSize(8.5).fillColor('#777').text(meta.join(' · '), MARGIN, doc.y, { width: priceX - MARGIN - 8 }).fillColor('#000');
      doc.moveDown(0.5);
    }
    doc.moveDown(0.6);
  }
}

function renderAllergens(doc: Doc, input: PdfInput) {
  header(doc, input, 'Alerjen tablosu (14 ana alerjen)');
  doc.fontSize(8.5).fillColor('#555').text('● içerir   ○ içermez   ? doğrulanmadı — İşaretlenmemiş veya doğrulanmamış bilgi "içermez" anlamına gelmez; şüphede personele danışın.', { align: 'center' }).fillColor('#000');
  doc.moveDown(0.8);
  const cats = items(input);
  if (cats.length === 0) {
    doc.fontSize(12).text('Menüde gösterilecek ürün yok.', { align: 'center' });
    return;
  }
  const nameW = 170;
  const colW = (A4.width - 2 * MARGIN - nameW) / ALLERGEN_CODES.length;
  const rowH = 16;
  // Columns are numbered 1–14 (23pt is too narrow for words); the legend below the table maps numbers to names.
  const tableHeader = () => {
    const y = doc.y;
    doc.fontSize(8).text('Ürün', MARGIN + 6, y + 2, { width: nameW - 8, lineBreak: false });
    ALLERGEN_CODES.forEach((_, i) => doc.text(String(i + 1), MARGIN + nameW + i * colW, y + 2, { width: colW, align: 'center', lineBreak: false }));
    doc.y = y + 14;
    doc.moveTo(MARGIN, doc.y).lineTo(A4.width - MARGIN, doc.y).lineWidth(0.5).strokeColor('#999').stroke();
    doc.y += 2;
  };
  tableHeader();
  for (const c of cats) {
    if (doc.y + rowH * 2 + 20 > A4.height - MARGIN - 24) {
      doc.addPage();
      tableHeader();
    }
    doc.fontSize(10).text(c.name, MARGIN, doc.y + 4, { width: A4.width - 2 * MARGIN, lineBreak: false });
    doc.y += 4;
    for (const it of c.items) {
      if (doc.y + rowH > A4.height - MARGIN - 24) {
        doc.addPage();
        tableHeader();
      }
      const y = doc.y;
      doc.fontSize(8.5).text(it.name, MARGIN + 6, y + 3, { width: nameW - 8, height: rowH, ellipsis: true, lineBreak: false });
      ALLERGEN_CODES.forEach((code, i) => {
        const a = it.allergens.find((x) => x.code === code);
        const mark = !a || a.status === 'UNKNOWN' ? '?' : a.status === 'CONTAINS' ? '●' : '○';
        doc.fontSize(9).text(mark, MARGIN + nameW + i * colW, y + 2, { width: colW, align: 'center', lineBreak: false });
      });
      doc.y = y + rowH;
      doc.moveTo(MARGIN, doc.y).lineTo(A4.width - MARGIN, doc.y).lineWidth(0.25).strokeColor('#ddd').stroke();
    }
    doc.y += 6;
  }
  doc.moveDown(1);
  doc.fontSize(8).fillColor('#555').text(ALLERGEN_CODES.map((c, i) => `${i + 1} ${ALLERGEN_LABELS_TR[c]}`).join('  ·  '), MARGIN, doc.y, { width: A4.width - 2 * MARGIN, align: 'left' }).fillColor('#000');
}

function footer(doc: Doc, input: PdfInput) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin makes pdfkit open a new page; lift the margin while the footer is drawn.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const text = `Yayın sürümü ${input.revisionNo} · ${fmtDate(input.publishedAt)} · Sayfa ${i - range.start + 1}/${range.count} · Fiyat ve alerjen bilgileri işletmeye aittir`;
    doc.fontSize(7.5).fillColor('#777').text(text, MARGIN, A4.height - MARGIN + 12, { width: A4.width - 2 * MARGIN, align: 'center', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}
