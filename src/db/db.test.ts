/**
 * @jest-environment node
 */
import { createHash } from 'node:crypto';

import { MASTER_DE, MASTER_EN } from '@/engine/__fixtures__/masters';

import { createTestDb } from '../../test/node-sqlite-db';

import { addBullet, addBullets, deleteBullet, listBullets, moveBullet, updateBullet } from './bullets';
import { createCover, deleteCover, getCover, listCovers, updateCover } from './covers';
import { addEntry, deleteEntry, duplicateEntry, getEntry, listEntries, moveEntry, restoreEntry, updateEntry } from './entries';
import { ValidationError } from './errors';
import { addExport, deleteExport, getExport, listExports, setExportReadback } from './exports';
import { addKeyword, listKeywords, removeKeyword, replaceAutoKeywords, setKeywordState } from './keywords';
import { loadMaster, loadRenderModel, loadResolvedVersion } from './load';
import { LATEST_VERSION, MIGRATIONS, migrate, openDatabase } from './migrations';
import { addLink, deleteLink, getProfile, listLinks, moveLink, updateLink, updateProfile } from './profile';
import { addSection, deleteSection, listSections, moveSection, renameSection } from './sections';
import { seedMaster } from './seed';
import { getDocumentDefaults, getThemePreference, setDocumentDefaults, setThemePreference } from './settings';
import type { Db } from './types';
import {
  applyBulletOverrideToMaster,
  applyEntryOverrideToMaster,
  applyProfileOverrideToMaster,
  markEntrySeen,
  moveEntryInVersion,
  moveSectionInVersion,
  setBulletIncluded,
  setBulletOverride,
  setEntryIncluded,
  setEntryOverride,
  setSectionIncluded,
  setSectionPageBreak,
  setSectionTitleOverride,
} from './version-items';
import { createVersion, deleteVersion, duplicateVersion, getVersion, listVersions, nextCopyName, updateVersion } from './versions';

const NOW = 1_790_000_000_000; // 2026-09
const later = (ms: number) => NOW + ms;

async function freshDb() {
  const db = createTestDb();
  await openDatabase(db);
  return db;
}

async function seeded() {
  const db = await freshDb();
  const ids = await seedMaster(db, MASTER_EN, NOW);
  const v = await createVersion(db, { name: 'Northfield', targetCompany: 'Northfield' }, later(1));
  return { db, ids, v };
}

const count = async (db: Db, sql: string, ...params: (string | number)[]) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM (${sql})`, ...params))!.n;
const positions = async (db: Db, sql: string, ...params: number[]) =>
  (await db.getAllAsync<{ position: number }>(sql, ...params)).map((r) => r.position);

describe('migrations', () => {
  it('reach the latest version, are safe to run again, and turn foreign keys on', async () => {
    const db = await freshDb();
    await openDatabase(db);
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LATEST_VERSION);
    expect((await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys).toBe(1);
    expect(LATEST_VERSION).toBe(2);
  });
  it('committed migrations are append-only: their text is pinned (review finding 19)', () => {
    // A failing hash means a committed migration was edited. Add a NEW migration instead and append its hash here.
    const hashes = MIGRATIONS.map((sql) => createHash('sha256').update(sql).digest('hex'));
    expect(hashes).toEqual([
      '2d464784c40ea0f1054e48cf90e7a7ca24f214a376c2c0d597ae8a9ed688d522', // 1 — template (mobile-starter)
      'd8b087397f2130ab0f1065d49d91c86270030269dc6e9065c761bba638d23346', // 2 — v1 P1 schema
    ]);
  });
  it('migration 2 upgrades a template database: drops the demo items table, keeps settings', async () => {
    const db = createTestDb();
    await migrate(db, [
      `CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
       CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
    ]);
    await db.execAsync("INSERT INTO items (title, created_at) VALUES ('demo', 1); INSERT INTO settings VALUES ('theme', 'dark');");
    await openDatabase(db);
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'items'")).toBeNull();
    expect(await getThemePreference(db)).toBe('dark');
    const tables = (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map(
      (r) => r.name
    );
    expect(tables).toEqual(
      expect.arrayContaining([
        'profile',
        'profile_links',
        'sections',
        'entries',
        'bullets',
        'versions',
        'version_sections',
        'version_entries',
        'version_bullets',
        'version_keywords',
        'cover_letters',
        'exports',
        'settings',
      ])
    );
  });
});

