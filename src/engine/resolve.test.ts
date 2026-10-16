import { resolve, resolveVersion, versionOrder } from './resolve';
import type { Bullet, Entry, Master, Section, Version, VersionState } from './types';

const T0 = 1_000;

function entry(id: number, sectionId: number, position: number, fields: Partial<Entry> = {}): Entry {
  return {
    id,
    sectionId,
    position,
    title: `Title ${id}`,
    organization: `Org ${id}`,
    location: `Loc ${id}`,
    startDate: '2020',
    endDate: null,
    isCurrent: false,
    url: '',
    description: '',
    extra: {},
    createdAt: T0,
    updatedAt: T0,
    ...fields,
  };
}
const bullet = (id: number, entryId: number, position: number, text = `Bullet ${id}`): Bullet => ({
  id,
  entryId,
  position,
  text,
  createdAt: T0,
  updatedAt: T0,
});
const section = (id: number, kind: Section['kind'], position: number, customTitle: string | null = null): Section => ({
  id,
  kind,
  position,
  customTitle,
});

function master(): Master {
  return {
    profile: {
      fullName: 'Jordan Lee',
      headline: 'Team Lead',
      email: 'j@example.com',
      phone: '1',
      city: 'Columbus',
      region: 'OH',
      countryCode: 'US',
      birthDate: '1990-01-01',
      nationality: 'US',
      showPersonal: false,
      photoFile: 'photos/me.jpg',
      summary: 'Master summary',
      isExample: false,
      updatedAt: T0,
    },
    links: [
      { id: 2, position: 1, label: 'github', customLabel: null, url: 'https://github.com/x' },
      { id: 1, position: 0, label: 'linkedin', customLabel: null, url: 'https://linkedin.com/in/x' },
      { id: 3, position: 2, label: 'other', customLabel: 'Blog', url: '  ' },
    ],
    sections: [section(10, 'experience', 0), section(20, 'education', 1), section(30, 'skills', 2, 'Tools')],
    entries: [entry(101, 10, 0), entry(102, 10, 1), entry(103, 10, 2), entry(201, 20, 0), entry(301, 30, 0)],
    bullets: [bullet(1, 101, 0), bullet(2, 101, 1), bullet(3, 101, 2), bullet(4, 301, 0)],
  };
}

function version(fields: Partial<Version> = {}): Version {
  return {
    id: 7,
    name: 'ACME',
    targetCompany: 'ACME',
    targetRole: '',
    jobAd: '',
    language: 'en',
    template: 'modern',
    styleJson: '{}',
    headlineOverride: null,
    summaryOverride: null,
    sourceVersionId: null,
    archived: false,
    isExample: false,
    createdAt: T0 + 10,
    updatedAt: T0 + 10,
    lastExportedAt: null,
    ...fields,
  };
}

const state = (rows: Partial<VersionState> = {}, v: Partial<Version> = {}): VersionState => ({
  version: version(v),
  sections: [],
  entries: [],
  bullets: [],
  ...rows,
});

const ids = <T extends { id: number }>(items: T[]) => items.map((i) => i.id);

describe('resolve: no version rows = the master (D17)', () => {
  it('everything included, master order, master text', () => {
    const m = master();
    const model = resolve(m, state());
    expect(ids(model.sections)).toEqual([10, 20, 30]);
    expect(ids(model.sections[0].entries)).toEqual([101, 102, 103]);
    expect(model.sections[0].entries[0].bullets.map((b) => b.text)).toEqual(['Bullet 1', 'Bullet 2', 'Bullet 3']);
    expect(model.person.headline).toBe('Team Lead');
    expect(model.summary).toBe('Master summary');
    expect(model.sections[2].title).toBe('Tools');
    expect(model.sections[0].title).toBeNull();
    expect(model.droppedSections).toEqual([]);
    expect(model.style.dateStyle).toBe('Mon YYYY');
  });
  it('links in master order without blank URLs; personal details and photo only when switched on', () => {
    const m = master();
    let model = resolve(m, state());
    expect(model.person.links.map((l) => l.label)).toEqual(['linkedin', 'github']);
    expect(model.person).toMatchObject({ birthDate: null, nationality: null, photoFile: null });
    m.profile.showPersonal = true;
    model = resolve(m, state({}, { styleJson: '{"photo":true}' }));
    expect(model.person).toMatchObject({ birthDate: '1990-01-01', nationality: 'US', photoFile: 'photos/me.jpg' });
  });
});

