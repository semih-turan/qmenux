import ExcelJS from 'exceljs';

/**
 * CSV/XLSX catalog import (T027, CATALOG_WORKFLOWS.md "CSV/XLSX import").
 * Pure parsing and validation: no database access, so it is unit-tested directly.
 * Spreadsheet formulas are never evaluated (only cached results are read), cell text is sanitised,
 * prices are parsed from Turkish or English notation into integer minor units.
 */

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_COLUMNS = 20;
export const IMPORT_FIELDS = ['category', 'name', 'description', 'price', 'tags'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
/** Column index per field; `name`, `category` and `price` are required for a usable mapping. */
export type ImportMapping = Partial<Record<ImportField, number>>;

export interface ImportGrid {
  headers: string[];
  rows: string[][];
}

export interface ImportRowResult {
  /** 1-based line in the file (header is line 1). */
  line: number;
  category: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  tags: string[];
  errors: string[];
}

export const CSV_TYPES = new Set(['text/csv', 'application/csv', 'text/plain']);
export const XLSX_TYPES = new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

// ---------------------------------------------------------------- text helpers

/** Removes BOM/control characters and a leading formula trigger ("=SUM()" can never become a product name). */
const BOM = String.fromCharCode(0xfeff);
// C0 control characters (except tab/newline) are stripped; built from a string so no literal control bytes live in this file.
// eslint-disable-next-line no-control-regex -- stripping them is the point
const CONTROL_RE = new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', 'g');

export function sanitizeCell(v: string): string {
  let s = (v.startsWith(BOM) ? v.slice(1) : v).replace(CONTROL_RE, '').trim();
  while (s.startsWith('=') || s.startsWith('@')) s = s.slice(1).trim();
  return s;
}

/** Turkish-aware, accent-insensitive key for header and duplicate matching ("Ürün Adı" → "urun adi"). */
export function normalizeKey(v: string): string {
  return v
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "12,50" → 1250, "12.50" → 1250, "1.250,00" → 125000, "1,250.00" → 125000, "₺ 45" → 4500, "45 TL" → 4500.
 * A lone separator followed by exactly three digits is thousands grouping ("1.250" from Turkish Excel,
 * "1,250" from English Excel); followed by one or two digits it is the decimal mark. Null when unreadable.
 */
export function parsePriceMinor(raw: string): number | null {
  let s = raw.replace(/[₺$€]|tl|try/gi, '').replace(/\s+/g, '').trim();
  if (!s) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots > 0 && commas > 0) {
    // Both present: the last separator is the decimal one, the other is thousands.
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (commas > 1 || dots > 1) {
    // Repeated single separator can only be thousands grouping.
    s = s.replace(/[.,]/g, '');
  } else if (commas === 1 || dots === 1) {
    const [, frac = ''] = s.split(/[.,]/);
    s = frac.length === 3 ? s.replace(/[.,]/, '') : s.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- CSV

/** RFC 4180-style parser with delimiter sniffing (`;` is what Turkish Excel writes, `,` elsewhere, `\t` for TSV). */
export function parseCsv(text: string): ImportGrid {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return toGrid(rows);
}

// ---------------------------------------------------------------- XLSX

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return typeof v.text === 'string' ? v.text : cellText(v.text as ExcelJS.CellValue);
    // Formula cells: only the cached result is read; the formula itself is never evaluated.
    if ('result' in v) return cellText((v.result ?? '') as ExcelJS.CellValue);
    if ('error' in v) return '';
  }
  return '';
}

/** First worksheet only. Macros are ignored by exceljs; formulas are not executed. */
export async function parseXlsx(buf: Buffer): Promise<ImportGrid> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const cells = row.values as ExcelJS.CellValue[]; // 1-based
    for (let c = 1; c < Math.min(cells.length, IMPORT_MAX_COLUMNS + 1); c++) values.push(cellText(cells[c]));
    rows.push(values);
  });
  return toGrid(rows);
}

function toGrid(raw: string[][]): ImportGrid {
  const cleaned = raw.map((r) => r.slice(0, IMPORT_MAX_COLUMNS).map(sanitizeCell)).filter((r) => r.some((c) => c !== ''));
  const headers = cleaned[0] ?? [];
  const width = headers.length;
  const rows = cleaned.slice(1).map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
  return { headers, rows };
}

// ---------------------------------------------------------------- mapping + validation

