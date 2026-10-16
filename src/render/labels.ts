// Document labels (SPEC §5.6, D25): the words the DOCUMENT prints, in the version's language — independent of the
// UI language (src/i18n). Section titles are standard headings a parser recognises (C5's list in checks.ts).
import type { Lang, SectionKind } from '@/engine/types';

export type DocLabels = {
  sections: Record<SectionKind, string>;
  summary: string;
  personal: string;
  birthDate: string;
  nationality: string;
  grade: string;
  credentialId: string;
  months: readonly string[];
};

export const DOC_LABELS: Record<Lang, DocLabels> = {
  en: {
    sections: {
      experience: 'Experience',
      education: 'Education',
      projects: 'Projects',
      skills: 'Skills',
      certifications: 'Certifications',
      languages: 'Languages',
      awards: 'Awards',
      publications: 'Publications',
      volunteer: 'Volunteering',
      interests: 'Interests',
      references: 'References',
      custom: 'Additional Information',
    },
    summary: 'Summary',
    personal: 'Personal Details',
    birthDate: 'Date of birth',
    nationality: 'Nationality',
    grade: 'Grade',
    credentialId: 'Credential ID',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
  de: {
    sections: {
      experience: 'Berufserfahrung',
      education: 'Ausbildung',
      projects: 'Projekte',
      skills: 'Kenntnisse',
      certifications: 'Zertifikate',
      languages: 'Sprachen',
      awards: 'Auszeichnungen',
      publications: 'Veröffentlichungen',
      volunteer: 'Ehrenamt',
      interests: 'Interessen',
      references: 'Referenzen',
      custom: 'Weitere Angaben',
    },
    summary: 'Kurzprofil',
    personal: 'Persönliche Daten',
    birthDate: 'Geburtsdatum',
    nationality: 'Staatsangehörigkeit',
    grade: 'Note',
    credentialId: 'Nachweis-Nr.',
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  },
};

/** The printed title of a section: the user's/version's title, else the standard label. */
export function sectionTitle(kind: SectionKind, title: string | null, lang: Lang): string {
  return title !== null && title.trim() !== '' ? title.trim() : DOC_LABELS[lang].sections[kind];
}

/**
 * A full calendar date (`YYYY-MM-DD`) as the document prints it: DE `12.04.1994`; EN `12 April 1994` on A4 and
 * `April 12, 1994` on Letter (US convention). Anything else is printed as stored.
 */
export function formatFullDate(iso: string, lang: Lang, paper: 'a4' | 'letter'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return iso.trim();
  if (lang === 'de') return `${m[3]}.${m[2]}.${m[1]}`;
  const name = DOC_LABELS.en.months[month - 1];
  return paper === 'letter' ? `${name} ${day}, ${year}` : `${day} ${name} ${year}`;
}

/** Links and URLs print as plain text without scheme, `www.` and a trailing slash (SPEC §5.6). */
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

/** Upper-case headings are upper-cased in the text itself (no CSS text-transform: the PDF text equals E). */
export function upper(text: string, lang: Lang): string {
  return text.toLocaleUpperCase(lang === 'de' ? 'de-DE' : 'en-US');
}
