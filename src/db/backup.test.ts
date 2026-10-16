/**
 * @jest-environment node
 */
// Backup → restore (SPEC §9, A10, D22) on the Node SQLite fake: full round trip incl. photo and export snapshots,
// refusal of corrupt/foreign/newer files before anything changes, and atomic rollback through the write queue.
import { BACKUP_SCHEMA, BACKUP_TABLES, photoRestorePlan, repointSnapshotPhoto, restorePlan, backupFileName, buildBackup, parseBackup, serializeBackup, TABLE_ORDER, type Backup } from '@/data/backup';
import { exportFilePath, historyItem, readbackJson, snapshotJson } from '@/data/history';
import { SAMPLE_PROFILES } from '@/engine/content/sample-profiles';
import { STRESS_DE } from '@/render/__fixtures__/models';
import { renderHtml } from '@/render/index';

import { createTestDb } from '../../test/node-sqlite-db';
import { readBackupData, restoreBackupData } from './backup';
import { createCover } from './covers';
import { addExport, listExports } from './exports';
import { addKeyword, replaceAutoKeywords, setKeywordState } from './keywords';
import { loadRenderModel } from './load';
import { LATEST_VERSION, openDatabase } from './migrations';
import { updateProfile } from './profile';
import { seedMaster } from './seed';
import { getSetting, setDocumentDefaults, setSetting, setThemePreference } from './settings';
import type { Db } from './types';
import { setBulletOverride, setEntryIncluded, setEntryOverride, setSectionPageBreak, setSectionTitleOverride } from './version-items';
import { createVersion, duplicateVersion } from './versions';

const NOW = Date.UTC(2026, 9, 1, 12);
const APP = { name: 'Resume Builder', version: '1.0.0', schema: LATEST_VERSION };
const PHOTO = { mime: 'image/jpeg' as const, base64: Buffer.from('fake jpeg bytes ÿØ').toString('base64') };

async function freshDb() {
  const db = createTestDb();
  await openDatabase(db);
  return db;
}

/** A database that uses every table and every kind of deviation. */
async function richDb() {
  const db = await freshDb();
  const ids = await seedMaster(db, SAMPLE_PROFILES.en.master, NOW);
  await updateProfile(db, { photoFile: 'photos/profile.jpg', showPersonal: true, birthDate: '1990-05-01', nationality: 'US' }, NOW);
  const v1 = await createVersion(db, { name: 'Northwind', targetCompany: 'Northwind Freight', jobAd: SAMPLE_PROFILES.en.versions[0].jobAd, template: 'classic', styleJson: '{"paper":"letter","photo":true}' }, NOW + 1);
  await setEntryIncluded(db, v1, ids.entries[0][2], false, NOW + 2);
  await setEntryOverride(db, v1, ids.entries[0][0], 'title', 'Operations Coordinator (Logistics)', NOW + 3);
  await setBulletOverride(db, v1, ids.bullets[0][0][1], 'Cut late deliveries from 9% to 4%', NOW + 4);
  await setSectionTitleOverride(db, v1, ids.sections[0], 'Work Experience', NOW + 5);
  await setSectionPageBreak(db, v1, ids.sections[1], true, NOW + 6);
  await replaceAutoKeywords(db, v1, ['power bi', 'sql', 'lean']);
  await setKeywordState(db, v1, 'lean', 'ignored');
  await addKeyword(db, v1, 'route planning');
  const copy = await duplicateVersion(db, v1, NOW + 7);
  const cover = await createCover(db, { versionId: v1, recipientCompany: 'Northwind Freight', body: 'Dear team,\n\nHello.', language: 'en' }, NOW + 8);
  const model = await loadRenderModel(db, v1);
  const { expectedLines } = renderHtml(model);
  await addExport(db, {
    versionId: v1, coverLetterId: null, kind: 'resume_pdf', fileName: 'Alex-Morgan-Resume-Northwind-Freight.pdf',
    filePath: exportFilePath({ versionId: v1 }, NOW + 9, 'Alex-Morgan-Resume-Northwind-Freight.pdf'), pageCount: 1, bytes: 19_000,
    snapshotJson: snapshotJson({ v: 1, kind: 'resume_pdf', model }),
    readbackJson: readbackJson({ unavailable: true, reason: `${expectedLines.length} lines, reader timed out` }),
  }, NOW + 9);
  await addExport(db, {
    versionId: null, coverLetterId: cover, kind: 'cover_pdf', fileName: 'Alex-Morgan-Cover-Letter.pdf', filePath: null, pageCount: 1, bytes: 9_000,
    snapshotJson: '{"v":1,"kind":"cover_pdf","cover":{},"design":{},"today":"2026-10-01"}', readbackJson: null,
  }, NOW + 10);
  await setThemePreference(db, 'dark');
  await setDocumentDefaults(db, { paper: 'letter', language: 'en' });
  return { db, v1, copy };
}

