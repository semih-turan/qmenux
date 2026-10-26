import { describe, expect, it } from 'vitest';
import type { PublicMenu, PublicMenuItem } from '@qmenux/contracts';
import { activeFilterCount, allergenSummary, discover, EMPTY_FILTERS, isFiltering, menuTags, type Filters } from '../src/lib/discovery';

function item(id: string, over: Partial<PublicMenuItem> = {}): PublicMenuItem {
  return { id, name: id, description: null, priceMinor: 10000, imageUrl: null, availability: 'AVAILABLE', tags: [], kcal: null, allergens: [], ...over };
}

const menu: PublicMenu = {
  slug: 'demo-kahve',
  displayName: 'Demo Kahve',
  tagline: null,
  businessType: 'CAFE',
  themeId: 'coffee-minimal',
  logoUrl: null,
  branch: { name: 'Merkez', address: null, phone: null, hoursText: null },
  wifi: null,
  whatsapp: null,
  revision: { no: 1, publishedAt: '2026-10-25T11:30:00.000Z' },
  categories: [
    {
      id: 'hot',
      name: 'Sıcak İçecekler',
      description: null,
      items: [
        item('espresso', { name: 'Espresso', tags: ['Vegan'], allergens: [{ code: 'MILK', status: 'FREE' }] }),
        item('latte', { name: 'Latte', description: 'Süt köpüğü ile', tags: ['sütlü'], allergens: [{ code: 'MILK', status: 'CONTAINS' }] }),
        item('turk', { name: 'Türk kahvesi', tags: ['Geleneksel', 'vegan'] }),
        item('salep', { name: 'Salep', availability: 'SOLD_OUT', tags: ['Kış'], allergens: [{ code: 'MILK', status: 'MAY_CONTAIN' }] }),
      ],
    },
    {
      id: 'sweet',
      name: 'Tatlılar',
      description: null,
      items: [
        item('cheesecake', { name: 'Cheesecake', allergens: [{ code: 'GLUTEN', status: 'UNKNOWN' }, { code: 'MILK', status: 'UNKNOWN' }] }),
        item('sorbe', { name: 'Limon sorbe', tags: ['VEGAN'], allergens: [{ code: 'MILK', status: 'FREE' }, { code: 'GLUTEN', status: 'FREE' }] }),
      ],
    },
  ],
};

const f = (over: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...over });
const ids = (groups: { items: PublicMenuItem[] }[]) => groups.flatMap((g) => g.items.map((i) => i.id));

describe('filter state', () => {
  it('counts filters, not the search text', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount(f({ q: 'latte' }))).toBe(0);
    expect(activeFilterCount(f({ exclude: ['MILK', 'GLUTEN'], tags: ['vegan'], hideSoldOut: true }))).toBe(4);
  });
  it('treats whitespace-only search as not searching', () => {
    expect(isFiltering(f({ q: '   ' }))).toBe(false);
    expect(isFiltering(f({ q: 'a' }))).toBe(true);
    expect(isFiltering(f({ hideSoldOut: true }))).toBe(true);
  });
});

describe('menuTags', () => {
  it('dedupes tags the way search folds them and sorts them in Turkish order', () => {
    expect(menuTags(menu)).toEqual(['Geleneksel', 'Kış', 'sütlü', 'Vegan']);
  });
});

