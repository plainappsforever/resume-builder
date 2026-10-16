// Render inputs and the computed document style (SPEC §5.6, D36, D44). PURE.
// The RenderModel itself comes from src/engine/resolve.ts (the resolved, visible document).
import type { DateStyle } from '@/engine/dates';
import { FONT_EXTENT } from './fonts.generated';
import { effectiveFont, type FontId, type HeadingCase, type Paper, type VersionStyle } from '@/engine/style';
import type { TemplateId } from '@/engine/types';

export type { RenderModel } from '@/engine/resolve';

/** The photo as the glue reads it from app files (JPEG ≤ 600 px, D27); inlined as a data URL. */
export type PhotoData = { mime: 'image/jpeg' | 'image/png'; base64: string };
export type RenderOptions = { photo?: PhotoData | null };

/** 8 accent presets (SPEC §5.6). The first is the "ink" colour; templates pick their own default. */
export const ACCENT_PRESETS = ['#1A1A1A', '#1F4E79', '#2E5E4E', '#5A2A4A', '#7A2E2E', '#3D3D8F', '#8A5A00', '#4A4A4A'] as const;

export const PAPER_SIZES: Record<Paper, { widthMm: number; heightMm: number; widthPt: number; heightPt: number }> = {
  a4: { widthMm: 210, heightMm: 297, widthPt: 595, heightPt: 842 },
  letter: { widthMm: 215.9, heightMm: 279.4, widthPt: 612, heightPt: 792 },
};

/** Style steps −2…+2 (D36) → values (D44). Index = step + 2. */
export const MARGIN_MM = [12.7, 15, 18, 21.5, 25] as const;
export const SPACING = [0.6, 0.8, 1, 1.2, 1.4] as const;
export const SIZE_STEP_PT = 0.5;
export const MIN_SIZE_PT = 9;
export const MAX_SIZE_PT = 12;

export type PageSetup = {
  paper: Paper;
  widthMm: number;
  heightMm: number;
  widthPt: number;
  heightPt: number;
  marginMm: number;
  marginPt: number;
};

/** expo-print options for P5: `width`/`height` in points; iOS also takes `margins` (Android uses CSS @page). */
export type PrintOptions = {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
};

export type DocStyle = {
  template: TemplateId;
  font: FontId;
  sizePt: number;
  lineHeight: number;
  spacing: number;
  accent: string;
  headingCase: HeadingCase;
  dateStyle: DateStyle;
  page: PageSetup;
};

export type TemplateDefaults = { baseSizePt: number; lineHeight: number; accent: string; headingCase: HeadingCase; colour: boolean };

/**
 * Line height never below the font's glyph extent + 0.04 em (D47): with Noto Sans (extent 1.362) at 1.35, Apple
 * PDFKit read a short line before the line above it, because the glyph boxes of neighbouring lines overlapped.
 */
export const LINE_EXTENT_MARGIN = 0.04;

const mmToPt = (mm: number) => Math.round((mm / 25.4) * 72 * 100) / 100;

export function pageSetup(paper: Paper, marginStep: number): PageSetup {
  const size = PAPER_SIZES[paper];
  const marginMm = MARGIN_MM[marginStep + 2] ?? MARGIN_MM[2];
  return { paper, ...size, marginMm, marginPt: mmToPt(marginMm) };
}

export function docStyle(template: TemplateId, style: VersionStyle, defaults: TemplateDefaults): DocStyle {
  const sizePt = Math.min(MAX_SIZE_PT, Math.max(MIN_SIZE_PT, defaults.baseSizePt + SIZE_STEP_PT * style.sizeStep));
  return {
    template,
    font: effectiveFont(style, template),
    sizePt,
    lineHeight: Math.round(Math.max(defaults.lineHeight, FONT_EXTENT[effectiveFont(style, template)] + LINE_EXTENT_MARGIN) * 1000) / 1000,
    spacing: SPACING[style.spacingStep + 2] ?? 1,
    accent: defaults.colour ? (style.accent ?? defaults.accent) : '#000000',
    headingCase: style.headingCase ?? defaults.headingCase,
    dateStyle: style.dateStyle,
    page: pageSetup(style.paper, style.marginStep),
  };
}

export function printOptions(page: PageSetup): PrintOptions {
  const m = page.marginPt;
  return { width: page.widthPt, height: page.heightPt, margins: { top: m, right: m, bottom: m, left: m } };
}