describe('CHECK constraints and date GLOBs', () => {
  it('profile is a single row (id = 1)', async () => {
    const db = await freshDb();
    await expect(db.runAsync('INSERT INTO profile (id, updated_at) VALUES (2, 0)')).rejects.toThrow(/CHECK/);
  });
  it.each([
    ['sections', "INSERT INTO sections (kind, position) VALUES ('hobbies', 0)"],
    ['profile_links', "INSERT INTO profile_links (position, label, url) VALUES (0, 'twitter', 'x')"],
    ['versions.language', "INSERT INTO versions (name, language, created_at, updated_at) VALUES ('x', 'fr', 0, 0)"],
    ['versions.template', "INSERT INTO versions (name, template, created_at, updated_at) VALUES ('x', 'fancy', 0, 0)"],
  ])('%s rejects unknown values', async (_name, sql) => {
    const db = await freshDb();
    await expect(db.runAsync(sql)).rejects.toThrow(/CHECK/);
  });
  it('entry dates: YYYY or YYYY-MM only; current entries have no end date', async () => {
    const db = await freshDb();
    const s = await addSection(db, 'experience');
    const insert = (start: string | null, end: string | null, current = 0) =>
      db.runAsync(
        'INSERT INTO entries (section_id, position, start_date, end_date, is_current, created_at, updated_at) VALUES (?, 0, ?, ?, ?, 0, 0)',
        s,
        start,
        end,
        current
      );
    await expect(insert('2019', '2020-05')).resolves.toBeDefined();
    await expect(insert(null, null)).resolves.toBeDefined();
    for (const bad of ['19', '2019-5', '2019/05', '2019-05-01', 'March', '3019']) {
      await expect(insert(bad, null)).rejects.toThrow(/CHECK/);
    }
    await expect(insert('2019', '2020', 1)).rejects.toThrow(/CHECK/);
  });
  it('keywords: source and state; exports: exactly one owner and a known kind', async () => {
    const { db, v } = await seeded();
    await expect(db.runAsync("INSERT INTO version_keywords (version_id, term, source) VALUES (?, 'x', 'ai')", v)).rejects.toThrow(/CHECK/);
    await expect(
      db.runAsync("INSERT INTO version_keywords (version_id, term, source, state) VALUES (?, 'x', 'auto', 'hidden')", v)
    ).rejects.toThrow(/CHECK/);
    const c = await createCover(db, { versionId: v }, NOW);
    const ins = (vid: number | null, cid: number | null, kind = 'resume_pdf') =>
      db.runAsync(
        "INSERT INTO exports (version_id, cover_letter_id, kind, file_name, snapshot_json, created_at) VALUES (?, ?, ?, 'f', '{}', 0)",
        vid,
        cid,
        kind
      );
    await expect(ins(v, c)).rejects.toThrow(/CHECK/);
    await expect(ins(null, null)).rejects.toThrow(/CHECK/);
    await expect(ins(v, null, 'docx')).rejects.toThrow(/CHECK/);
    await expect(ins(null, c, 'cover_pdf')).resolves.toBeDefined();
  });
});

