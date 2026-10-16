/**
 * @jest-environment node
 */
import { LANGS } from '@/engine/types';

import { createTestDb } from '../../test/node-sqlite-db';
import { adoptExample, exampleExportPaths, ExampleRefusedError, hasProfileData, isExampleActive, loadExample, removeExample } from './example';
import { loadRenderModel } from './load';
import { addExport } from './exports';
import { openDatabase } from './migrations';
import { updateProfile } from './profile';
import { listSections } from './sections';
import { wipeAllData } from './wipe';
import { listVersions } from './versions';

async function freshDb() {
  const db = createTestDb();
  await openDatabase(db);
  return db;
}

describe.each(LANGS)('example data (%s)', (lang) => {
  it('loads into an empty app, resolves, and removes cleanly', async () => {
    const db = await freshDb();
    expect(await hasProfileData(db)).toBe(false);
    const ids = await loadExample(db, lang);
    expect(ids).toHaveLength(2);
    expect(await isExampleActive(db)).toBe(true);
    for (const id of ids) expect((await loadRenderModel(db, id)).person.fullName).not.toBe('');
    expect((await listVersions(db)).every((v) => v.isExample)).toBe(true);

    expect(await removeExample(db)).toBe(true);
    expect(await hasProfileData(db)).toBe(false);
    expect(await listSections(db)).toEqual([]);
    expect(await listVersions(db)).toEqual([]);
    for (const table of ['entries', 'bullets', 'version_entries', 'version_bullets', 'version_sections', 'profile_links']) {
      expect(await db.getAllAsync(`SELECT 1 FROM ${table}`)).toEqual([]);
    }
  });

  it('is refused when the app already has data', async () => {
    const db = await freshDb();
    await updateProfile(db, { fullName: 'Sam' });
    await expect(loadExample(db, lang)).rejects.toBeInstanceOf(ExampleRefusedError);
    expect(await listSections(db)).toEqual([]); // nothing half-written
  });
});

it('adopting stops "remove example": the data is the user’s now (D64)', async () => {
  const db = await freshDb();
  await loadExample(db, 'en');
  await adoptExample(db);
  expect(await isExampleActive(db)).toBe(false);
  expect(await removeExample(db)).toBe(false);
  expect((await listSections(db)).length).toBeGreaterThan(0);
  expect((await listVersions(db)).some((v) => v.isExample)).toBe(false);
});

it('wipeAllData empties every table and restarts the ids at 1', async () => {
  const db = await freshDb();
  await loadExample(db, 'en');
  await wipeAllData(db);
  expect(await hasProfileData(db)).toBe(false);
  await loadExample(db, 'en');
  expect((await listSections(db))[0].id).toBe(1);
  expect((await listVersions(db)).map((v) => v.id).sort()).toEqual([1, 2]);
});

it('v1.1 (REVIEW_V1 #17): the example resumes’ export files are listed for removal', async () => {
  const db = await freshDb();
  const [v1] = await loadExample(db, 'en');
  await addExport(db, { versionId: v1, coverLetterId: null, kind: 'resume_pdf', fileName: 'a.pdf', filePath: `exports/v${v1}/1/a.pdf`, pageCount: 1, bytes: 1, snapshotJson: '{}', readbackJson: null }, 1);
  await addExport(db, { versionId: v1, coverLetterId: null, kind: 'plain_text', fileName: 'a.txt', filePath: null, pageCount: null, bytes: 1, snapshotJson: '{}', readbackJson: null }, 2);
  expect(await exampleExportPaths(db)).toEqual([`exports/v${v1}/1/a.pdf`]);
  await adoptExample(db);
  expect(await exampleExportPaths(db)).toEqual([]);
});
