import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { autoMap, mappingProblems, parseCsv, parsePriceMinor, parseXlsx, sanitizeCell, validateRows, TEMPLATE_CSV } from '../src/admin/import-parse.js';

describe('parsePriceMinor', () => {
  it('reads Turkish and English notations into minor units', () => {
    expect(parsePriceMinor('12,50')).toBe(1250);
    expect(parsePriceMinor('12.50')).toBe(1250);
    expect(parsePriceMinor('1.250,00')).toBe(125000);
    expect(parsePriceMinor('1,250.00')).toBe(125000);
    expect(parsePriceMinor('₺ 45')).toBe(4500);
    expect(parsePriceMinor('45 TL')).toBe(4500);
    expect(parsePriceMinor('1,250')).toBe(125000); // lone separator + 3 digits = thousands
    expect(parsePriceMinor('1.250')).toBe(125000);
    expect(parsePriceMinor('1,2')).toBe(120);
    expect(parsePriceMinor('0')).toBe(0);
  });
  it('rejects garbage', () => {
    expect(parsePriceMinor('abc')).toBeNull();
    expect(parsePriceMinor('12,3456')).toBeNull();
    expect(parsePriceMinor('')).toBeNull();
    expect(parsePriceMinor('-5')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('sniffs the delimiter, honours quotes, strips the BOM', () => {
    const g = parseCsv(TEMPLATE_CSV);
    expect(g.headers).toEqual(['Kategori', 'Ürün', 'Açıklama', 'Fiyat', 'Etiketler']);
    expect(g.rows).toHaveLength(4);
    expect(g.rows[0]![1]).toBe('Türk kahvesi');
    expect(g.rows[2]![1]).toBe('Serpme kahvaltı (2 kişilik)');
  });
  it('handles comma delimiter with quoted commas and escaped quotes', () => {
    const g = parseCsv('category,name,price\nKahve,"Latte, büyük ""XL""",95.50\n');
    expect(g.rows[0]).toEqual(['Kahve', 'Latte, büyük "XL"', '95.50']);
  });
  it('drops empty lines and pads short rows', () => {
    const g = parseCsv('a;b;c\n1;2\n\n\n3;4;5\n');
    expect(g.rows).toEqual([
      ['1', '2', ''],
      ['3', '4', '5'],
    ]);
  });
});

describe('sanitizeCell', () => {
  it('neutralises formula triggers and control characters', () => {
    expect(sanitizeCell('=SUM(A1)')).toBe('SUM(A1)');
    expect(sanitizeCell('@cmd')).toBe('cmd');
    expect(sanitizeCell('  Latte\u0000 ')).toBe('Latte');
    expect(sanitizeCell('+1 shot')).toBe('+1 shot');
  });
});

describe('autoMap + validateRows', () => {
  it('maps Turkish headers and validates rows with Turkish messages', () => {
    const g = parseCsv('Kategori;Ürün Adı;Fiyat (TL);Etiket\nKahve;Latte;95,00;vegan|sıcak\n;Boş kategori;10;\nKahve;Latte;99;\nKahve;Çay;abc;\n');
    const m = autoMap(g.headers);
    expect(m).toEqual({ category: 0, name: 1, price: 2, tags: 3 });
    expect(mappingProblems(m, g.headers.length)).toEqual([]);
    const rows = validateRows(g, m);
    expect(rows[0]).toMatchObject({ line: 2, category: 'Kahve', name: 'Latte', priceMinor: 9500, tags: ['vegan', 'sıcak'], errors: [] });
    expect(rows[1]!.errors).toContain('Kategori boş.');
    expect(rows[2]!.errors[0]).toMatch(/aynı kategori ve ürün adı/);
    expect(rows[3]!.errors[0]).toMatch(/Fiyat okunamadı/);
  });
  it('reports missing required columns', () => {
    expect(mappingProblems({ name: 0 }, 3)).toEqual(['Kategori sütunu seçilmedi.', 'Fiyat sütunu seçilmedi.']);
    expect(mappingProblems({ category: 0, name: 0, price: 1 }, 3)).toContain('Aynı sütun iki alana atanmış.');
  });
});

describe('parseXlsx', () => {
  it('reads the first sheet and never evaluates formulas', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Menü');
    ws.addRow(['Kategori', 'Ürün', 'Fiyat']);
    ws.addRow(['Kahve', 'Latte', 95.5]);
    ws.addRow(['Kahve', { formula: 'A1&"x"', result: 'Formül sonucu' }, { formula: '1+1', result: 2 }]);
    ws.addRow(['Kahve', { richText: [{ text: 'Zengin ' }, { text: 'metin' }] }, '12,50']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const g = await parseXlsx(buf);
    expect(g.headers).toEqual(['Kategori', 'Ürün', 'Fiyat']);
    expect(g.rows).toEqual([
      ['Kahve', 'Latte', '95.5'],
      ['Kahve', 'Formül sonucu', '2'],
      ['Kahve', 'Zengin metin', '12,50'],
    ]);
    const rows = validateRows(g, autoMap(g.headers));
    expect(rows.map((r) => r.priceMinor)).toEqual([9550, 200, 1250]);
  });
});
