import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_ID, THEME_IDS, THEME_SWATCHES } from '@qmenux/contracts';
import { resolveTheme, THEMES, themeStyle, type ThemeTokens } from '../src/lib/themes';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every foreground/background pair menu.css puts text on. All of it is body-size text, so AA is 4.5:1. */
const TEXT_PAIRS: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['accentInk', 'bg'],
  ['accentInk', 'surface'],
  ['onAccent', 'accent'],
  ['ink', 'highlight'],
];

describe('theme registry', () => {
  it('has exactly the ten catalogue themes', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    expect(THEME_IDS).toHaveLength(10);
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
  });

  it('starts from the swatches the admin theme picker shows', () => {
    for (const id of THEME_IDS) {
      const { bg, ink, accent } = THEMES[id].tokens;
      expect({ bg, ink, accent }).toEqual(THEME_SWATCHES[id]);
    }
  });

  it('uses plain #RRGGBB colours only', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id].tokens;
      for (const k of ['bg', 'surface', 'ink', 'muted', 'line', 'accent', 'onAccent', 'accentInk', 'decor', 'highlight'] as const) {
        expect(t[k], `${id}.${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it.each(THEME_IDS)('%s meets WCAG AA for every text pair', (id) => {
    const t = THEMES[id].tokens;
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(contrast(t[fg], t[bg]), `${id}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('marks dark themes by their background', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      expect(t.dark, id).toBe(luminance(t.tokens.bg) < luminance(t.tokens.ink));
    }
  });
});

describe('resolveTheme', () => {
  it('returns a known theme as is', () => {
    expect(resolveTheme('dark-dining')).toEqual({ theme: THEMES['dark-dining'], fallback: false });
  });
  it('falls back to the default for unknown, retired or missing ids', () => {
    for (const id of ['', 'neon', 'Coffee-Minimal', '__proto__', 'constructor', null, undefined]) {
      expect(resolveTheme(id)).toEqual({ theme: THEMES[DEFAULT_THEME_ID], fallback: true });
    }
  });
});

describe('themeStyle', () => {
  it('maps tokens to custom properties and the colour scheme', () => {
    const s = themeStyle(THEMES['dark-dining']) as Record<string, string>;
    expect(s['--t-bg']).toBe(THEMES['dark-dining'].tokens.bg);
    expect(s['--t-on-accent']).toBe(THEMES['dark-dining'].tokens.onAccent);
    expect(s['--t-heading-weight']).toBe(String(THEMES['dark-dining'].tokens.headingWeight));
    expect(s.colorScheme).toBe('dark');
    expect((themeStyle(THEMES['coffee-minimal']) as Record<string, string>).colorScheme).toBe('light');
  });
});