describe('backup format ↔ database', () => {
  it('BACKUP_TABLES lists exactly the tables and columns of the latest schema', async () => {
    const db = await freshDb();
    const tables = (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((t) => t.name);
    expect(tables).toEqual([...TABLE_ORDER].sort());
    for (const table of TABLE_ORDER) {
      const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name).sort();
      expect([table, cols]).toEqual([table, Object.keys(BACKUP_TABLES[table].columns).sort()]);
    }
  });
});

describe('A10: backup → restore round trip', () => {
  it('restores everything (rows, photo, export snapshots, settings) into an empty and into a different database', async () => {
    const { db, v1, copy } = await richDb();
    const before = await readBackupData(db);
    const text = serializeBackup(buildBackup(before, PHOTO, APP, new Date(NOW)));
    expect(text).toContain('\n  "format": "resume-builder-backup",');
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.summary).toEqual({ exportedAt: '2026-10-01T12:00:00.000Z', fullName: 'Alex Morgan', sections: 6, entries: before.entries.length, bullets: before.bullets.length, versions: 2, coverLetters: 1, exports: 2, photo: true });
    expect(parsed.backup.photo).toEqual(PHOTO);

    for (const target of [await freshDb(), await (async () => { const other = await freshDb(); await seedMaster(other, STRESS_DE, NOW); await setSetting(other, 'x', 'y'); return other; })()]) {
      await restoreBackupData(target, parsed.backup, 'photos/profile.jpg');
      expect(await readBackupData(target)).toEqual(before);
      expect(await loadRenderModel(target, v1)).toEqual(await loadRenderModel(db, v1));
      expect(await loadRenderModel(target, copy)).toEqual(await loadRenderModel(db, copy));
      expect(await getSetting(target, 'x')).toBeNull();
      const history = (await listExports(target, { versionId: v1 })).map(historyItem);
      expect(history).toEqual([{ id: 1, kind: 'resume_pdf', fileName: 'Alex-Morgan-Resume-Northwind-Freight.pdf', createdAt: NOW + 9, pages: 1, bytes: 19_000, readback: 'unavailable', reshare: 'file', remadeAt: null }]);
    }
  });

  it('without a photo in the backup the profile points to no photo', async () => {
    const { db } = await richDb();
    const parsed = parseBackup(serializeBackup(buildBackup(await readBackupData(db), null, APP, new Date(NOW))));
    if (!parsed.ok) throw new Error('parse');
    const target = await freshDb();
    await restoreBackupData(target, parsed.backup, 'photos/ignored.jpg');
    expect((await readBackupData(target)).profile[0].photo_file).toBeNull();
  });

  it('file name', () => {
    expect(backupFileName(new Date(2026, 9, 1, 23, 30))).toBe('Resume-Builder-Backup-2026-10-01.json');
  });
});

describe('D62: the restored photo never overwrites the current one', () => {
  it('new file first, old one deleted only after COMMIT, new one deleted on failure', async () => {
    const { db } = await richDb();
    const backup = buildBackup(await readBackupData(db), PHOTO, APP, new Date(NOW));
    expect(photoRestorePlan(backup, 'photos/profile.jpg', 123)).toEqual({
      write: { path: 'photos/restored-123.jpg', photo: PHOTO },
      deleteAfterCommit: 'photos/profile.jpg',
      deleteOnFailure: 'photos/restored-123.jpg',
    });
    expect(photoRestorePlan({ ...backup, photo: null }, 'photos/profile.jpg', 5)).toEqual({ write: null, deleteAfterCommit: 'photos/profile.jpg', deleteOnFailure: null });
    expect(photoRestorePlan({ ...backup, photo: null }, null, 5)).toEqual({ write: null, deleteAfterCommit: null, deleteOnFailure: null });
  });
});