describe('resolve: include flags (rules 1–3, 5)', () => {
  it('hidden section, entry and bullet', () => {
    const model = resolve(
      master(),
      state({
        sections: [{ sectionId: 20, included: false, position: null, titleOverride: null, pageBreakBefore: false }],
        entries: [{ entryId: 102, included: false, position: null, overrides: {}, seenMasterAt: null }],
        bullets: [{ bulletId: 2, included: false, position: null, textOverride: null }],
      })
    );
    expect(ids(model.sections)).toEqual([10, 30]);
    expect(ids(model.sections[0].entries)).toEqual([101, 103]);
    expect(model.sections[0].entries[0].bullets.map((b) => b.id)).toEqual([1, 3]);
    expect(model.droppedSections).toEqual([]); // a hidden section is not "dropped"
  });
  it('an included section whose entries are all hidden is dropped and reported; so is an empty one', () => {
    const m = master();
    m.sections.push(section(40, 'awards', 3));
    const model = resolve(m, state({ entries: [{ entryId: 301, included: false, position: null, overrides: {}, seenMasterAt: null }] }));
    expect(ids(model.sections)).toEqual([10, 20]);
    expect(model.droppedSections).toEqual([
      { id: 30, kind: 'skills', title: 'Tools' },
      { id: 40, kind: 'awards', title: null },
    ]);
  });
  it('the full resolution keeps hidden items (for the Content tab and keyword suggestions)', () => {
    const r = resolveVersion(
      master(),
      state({ entries: [{ entryId: 102, included: false, position: null, overrides: {}, seenMasterAt: null }] })
    );
    expect(r.sections[0].entries.map((e) => [e.id, e.included])).toEqual([
      [101, true],
      [102, false],
      [103, true],
    ]);
  });
});

describe('resolve: order (rule 1)', () => {
  it('version-positioned first by position, then the rest in master order', () => {
    expect(versionOrder(['a', 'b', 'c', 'd', 'e'], (x) => ({ c: 0, e: 1 })[x] ?? null)).toEqual(['c', 'e', 'a', 'b', 'd']);
    expect(versionOrder(['a', 'b', 'c'], (x) => ({ a: 5, b: 5 })[x] ?? null)).toEqual(['a', 'b', 'c']); // stable on ties
    const model = resolve(
      master(),
      state({
        sections: [{ sectionId: 30, included: true, position: 0, titleOverride: null, pageBreakBefore: true }],
        entries: [
          { entryId: 103, included: true, position: 0, overrides: {}, seenMasterAt: null },
          { entryId: 101, included: true, position: 1, overrides: {}, seenMasterAt: null },
        ],
        bullets: [{ bulletId: 3, included: true, position: 0, textOverride: null }],
      })
    );
    expect(ids(model.sections)).toEqual([30, 10, 20]);
    expect(model.sections[0].pageBreakBefore).toBe(true);
    expect(ids(model.sections[1].entries)).toEqual([103, 101, 102]);
    expect(model.sections[1].entries[1].bullets.map((b) => b.id)).toEqual([3, 1, 2]);
  });
  it('master order is position, then id', () => {
    const m = master();
    m.entries = [entry(105, 10, 1), entry(104, 10, 1), entry(101, 10, 0)];
    expect(ids(resolve(m, state()).sections[0].entries)).toEqual([101, 104, 105]);
  });
});

