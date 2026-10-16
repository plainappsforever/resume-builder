// Shared data shapes of the master profile and the versions (SPEC §4, D17). PURE: no React/Expo imports.
// The database layer (src/db) maps rows to these shapes; the engines and the renderer only ever see these.

export type Lang = 'en' | 'de';
export const LANGS: readonly Lang[] = ['en', 'de'];

export const SECTION_KINDS = [
  'experience',
  'education',
  'projects',
  'skills',
  'certifications',
  'languages',
  'awards',
  'publications',
  'volunteer',
  'interests',
  'references',
  'custom',
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const LINK_LABELS = ['linkedin', 'website', 'github', 'portfolio', 'other'] as const;
export type LinkLabel = (typeof LINK_LABELS)[number];

export const TEMPLATE_IDS = ['classic', 'modern', 'compact', 'executive', 'lebenslauf', 'plain'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** The entry fields a version may override (SPEC §4 version_entries.override_json). */
export const ENTRY_OVERRIDE_FIELDS = ['title', 'organization', 'location', 'description'] as const;
export type EntryField = (typeof ENTRY_OVERRIDE_FIELDS)[number];
export type EntryOverrides = Partial<Record<EntryField, string>>;

// ---- Master ---------------------------------------------------------------------------------------------------

export type Profile = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  region: string;
  countryCode: string;
  birthDate: string | null;
  nationality: string | null;
  showPersonal: boolean;
  /** Relative to the app's document directory. */
  photoFile: string | null;
  summary: string;
  isExample: boolean;
  updatedAt: number;
};

export type ProfileLink = {
  id: number;
  position: number;
  label: LinkLabel;
  customLabel: string | null;
  url: string;
};

export type Section = {
  id: number;
  kind: SectionKind;
  /** NULL = the standard label in the document language. */
  customTitle: string | null;
  position: number;
};

export type Entry = {
  id: number;
  sectionId: number;
  position: number;
  title: string;
  organization: string;
  location: string;
  /** `YYYY` or `YYYY-MM` (dates.ts). */
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  url: string;
  description: string;
  /** Per-kind extras (grade, field of study, CEFR level, credential id …). */
  extra: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

export type Bullet = {
  id: number;
  entryId: number;
  position: number;
  text: string;
  createdAt: number;
  updatedAt: number;
};

export type Master = {
  profile: Profile;
  links: ProfileLink[];
  sections: Section[];
  entries: Entry[];
  bullets: Bullet[];
};

// ---- Versions (deviations only, D17: no row = included, master order, master text) ----------------------------

export type Version = {
  id: number;
  name: string;
  targetCompany: string;
  targetRole: string;
  jobAd: string;
  language: Lang;
  template: TemplateId;
  /** Raw style JSON; parse with style.ts. */
  styleJson: string;
  headlineOverride: string | null;
  summaryOverride: string | null;
  sourceVersionId: number | null;
  archived: boolean;
  isExample: boolean;
  createdAt: number;
  updatedAt: number;
  lastExportedAt: number | null;
};

export type VersionSectionRow = {
  sectionId: number;
  included: boolean;
  position: number | null;
  titleOverride: string | null;
  pageBreakBefore: boolean;
};

export type VersionEntryRow = {
  entryId: number;
  included: boolean;
  position: number | null;
  overrides: EntryOverrides;
  seenMasterAt: number | null;
};

export type VersionBulletRow = {
  bulletId: number;
  included: boolean;
  position: number | null;
  textOverride: string | null;
};

export type VersionState = {
  version: Version;
  sections: VersionSectionRow[];
  entries: VersionEntryRow[];
  bullets: VersionBulletRow[];
};

// ---- Drafts (fixtures, example data, seeding: master content without ids/positions/timestamps) ----------------

export type EntryDraft = Partial<Pick<Entry, 'title' | 'organization' | 'location' | 'startDate' | 'endDate' | 'isCurrent' | 'url' | 'description' | 'extra'>> & {
  bullets?: string[];
};
export type SectionDraft = { kind: SectionKind; customTitle?: string | null; entries: EntryDraft[] };
export type MasterDraft = {
  profile: Partial<Omit<Profile, 'updatedAt'>>;
  links?: { label: LinkLabel; customLabel?: string | null; url: string }[];
  sections: SectionDraft[];
};