describe('A10: corrupt, foreign and newer files are refused before anything changes', () => {
  let good: Backup;
  beforeAll(async () => {
    const { db } = await richDb();
    good = buildBackup(await readBackupData(db), PHOTO, APP, new Date(NOW));
  });
  const mutate = (fn: (b: Record<string, any>) => void) => {
    const b = JSON.parse(JSON.stringify(good));
    fn(b);
    return JSON.stringify(b);
  };
  it.each([
    ['not JSON', '{"format": "resume-builder-backup", ', 'notJson'],
    ['another app', JSON.stringify({ format: 'invoice-maker-backup', version: 1 }), 'foreign'],
    ['an array', '[]', 'foreign'],
  ])('%s', (_name, text, code) => {
    expect(parseBackup(text)).toEqual({ ok: false, error: { code } });
  });
  it('a newer format version', () => {
    expect(parseBackup(mutate((b) => (b.version = 2)))).toEqual({ ok: false, error: { code: 'newer', version: 2 } });
  });
  it('a newer database schema (D59)', () => {
    expect(BACKUP_SCHEMA).toBe(LATEST_VERSION);
    expect(parseBackup(mutate((b) => (b.app.schema = 99)))).toEqual({ ok: false, error: { code: 'newerSchema', schema: 99 } });
  });
  it('NUL characters in text are removed (D59)', () => {
    const r = parseBackup(mutate((b) => (b.data.bullets[0].text = 'Led\u0000 a team')));
    expect(r.ok && r.backup.data.bullets[0].text).toBe('Led a team');
  });
  it('a hostile file fails validation before any write: the database is untouched', async () => {
    const { db } = await richDb();
    const before = await readBackupData(db);
    const r = parseBackup(mutate((b) => (b.data.exports[0].file_path = '../../Library/LocalDatabase/app.db')));
    expect(r.ok).toBe(false);
    expect(await readBackupData(db)).toEqual(before);
  });
  it.each([
    ['missing table', (b: any) => delete b.data.bullets, 'bullets: missing'],
    ['unknown table', (b: any) => (b.data.secrets = []), 'unknown table secrets'],
    ['extra column', (b: any) => (b.data.entries[0].evil = 1), 'entries[0]: columns'],
    ['wrong type', (b: any) => (b.data.bullets[0].text = 5), 'bullets[0].text'],
    ['bad enum', (b: any) => (b.data.sections[0].kind = 'hobbies'), 'sections[0]: kind in list'],
    ['bad date', (b: any) => (b.data.entries[0].start_date = '21-04'), 'entries[0]: start_date date format'],
    ['current with end', (b: any) => (b.data.entries[0].end_date = '2024-01'), 'entries[0]: current has no end date'],
    ['broken reference', (b: any) => (b.data.bullets[0].entry_id = 999), 'bullets.entry_id → entries 999'],
    ['duplicate key', (b: any) => b.data.version_keywords.push({ ...b.data.version_keywords[0] }), /^version_keywords\[\d+\]: duplicate key$/],
    ['two profiles', (b: any) => b.data.profile.push({ ...b.data.profile[0], id: 2 }), 'profile[1]: id = 1'],
    ['export with two owners', (b: any) => (b.data.exports[0].cover_letter_id = 1), 'exports[0]: exactly one owner'],
    ['snapshot not JSON', (b: any) => (b.data.exports[0].snapshot_json = '{oops'), 'exports[0]: snapshot is JSON'],
    ['photo not base64', (b: any) => (b.photo.base64 = 'abc$'), 'photo data'],
    ['photo of another type', (b: any) => (b.photo.mime = 'image/gif'), 'photo'],
    // D59 (review findings 6, 18): paths the app would later delete, impossible dates, a newer schema.
    ['export path outside the app', (b: any) => (b.data.exports[0].file_path = '../../Library/LocalDatabase/app.db'), 'exports[0]: file path inside the export folder'],
    ['absolute export path', (b: any) => (b.data.exports[0].file_path = '/etc/hosts'), 'exports[0]: file path inside the export folder'],
    ['export path climbing out', (b: any) => (b.data.exports[0].file_path = 'exports/v1/1/../../../app.db'), 'exports[0]: file path inside the export folder'],
    ['export path of another owner', (b: any) => (b.data.exports[0].file_path = 'exports/v999/1/a.pdf'), 'exports[0]: file path inside the export folder'],
    ['month 13', (b: any) => (b.data.entries[0].start_date = '2019-13'), 'entries[0]: start_date date format'],
    ['month 00', (b: any) => (b.data.entries[0].start_date = '2019-00'), 'entries[0]: start_date date format'],
    ['year before 1950', (b: any) => (b.data.entries[0].start_date = '1000'), 'entries[0]: dates valid'],
    ['year far ahead', (b: any) => (b.data.entries[0].start_date = '2099-01'), 'entries[0]: dates valid'],
    ['end before start', (b: any) => Object.assign(b.data.entries[0], { start_date: '2020-05', end_date: '2019-01', is_current: 0 }), 'entries[0]: dates valid'],
    ['schema 0', (b: any) => (b.app.schema = 0), 'app'],
  ])('invalid: %s', (_name, fn, detail: string | RegExp) => {
    const result = parseBackup(mutate(fn));
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    if (!result.ok && result.error.code === 'invalid') expect(result.error.detail).toMatch(detail);
  });
});

