// Dates of CV entries (SPEC §5.2). PURE.
// Stored as `YYYY` or `YYYY-MM`. Valid: 1950 ≤ year ≤ current year + 6, month 1–12, end ≥ start (compared at the
// lower precision of the two: a year-only date stands for the whole year), is_current ⇒ no end date.
import type { Lang } from './types';

export type DateStyle = 'MM/YYYY' | 'Mon YYYY' | 'YYYY';
export const DATE_STYLES: readonly DateStyle[] = ['MM/YYYY', 'Mon YYYY', 'YYYY'];

export type PartialDate = { year: number; month: number | null };

/** i18n keys of the validation messages (src/i18n). */
export type DateError = 'date.error.format' | 'date.error.year' | 'date.error.month' | 'date.error.endBeforeStart';

export const MIN_YEAR = 1950;
export const MAX_YEARS_AHEAD = 6;

const MONTHS: Record<Lang, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  // Duden abbreviations; short names are written out (D30).
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
};
const PRESENT: Record<Lang, string> = { en: 'Present', de: 'heute' };
const EN_DASH = '–';

export function defaultDateStyle(lang: Lang): DateStyle {
  return lang === 'de' ? 'MM/YYYY' : 'Mon YYYY';
}

/** Strict parse of a stored value. Anything else (also month 00/13) → null. */
export function parsePartialDate(value: string | null | undefined): PartialDate | null {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] === undefined ? null : Number(m[2]);
  if (month !== null && (month < 1 || month > 12)) return null;
  return { year, month };
}

export function toStoredDate(date: PartialDate): string {
  return date.month === null ? String(date.year) : `${date.year}-${String(date.month).padStart(2, '0')}`;
}

/** Validates one stored date. `currentYear` is injected (tests, and "today" is the caller's business). */
export function validateDate(value: string, currentYear: number): DateError | null {
  const shape = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!shape) return 'date.error.format';
  const year = Number(shape[1]);
  if (year < MIN_YEAR || year > currentYear + MAX_YEARS_AHEAD) return 'date.error.year';
  if (shape[2] !== undefined) {
    const month = Number(shape[2]);
    if (month < 1 || month > 12) return 'date.error.month';
  }
  return null;
}

/** -1 / 0 / 1, compared at the lower precision of the two dates. */
export function comparePartialDates(a: PartialDate, b: PartialDate): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month === null || b.month === null) return 0;
  return a.month === b.month ? 0 : a.month < b.month ? -1 : 1;
}

export type DateRangeInput = { startDate: string | null; endDate: string | null; isCurrent: boolean };

/** "Current" clears the end date (SPEC §10); empty strings become NULL. */
export function normalizeDateRange(input: DateRangeInput): DateRangeInput {
  const startDate = input.startDate?.trim() || null;
  const endDate = input.isCurrent ? null : input.endDate?.trim() || null;
  return { startDate, endDate, isCurrent: input.isCurrent };
}

export type DateRangeErrors = { start?: DateError; end?: DateError };

/** Field errors of a (normalized) range; empty object = valid. */
export function validateDateRange(input: DateRangeInput, currentYear: number): DateRangeErrors {
  const { startDate, endDate } = normalizeDateRange(input);
  const errors: DateRangeErrors = {};
  const startError = startDate === null ? null : validateDate(startDate, currentYear);
  const endError = endDate === null ? null : validateDate(endDate, currentYear);
  if (startError) errors.start = startError;
  if (endError) errors.end = endError;
  if (!startError && !endError && startDate !== null && endDate !== null) {
    if (comparePartialDates(parsePartialDate(endDate)!, parsePartialDate(startDate)!) < 0) {
      errors.end = 'date.error.endBeforeStart';
    }
  }
  return errors;
}

/** One date in a display style. Year-only dates print the year in every style. Invalid → the raw text. */
export function formatDate(value: string, style: DateStyle, lang: Lang): string {
  const date = parsePartialDate(value);
  if (!date) return value;
  if (date.month === null || style === 'YYYY') return String(date.year);
  if (style === 'MM/YYYY') return `${String(date.month).padStart(2, '0')}/${date.year}`;
  return `${MONTHS[lang][date.month - 1]} ${date.year}`;
}

/**
 * "start – end" with an en dash; current → "Present"/"heute". Only one date → that date. Identical display text on
 * both sides (e.g. `YYYY` style within one year) → printed once.
 */
export function formatDateRange(input: DateRangeInput, style: DateStyle, lang: Lang): string {
  const { startDate, endDate, isCurrent } = normalizeDateRange(input);
  const start = startDate === null ? '' : formatDate(startDate, style, lang);
  const end = isCurrent ? PRESENT[lang] : endDate === null ? '' : formatDate(endDate, style, lang);
  if (start && end) return start === end ? start : `${start} ${EN_DASH} ${end}`;
  return start || end;
}

/** Sort key of a date for "newest first": year*100 + month (year-only = month 0). */
function key(value: string | null): number | null {
  const date = parsePartialDate(value);
  return date ? date.year * 100 + (date.month ?? 0) : null;
}

/**
 * The "sort newest first" helper (SPEC §5.2): by end (current first; no end → its start), then by start, both
 * descending; undated items last; stable otherwise. Never applied automatically.
 */
export function sortNewestFirst<T extends DateRangeInput>(items: readonly T[]): T[] {
  const NONE = -Infinity;
  const endKey = (item: T) => (item.isCurrent ? Infinity : (key(item.endDate) ?? key(item.startDate) ?? NONE));
  const startKey = (item: T) => key(item.startDate) ?? NONE;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => endKey(b.item) - endKey(a.item) || startKey(b.item) - startKey(a.item) || a.index - b.index)
    .map(({ item }) => item);
}
