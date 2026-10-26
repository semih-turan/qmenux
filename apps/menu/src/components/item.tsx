'use client';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS_TR,
  ALLERGEN_SHORT_LABELS_TR,
  formatMinor,
  statusOf,
  type AllergenCode,
  type AllergenStatus,
  type PublicMenuItem,
} from '@qmenux/contracts';
import { memo, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { sendMetric } from '@/lib/beacon';
import { allergenSummary } from '@/lib/discovery';

const short = (codes: AllergenCode[]) => codes.map((c) => ALLERGEN_SHORT_LABELS_TR[c]).join(', ');

/** One line under the card. Unrecorded never reads as "free"; the full table is in the inline detail. */
function AllergenLine({ item }: { item: PublicMenuItem }) {
  const s = allergenSummary(item);
  if (s.kind === 'none-recorded') return <p className="m-card__al">Alerjen bilgisi girilmemiş</p>;
  if (s.kind === 'partial') return <p className="m-card__al">Alerjen bilgisi eksik</p>;
  if (s.kind === 'all-free') return <p className="m-card__al">Listelenen 14 alerjeni içermez</p>;
  return (
    <p className="m-card__al">
      {s.contains.length > 0 && (
        <>
          <b>İçerir:</b> {short(s.contains)}
        </>
      )}
      {s.contains.length > 0 && s.mayContain.length > 0 && ' · '}
      {s.mayContain.length > 0 && (
        <>
          <b>Eser miktarda:</b> {short(s.mayContain)}
        </>
      )}
      {s.unknown > 0 && ' · diğerleri için bilgi yok'}
    </p>
  );
}

export const ItemCard = memo(function ItemCard({ item }: { item: PublicMenuItem }) {
  const soldOut = item.availability === 'SOLD_OUT';
  const tags = item.tags.slice(0, 3);
  return (
    <article className="m-product" data-soldout={soldOut}>
      <details onToggle={(e) => {
        if (e.currentTarget.open) sendMetric('item_view', item.id, true);
      }}>
        <summary className="m-card">
          {item.imageUrl && <img className="m-card__img" src={item.imageUrl} alt="" width={88} height={88} loading="lazy" decoding="async" />}
          <div className="m-card__body">
            <div className="m-card__top">
              <h3 className="m-card__name">
                {item.name}
              </h3>
              <span className="m-leader" aria-hidden="true" />
              <span className="m-price">{formatMinor(item.priceMinor)}</span>
            </div>
            {item.description && <p className="m-card__desc">{item.description}</p>}
            {(soldOut || tags.length > 0 || item.kcal !== null) && (
              <div className="m-card__meta">
                {soldOut && <span className="m-soldout">Tükendi</span>}
                {tags.map((t) => (
                  <span className="m-tag" key={t}>
                    {t}
                  </span>
                ))}
                {item.kcal !== null && <span className="m-kcal">{item.kcal} kcal</span>}
              </div>
            )}
            <AllergenLine item={item} />
            <span className="m-card__more">Ürün bilgileri <ChevronDown size={16} aria-hidden="true" /></span>
          </div>
        </summary>
        <div className="m-item-detail">
          {item.imageUrl && <img className="m-detail__img" src={item.imageUrl} alt={`${item.name} fotoğrafı`} loading="lazy" decoding="async" />}
          {item.description && <p className="m-detail__desc">{item.description}</p>}
          {item.tags.length > 0 && <ul className="m-card__meta" aria-label="Etiketler">{item.tags.map((tag) => <li className="m-tag" key={tag}>{tag}</li>)}</ul>}
          <AllergenTable item={item} />
        </div>
      </details>
    </article>
  );
});

const GROUPS: { status: AllergenStatus; title: string; cls: string }[] = [
  { status: 'CONTAINS', title: 'İçerir', cls: 'm-algroup--contains' },
  { status: 'MAY_CONTAIN', title: 'Eser miktarda içerebilir', cls: 'm-algroup--may' },
  { status: 'FREE', title: 'İçermez', cls: 'm-algroup--free' },
  { status: 'UNKNOWN', title: 'Bilgi yok', cls: 'm-algroup--unknown' },
];

function AllergenTable({ item }: { item: PublicMenuItem }) {
  const titleId = useId();
  const by = new Map<AllergenStatus, AllergenCode[]>(GROUPS.map((g) => [g.status, []]));
  for (const code of ALLERGEN_CODES) by.get(statusOf(item.allergens, code))!.push(code);
  const unknown = by.get('UNKNOWN')!.length;
  return (
    <section aria-labelledby={titleId}>
      <h4 className="m-section-title" id={titleId}>
        Alerjenler
      </h4>
      {unknown === ALLERGEN_CODES.length ? (
        <p className="m-note">
          İşletme bu ürün için alerjen bilgisi girmemiş. <strong>Bu, ürünün alerjen içermediği anlamına gelmez.</strong> Ciddi
          alerjiniz varsa sipariş öncesi personele danışın.
        </p>
      ) : (
        <>
          <div className="m-algroups">
            {GROUPS.map((g) => {
              const codes = by.get(g.status)!;
              if (!codes.length) return null;
              return (
                <div className={`m-algroup ${g.cls}`} key={g.status}>
                  <h5>{g.title}</h5>
                  <ul>
                    {codes.map((c) => (
                      <li key={c}>{ALLERGEN_LABELS_TR[c]}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="m-note">
            {unknown > 0 && (
              <>
                <strong>“Bilgi yok” olanlar, ürünün o alerjeni içermediği anlamına gelmez.</strong>{' '}
              </>
            )}
            Ciddi alerjiniz varsa sipariş öncesi personele danışın.
          </p>
        </>
      )}
    </section>
  );
}
