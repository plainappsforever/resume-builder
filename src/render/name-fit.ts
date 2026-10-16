// Name fit (v1.1, D90; REVIEW_V1 #8): a long name is set smaller so it stays on ONE line — parsers commonly take the
// first line as the name. PURE. The width is estimated from the bold advance widths of the embedded fonts
// (name-metrics.generated.ts, no kerning), taking the widest of the fonts the document may be printed with: the
// chosen web font (iOS) and the phone's families on Android (D72: Source Sans Pro / Roboto for sans, Noto Serif for
// serif; Inter stands in for Roboto and Noto Sans x 1.06 for Noto Serif, both wider than the real fonts).
import type { FontId } from '@/engine/style';

import type { DocStyle } from './model';
import { NAME_ADVANCE, NAME_ADVANCE_FIRST } from './name-metrics.generated';

const SERIF: readonly FontId[] = ['merriweather', 'eb-garamond'];
/** Share of the available width the estimate may use (kerning, rounding, an engine's own spacing). */
const SAFETY = 0.94;
/** Never smaller than the body text; a longer name wraps at a space (hyphenated parts stay together) and the read-back says so. */
export const NAME_MIN_EM = 1;
const PT_PER_MM = 72 / 25.4;

function widthEm(text: string, font: FontId): number {
  const table = NAME_ADVANCE[font];
  // A character outside the table (or the font) counts as the font's widest capital: wider is safe.
  const fallback = Math.max(...[...'MW'].map((c) => table[c.codePointAt(0)! - NAME_ADVANCE_FIRST]));
  let sum = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const adv = cp >= NAME_ADVANCE_FIRST && cp - NAME_ADVANCE_FIRST < table.length ? table[cp - NAME_ADVANCE_FIRST] : 0;
    sum += adv || fallback;
  }
  return sum / 1000;
}

/** Estimated width of the name in em of its own font size, widest of the possible print fonts. */
export function nameWidthEm(name: string, font: FontId): number {
  const candidates = SERIF.includes(font)
    ? [widthEm(name, font), widthEm(name, 'noto-sans') * 1.06]
    : [widthEm(name, font), widthEm(name, 'source-sans-3'), widthEm(name, 'inter')];
  return Math.max(...candidates);
}

/** Width of the text line beside (or without) the floated photo, in pt, with the safety share applied. */
export function lineWidthPt(spec: { photoMm: number }, s: DocStyle, withPhoto: boolean, photoGapMm = 5): number {
  const availableMm = s.page.widthMm - 2 * s.page.marginMm - (withPhoto ? spec.photoMm + photoGapMm : 0);
  return availableMm * PT_PER_MM * SAFETY;
}

/** True when `text` at `em` × body size surely fits on one line (bold widths: a regular-weight text is narrower). */
export function fitsOneLine(text: string, spec: { photoMm: number }, s: DocStyle, withPhoto: boolean, em = 1): boolean {
  return nameWidthEm(text, s.font) * s.sizePt * em <= lineWidthPt(spec, s, withPhoto);
}

/**
 * The name's font size in em of the body text when the template's own size (`nameEm`) would not fit on one line,
 * in steps of 0.05 em, never below NAME_MIN_EM; null = the template's size fits.
 */
export function nameFitEm(name: string, spec: { nameEm: number; photoMm: number }, s: DocStyle, withPhoto: boolean, photoGapMm = 5): number | null {
  if (!name) return null;
  const availablePt = lineWidthPt(spec, s, withPhoto, photoGapMm);
  const width = nameWidthEm(name, s.font) * s.sizePt; // pt per em of name size
  if (width * spec.nameEm <= availablePt) return null;
  const fit = Math.floor((availablePt / width) * 20) / 20;
  return Math.max(NAME_MIN_EM, Math.min(spec.nameEm, fit));
}
