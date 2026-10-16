// Version resolution (SPEC §5.1, D17). PURE. The ONLY way a screen, renderer, checker or matcher sees the content of
// a version: master content + the version's deviations (no row = included, master order, master text).
//
// 1. Sections: all master sections; included unless the version row says 0; order = version position if set, else
//    master position (version-positioned first by position, unpositioned after them in master order; stable).
// 2. Entries per section: the same rule; field = override if set (also an empty override), else master.
// 3. Bullets per entry: the same rule; text = override if non-empty, else master.
// 4. Headline/summary: override if set (not NULL), else master.
// 5. An included section with zero included entries is dropped from the render model and reported.
// 6. Per entry: overridden (any override, also on its bullets), newSinceExport, masterChanged (D31).
import { parseStyle, PHOTO_TEMPLATES, type VersionStyle } from './style';
import {
  ENTRY_OVERRIDE_FIELDS,
  type Bullet,
  type Entry,
  type EntryField,
  type Lang,
  type LinkLabel,
  type Master,
  type SectionKind,
  type TemplateId,
  type VersionState,
} from './types';

export type ResolvedBullet = {
  id: number;
  text: string;
  masterText: string;
  included: boolean;
  overridden: boolean;
};

export type ResolvedEntry = {
  id: number;
  sectionId: number;
  included: boolean;
  title: string;
  organization: string;
  location: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  url: string;
  extra: Record<string, string>;
  /** Fields with a version override, in ENTRY_OVERRIDE_FIELDS order. */
  overriddenFields: EntryField[];
  /** Any entry-field or bullet override in this version. */
  overridden: boolean;
  newSinceExport: boolean;
  masterChanged: boolean;
  bullets: ResolvedBullet[];
};

export type ResolvedSection = {
  id: number;
  kind: SectionKind;
  /** Version title override, else the master's custom title; NULL = standard label of the document language. */
  title: string | null;
  titleOverridden: boolean;
  included: boolean;
  pageBreakBefore: boolean;
  entries: ResolvedEntry[];
};

/** Everything the version shows AND hides (Content tab, keyword suggestions for hidden entries). */
export type ResolvedVersion = {
  versionId: number;
  name: string;
  language: Lang;
  template: TemplateId;
  style: VersionStyle;
  headline: string;
  headlineOverridden: boolean;
  summary: string;
  summaryOverridden: boolean;
  sections: ResolvedSection[];
};

export type RenderLink = { label: LinkLabel; customLabel: string | null; url: string };
export type RenderPerson = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  region: string;
  countryCode: string;
  /** Only when the profile's "show personal details" is on (default off, D27/Q3). */
  birthDate: string | null;
  nationality: string | null;
  /** Only when the version's style has the photo switched on and the template shows photos (PHOTO_TEMPLATES). */
  photoFile: string | null;
  links: RenderLink[];
};
export type RenderBullet = { id: number; text: string };
export type RenderEntry = {
  id: number;
  title: string;
  organization: string;
  location: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  url: string;
  extra: Record<string, string>;
  bullets: RenderBullet[];
};
export type RenderSection = {
  id: number;
  kind: SectionKind;
  title: string | null;
  pageBreakBefore: boolean;
  entries: RenderEntry[];
};

/** The resolved, visible document: input of the renderer, the checks and the export snapshot (JSON-safe). */
export type RenderModel = {
  versionId: number;
  name: string;
  language: Lang;
  template: TemplateId;
  style: VersionStyle;
  person: RenderPerson;
  summary: string;
  sections: RenderSection[];
  /** Included sections without any included entry (rule 5; check C9 reports them). */
  droppedSections: { id: number; kind: SectionKind; title: string | null }[];
};

type Ordered = { id: number; position: number };

function masterOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id - b.id);
}

/** Rule 1: version-positioned first (by position), then the rest in master order. `items` must be in master order. */
export function versionOrder<T>(items: readonly T[], positionOf: (item: T) => number | null): T[] {
  const indexed = items.map((item, index) => ({ item, index, position: positionOf(item) }));
  const positioned = indexed
    .filter((x) => x.position !== null)
    .sort((a, b) => (a.position as number) - (b.position as number) || a.index - b.index);
  const rest = indexed.filter((x) => x.position === null);
  return [...positioned, ...rest].map((x) => x.item);
}

