// Version design options (versions.style_json, SPEC §4). PURE. The stored JSON holds only what the user chose;
// everything else falls back to the defaults here (or, where NULL, to the template's own default — P3).
import { DATE_STYLES, defaultDateStyle, type DateStyle } from './dates';
import type { Lang, TemplateId } from './types';

export const FONT_IDS = ['inter', 'lato', 'source-sans-3', 'merriweather', 'eb-garamond', 'noto-sans'] as const;
export type FontId = (typeof FONT_IDS)[number];
export type Paper = 'a4' | 'letter';
export type HeadingCase = 'upper' | 'normal';

export type VersionStyle = {
  /** NULL = template default. */
  font: FontId | null;
  /** `#RRGGBB`; NULL = template default. */
  accent: string | null;
  /** Steps −2…+2 around the template's base size / margins / spacing. */
  sizeStep: number;
  marginStep: number;
  spacingStep: number;
  /** NULL = template default. */
  headingCase: HeadingCase | null;
  photo: boolean;
  paper: Paper;
  dateStyle: DateStyle;
};

export const STEP_MIN = -2;
export const STEP_MAX = 2;

function step(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(STEP_MAX, Math.max(STEP_MIN, value)) : 0;
}

function oneOf<T>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** Parses stored style JSON; unknown keys and invalid values fall back to the defaults (never throws). */
export function parseStyle(json: string | null | undefined, lang: Lang): VersionStyle {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(json || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return {
    font: oneOf(raw.font, FONT_IDS),
    accent: typeof raw.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accent) ? raw.accent.toUpperCase() : null,
    sizeStep: step(raw.sizeStep),
    marginStep: step(raw.marginStep),
    spacingStep: step(raw.spacingStep),
    headingCase: oneOf(raw.headingCase, ['upper', 'normal'] as const),
    photo: raw.photo === true,
    paper: oneOf(raw.paper, ['a4', 'letter'] as const) ?? 'a4',
    dateStyle: oneOf(raw.dateStyle, DATE_STYLES) ?? defaultDateStyle(lang),
  };
}

/** Each template's own font when the version keeps "template default" (D44). */
export const DEFAULT_FONT: Record<TemplateId, FontId> = {
  classic: 'merriweather',
  modern: 'inter',
  compact: 'lato',
  executive: 'eb-garamond',
  lebenslauf: 'source-sans-3',
  plain: 'noto-sans',
};

/** The font a document is actually set in. */
export function effectiveFont(style: Pick<VersionStyle, 'font'>, template: TemplateId): FontId {
  return style.font ?? DEFAULT_FONT[template];
}

/** Templates that can show a photo (SPEC §5.6, D27); elsewhere the photo switch has no effect. */
export const PHOTO_TEMPLATES: readonly TemplateId[] = ['modern', 'executive', 'lebenslauf'];