describe('foreign keys and cascades', () => {
  it('deleting a section removes its entries, bullets and every version row of them', async () => {
    const { db, ids, v } = await seeded();
    const exp = ids.sections[0];
    const [e1] = ids.entries[0];
    const [b1] = ids.bullets[0][0];
    await setSectionIncluded(db, v, exp, false, later(2));
    await setEntryOverride(db, v, e1, 'title', 'Lead', later(2));
    await setBulletOverride(db, v, b1, 'Tailored', later(2));
    await deleteSection(db, exp);
    expect(await count(db, 'SELECT * FROM entries WHERE section_id = ?', exp)).toBe(0);
    expect(await count(db, 'SELECT * FROM bullets WHERE entry_id = ?', e1)).toBe(0);
    expect(await count(db, 'SELECT * FROM version_sections')).toBe(0);
    expect(await count(db, 'SELECT * FROM version_entries')).toBe(0);
    expect(await count(db, 'SELECT * FROM version_bullets')).toBe(0);
  });
  it('deleting a version removes its rows and exports, unlinks cover letters, returns the export files', async () => {
    const { db, ids, v } = await seeded();
    await setEntryIncluded(db, v, ids.entries[0][1], false, later(2));
    await replaceAutoKeywords(db, v, ['forklift']);
    const cover = await createCover(db, { versionId: v }, NOW);
    await addExport(db, exportInput(v, `exports/v${v}/1/a.pdf`), later(3));
    await addExport(db, { ...exportInput(v, null), kind: 'plain_text', fileName: 'a.txt' }, later(4));
    const copy = await duplicateVersion(db, v, later(5));
    expect(await deleteVersion(db, v)).toEqual([`exports/v${v}/1/a.pdf`]);
    expect(await count(db, 'SELECT * FROM version_entries WHERE version_id = ?', v)).toBe(0);
    expect(await count(db, 'SELECT * FROM version_keywords WHERE version_id = ?', v)).toBe(0);
    expect(await count(db, 'SELECT * FROM exports')).toBe(0);
    expect((await getCover(db, cover))!.versionId).toBeNull();
    expect((await getVersion(db, copy))!.sourceVersionId).toBeNull(); // ON DELETE SET NULL
    expect(await count(db, 'SELECT * FROM version_entries WHERE version_id = ?', copy)).toBe(1);
  });
  it('deleting a cover letter removes its exports and returns their files', async () => {
    const { db } = await seeded();
    const c = await createCover(db, {}, NOW);
    await addExport(db, { ...exportInput(null, `exports/c${c}/1/x.pdf`), coverLetterId: c, kind: 'cover_pdf' }, NOW);
    expect(await deleteCover(db, c)).toEqual([`exports/c${c}/1/x.pdf`]);
    expect(await count(db, 'SELECT * FROM exports')).toBe(0);
  });
  it('version rows need existing master rows', async () => {
    const { db, v } = await seeded();
    await expect(setEntryIncluded(db, v, 9999, false)).rejects.toThrow(/FOREIGN KEY/);
    // ... and nothing half-written: the version's updated_at stayed (one transaction).
    expect((await getVersion(db, v))!.updatedAt).toBe(later(1));
  });
});

function exportInput(versionId: number | null, filePath: string | null) {
  return {
    versionId,
    coverLetterId: null,
    kind: 'resume_pdf' as const,
    filePath,
    fileName: 'Jordan-Lee-Resume.pdf',
    pageCount: 1,
    bytes: 52_000,
    snapshotJson: '{"sections":[]}',
    readbackJson: null,
  };
}

describe('profile and links', () => {
  it('starts empty, upserts, changes only given fields', async () => {
    const db = await freshDb();
    expect(await getProfile(db)).toMatchObject({ fullName: '', showPersonal: false, updatedAt: 0 });
    await updateProfile(db, { fullName: 'A B', showPersonal: true }, NOW);
    await updateProfile(db, { headline: 'H' }, later(1));
    expect(await getProfile(db)).toMatchObject({ fullName: 'A B', headline: 'H', showPersonal: true, updatedAt: later(1) });
  });
  it('links: add, edit, move, delete with compaction', async () => {
    const db = await freshDb();
    const a = await addLink(db, { label: 'linkedin', url: ' https://l ' });
    const b = await addLink(db, { label: 'github', url: 'https://g' });
    const c = await addLink(db, { label: 'other', customLabel: 'Blog', url: 'https://b' });
    await updateLink(db, a, { label: 'website', url: 'https://w' });
    await moveLink(db, c, 0);
    expect((await listLinks(db)).map((l) => [l.id, l.position, l.url])).toEqual([
      [c, 0, 'https://b'],
      [a, 1, 'https://w'],
      [b, 2, 'https://g'],
    ]);
    await deleteLink(db, a);
    expect((await listLinks(db)).map((l) => [l.id, l.position])).toEqual([
      [c, 0],
      [b, 1],
    ]);
  });
});

