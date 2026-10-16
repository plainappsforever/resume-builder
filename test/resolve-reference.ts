// Reference model for the A2 property test (src/db/resolve.property.test.ts): a deliberately naive, separate
// implementation of SPEC §4/§5.1 — ordered arrays instead of position columns, "pinned order" lists instead of
// version positions, Maps instead of rows. It shares NO code with src/db or src/engine/resolve.ts.
// Caveat (L27 rule 4): written by the same author in the same phase as the code it checks, so it guards against
// implementation slips (positions, cascades, joins, timestamps), not against a misreading of the spec. The
// independent oracle is P3.5's job.

export const FIELDS = ['title', 'organization', 'location', 'description'] as const;
export type Field = (typeof FIELDS)[number];

export type MBullet = { id: number; text: string };
export type MEntry = {
  id: number;
  title: string;
  organization: string;
  location: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  bullets: MBullet[];
};
export type MSection = { id: number; kind: string; customTitle: string | null; entries: MEntry[] };
export type MVersion = {
  id: number;
  createdAt: number;
  lastExportedAt: number | null;
  headlineOverride: string | null;
  summaryOverride: string | null;
  hidden: Set<string>; // 'S:1', 'E:2', 'B:3'
  pinned: Map<string, number[]>; // 'S' | 'E:<sectionId>' | 'B:<entryId>' → ids in version order
  titleOverride: Map<number, string>;
  overrides: Map<number, Partial<Record<Field, string>>>;
  bulletText: Map<number, string>;
  seen: Map<number, number>;
};
export type Model = { headline: string; summary: string; sections: MSection[]; versions: Map<number, MVersion> };

export function emptyModel(): Model {
  return { headline: '', summary: '', sections: [], versions: new Map() };
}

export function allEntries(m: Model): MEntry[] {
  return m.sections.flatMap((s) => s.entries);
}
export function allBullets(m: Model): { bullet: MBullet; entry: MEntry }[] {
  return allEntries(m).flatMap((entry) => entry.bullets.map((bullet) => ({ bullet, entry })));
}
export function sectionOf(m: Model, entryId: number): MSection {
  return m.sections.find((s) => s.entries.some((e) => e.id === entryId))!;
}
export function entryOf(m: Model, bulletId: number): MEntry {
  return allEntries(m).find((e) => e.bullets.some((b) => b.id === bulletId))!;
}

/** The move API's semantics: remove, clamp the index to 0…length, insert. */
export function moveInArray<T>(items: T[], item: T, toIndex: number): T[] {
  const rest = items.filter((x) => x !== item);
  rest.splice(Math.max(0, Math.min(rest.length, Math.trunc(toIndex))), 0, item);
  return rest;
}

const blank = (s: string | null | undefined) => s === null || s === undefined || s.trim() === '';

/** Current version order of siblings: pinned ids that still exist, then the rest in master order. */
export function versionSiblings<T extends { id: number }>(v: MVersion, key: string, siblings: T[]): T[] {
  const pinned = (v.pinned.get(key) ?? []).filter((id) => siblings.some((s) => s.id === id));
  return [...pinned.map((id) => siblings.find((s) => s.id === id)!), ...siblings.filter((s) => !pinned.includes(s.id))];
}

export type Projected = {
  headline: string;
  summary: string;
  sections: {
    id: number;
    title: string | null;
    included: boolean;
    entries: {
      id: number;
      included: boolean;
      title: string;
      organization: string;
      location: string;
      description: string;
      newSinceExport: boolean;
      masterChanged: boolean;
      bullets: { id: number; text: string; included: boolean }[];
    }[];
  }[];
};

export function modelResolve(m: Model, versionId: number): Projected {
  const v = m.versions.get(versionId)!;
  const newBaseline = v.lastExportedAt ?? v.createdAt;
  return {
    headline: v.headlineOverride ?? m.headline,
    summary: v.summaryOverride ?? m.summary,
    sections: versionSiblings(v, 'S', m.sections).map((s) => ({
      id: s.id,
      title: !blank(v.titleOverride.get(s.id)) ? v.titleOverride.get(s.id)! : !blank(s.customTitle) ? s.customTitle : null,
      included: !v.hidden.has(`S:${s.id}`),
      entries: versionSiblings(v, `E:${s.id}`, s.entries).map((e) => {
        const o = v.overrides.get(e.id) ?? {};
        const isNew = e.createdAt > newBaseline;
        const lastSeen = Math.max(v.createdAt, v.lastExportedAt ?? -Infinity, v.seen.get(e.id) ?? -Infinity);
        return {
          id: e.id,
          included: !v.hidden.has(`E:${e.id}`),
          title: o.title ?? e.title,
          organization: o.organization ?? e.organization,
          location: o.location ?? e.location,
          description: o.description ?? e.description,
          newSinceExport: isNew,
          masterChanged: !isNew && e.updatedAt > lastSeen,
          bullets: versionSiblings(v, `B:${e.id}`, e.bullets).map((b) => ({
            id: b.id,
            text: !blank(v.bulletText.get(b.id)) ? v.bulletText.get(b.id)! : b.text,
            included: !v.hidden.has(`B:${b.id}`),
          })),
        };
      }),
    })),
  };
}

export function newVersion(id: number, now: number): MVersion {
  return {
    id,
    createdAt: now,
    lastExportedAt: null,
    headlineOverride: null,
    summaryOverride: null,
    hidden: new Set(),
    pinned: new Map(),
    titleOverride: new Map(),
    overrides: new Map(),
    bulletText: new Map(),
    seen: new Map(),
  };
}

export function copyVersion(v: MVersion, id: number, now: number): MVersion {
  return {
    ...v,
    id,
    createdAt: now,
    lastExportedAt: null,
    hidden: new Set(v.hidden),
    pinned: new Map([...v.pinned].map(([k, ids]) => [k, [...ids]])),
    titleOverride: new Map(v.titleOverride),
    overrides: new Map([...v.overrides].map(([k, o]) => [k, { ...o }])),
    bulletText: new Map(v.bulletText),
    seen: new Map(v.seen),
  };
}

/** Removes every version trace of deleted master items (the DB's ON DELETE CASCADE). */
export function cascade(m: Model) {
  const sections = new Set(m.sections.map((s) => s.id));
  const entries = new Set(allEntries(m).map((e) => e.id));
  const bullets = new Set(allBullets(m).map((b) => b.bullet.id));
  for (const v of m.versions.values()) {
    for (const key of [...v.hidden]) {
      const [kind, id] = key.split(':');
      const alive = kind === 'S' ? sections : kind === 'E' ? entries : bullets;
      if (!alive.has(Number(id))) v.hidden.delete(key);
    }
    for (const id of [...v.titleOverride.keys()]) if (!sections.has(id)) v.titleOverride.delete(id);
    for (const id of [...v.overrides.keys()]) if (!entries.has(id)) v.overrides.delete(id);
    for (const id of [...v.seen.keys()]) if (!entries.has(id)) v.seen.delete(id);
    for (const id of [...v.bulletText.keys()]) if (!bullets.has(id)) v.bulletText.delete(id);
  }
}