/** A connection whose Nth INSERT fails (disk full). Same object for every call, so it has one write queue. */
function failingDb(db: Db, failAt: number): Db {
  let inserts = 0;
  return {
    execAsync: (...a: Parameters<Db['execAsync']>) => db.execAsync(...a),
    getAllAsync: (...a: Parameters<Db['getAllAsync']>) => db.getAllAsync(...a),
    getFirstAsync: (...a: Parameters<Db['getFirstAsync']>) => db.getFirstAsync(...a),
    runAsync: ((sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT INTO') && !sql.startsWith('INSERT INTO settings') && ++inserts === failAt) return Promise.reject(new Error('database or disk is full'));
      return (db.runAsync as (s: string, ...p: unknown[]) => Promise<unknown>)(sql, ...params);
    }) as Db['runAsync'],
  } as Db;
}

describe('restore is atomic (one write-queue transaction)', () => {
  it.each([1, 7, 40, -1])('an INSERT failing at #%i (-1 = the last one) leaves the old data exactly as it was', async (n) => {
    const { db: source } = await richDb();
    const parsed = parseBackup(serializeBackup(buildBackup(await readBackupData(source), PHOTO, APP, new Date(NOW))));
    if (!parsed.ok) throw new Error('parse');
    const rows = TABLE_ORDER.filter((t) => t !== 'settings').reduce((sum, t) => sum + parsed.backup.data[t].length, 0);
    const failAt = n === -1 ? rows : n;
    const target = await freshDb();
    await seedMaster(target, STRESS_DE, NOW);
    const before = await readBackupData(target);
    await expect(restoreBackupData(failingDb(target, failAt), parsed.backup, 'photos/p.jpg')).rejects.toThrow('database or disk is full');
    expect(await readBackupData(target)).toEqual(before);
  });

  it('a write issued while a failing restore runs is queued behind it, not rolled back with it', async () => {
    const { db: source } = await richDb();
    const parsed = parseBackup(serializeBackup(buildBackup(await readBackupData(source), null, APP, new Date(NOW))));
    if (!parsed.ok) throw new Error('parse');
    const target = await freshDb();
    const conn = failingDb(target, 30);
    const restore = restoreBackupData(conn, parsed.backup, null);
    const write = setSetting(conn, 'theme', 'light');
    await expect(restore).rejects.toThrow();
    await write;
    expect(await getSetting(target, 'theme')).toBe('light');
    expect((await readBackupData(target)).entries).toEqual([]);
  });
});

describe('D96: history snapshots follow the restored photo (REVIEW_V1 #9)', () => {
  const snap = (photoFile: string | null) => JSON.stringify({ v: 1, kind: 'resume_pdf', model: { person: { fullName: 'A', photoFile }, sections: [] } });
  it('a snapshot that printed the old photo points at the new file; others stay byte-identical', () => {
    expect(JSON.parse(repointSnapshotPhoto(snap('photos/photo-1.jpg'), 'photos/photo-1.jpg', 'photos/restored-9.jpg')).model.person.photoFile).toBe('photos/restored-9.jpg');
    expect(JSON.parse(repointSnapshotPhoto(snap('photos/photo-1.jpg'), 'photos/photo-1.jpg', null)).model.person.photoFile).toBeNull();
    expect(repointSnapshotPhoto(snap(null), 'photos/photo-1.jpg', 'photos/restored-9.jpg')).toBe(snap(null));
    expect(repointSnapshotPhoto(snap('photos/photo-0.jpg'), 'photos/photo-1.jpg', 'x')).toBe(snap('photos/photo-0.jpg'));
    expect(repointSnapshotPhoto('{"v":1,"kind":"cover_pdf"}', 'photos/photo-1.jpg', 'x')).toBe('{"v":1,"kind":"cover_pdf"}');
    expect(repointSnapshotPhoto('not json', 'photos/photo-1.jpg', 'x')).toBe('not json');
  });
  it('restorePlan rewrites the export rows with the new photo path', () => {
    const backup = {
      photo: { mime: 'image/jpeg', base64: '/9j/' },
      data: Object.fromEntries(TABLE_ORDER.map((t) => [t, []])),
    } as unknown as Backup;
    (backup.data as Record<string, unknown[]>).profile = [{ id: 1, photo_file: 'photos/photo-1.jpg' }];
    (backup.data as Record<string, unknown[]>).exports = [{ id: 7, snapshot_json: snap('photos/photo-1.jpg') }];
    const plan = restorePlan(backup, 'photos/restored-9.jpg');
    const exportsRows = plan.find((p) => p.table === 'exports')!.rows;
    expect(JSON.parse(exportsRows[0].snapshot_json as string).model.person.photoFile).toBe('photos/restored-9.jpg');
    expect(plan.find((p) => p.table === 'profile')!.rows[0].photo_file).toBe('photos/restored-9.jpg');
  });
});