describe('resolve: overrides (rules 2–4)', () => {
  it('entry fields: override if set (also empty), else master', () => {
    const r = resolveVersion(
      master(),
      state({ entries: [{ entryId: 101, included: true, position: null, overrides: { title: 'Shift Lead', location: '' }, seenMasterAt: null }] })
    );
    const e = r.sections[0].entries[0];
    expect([e.title, e.organization, e.location]).toEqual(['Shift Lead', 'Org 101', '']);
    expect(e.overriddenFields).toEqual(['title', 'location']);
    expect(e.overridden).toBe(true);
    expect(r.sections[0].entries[1].overridden).toBe(false);
  });
  it('bullets: override if non-empty, else master', () => {
    const r = resolveVersion(
      master(),
      state({
        bullets: [
          { bulletId: 1, included: true, position: null, textOverride: 'Tailored 1' },
          { bulletId: 2, included: true, position: null, textOverride: '   ' },
          { bulletId: 3, included: true, position: null, textOverride: '' },
        ],
      })
    );
    const e = r.sections[0].entries[0];
    expect(e.bullets.map((b) => [b.text, b.masterText, b.overridden])).toEqual([
      ['Tailored 1', 'Bullet 1', true],
      ['Bullet 2', 'Bullet 2', false],
      ['Bullet 3', 'Bullet 3', false],
    ]);
    expect(e.overriddenFields).toEqual([]);
    expect(e.overridden).toBe(true); // bullet override counts for the entry badge
  });
  it('headline, summary and section title', () => {
    const r = resolveVersion(
      master(),
      state(
        { sections: [{ sectionId: 30, included: true, position: null, titleOverride: 'Technical skills', pageBreakBefore: false }] },
        { headlineOverride: 'Shift Supervisor', summaryOverride: '' }
      )
    );
    expect([r.headline, r.headlineOverridden, r.summary, r.summaryOverridden]).toEqual(['Shift Supervisor', true, '', true]);
    expect(r.sections[2]).toMatchObject({ title: 'Technical skills', titleOverridden: true });
  });
});

describe('resolve: flags (rule 6, D31)', () => {
  it('new since export: created after the last export, or after the version was created if never exported', () => {
    const m = master();
    m.entries.push(entry(104, 10, 3, { createdAt: T0 + 50, updatedAt: T0 + 50 }));
    let e = resolveVersion(m, state()).sections[0].entries;
    expect(e.map((x) => x.newSinceExport)).toEqual([false, false, false, true]);
    e = resolveVersion(m, state({}, { lastExportedAt: T0 + 60 })).sections[0].entries;
    expect(e.map((x) => x.newSinceExport)).toEqual([false, false, false, false]);
  });
  it('changed in master: updated after max(created, last export, seen); never together with "new"', () => {
    const m = master();
    m.entries[0].updatedAt = T0 + 50;
    m.entries.push(entry(104, 10, 3, { createdAt: T0 + 50, updatedAt: T0 + 70 }));
    const flags = (s: VersionState) => resolveVersion(m, s).sections[0].entries.map((x) => x.masterChanged);
    expect(flags(state())).toEqual([true, false, false, false]);
    expect(flags(state({ entries: [{ entryId: 101, included: true, position: null, overrides: {}, seenMasterAt: T0 + 55 }] }))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(flags(state({}, { lastExportedAt: T0 + 60 }))).toEqual([false, false, false, true]);
  });
});

describe('resolve: deterministic', () => {
  it('same output for shuffled input rows', () => {
    const m = master();
    const s = state({
      entries: [
        { entryId: 103, included: true, position: 0, overrides: { title: 'x' }, seenMasterAt: null },
        { entryId: 102, included: false, position: null, overrides: {}, seenMasterAt: null },
      ],
      bullets: [{ bulletId: 2, included: true, position: 0, textOverride: 'y' }],
    });
    const shuffled: Master = {
      ...m,
      links: [...m.links].reverse(),
      sections: [...m.sections].reverse(),
      entries: [...m.entries].reverse(),
      bullets: [...m.bullets].reverse(),
    };
    const s2 = { ...s, entries: [...s.entries].reverse(), bullets: [...s.bullets].reverse() };
    expect(resolveVersion(shuffled, s2)).toEqual(resolveVersion(m, s));
    expect(JSON.stringify(resolve(shuffled, s2))).toBe(JSON.stringify(resolve(m, s)));
  });
});