describe('sections, entries, bullets', () => {
  it('position compaction on delete, everywhere', async () => {
    const { db, ids } = await seeded();
    await deleteSection(db, ids.sections[1]);
    expect(await positions(db, 'SELECT position FROM sections ORDER BY position')).toEqual([0, 1, 2]);
    const s = ids.sections[0];
    const e = await addEntry(db, s, { title: 'Third' }, later(1));
    await deleteEntry(db, ids.entries[0][0]);
    expect(await positions(db, 'SELECT position FROM entries WHERE section_id = ? ORDER BY position', s)).toEqual([0, 1]);
    expect((await listEntries(db, s)).map((x) => x.id)).toEqual([ids.entries[0][1], e]);
    const [b0, b1] = ids.bullets[0][1];
    await deleteBullet(db, b0, later(2));
    expect((await listBullets(db, ids.entries[0][1])).map((b) => [b.id, b.position])).toEqual([[b1, 0]]);
  });
  it('move and rename sections', async () => {
    const { db, ids } = await seeded();
    await moveSection(db, ids.sections[3], 0);
    await renameSection(db, ids.sections[2], '  Tools  ');
    expect((await listSections(db)).map((s) => [s.id, s.position, s.customTitle])).toEqual([
      [ids.sections[3], 0, null],
      [ids.sections[0], 1, null],
      [ids.sections[1], 2, null],
      [ids.sections[2], 3, 'Tools'],
    ]);
    await renameSection(db, ids.sections[2], ' ');
    expect((await listSections(db))[3].customTitle).toBeNull();
  });
  it('entries: dates validated before writing, current clears the end, unchanged edits do not touch updated_at', async () => {
    const { db, ids } = await seeded();
    const s = ids.sections[0];
    await expect(addEntry(db, s, { startDate: '2020-05', endDate: '2020-01' }, NOW)).rejects.toThrow(ValidationError);
    await expect(addEntry(db, s, { startDate: '1900' }, NOW)).rejects.toMatchObject({ fields: { start: 'date.error.year' } });
    expect(await listEntries(db, s)).toHaveLength(2);
    const e = ids.entries[0][1];
    expect(await updateEntry(db, e, { isCurrent: true }, later(10))).toBe(true);
    expect(await getEntry(db, e)).toMatchObject({ isCurrent: true, endDate: null, updatedAt: later(10) });
    expect(await updateEntry(db, e, { isCurrent: true, title: 'Warehouse Associate' }, later(20))).toBe(false);
    expect((await getEntry(db, e))!.updatedAt).toBe(later(10));
    expect(await updateEntry(db, e, { extra: { note: 'x' } }, later(30))).toBe(true);
    expect((await getEntry(db, e))!.extra).toEqual({ note: 'x' });
  });
  it('moving an entry keeps updated_at; duplicating copies bullets right below', async () => {
    const { db, ids } = await seeded();
    const [e0, e1] = ids.entries[0];
    await moveEntry(db, e0, 5);
    expect((await listEntries(db, ids.sections[0])).map((e) => e.id)).toEqual([e1, e0]);
    expect((await getEntry(db, e0))!.updatedAt).toBe(NOW);
    const copy = await duplicateEntry(db, e1, later(1));
    expect((await listEntries(db, ids.sections[0])).map((e) => e.id)).toEqual([e1, copy, e0]);
    expect((await listBullets(db, copy)).map((b) => b.text)).toEqual((await listBullets(db, e1)).map((b) => b.text));
  });
  it('bullet changes are content changes of the entry (updated_at), a no-op move is not', async () => {
    const { db, ids } = await seeded();
    const e = ids.entries[0][0];
    const [b0, , b2] = ids.bullets[0][0];
    await updateBullet(db, b0, 'Led a team of 15', later(1));
    expect((await getEntry(db, e))!.updatedAt).toBe(later(1));
    expect(await updateBullet(db, b0, 'Led a team of 15', later(2))).toBe(false);
    await moveBullet(db, b2, 2, later(3)); // already last
    expect((await getEntry(db, e))!.updatedAt).toBe(later(1));
    await moveBullet(db, b2, 0, later(4));
    expect((await getEntry(db, e))!.updatedAt).toBe(later(4));
    const added = await addBullets(db, e, ['x', 'y'], later(5), 1);
    expect((await listBullets(db, e)).map((b) => b.text)).toEqual([
      'Trained 25 new hires on forklift safety and the WMS',
      'x',
      'y',
      'Led a team of 15',
      'Reduced picking errors by 32% with a barcode double-check',
    ]);
    expect(added).toHaveLength(2);
    expect(await positions(db, 'SELECT position FROM bullets WHERE entry_id = ? ORDER BY position', e)).toEqual([0, 1, 2, 3, 4]);
    await deleteBullet(db, added[0], later(6));
    expect((await getEntry(db, e))!.updatedAt).toBe(later(6));
  });
  it('undo of an entry delete restores ids, place, bullets and version rows (SPEC §10)', async () => {
    const { db, ids, v } = await seeded();
    const [e0, e1] = ids.entries[0];
    const b = ids.bullets[0][0][1];
    await setEntryOverride(db, v, e0, 'title', 'Shift Lead', later(2));
    await setBulletIncluded(db, v, b, false, later(2));
    const before = await loadResolvedVersion(db, v);
    const masterBefore = await loadMaster(db);
    const snapshot = await deleteEntry(db, e0);
    expect((await listEntries(db, ids.sections[0])).map((e) => [e.id, e.position])).toEqual([[e1, 0]]);
    await restoreEntry(db, snapshot);
    expect(await loadMaster(db)).toEqual(masterBefore);
    expect(await loadResolvedVersion(db, v)).toEqual(before);
  });
  it('undo skips version rows of versions deleted in between', async () => {
    const { db, ids, v } = await seeded();
    const e0 = ids.entries[0][0];
    await setEntryIncluded(db, v, e0, false, later(2));
    const snapshot = await deleteEntry(db, e0);
    await deleteVersion(db, v);
    await restoreEntry(db, snapshot);
    expect(await getEntry(db, e0)).not.toBeNull();
    expect(await count(db, 'SELECT * FROM version_entries')).toBe(0);
  });
  it('undo after the section was deleted: a typed error, nothing written (review finding 16)', async () => {
    const { db, ids } = await seeded();
    const snapshot = await deleteEntry(db, ids.entries[0][0]);
    await deleteSection(db, ids.sections[0]);
    await expect(restoreEntry(db, snapshot)).rejects.toMatchObject({ name: 'NotFoundError', message: `section ${ids.sections[0]} not found` });
    expect(await getEntry(db, ids.entries[0][0])).toBeNull();
  });
});

