import { DEFAULT_THEME_ID, THEME_IDS, THEME_SWATCHES, type ThemeId } from '@qmenux/contracts';
import type { CSSProperties } from 'react';

/**
 * Public menu theme registry (THEME_SYSTEM.md, PUBLIC_THEME_CATALOG.md). A theme only changes how the
 * same published menu looks: every theme renders the same components, the same prices, allergen
 * table, sold-out state, Wi-Fi and WhatsApp rules. Variation is limited to the tokens and the few
 * layout switches below, so no theme can drop a required disclosure.
 *
 * Colours start from THEME_SWATCHES (shared with the admin theme picker). `accent` is the fill colour
 * behind `onAccent` text; `accentInk` is accent-coloured text on `bg`/`surface`; `decor` is purely
 * decorative. Every text pair is checked for WCAG AA in test/themes.test.ts.
 */
export interface ThemeTokens {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onAccent: string;
  accentInk: string;
  decor: string;
  /** Background of the price tag (`price: 'tag'`), always paired with `ink`. */
  highlight: string;
  fontDisplay: string;
  fontBody: string;
  radius: string;
  headingWeight: number;
  headingCase: 'none' | 'uppercase';
  headingTracking: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  /** Bumped whenever the rendered output changes; tenants pin a version in a later release. */
  version: number;
  layout: 'list' | 'cards' | 'tiles';
  header: 'start' | 'center' | 'band';
  ornament: 'none' | 'leaf' | 'rule' | 'wave' | 'numbered' | 'checker';
  price: 'plain' | 'pill' | 'tag' | 'leader';
  dark: boolean;
  tokens: ThemeTokens;
}

const SERIF = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const ROUNDED = 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, "Segoe UI", system-ui, sans-serif';
const CONDENSED = '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", system-ui, sans-serif';
const DIDONE = 'Didot, "Bodoni 72", "Bodoni MT", "Hoefler Text", Garamond, "Times New Roman", serif';
const HUMANIST = 'Optima, Candara, "Gill Sans", "Gill Sans MT", "Segoe UI", system-ui, sans-serif';
const SLAB = 'Rockwell, "Rockwell Nova", "Roboto Slab", "Courier New", Georgia, serif';
const GOTHIC = '"Hiragino Sans", "Yu Gothic UI", "Yu Gothic", "Helvetica Neue", system-ui, sans-serif';