function nonEmpty(value: string | null | undefined): string | null {
  return value !== null && value !== undefined && value.trim() !== '' ? value : null;
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function resolveVersion(master: Master, state: VersionState): ResolvedVersion {
  const { version } = state;
  const vSections = new Map(state.sections.map((r) => [r.sectionId, r]));
  const vEntries = new Map(state.entries.map((r) => [r.entryId, r]));
  const vBullets = new Map(state.bullets.map((r) => [r.bulletId, r]));
  const entriesBySection = groupBy(masterOrder(master.entries), (e) => e.sectionId);
  const bulletsByEntry = groupBy(masterOrder(master.bullets), (b) => b.entryId);

  const newBaseline = version.lastExportedAt ?? version.createdAt;
  const seenBaseline = Math.max(version.createdAt, version.lastExportedAt ?? -Infinity);

  const resolveBullets = (entry: Entry): ResolvedBullet[] =>
    versionOrder(bulletsByEntry.get(entry.id) ?? [], (b: Bullet) => vBullets.get(b.id)?.position ?? null).map((b) => {
      const row = vBullets.get(b.id);
      const override = nonEmpty(row?.textOverride);
      return {
        id: b.id,
        text: override ?? b.text,
        masterText: b.text,
        included: row?.included ?? true,
        overridden: override !== null,
      };
    });

  const resolveEntry = (entry: Entry): ResolvedEntry => {
    const row = vEntries.get(entry.id);
    const overrides = row?.overrides ?? {};
    const overriddenFields = ENTRY_OVERRIDE_FIELDS.filter((f) => typeof overrides[f] === 'string');
    const field = (f: EntryField) => (typeof overrides[f] === 'string' ? (overrides[f] as string) : entry[f]);
    const bullets = resolveBullets(entry);
    const newSinceExport = entry.createdAt > newBaseline;
    const lastSeen = Math.max(seenBaseline, row?.seenMasterAt ?? -Infinity);
    return {
      id: entry.id,
      sectionId: entry.sectionId,
      included: row?.included ?? true,
      title: field('title'),
      organization: field('organization'),
      location: field('location'),
      description: field('description'),
      startDate: entry.startDate,
      endDate: entry.endDate,
      isCurrent: entry.isCurrent,
      url: entry.url,
      extra: { ...entry.extra },
      overriddenFields,
      overridden: overriddenFields.length > 0 || bullets.some((b) => b.overridden),
      newSinceExport,
      masterChanged: !newSinceExport && entry.updatedAt > lastSeen,
      bullets,
    };
  };

  const sections = versionOrder(masterOrder(master.sections), (s) => vSections.get(s.id)?.position ?? null).map(
    (section): ResolvedSection => {
      const row = vSections.get(section.id);
      const override = nonEmpty(row?.titleOverride);
      const entries = versionOrder(entriesBySection.get(section.id) ?? [], (e) => vEntries.get(e.id)?.position ?? null);
      return {
        id: section.id,
        kind: section.kind,
        title: override ?? nonEmpty(section.customTitle),
        titleOverridden: override !== null,
        included: row?.included ?? true,
        pageBreakBefore: row?.pageBreakBefore ?? false,
        entries: entries.map(resolveEntry),
      };
    }
  );

  return {
    versionId: version.id,
    name: version.name,
    language: version.language,
    template: version.template,
    style: parseStyle(version.styleJson, version.language),
    headline: version.headlineOverride ?? master.profile.headline,
    headlineOverridden: version.headlineOverride !== null,
    summary: version.summaryOverride ?? master.profile.summary,
    summaryOverridden: version.summaryOverride !== null,
    sections,
  };
}

/** Keeps what the document shows: included sections/entries/bullets; drops (and reports) empty sections (rule 5). */
export function toRenderModel(master: Master, resolved: ResolvedVersion): RenderModel {
  const { profile } = master;
  const sections: RenderSection[] = [];
  const droppedSections: RenderModel['droppedSections'] = [];
  for (const section of resolved.sections) {
    if (!section.included) continue;
    const entries = section.entries
      .filter((e) => e.included)
      .map(
        (e): RenderEntry => ({
          id: e.id,
          title: e.title,
          organization: e.organization,
          location: e.location,
          description: e.description,
          startDate: e.startDate,
          endDate: e.endDate,
          isCurrent: e.isCurrent,
          url: e.url,
          extra: { ...e.extra },
          bullets: e.bullets.filter((b) => b.included).map((b) => ({ id: b.id, text: b.text })),
        })
      );
    if (entries.length === 0) droppedSections.push({ id: section.id, kind: section.kind, title: section.title });
    else sections.push({ id: section.id, kind: section.kind, title: section.title, pageBreakBefore: section.pageBreakBefore, entries });
  }
  return {
    versionId: resolved.versionId,
    name: resolved.name,
    language: resolved.language,
    template: resolved.template,
    style: resolved.style,
    person: {
      fullName: profile.fullName,
      headline: resolved.headline,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      region: profile.region,
      countryCode: profile.countryCode,
      birthDate: profile.showPersonal ? profile.birthDate : null,
      nationality: profile.showPersonal ? profile.nationality : null,
      photoFile: resolved.style.photo && PHOTO_TEMPLATES.includes(resolved.template) ? profile.photoFile : null,
      links: masterOrder(master.links)
        .filter((l) => l.url.trim() !== '')
        .map((l) => ({ label: l.label, customLabel: l.customLabel, url: l.url })),
    },
    summary: resolved.summary,
    sections,
    droppedSections,
  };
}

/** `resolve(master, version) → RenderModel` (SPEC §5.1). */
export function resolve(master: Master, state: VersionState): RenderModel {
  return toRenderModel(master, resolveVersion(master, state));
}
