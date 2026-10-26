import {
  ALLERGEN_CODES,
  allergenBucket,
  foldTr,
  matchesSearch,
  statusOf,
  type AllergenCode,
  type PublicMenu,
  type PublicMenuCategory,
  type PublicMenuItem,
} from '@qmenux/contracts';

/**
 * Guest search and filters (PUBLIC_DISCOVERY.md). Runs in the browser over the menu that is already on
 * the page, so it also works from the offline copy. The rules are the API's: Turkish folding for text,
 * and an allergen exclusion never treats a missing or UNKNOWN status as "free".
 */
export interface Filters {
  q: string;
  exclude: AllergenCode[];
  contains: AllergenCode[];
  categoryId: string | null;
  tags: string[];
  hideSoldOut: boolean;
}

export const EMPTY_FILTERS: Filters = { q: '', exclude: [], contains: [], categoryId: null, tags: [], hideSoldOut: false };

export function activeFilterCount(f: Filters): number {
  return f.exclude.length + f.contains.length + (f.categoryId ? 1 : 0) + f.tags.length + (f.hideSoldOut ? 1 : 0);
}

export function isFiltering(f: Filters): boolean {
  return f.q.trim().length > 0 || activeFilterCount(f) > 0;
}

/** Owner-entered tags across the menu, deduplicated the way search folds them, in Turkish order. */
export function menuTags(menu: PublicMenu): string[] {
  const seen = new Map<string, string>();
  for (const c of menu.categories) for (const i of c.items) for (const t of i.tags) {
    const label = t.trim();
    const key = foldTr(label);
    if (key && !seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr-TR'));
}

export interface ResultGroup {
  category: Pick<PublicMenuCategory, 'id' | 'name' | 'description'>;
  items: PublicMenuItem[];
}

export interface Discovery {
  groups: ResultGroup[];
  /** Matches whose allergen data cannot confirm the exclusion. Shown apart, with an explanation. */
  uncertain: ResultGroup[];
  count: number;
  uncertainCount: number;
}

export function discover(menu: PublicMenu, f: Filters): Discovery {
  const wantTags = f.tags.map(foldTr);
  const groups: ResultGroup[] = [];
  const uncertain: ResultGroup[] = [];
  let count = 0;
  let uncertainCount = 0;
  for (const c of menu.categories) {
    if (f.categoryId && c.id !== f.categoryId) continue;
    const ok: PublicMenuItem[] = [];
    const unsure: PublicMenuItem[] = [];
    for (const i of c.items) {
      if (!f.contains.every((code) => statusOf(i.allergens, code) === 'CONTAINS')) continue;
      if (f.hideSoldOut && i.availability === 'SOLD_OUT') continue;
      if (f.q && !matchesSearch([i.name, i.description, c.name, ...i.tags], f.q)) continue;
      if (wantTags.length) {
        const have = new Set(i.tags.map(foldTr));
        if (!wantTags.every((t) => have.has(t))) continue;
      }
      const bucket = allergenBucket(i.allergens, f.exclude);
      if (bucket === 'safe') ok.push(i);
      else if (bucket === 'uncertain') unsure.push(i);
    }
    if (ok.length) groups.push({ category: { id: c.id, name: c.name, description: c.description }, items: ok });
    if (unsure.length) uncertain.push({ category: { id: c.id, name: c.name, description: c.description }, items: unsure });
    count += ok.length;
    uncertainCount += unsure.length;
  }
  return { groups, uncertain, count, uncertainCount };
}

export type AllergenSummary =
  | { kind: 'listed'; contains: AllergenCode[]; mayContain: AllergenCode[]; unknown: number }
  | { kind: 'none-recorded' }
  | { kind: 'partial' }
  | { kind: 'all-free' };

/** What the item card says about allergens, without ever implying that unrecorded means absent. */
export function allergenSummary(item: Pick<PublicMenuItem, 'allergens'>): AllergenSummary {
  const contains: AllergenCode[] = [];
  const mayContain: AllergenCode[] = [];
  let unknown = 0;
  for (const code of ALLERGEN_CODES) {
    const s = statusOf(item.allergens, code);
    if (s === 'CONTAINS') contains.push(code);
    else if (s === 'MAY_CONTAIN') mayContain.push(code);
    else if (s === 'UNKNOWN') unknown++;
  }
  if (contains.length || mayContain.length) return { kind: 'listed', contains, mayContain, unknown };
  if (unknown === ALLERGEN_CODES.length) return { kind: 'none-recorded' };
  if (unknown > 0) return { kind: 'partial' };
  return { kind: 'all-free' };
}
