import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicMenuItem } from '@qmenux/contracts';
import { ItemCard } from '../src/components/item';

const item: PublicMenuItem = {
  id: 'test-item', name: 'Test kahve', description: 'Uzun açıklamanın tamamı',
  priceMinor: 12500, imageUrl: null, availability: 'SOLD_OUT',
  tags: ['Bir', 'İki', 'Üç', 'Dört'], kcal: null, allergens: [],
};

describe('inline product details', () => {
  it('keeps product details and uncertainty available in a native disclosure without a modal', () => {
    const html = renderToStaticMarkup(createElement(ItemCard, { item }));
    expect(html).toContain('<details>');
    expect(html).toContain('<summary');
    expect(html).toContain('Test kahve');
    expect(html).toContain('Ürün bilgileri');
    expect(html).toContain('Uzun açıklamanın tamamı');
    expect(html).toContain('Dört');
    expect(html).toContain('Tükendi');
    expect(html).toContain('alerjen içermediği anlamına gelmez');
    expect(html).not.toContain('<dialog');
    expect(html).not.toContain('aria-haspopup');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('kcal');
  });

  it('gives each expanded allergen section a unique accessible heading', () => {
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(ItemCard, { item }), createElement(ItemCard, { item: { ...item, id: 'second' } })));
    const ids = [...html.matchAll(/<section aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });
});