const base = (id: ThemeId) => THEME_SWATCHES[id];

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'coffee-minimal': {
    id: 'coffee-minimal',
    version: 1,
    layout: 'list',
    header: 'start',
    ornament: 'none',
    price: 'plain',
    dark: false,
    tokens: {
      ...base('coffee-minimal'),
      surface: '#FFFCF7',
      muted: '#6A5545',
      line: '#E3D7C7',
      onAccent: '#FFFFFF',
      accentInk: '#7A4E32',
      decor: '#8A5A3B',
      highlight: '#EAD9C4',
      fontDisplay: SERIF,
      fontBody: SANS,
      radius: '10px',
      headingWeight: 600,
      headingCase: 'none',
      headingTracking: '-0.01em',
    },
  },
  'botanical-cafe': {
    id: 'botanical-cafe',
    version: 1,
    layout: 'cards',
    header: 'center',
    ornament: 'leaf',
    price: 'plain',
    dark: false,
    tokens: {
      ...base('botanical-cafe'),
      surface: '#FFFFFF',
      muted: '#55655A',
      line: '#E2E4D6',
      onAccent: '#FFFFFF',
      accentInk: '#4E6B4B',
      decor: '#6E8B6B',
      highlight: '#E3EADB',
      fontDisplay: SERIF,
      fontBody: ROUNDED,
      radius: '20px',
      headingWeight: 600,
      headingCase: 'none',
      headingTracking: '0',
    },
  },
  'dark-dining': {
    id: 'dark-dining',
    version: 1,
    layout: 'cards',
    header: 'center',
    ornament: 'rule',
    price: 'plain',
    dark: true,
    tokens: {
      ...base('dark-dining'),
      surface: '#222226',
      muted: '#B5ADA3',
      line: '#36363C',
      onAccent: '#17171A',
      accentInk: '#D8935F',
      decor: '#C27A4A',
      highlight: '#3A2C22',
      fontDisplay: '"Big Caslon", "Book Antiqua", Palatino, Georgia, serif',
      fontBody: SANS,
      radius: '4px',
      headingWeight: 500,
      headingCase: 'uppercase',
      headingTracking: '0.12em',
    },
  },
  'street-food': {
    id: 'street-food',
    version: 1,
    layout: 'cards',
    header: 'band',
    ornament: 'none',
    price: 'pill',
    dark: false,
    tokens: {
      ...base('street-food'),
      surface: '#FFFFFF',
      muted: '#5E554E',
      line: '#1E1A17',
      onAccent: '#1E1A17',
      accentInk: '#B83A16',
      decor: '#FFC53D',
      highlight: '#FFE1A8',
      fontDisplay: CONDENSED,
      fontBody: SANS,
      radius: '14px',
      headingWeight: 800,
      headingCase: 'uppercase',
      headingTracking: '0.01em',
    },
  },
  'classic-bistro': {
    id: 'classic-bistro',
    version: 1,
    layout: 'list',
    header: 'center',
    ornament: 'rule',
    price: 'leader',
    dark: false,
    tokens: {
      ...base('classic-bistro'),
      surface: '#FFFDF8',
      muted: '#595E6B',
      line: '#D9D2C3',
      onAccent: '#FFFFFF',
      accentInk: '#7A2E2E',
      decor: '#7A2E2E',
      highlight: '#F0E4D2',
      fontDisplay: 'Georgia, "Times New Roman", serif',
      fontBody: 'Georgia, "Times New Roman", serif',
      radius: '2px',
      headingWeight: 700,
      headingCase: 'none',
      headingTracking: '0',
    },
  },
  'elegant-serif': {
    id: 'elegant-serif',
    version: 1,
    layout: 'list',
    header: 'center',
    ornament: 'rule',
    price: 'plain',
    dark: false,
    tokens: {
      ...base('elegant-serif'),
      surface: '#FFFFFF',
      muted: '#5F5F5F',
      line: '#E6E1D8',
      onAccent: '#FFFFFF',
      accentInk: '#7A6640',
      decor: '#9C8457',
      highlight: '#F3EEE4',
      fontDisplay: DIDONE,
      fontBody: SERIF,
      radius: '0px',
      headingWeight: 400,
      headingCase: 'none',
      headingTracking: '0.02em',
    },
  },
  mediterranean: {
    id: 'mediterranean',
    version: 1,
    layout: 'cards',
    header: 'band',
    ornament: 'wave',
    price: 'plain',
    dark: false,
    tokens: {
      ...base('mediterranean'),
      surface: '#FFFBF2',
      muted: '#4A5F70',
      line: '#E2D6BE',
      onAccent: '#FFFFFF',
      accentInk: '#1A5F91',
      decor: '#E3A64A',
      highlight: '#DCEAF4',
      fontDisplay: HUMANIST,
      fontBody: HUMANIST,
      radius: '16px',
      headingWeight: 600,
      headingCase: 'none',
      headingTracking: '0',
    },
  },
  'japanese-minimal': {
    id: 'japanese-minimal',
    version: 1,
    layout: 'list',
    header: 'start',
    ornament: 'numbered',
    price: 'plain',
    dark: false,
    tokens: {
      ...base('japanese-minimal'),
      surface: '#FFFFFF',
      muted: '#5C5A56',
      line: '#DAD6CF',
      onAccent: '#FFFFFF',
      accentInk: '#A8352A',
      decor: '#B23A2E',
      highlight: '#EFE9E1',
      fontDisplay: GOTHIC,
      fontBody: GOTHIC,
      radius: '0px',
      headingWeight: 500,
      headingCase: 'none',
      headingTracking: '0.06em',
    },
  },
  'modern-grid': {
    id: 'modern-grid',
    version: 1,
    layout: 'tiles',
    header: 'start',
    ornament: 'none',
    price: 'plain',
    dark: false,
    tokens: {
      ...base('modern-grid'),
      surface: '#FFFFFF',
      muted: '#4B5563',
      line: '#E5E7EB',
      onAccent: '#FFFFFF',
      accentInk: '#1D4ED8',
      decor: '#2563EB',
      highlight: '#DBEAFE',
      fontDisplay: SANS,
      fontBody: SANS,
      radius: '14px',
      headingWeight: 700,
      headingCase: 'none',
      headingTracking: '-0.02em',
    },
  },
  'retro-diner': {
    id: 'retro-diner',
    version: 1,
    layout: 'cards',
    header: 'band',
    ornament: 'checker',
    price: 'tag',
    dark: false,
    tokens: {
      ...base('retro-diner'),
      surface: '#FFFDF6',
      muted: '#66513F',
      line: '#E9D7B4',
      onAccent: '#FFFFFF',
      accentInk: '#B71C31',
      decor: '#E8B03A',
      highlight: '#F2C14E',
      fontDisplay: SLAB,
      fontBody: SANS,
      radius: '12px',
      headingWeight: 700,
      headingCase: 'none',
      headingTracking: '0',
    },
  },
};

/** Unknown or retired theme ids fall back to the default instead of breaking the menu (THEME_SYSTEM.md "Safety"). */
export function resolveTheme(id: string | null | undefined): { theme: ThemeDefinition; fallback: boolean } {
  if (id && (THEME_IDS as readonly string[]).includes(id)) return { theme: THEMES[id as ThemeId], fallback: false };
  return { theme: THEMES[DEFAULT_THEME_ID], fallback: true };
}

/** CSS custom properties for one theme. Values come from this file only, never from tenant input. */
export function themeStyle(t: ThemeDefinition): CSSProperties {
  const k = t.tokens;
  return {
    '--t-bg': k.bg,
    '--t-surface': k.surface,
    '--t-ink': k.ink,
    '--t-muted': k.muted,
    '--t-line': k.line,
    '--t-accent': k.accent,
    '--t-on-accent': k.onAccent,
    '--t-accent-ink': k.accentInk,
    '--t-decor': k.decor,
    '--t-highlight': k.highlight,
    '--t-font-display': k.fontDisplay,
    '--t-font-body': k.fontBody,
    '--t-radius': k.radius,
    '--t-heading-weight': String(k.headingWeight),
    '--t-heading-case': k.headingCase,
    '--t-heading-tracking': k.headingTracking,
    colorScheme: t.dark ? 'dark' : 'light',
  } as CSSProperties;
}