describe('discover', () => {
  it('filters by category without losing its description', () => {
    const described = { ...menu, categories: menu.categories.map((c) => ({ ...c, description: 'Kategori açıklaması' })) };
    const d = discover(described, f({ categoryId: 'sweet' }));
    expect(ids(d.groups)).toEqual(['cheesecake', 'sorbe']);
    expect(d.groups[0]!.category.description).toBe('Kategori açıklaması');
    expect(activeFilterCount(f({ categoryId: 'sweet' }))).toBe(1);
    expect(discover(menu, f({ categoryId: 'missing' })).count).toBe(0);
  });

  it('contains filters require a declared CONTAINS status, never unknown or may-contain', () => {
    expect(ids(discover(menu, f({ contains: ['MILK'] })).groups)).toEqual(['latte']);
    expect(discover(menu, f({ contains: ['MILK', 'GLUTEN'] })).count).toBe(0);
    const contradictory = discover(menu, f({ contains: ['MILK'], exclude: ['MILK'] }));
    expect(contradictory.count).toBe(0);
    expect(contradictory.uncertainCount).toBe(0);
    expect(activeFilterCount(f({ contains: ['MILK'] }))).toBe(1);
  });
  it('returns the whole menu, grouped, when nothing is set', () => {
    const d = discover(menu, EMPTY_FILTERS);
    expect(d.groups.map((g) => g.category.id)).toEqual(['hot', 'sweet']);
    expect(d.count).toBe(6);
    expect(d.uncertainCount).toBe(0);
  });

  it('searches with Turkish folding across name, description, category and tags', () => {
    expect(ids(discover(menu, f({ q: 'TURK KAHVESİ' })).groups)).toEqual(['turk']);
    expect(ids(discover(menu, f({ q: 'kopugu' })).groups)).toEqual(['latte']);
    expect(ids(discover(menu, f({ q: 'tatlilar' })).groups)).toEqual(['cheesecake', 'sorbe']);
    expect(ids(discover(menu, f({ q: 'kis' })).groups)).toEqual(['salep']);
    expect(ids(discover(menu, f({ q: 'sıcak latte' })).groups)).toEqual(['latte']);
    expect(discover(menu, f({ q: 'pizza' })).count).toBe(0);
  });

  it('hides sold-out items only when asked', () => {
    expect(ids(discover(menu, f({ hideSoldOut: true })).groups)).not.toContain('salep');
    expect(ids(discover(menu, EMPTY_FILTERS).groups)).toContain('salep');
  });

  it('requires every selected tag, case- and diacritic-insensitively', () => {
    expect(ids(discover(menu, f({ tags: ['vegan'] })).groups)).toEqual(['espresso', 'turk', 'sorbe']);
    expect(ids(discover(menu, f({ tags: ['VEGAN', 'geleneksel'] })).groups)).toEqual(['turk']);
  });

  it('only lists recorded FREE items as safe and keeps unrecorded ones apart', () => {
    const d = discover(menu, f({ exclude: ['MILK'] }));
    expect(ids(d.groups)).toEqual(['espresso', 'sorbe']);
    // Türk kahvesi has nothing recorded and cheesecake says UNKNOWN: neither is "milk-free".
    expect(ids(d.uncertain)).toEqual(['turk', 'cheesecake']);
    expect(d.count).toBe(2);
    expect(d.uncertainCount).toBe(2);
    // CONTAINS and MAY_CONTAIN are excluded outright.
    expect([...ids(d.groups), ...ids(d.uncertain)]).not.toContain('latte');
    expect([...ids(d.groups), ...ids(d.uncertain)]).not.toContain('salep');
  });

  it('needs FREE on every excluded allergen to call an item safe', () => {
    const d = discover(menu, f({ exclude: ['MILK', 'GLUTEN'] }));
    expect(ids(d.groups)).toEqual(['sorbe']);
    expect(ids(d.uncertain)).toEqual(['espresso', 'turk', 'cheesecake']);
  });

  it('combines search, tags and exclusions', () => {
    const d = discover(menu, f({ q: 'kahve', tags: ['vegan'], exclude: ['MILK'] }));
    expect(d.count).toBe(0);
    expect(ids(d.uncertain)).toEqual(['turk']);
  });
});

describe('allergenSummary', () => {
  it('never reads an empty record as allergen-free', () => {
    expect(allergenSummary({ allergens: [] })).toEqual({ kind: 'none-recorded' });
  });
  it('lists contains and may-contain, counting what is still unknown', () => {
    const s = allergenSummary({ allergens: [{ code: 'MILK', status: 'CONTAINS' }, { code: 'SESAME', status: 'MAY_CONTAIN' }, { code: 'GLUTEN', status: 'FREE' }] });
    expect(s).toEqual({ kind: 'listed', contains: ['MILK'], mayContain: ['SESAME'], unknown: 11 });
  });
  it('is partial while some allergens are unrecorded', () => {
    expect(allergenSummary({ allergens: [{ code: 'MILK', status: 'FREE' }] })).toEqual({ kind: 'partial' });
  });
  it('is all-free only when all fourteen are recorded FREE', () => {
    const codes = ['GLUTEN', 'CRUSTACEANS', 'EGGS', 'FISH', 'PEANUTS', 'SOY', 'MILK', 'TREE_NUTS', 'CELERY', 'MUSTARD', 'SESAME', 'SULPHITES', 'LUPIN', 'MOLLUSCS'] as const;
    expect(allergenSummary({ allergens: codes.map((code) => ({ code, status: 'FREE' as const })) })).toEqual({ kind: 'all-free' });
  });
});
