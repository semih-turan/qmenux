// BRAND-001 evidence: every text/background pair used by the shared components meets WCAG 2.2 AA
// (4.5:1 text, 3:1 non-text UI per SC 1.4.11) in both the light and dark token sets.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--qx-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT: [string, string][] = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['ink', 'surface-press'],
  ['ink-2', 'canvas'],
  ['ink-2', 'surface'],
  ['ink-2', 'surface-2'],
  ['ink-3', 'canvas'],
  ['ink-3', 'surface'],
  ['on-primary', 'primary'],
  ['on-primary', 'primary-press'],
  ['primary-text', 'canvas'],
  ['primary-text', 'surface'],
  ['primary-text', 'primary-surface'],
  ['on-danger', 'danger'],
  ['on-danger', 'danger-press'],
  ['danger-text', 'canvas'],
  ['danger-text', 'surface'],
  ['danger-text', 'danger-surface'],
  ['success-text', 'surface'],
  ['success-text', 'success-surface'],
  ['warning-text', 'surface'],
  ['warning-text', 'warning-surface'],
  ['info-text', 'info-surface'],
  ['toast-ink', 'toast-bg'],
  ['toast-action', 'toast-bg'],
];

// Focus rings are drawn with a 2px offset, so they always sit against canvas/surface, never the fill.
const NON_TEXT: [string, string][] = [
  ['border-strong', 'surface'],
  ['border-strong', 'canvas'],
  ['focus', 'canvas'],
  ['focus', 'surface'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s tokens', (_name, t) => {
  it.each(TEXT)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(NON_TEXT)('%s against %s ≥ 3:1', (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('dark token sets', () => {
  it('OS-preference and explicit data-theme blocks are identical', () => {
    expect(block(':root:not([data-theme="light"])')).toEqual(block(':root[data-theme="dark"]'));
  });
});

describe('approved palette is unchanged', () => {
  it('matches BRAND_DESIGN_SYSTEM.md', () => {
    expect([light['brand-primary'], light['brand-ink'], light['brand-canvas'], light['brand-red'], light['brand-mustard'], light['brand-sage']]).toEqual([
      '#e86a33',
      '#252420',
      '#f7f5f0',
      '#c94b3b',
      '#d9a441',
      '#66745c',
    ]);
  });
  it('documents why terracotta is never small text on light surfaces', () => {
    expect(contrast(light['brand-primary']!, '#ffffff')).toBeLessThan(4.5);
  });
});
