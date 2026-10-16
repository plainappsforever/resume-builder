// Export file names (SPEC §5.9). PURE.
// `<First>-<Last>-Resume[-<Company>].pdf` (EN) / `<Vorname>-<Nachname>-Lebenslauf[-<Firma>].pdf` (DE);
// cover letter `…-Cover-Letter…` / `…-Anschreiben…`. ASCII-folded, spaces → `-`, at most 80 characters in total.
import type { Lang } from './types';

export const MAX_FILE_NAME = 80;

const DOC_WORD: Record<'resume' | 'cover', Record<Lang, string>> = {
  resume: { en: 'Resume', de: 'Lebenslauf' },
  cover: { en: 'Cover-Letter', de: 'Anschreiben' },
};

// German transliteration first (Müller → Mueller), then every other diacritic is dropped by NFD.
const SPECIAL: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', ẞ: 'SS',
  æ: 'ae', Æ: 'Ae', ø: 'o', Ø: 'O', å: 'a', Å: 'A', œ: 'oe', Œ: 'Oe', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', þ: 'th', Þ: 'Th',
};

/** ASCII letters, digits and single dashes only; never starts or ends with a dash. "&" → "and" / "und" (v1.1, REVIEW_V1 #21). */
export function fileNamePart(text: string, language: Lang = 'en'): string {
  return text
    .normalize('NFKC') // full-width "Ｗide" → "Wide", "Ⅻ" → "XII" (review finding 15)
    .replace(/[äöüÄÖÜßẞæÆøØåÅœŒłŁđĐþÞ]/g, (c) => SPECIAL[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, language === 'de' ? ' und ' : ' and ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cut(part: string, max: number): string {
  return max <= 0 ? '' : part.slice(0, max).replace(/-+$/g, '');
}

export type FileNameInput = {
  fullName: string;
  company?: string | null;
  language: Lang;
  kind: 'resume' | 'cover';
  ext: 'pdf' | 'txt';
};

/** Shortens the company first, then the name, so the result never exceeds MAX_FILE_NAME characters. */
export function documentFileName({ fullName, company, language, kind, ext }: FileNameInput): string {
  const word = DOC_WORD[kind][language];
  const suffix = `.${ext}`;
  let name = fileNamePart(fullName, language);
  let firm = fileNamePart(company ?? '', language);
  const length = () => [name, word, firm].filter(Boolean).join('-').length + suffix.length;
  if (length() > MAX_FILE_NAME) firm = cut(firm, firm.length - (length() - MAX_FILE_NAME));
  if (length() > MAX_FILE_NAME) name = cut(name, name.length - (length() - MAX_FILE_NAME));
  return [name, word, firm].filter(Boolean).join('-') + suffix;
}