describe('versions', () => {
  it('create, list (archived apart), update', async () => {
    const { db, v } = await seeded();
    const w = await createVersion(db, { name: ' Second ', language: 'de', template: 'lebenslauf' }, later(5));
    expect((await listVersions(db)).map((x) => x.id)).toEqual([w, v]);
    await updateVersion(db, v, { archived: true, headlineOverride: 'X' }, later(6));
    expect((await listVersions(db)).map((x) => x.id)).toEqual([w]);
    expect((await listVersions(db, { archived: true })).map((x) => x.id)).toEqual([v]);
    expect(await getVersion(db, w)).toMatchObject({ name: 'Second', language: 'de', template: 'lebenslauf', styleJson: '{}' });
    await expect(updateVersion(db, 999, { name: 'x' })).rejects.toThrow(/not found/);
  });
  it('copy names: " (2)", then the next free number', () => {
    expect(nextCopyName('ACME', ['ACME'])).toBe('ACME (2)');
    expect(nextCopyName('ACME', ['ACME', 'ACME (2)'])).toBe('ACME (3)');
    expect(nextCopyName('ACME (2)', ['ACME', 'ACME (2)'])).toBe('ACME (3)');
  });
  it('duplicate copies every version row (sections, entries, bullets, keywords) but no exports', async () => {
    const { db, ids, v } = await seeded();
    await setSectionIncluded(db, v, ids.sections[1], false, later(2));
    await setSectionTitleOverride(db, v, ids.sections[2], 'Tools', later(2));
    await setSectionPageBreak(db, v, ids.sections[3], true, later(2));
    await moveSectionInVersion(db, v, ids.sections[3], 0, later(2));
    await setEntryOverride(db, v, ids.entries[0][0], 'organization', 'NFL', later(2));
    await moveEntryInVersion(db, v, ids.entries[0][1], 0, later(2));
    await markEntrySeen(db, v, ids.entries[0][1], later(2));
    await setBulletOverride(db, v, ids.bullets[0][0][0], 'Tailored', later(2));
    await setBulletIncluded(db, v, ids.bullets[0][0][2], false, later(2));
    await updateVersion(db, v, { headlineOverride: 'Shift Lead', styleJson: '{"paper":"letter"}', jobAd: 'ad' }, later(2));
    await replaceAutoKeywords(db, v, ['forklift', 'wms']);
    await addKeyword(db, v, 'osha');
    await setKeywordState(db, v, 'wms', 'pinned');
    await addExport(db, exportInput(v, `exports/v${v}/1/a.pdf`), later(3));

    const copy = await duplicateVersion(db, v, later(4));
    const rows = async (table: string, id: number) =>
      (await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table} WHERE version_id = ? ORDER BY 2`, id)).map(
        ({ version_id: _drop, ...rest }) => rest
      );
    for (const table of ['version_sections', 'version_entries', 'version_bullets', 'version_keywords']) {
      const original = await rows(table, v);
      expect(original.length).toBeGreaterThan(0);
      expect(await rows(table, copy)).toEqual(original);
    }
    const c = (await getVersion(db, copy))!;
    expect(c).toMatchObject({
      name: 'Northfield (2)',
      sourceVersionId: v,
      headlineOverride: 'Shift Lead',
      styleJson: '{"paper":"letter"}',
      jobAd: 'ad',
      lastExportedAt: null,
      createdAt: later(4),
    });
    expect(await listExports(db, { versionId: copy })).toEqual([]);
    const a = await loadRenderModel(db, v);
    const b = await loadRenderModel(db, copy);
    expect({ ...b, versionId: a.versionId, name: a.name }).toEqual(a);
  });
});

describe('version edits never touch the master; Apply to master does, for this version only', () => {
  it('include/order/override leave master rows identical', async () => {
    const { db, ids, v } = await seeded();
    const before = await loadMaster(db);
    await setSectionIncluded(db, v, ids.sections[1], false, later(2));
    await setEntryOverride(db, v, ids.entries[0][0], 'title', 'Shift Lead', later(2));
    await setBulletOverride(db, v, ids.bullets[0][0][0], 'Tailored', later(2));
    await moveEntryInVersion(db, v, ids.entries[0][1], 0, later(2));
    await updateVersion(db, v, { summaryOverride: 'Short' }, later(2));
    expect(await loadMaster(db)).toEqual(before);
    const model = await loadRenderModel(db, v);
    expect(model.sections.map((s) => s.kind)).toEqual(['experience', 'skills', 'certifications']);
    expect(model.sections[0].entries.map((e) => e.title)).toEqual(['Warehouse Associate', 'Shift Lead']);
    expect(model.sections[0].entries[1].bullets[0].text).toBe('Tailored');
    expect(model.summary).toBe('Short');
  });
  it('apply entry/bullet/headline overrides: master changes, this version clears, the other keeps its own', async () => {
    const { db, ids, v } = await seeded();
    const w = await createVersion(db, { name: 'Other' }, later(1));
    const e = ids.entries[0][0];
    const b = ids.bullets[0][0][0];
    await setEntryOverride(db, v, e, 'title', 'Shift Lead', later(2));
    await setEntryOverride(db, v, e, 'location', 'Remote', later(2));
    await setEntryOverride(db, w, e, 'title', 'Other title', later(2));
    await setBulletOverride(db, v, b, 'Led 15 people', later(2));
    await updateVersion(db, v, { headlineOverride: 'Shift Supervisor' }, later(2));

    await applyEntryOverrideToMaster(db, v, e, ['title'], later(3));
    expect(await getEntry(db, e)).toMatchObject({ title: 'Shift Lead', location: 'Columbus, OH', updatedAt: later(3) });
    let rv = await loadResolvedVersion(db, v);
    expect(rv.sections[0].entries[0]).toMatchObject({ title: 'Shift Lead', location: 'Remote', overriddenFields: ['location'], masterChanged: false });
    let rw = await loadResolvedVersion(db, w);
    expect(rw.sections[0].entries[0]).toMatchObject({ title: 'Other title', masterChanged: true });

    await applyBulletOverrideToMaster(db, v, b, later(4));
    expect((await listBullets(db, e))[0].text).toBe('Led 15 people');
    rv = await loadResolvedVersion(db, v);
    expect(rv.sections[0].entries[0].bullets[0]).toMatchObject({ text: 'Led 15 people', overridden: false });

    await applyProfileOverrideToMaster(db, v, 'headline', later(5));
    expect((await getProfile(db)).headline).toBe('Shift Supervisor');
    expect((await getVersion(db, v))!.headlineOverride).toBeNull();
    rw = await loadResolvedVersion(db, w);
    expect(rw.headline).toBe('Shift Supervisor');

    // Nothing to apply → no master write.
    const m = await loadMaster(db);
    await applyEntryOverrideToMaster(db, w, ids.entries[0][1], undefined, later(6));
    await applyProfileOverrideToMaster(db, w, 'summary', later(6));
    expect(await loadMaster(db)).toEqual(m);
  });
  it('a new master entry appears in every version, badged new until that version is exported (A3)', async () => {
    const { db, ids, v } = await seeded();
    const w = await duplicateVersion(db, v, later(2));
    await setEntryOverride(db, v, ids.entries[0][0], 'title', 'Shift Lead', later(3));
    const added = await addEntry(db, ids.sections[0], { title: 'Picker', startDate: '2016' }, later(4));
    await updateEntry(db, ids.entries[0][0], { location: 'Columbus' }, later(5));
    for (const id of [v, w]) {
      const entries = (await loadResolvedVersion(db, id)).sections[0].entries;
      expect(entries.map((e) => e.id)).toEqual([...ids.entries[0], added]);
      expect(entries[2]).toMatchObject({ included: true, newSinceExport: true });
    }
    const rv = (await loadResolvedVersion(db, v)).sections[0].entries[0];
    expect(rv).toMatchObject({ title: 'Shift Lead', location: 'Columbus', masterChanged: true }); // override survives
    await addExport(db, exportInput(v, `exports/v${v}/6/f.pdf`), later(6));
    expect((await loadResolvedVersion(db, v)).sections[0].entries.map((e) => [e.newSinceExport, e.masterChanged])).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
    expect((await loadResolvedVersion(db, w)).sections[0].entries[2].newSinceExport).toBe(true);
  });
});

describe('keywords, cover letters, exports, settings', () => {
  it('replacing auto keywords keeps pinned, ignored and added ones', async () => {
    const { db, v } = await seeded();
    await replaceAutoKeywords(db, v, ['forklift', 'wms', 'sap', 'forklift', ' ']);
    await setKeywordState(db, v, 'wms', 'pinned');
    await setKeywordState(db, v, 'sap', 'ignored');
    expect(await addKeyword(db, v, ' osha ')).toBe(true);
    expect(await addKeyword(db, v, 'osha')).toBe(false);
    await replaceAutoKeywords(db, v, ['excel']);
    expect(await listKeywords(db, v)).toEqual([
      { term: 'wms', source: 'auto', state: 'pinned' },
      { term: 'sap', source: 'auto', state: 'ignored' },
      { term: 'osha', source: 'added', state: 'normal' },
      { term: 'excel', source: 'auto', state: 'normal' },
    ]);
    await removeKeyword(db, v, 'osha');
    expect((await listKeywords(db, v)).map((k) => k.term)).toEqual(['wms', 'sap', 'excel']);
  });
  it('cover letters: create, update, list', async () => {
    const { db, v } = await seeded();
    const c = await createCover(db, { versionId: v, language: 'de', subject: 'Bewerbung' }, NOW);
    await updateCover(db, c, { body: 'Sehr geehrte …', isExample: true }, later(1));
    expect(await getCover(db, c)).toMatchObject({ versionId: v, language: 'de', subject: 'Bewerbung', body: 'Sehr geehrte …', isExample: true, updatedAt: later(1) });
    expect((await listCovers(db)).map((x) => x.id)).toEqual([c]);
    await expect(updateCover(db, 999, { body: 'x' })).rejects.toThrow(/not found/);
  });
  it('exports: history newest first, read-back stored later, delete returns the file', async () => {
    const { db, v } = await seeded();
    const a = await addExport(db, exportInput(v, `exports/v${v}/1/a.pdf`), later(1));
    const b = await addExport(db, exportInput(v, `exports/v${v}/2/b.pdf`), later(2));
    expect((await getVersion(db, v))!.lastExportedAt).toBe(later(2));
    await setExportReadback(db, a, '{"coverage":1}');
    expect((await getExport(db, a))!.readbackJson).toBe('{"coverage":1}');
    expect((await listExports(db, { versionId: v })).map((x) => x.id)).toEqual([b, a]);
    expect(await deleteExport(db, a)).toBe(`exports/v${v}/1/a.pdf`);
    // D59 (review finding 6): an unsafe path is refused on insert and never handed back for deletion.
    for (const bad of ['../../Library/LocalDatabase/app.db', '/etc/hosts', `exports/v${v}/1/../../app.db`, `exports/v${v + 1}/1/a.pdf`, 'exports/a.pdf'])
      await expect(addExport(db, exportInput(v, bad), later(3))).rejects.toThrow(/Unsafe export path/);
    await db.runAsync('UPDATE exports SET file_path = ? WHERE id = ?', '../../Library/LocalDatabase/app.db', b);
    expect((await listExports(db, { versionId: v })).map((x) => x.id)).toEqual([b]);
    expect(await deleteExport(db, b)).toBeNull();
    expect(await listExports(db, { versionId: v })).toEqual([]);
  });
  it('theme and document defaults', async () => {
    const db = await freshDb();
    expect(await getThemePreference(db)).toBe('system');
    await setThemePreference(db, 'dark');
    expect(await getThemePreference(db)).toBe('dark');
    expect(await getDocumentDefaults(db)).toEqual({ paper: 'a4', dateStyle: null, language: 'en' });
    await setDocumentDefaults(db, { paper: 'letter', dateStyle: 'YYYY', language: 'de' });
    expect(await getDocumentDefaults(db)).toEqual({ paper: 'letter', dateStyle: 'YYYY', language: 'de' });
    await setDocumentDefaults(db, { dateStyle: null });
    expect((await getDocumentDefaults(db)).dateStyle).toBeNull();
    await db.runAsync("UPDATE settings SET value = 'a3' WHERE key = 'default_paper'");
    expect((await getDocumentDefaults(db)).paper).toBe('a4');
  });
});

describe('seeding fixtures', () => {
  it('EN and DE masters seed in one transaction and resolve to the fixture text', async () => {
    const db = await freshDb();
    await seedMaster(db, MASTER_DE, NOW);
    const v = await createVersion(db, { name: 'Klinikum', language: 'de', template: 'lebenslauf' }, later(1));
    const model = await loadRenderModel(db, v);
    expect(model.person).toMatchObject({ fullName: 'Lena Müller-Özdemir', birthDate: '1994-04-12', nationality: 'deutsch' });
    expect(model.style.dateStyle).toBe('MM/YYYY');
    expect(model.sections.map((s) => s.kind)).toEqual(['experience', 'education', 'languages']);
    expect(model.sections[1].entries[0].extra).toEqual({ grade: '1,7' });
    expect(model.sections[2].entries.map((e) => e.title)).toEqual(['Deutsch', 'Türkisch', 'Englisch']);
  });
  it('a bad date in a draft rolls the whole seed back', async () => {
    const db = await freshDb();
    await expect(
      seedMaster(db, { profile: { fullName: 'X' }, sections: [{ kind: 'experience', entries: [{ title: 'ok' }, { startDate: '2020-13' }] }] }, NOW)
    ).rejects.toThrow(ValidationError);
    expect(await getProfile(db)).toMatchObject({ fullName: '' });
    expect(await listSections(db)).toEqual([]);
    expect(await addBullet(db, 1, 'x').catch((e: Error) => e.message)).toMatch(/FOREIGN KEY/);
  });
});
