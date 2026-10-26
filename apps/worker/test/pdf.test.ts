import { describe, expect, it } from 'vitest';
import { formatPrice, renderPdf, type PdfInput } from '../src/pdf';

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

const snapshot: PdfInput['snapshot'] = {
  schema: 1,
  categories: [
    {
      id: 'c1',
      name: 'Sıcak kahveler ☕',
      description: 'Günlük kavrulmuş çekirdek',
      items: [
        { id: 'p1', name: 'Türk kahvesi', description: 'Şekerli / orta / sade', priceMinor: 6500, imageKey: null, tags: [], kcal: 12, allergens: [{ code: 'MILK', status: 'FREE' }, { code: 'GLUTEN', status: 'UNKNOWN' }] },
        { id: 'p2', name: 'Çok uzun isimli ürün '.repeat(6).trim(), description: null, priceMinor: 1234567, imageKey: null, tags: ['sold_out'], kcal: null, allergens: [{ code: 'TREE_NUTS', status: 'CONTAINS' }] },
      ],
    },
    { id: 'c2', name: 'Boş kategori', description: null, items: [] },
  ],
};

const base = { tenantName: 'Demo Kahve — Şube 2 🥐', branchName: 'Kadıköy', revisionNo: 3, publishedAt: new Date('2026-10-26T12:00:00Z'), snapshot };

describe('renderPdf', () => {
  it('renders an A4 menu with Turkish text and prices', async () => {
    const pdf = await renderPdf({ ...base, exportType: 'MENU_A4', includeSoldOut: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000);
    // Two short categories fit on one page; the footer must not push a second page.
    expect(pageCount(pdf)).toBe(1);
  });

  it('paginates a long menu and numbers every page', async () => {
    const big = { ...snapshot, categories: Array.from({ length: 12 }, (_, i) => ({ ...snapshot.categories[0]!, id: `c${i}`, name: `Kategori ${i + 1}` })) };
    const pdf = await renderPdf({ ...base, snapshot: big, exportType: 'MENU_A4', includeSoldOut: true });
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it('renders the allergen table and excludes sold-out items when asked', async () => {
    const withSoldOut = await renderPdf({ ...base, exportType: 'ALLERGEN_A4', includeSoldOut: true });
    const without = await renderPdf({ ...base, exportType: 'ALLERGEN_A4', includeSoldOut: false });
    expect(withSoldOut.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(withSoldOut)).toBe(1);
    expect(without.length).toBeLessThan(withSoldOut.length);
  });

  it('handles an empty menu', async () => {
    const pdf = await renderPdf({ ...base, snapshot: { schema: 1, categories: [] }, exportType: 'MENU_A4', includeSoldOut: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('formatPrice', () => {
  it('uses Turkish separators and the lira sign', () => {
    expect(formatPrice(6500)).toBe('65,00 ₺');
    expect(formatPrice(1234567)).toBe('12.345,67 ₺');
  });
});
