'use client';
import type { PublicMenu, PublicMenuItem } from '@qmenux/contracts';
import { AlertTriangle, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { sendMetric } from '@/lib/beacon';
import { activeFilterCount, discover, EMPTY_FILTERS, isFiltering, menuTags, type Filters, type ResultGroup } from '@/lib/discovery';
import { FilterSheet } from './filter-sheet';
import { Freshness } from './freshness';
import { ItemCard, ItemSheet } from './item';

const SEARCH_METRIC_DELAY_MS = 1200;
// How far the guest has to scroll on their own after a chip tap before scroll-spy takes over again.
const SPY_RELEASE_PX = 48;

function Group({ g, onOpen, prefix }: { g: ResultGroup; onOpen: (i: PublicMenuItem) => void; prefix: string }) {
  return (
    <section className="m-cat" aria-labelledby={`${prefix}-${g.category.id}`}>
      <h2 className="m-cat__title" id={`${prefix}-${g.category.id}`}>
        {g.category.name}
      </h2>
      <div className="m-items">
        {g.items.map((i) => (
          <ItemCard key={i.id} item={i} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MenuBrowser({ menu, renderedAt }: { menu: PublicMenu; renderedAt: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<PublicMenuItem | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(menu.categories[0]?.id ?? null);
  const [stuck, setStuck] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set by a chip tap: scroll-spy leaves the tapped category alone until the guest scrolls away from where it landed.
  const jumpRef = useRef<{ landedAt: number | null } | null>(null);

  const q = useDeferredValue(filters.q);
  const view = useMemo(() => ({ ...filters, q }), [filters, q]);
  const filtering = isFiltering(view);
  const result = useMemo(() => (filtering ? discover(menu, view) : null), [filtering, menu, view]);
  const tags = useMemo(() => menuTags(menu), [menu]);
  const itemCount = useMemo(() => menu.categories.reduce((n, c) => n + c.items.length, 0), [menu]);
  const active = activeFilterCount(filters);

  // Sold-out-only filtering still has a meaning here; the latest live menu decides what is listed.
  const openItem = useCallback((item: PublicMenuItem) => {
    setSelected(item);
    setItemOpen(true);
    sendMetric('item_view', item.id, true);
  }, []);

  // Keep the open detail in step with a refreshed menu (sold out while reading, price change).
  useEffect(() => {
    if (!selected) return;
    for (const c of menu.categories) {
      const fresh = c.items.find((i) => i.id === selected.id);
      if (fresh) {
        if (fresh !== selected) setSelected(fresh);
        return;
      }
    }
  }, [menu, selected]);

  // Sticky bar height feeds scroll-margin and scroll-padding so headings never hide under it.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--sticky-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    });
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const s = sentinelRef.current;
    if (!s) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting));
    io.observe(s);
    return () => io.disconnect();
  }, []);

  // Scroll-spy: the category whose top last passed a line just under the sticky bar is the current one.
  // Short last categories can never reach the bar, so over the final screenful of scrolling the line slides
  // down the viewport; every category gets its turn and the last one wins at the very bottom.
  useEffect(() => {
    if (filtering) return;
    const sections = [...document.querySelectorAll<HTMLElement>('[data-cat]')];
    if (!sections.length) return;
    let frame = 0;
    let last: string | null = null;
    const pick = () => {
      frame = 0;
      const jump = jumpRef.current;
      if (jump) {
        if (jump.landedAt === null || Math.abs(window.scrollY - jump.landedAt) < SPY_RELEASE_PX) return;
        jumpRef.current = null;
        last = null; // the tap moved the highlight without us, so re-sync on this pass
      }
      const y = window.scrollY;
      const scrolled = y > 0;
      let line = (barRef.current?.getBoundingClientRect().bottom ?? 0) + 8;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (scrolled && max > 0) {
        const span = Math.min(window.innerHeight, max);
        const t = Math.min(1, Math.max(0, 1 - (max - y) / span));
        line += t * (window.innerHeight * 0.8 - line);
      }
      let current = sections[0]!;
      for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
      const id = current.dataset.cat!;
      if (id === last) return;
      last = id;
      setActiveCat(id);
      if (scrolled) sendMetric('category_view', id, true);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [filtering, menu]);

  // Keep the current chip in view without moving the page vertically.
  useEffect(() => {
    const box = chipsRef.current;
    const chip = activeCat ? box?.querySelector<HTMLElement>(`[data-chip="${activeCat}"]`) : null;
    if (!box || !chip) return;
    const left = chip.offsetLeft - box.clientWidth / 2 + chip.offsetWidth / 2;
    box.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeCat]);

  // One aggregate "search" event per search, after typing settles. The text itself never leaves the page.
  const searchSent = useRef(false);
  useEffect(() => {
    const term = filters.q.trim();
    if (!term) {
      searchSent.current = false;
      return;
    }
    if (term.length < 2 || searchSent.current) return;
    const t = setTimeout(() => {
      searchSent.current = true;
      sendMetric('search');
    }, SEARCH_METRIC_DELAY_MS);
    return () => clearTimeout(t);
  }, [filters.q]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(`c-${id}`);
    if (!el) return;
    setActiveCat(id);
    const jump = { landedAt: null as number | null };
    jumpRef.current = jump;
    sendMetric('category_view', id, true);
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    // scrollend never fires when the page cannot move (already at the bottom), hence the timeout too.
    const land = () => {
      if (jump.landedAt === null) jump.landedAt = window.scrollY;
      window.removeEventListener('scrollend', land);
    };
    window.addEventListener('scrollend', land);
    setTimeout(land, 900);
  };

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    inputRef.current?.focus();
  };

  const startResults = () => {
    // Bring the results to the top when a search starts below the fold, so the first hits are visible.
    const s = sentinelRef.current;
    if (s && s.getBoundingClientRect().top < 0) window.scrollTo({ top: s.offsetTop, behavior: 'auto' });
  };

  const total = result ? result.count + result.uncertainCount : 0;

  return (
    <>
      <div ref={sentinelRef} className="m-sentinel" aria-hidden="true" />
      <div ref={barRef} className="m-bar" data-stuck={stuck}>
        <div className="m-wrap">
          <Freshness renderedAt={renderedAt} />
          <search className="m-search" aria-label="Menüde ara">
            <div className="m-search__field">
              <Search className="m-search__icon" size={20} aria-hidden="true" />
              <input
                ref={inputRef}
                className="m-input"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Menüde ara"
                aria-label="Menüde ara"
                value={filters.q}
                maxLength={80}
                onFocus={() => filters.q === '' || startResults()}
                onChange={(e) => {
                  if (!filters.q && e.target.value) startResults();
                  setFilters((f) => ({ ...f, q: e.target.value }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              {filters.q && (
                <button
                  type="button"
                  className="m-search__clear"
                  aria-label="Aramayı temizle"
                  onClick={() => {
                    setFilters((f) => ({ ...f, q: '' }));
                    inputRef.current?.focus();
                  }}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              className="m-iconbtn"
              data-active={active > 0}
              aria-haspopup="dialog"
              aria-label={active > 0 ? `Filtreler, ${active} etkin` : 'Filtreler'}
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal size={20} aria-hidden="true" />
              {active > 0 && (
                <span className="m-count" aria-hidden="true">
                  {active}
                </span>
              )}
            </button>
          </search>
          {!filtering && menu.categories.length > 1 ? (
            <nav aria-label="Kategoriler">
              <div className="m-chips" ref={chipsRef}>
                {menu.categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="m-chip"
                    data-chip={c.id}
                    aria-current={activeCat === c.id ? 'true' : undefined}
                    onClick={() => jumpTo(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </nav>
          ) : (
            <div className="m-bar__pad" aria-hidden="true" />
          )}
        </div>
      </div>

      <main id="menu" className="m-wrap" tabIndex={-1}>
        <p className="m-sr" role="status">
          {result
            ? total > 0
              ? `${result.count} ürün bulundu${result.uncertainCount > 0 ? `, ${result.uncertainCount} ürünün alerjen bilgisi eksik` : ''}`
              : 'Sonuç bulunamadı'
            : ''}
        </p>
        {result ? (
          <div className="m-results">
            {/* With nothing found the empty state carries the clear action; one button is enough. */}
            {total > 0 && (
              <div className="m-filterline">
                <p>
                  <strong>{result.count}</strong> ürün
                  {result.uncertainCount > 0 && <> · {result.uncertainCount} ürünün bilgisi eksik</>}
                </p>
                <button type="button" className="m-btn m-btn--link" onClick={clearAll}>
                  Tümünü temizle
                </button>
              </div>
            )}
            {total === 0 ? (
              <div className="m-empty">
                <span className="m-empty__icon" aria-hidden="true">
                  <SearchX size={26} />
                </span>
                <h2>Sonuç bulunamadı</h2>
                <p>
                  {!view.q.trim()
                    ? 'Seçtiğiniz filtrelere uyan ürün yok.'
                    : active > 0
                      ? `“${view.q.trim()}” için seçtiğiniz filtrelere uyan ürün yok.`
                      : `“${view.q.trim()}” için eşleşen ürün yok. Farklı bir kelime deneyin.`}
                </p>
                <button type="button" className="m-btn" onClick={clearAll}>
                  {!view.q.trim() ? 'Filtreleri temizle' : active > 0 ? 'Aramayı ve filtreleri temizle' : 'Aramayı temizle'}
                </button>
              </div>
            ) : (
              <>
                {result.count === 0 && (
                  <div className="m-empty m-empty--inline">
                    <span className="m-empty__icon" aria-hidden="true">
                      <AlertTriangle size={22} />
                    </span>
                    <h2>Doğrulanmış sonuç yok</h2>
                    <p>Seçtiğiniz alerjenleri içermediği işletme tarafından doğrulanmış bir ürün bulunamadı.</p>
                  </div>
                )}
                <div className="m-cats">
                  {result.groups.map((g) => (
                    <Group key={g.category.id} g={g} onOpen={openItem} prefix="r" />
                  ))}
                </div>
                {result.uncertain.length > 0 && (
                  <section className="m-uncertain" aria-labelledby="m-unc-title">
                    <h2 id="m-unc-title">
                      <AlertTriangle size={18} aria-hidden="true" />
                      Alerjen bilgisi eksik ürünler
                    </h2>
                    <p>
                      Bu ürünlerde seçtiğiniz alerjenler için doğrulanmış bilgi yok; içermedikleri anlamına gelmez. Emin olmak için
                      personele danışın.
                    </p>
                    {result.uncertain.map((g) => (
                      <Group key={g.category.id} g={g} onOpen={openItem} prefix="u" />
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="m-cats">
            {menu.categories.map((c) => (
              <section key={c.id} id={`c-${c.id}`} className="m-cat" data-cat={c.id} aria-labelledby={`h-${c.id}`}>
                <h2 className="m-cat__title" id={`h-${c.id}`} tabIndex={-1}>
                  {c.name}
                </h2>
                {c.description && <p className="m-cat__desc">{c.description}</p>}
                <div className="m-items">
                  {c.items.map((i) => (
                    <ItemCard key={i.id} item={i} onOpen={openItem} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <ItemSheet item={selected} open={itemOpen} onClose={() => setItemOpen(false)} />
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        tags={tags}
        count={result ? result.count : itemCount}
        uncertain={result ? result.uncertainCount : 0}
      />
    </>
  );
}
