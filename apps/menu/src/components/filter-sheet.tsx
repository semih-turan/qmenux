'use client';
import { ALLERGEN_CODES, ALLERGEN_LABELS_TR, ALLERGEN_SHORT_LABELS_TR, type PublicMenuCategory } from '@qmenux/contracts';
import { Check } from 'lucide-react';
import { activeFilterCount, type Filters } from '@/lib/discovery';
import { Sheet } from './sheet';

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/**
 * Filters apply as they are tapped, so the count on the main button is always the real result. The
 * allergen wording is "should not contain" because only verified FREE values pass; everything
 * unrecorded is listed apart instead of being hidden or shown as safe.
 */
export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  tags,
  categories,
  count,
  uncertain,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  tags: string[];
  categories: Pick<PublicMenuCategory, 'id' | 'name'>[];
  /** Items that match, allergen exclusions verified. */
  count: number;
  /** Items listed apart because their allergen record is missing. */
  uncertain: number;
}) {
  const active = activeFilterCount(filters);
  // Unverified items are never counted as matches, so "4 ürün" can't read as "4 milk-free items".
  const label = count > 0 ? `${count} ürünü göster` : uncertain > 0 ? 'Sonuçları göster' : 'Sonuç yok';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtrele"
      footer={
        <>
          <button
            type="button"
            className="m-btn"
            disabled={active === 0}
            onClick={() => onChange({ ...filters, exclude: [], contains: [], categoryId: null, tags: [], hideSoldOut: false })}
          >
            Temizle
          </button>
          <button type="button" className="m-btn m-btn--primary" onClick={onClose}>
            {label}
          </button>
        </>
      }
    >
      <label className="m-category-filter">
        <span>Kategori</span>
        <select value={filters.categoryId ?? ''} onChange={(e) => onChange({ ...filters, categoryId: e.target.value || null })}>
          <option value="">Tüm kategoriler</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>

      {([
        { key: 'contains', title: 'Şunları içersin', hint: 'İşletmenin içerdiğini doğruladığı alerjenlere göre gösterilir.' },
        { key: 'exclude', title: 'Şunları içermesin', hint: 'Yalnızca işletmenin içermediğini doğruladığı ürünler listelenir. Bilgisi eksik ürünler ayrıca gösterilir.' },
      ] as const).map(({ key, title, hint }) => (
        <fieldset className="m-fieldset" key={key}>
          <legend>{title}</legend>
          <p className="m-hint">{hint}</p>
          <div className="m-toggles">
            {ALLERGEN_CODES.map((code) => {
              const on = filters[key].includes(code);
              return (
                <button key={code} type="button" className="m-toggle" aria-pressed={on} title={ALLERGEN_LABELS_TR[code]}
                  onClick={() => onChange({ ...filters, [key]: toggle(filters[key], code) })}>
                  {on && <Check size={16} aria-hidden="true" />}
                  {ALLERGEN_SHORT_LABELS_TR[code]}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {tags.length > 0 && (
        <fieldset className="m-fieldset">
          <legend>Etiketler</legend>
          <div className="m-toggles m-toggles--wrap">
            {tags.map((t) => {
              const on = filters.tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className="m-toggle"
                  aria-pressed={on}
                  onClick={() => onChange({ ...filters, tags: toggle(filters.tags, t) })}
                >
                  {on && <Check size={16} aria-hidden="true" />}
                  {t}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <button
        type="button"
        role="switch"
        className="m-switchrow"
        aria-checked={filters.hideSoldOut}
        onClick={() => onChange({ ...filters, hideSoldOut: !filters.hideSoldOut })}
      >
        <span>Tükenenleri gizle</span>
        <span className="m-switch" aria-hidden="true" />
      </button>
    </Sheet>
  );
}