const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  category: ['kategori', 'kategori adi', 'category', 'grup', 'bolum'],
  name: ['urun', 'urun adi', 'ad', 'isim', 'name', 'product', 'item', 'urun ismi'],
  description: ['aciklama', 'description', 'icerik', 'detay', 'not'],
  price: ['fiyat', 'price', 'tutar', 'ucret', 'fiyat tl', 'fiyat try'],
  tags: ['etiketler', 'etiket', 'tags', 'tag', 'ozellik', 'ozellikler'],
};

/** Guesses the column for each field from the header row; unmatched fields stay unmapped. */
export function autoMap(headers: string[]): ImportMapping {
  const keys = headers.map(normalizeKey);
  const mapping: ImportMapping = {};
  for (const field of IMPORT_FIELDS) {
    const idx = keys.findIndex((k) => HEADER_SYNONYMS[field].includes(k));
    if (idx >= 0 && !Object.values(mapping).includes(idx)) mapping[field] = idx;
  }
  return mapping;
}

export function mappingProblems(mapping: ImportMapping, columnCount: number): string[] {
  const out: string[] = [];
  for (const f of ['category', 'name', 'price'] as const) if (mapping[f] === undefined) out.push(`${FIELD_LABELS[f]} sütunu seçilmedi.`);
  const used = Object.values(mapping).filter((v): v is number => v !== undefined);
  if (used.some((i) => i < 0 || i >= columnCount)) out.push('Seçilen sütun dosyada yok.');
  if (new Set(used).size !== used.length) out.push('Aynı sütun iki alana atanmış.');
  return out;
}

export const FIELD_LABELS: Record<ImportField, string> = { category: 'Kategori', name: 'Ürün adı', description: 'Açıklama', price: 'Fiyat', tags: 'Etiketler' };

const MAX_PRICE_MINOR = 1_000_000_00;

/** Dry run: every row gets its parsed values and Turkish error messages; duplicates inside the file are flagged. */
export function validateRows(grid: ImportGrid, mapping: ImportMapping): ImportRowResult[] {
  const seen = new Set<string>();
  const col = (r: string[], f: ImportField) => (mapping[f] === undefined ? '' : (r[mapping[f]!] ?? ''));
  return grid.rows.map((r, i) => {
    const errors: string[] = [];
    const category = col(r, 'category').trim();
    const name = col(r, 'name').trim();
    const descriptionRaw = col(r, 'description').trim();
    const priceRaw = col(r, 'price').trim();
    const tags = col(r, 'tags')
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!category) errors.push('Kategori boş.');
    else if (category.length > 80) errors.push('Kategori adı 80 karakteri aşıyor.');
    if (!name) errors.push('Ürün adı boş.');
    else if (name.length > 120) errors.push('Ürün adı 120 karakteri aşıyor.');
    if (descriptionRaw.length > 600) errors.push('Açıklama 600 karakteri aşıyor.');
    const priceMinor = priceRaw ? parsePriceMinor(priceRaw) : null;
    if (!priceRaw) errors.push('Fiyat boş.');
    else if (priceMinor === null) errors.push(`Fiyat okunamadı: "${priceRaw}". Örnek: 12,50`);
    else if (priceMinor > MAX_PRICE_MINOR) errors.push('Fiyat çok yüksek.');
    if (tags.length > 8) errors.push('En fazla 8 etiket.');
    if (tags.some((t) => t.length > 24)) errors.push('Etiket 24 karakteri aşıyor.');
    const key = `${normalizeKey(category)}::${normalizeKey(name)}`;
    if (category && name) {
      if (seen.has(key)) errors.push('Dosyada aynı kategori ve ürün adıyla önceki bir satır var.');
      seen.add(key);
    }
    return { line: i + 2, category, name, description: descriptionRaw || null, priceMinor, tags: tags.slice(0, 8), errors };
  });
}

/** The template businesses download: same headers the auto-mapper recognises, Turkish decimal comma, `;` delimiter. */
export const TEMPLATE_CSV =
  BOM +
  'Kategori;Ürün;Açıklama;Fiyat;Etiketler\r\n' +
  'Sıcak kahveler;Türk kahvesi;Şekerli, orta veya sade;65,00;vegan\r\n' +
  'Sıcak kahveler;Latte;Günlük kavrulmuş çekirdek, süt;95,00;\r\n' +
  'Kahvaltı;Serpme kahvaltı (2 kişilik);Peynir tabağı, zeytin, bal-kaymak, menemen;650,00;;\r\n' +
  'Tatlılar;San Sebastian cheesecake;;180,00;glutensiz\r\n';
