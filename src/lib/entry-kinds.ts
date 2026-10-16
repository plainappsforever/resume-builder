// What the entry editor shows per section kind (SPEC §6 "fields per kind"). PURE data, no React.
// Extra keys match what the renderer prints: `grade`, `credentialId`, `level` (src/render/html/shared.ts).
import type { SectionKind } from '@/engine/types';
import type { TranslationKey } from '@/i18n';

export type EntryFieldId = 'title' | 'organization' | 'location' | 'dates' | 'url' | 'description' | 'grade' | 'credentialId' | 'level';

export type KindSpec = {
  titleLabel: TranslationKey;
  organizationLabel: TranslationKey;
  /** Fields in editor order (title and bullets are always there; bullets are the last block). */
  fields: readonly EntryFieldId[];
  /** One date (issued / published / awarded) instead of a range. */
  singleDate?: boolean;
  bulletsLabel: TranslationKey;
  /** The section's entries are single words or phrases (skills, interests): the list shows the bullets as the subtitle. */
  itemsAsBullets?: boolean;
};

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const JOB: KindSpec = {
  titleLabel: 'field.jobTitle',
  organizationLabel: 'field.employer',
  fields: ['organization', 'location', 'dates', 'description'],
  bulletsLabel: 'bullets.title',
};

export const KIND_SPECS: Record<SectionKind, KindSpec> = {
  experience: JOB,
  volunteer: { ...JOB, titleLabel: 'field.role', organizationLabel: 'field.organization' },
  education: {
    titleLabel: 'field.degree',
    organizationLabel: 'field.school',
    fields: ['organization', 'location', 'dates', 'grade', 'description'],
    bulletsLabel: 'bullets.title',
  },
  projects: {
    titleLabel: 'field.projectName',
    organizationLabel: 'field.organization',
    fields: ['organization', 'url', 'dates', 'description'],
    bulletsLabel: 'bullets.title',
  },
  skills: { titleLabel: 'field.skillGroup', organizationLabel: 'field.organization', fields: [], bulletsLabel: 'bullets.skills', itemsAsBullets: true },
  interests: { titleLabel: 'field.interestGroup', organizationLabel: 'field.organization', fields: [], bulletsLabel: 'bullets.skills', itemsAsBullets: true },
  certifications: {
    titleLabel: 'field.certificate',
    organizationLabel: 'field.issuer',
    fields: ['organization', 'dates', 'credentialId', 'url'],
    singleDate: true,
    bulletsLabel: 'bullets.title',
  },
  languages: { titleLabel: 'field.language', organizationLabel: 'field.organization', fields: ['level'], bulletsLabel: 'bullets.title' },
  awards: {
    titleLabel: 'field.award',
    organizationLabel: 'field.issuer',
    fields: ['organization', 'dates', 'description'],
    singleDate: true,
    bulletsLabel: 'bullets.title',
  },
  publications: {
    titleLabel: 'field.publication',
    organizationLabel: 'field.publisher',
    fields: ['organization', 'dates', 'url', 'description'],
    singleDate: true,
    bulletsLabel: 'bullets.title',
  },
  references: {
    titleLabel: 'field.referenceName',
    organizationLabel: 'field.company',
    fields: ['organization', 'description'],
    bulletsLabel: 'bullets.title',
  },
  custom: {
    titleLabel: 'field.title',
    organizationLabel: 'field.organization',
    fields: ['organization', 'location', 'dates', 'url', 'description'],
    bulletsLabel: 'bullets.title',
  },
};

/** Section kinds offered by "Add section" (the standard ones first). */
export const ADDABLE_KINDS: readonly SectionKind[] = [
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'volunteer',
  'awards',
  'publications',
  'interests',
  'references',
  'custom',
];

/** Lines pasted into "Paste lines as bullets" → bullet texts: bullet glyphs and blank lines removed. */
export function linesToBullets(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/^\s*(?:[•·▪◦‣⁃●○■□–—*]|-(?=\s)|\d{1,2}[.)](?=\s))\s*/, '').trim())
    .filter((line) => line !== '');
}
