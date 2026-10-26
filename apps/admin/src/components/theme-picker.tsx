'use client';
import type { KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { THEME_IDS, THEME_META, THEME_SWATCHES, type ThemeId } from '@qmenux/contracts';

const KEYS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Radio group of the ten public themes, with roving arrow-key focus. Only the customer menu changes. */
export function ThemePicker({ value, suggested, onChange }: { value: ThemeId; suggested?: ThemeId; onChange: (t: ThemeId) => void }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = THEME_IDS.indexOf(value);
    const next = THEME_IDS[(i + dir + THEME_IDS.length) % THEME_IDS.length]!;
    onChange(next);
    (e.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className="qx-themes" role="radiogroup" aria-label="Menü teması" onKeyDown={onKeyDown}>
      {THEME_IDS.map((id) => {
        const s = THEME_SWATCHES[id];
        const checked = id === value;
        return (
          <button key={id} type="button" role="radio" data-value={id} aria-checked={checked} tabIndex={checked ? 0 : -1} className="qx-theme" onClick={() => onChange(id)}>
            <span className="qx-theme__swatch" style={{ background: s.bg, color: s.ink }} aria-hidden="true">
              <span className="qx-theme__aa">Aa</span>
              <span className="qx-theme__accent" style={{ background: s.accent }} />
            </span>
            <span className="qx-theme__name">
              {THEME_META[id].name}
              {checked && <Check size={16} aria-hidden="true" />}
            </span>
            <span className="qx-small qx-muted">{THEME_META[id].suitableFor}</span>
            {suggested === id && !checked && <span className="qx-theme__hint">Önerilen</span>}
          </button>
        );
      })}
    </div>
  );
}
