/**
 * @jest-environment node
 */
// P6 (Job tab, Check tab, cover letters, data screens) on the Node SQLite fake: the keyword list a version shows and the
// "include hidden entry" action (SPEC §5.4, A5), the Check tab's feed (C11/C12/C15 from the newest export), cover-letter
// export rows (A15), the history list, and the dev round-trip fingerprint of a restore (A10).
import { countData, dataFingerprint, parseBackup, serializeBackup, buildBackup } from '@/data/backup';
import { checkExportContext, exportFilePath, readbackJson, snapshotJson } from '@/data/history';
import { runChecks } from '@/engine/checks';
import { SAMPLE_PROFILES } from '@/engine/content/sample-profiles';
import { extractKeywords } from '@/engine/keywords/extract';
import { autoTermsToStore } from '@/engine/keywords/list';
import { buildJobView, filterRows, termSlug } from '@/engine/keywords/view';

import { createTestDb } from '../../test/node-sqlite-db';
import { readBackupData, readDataCounts, readDataFingerprint, restoreBackupData } from './backup';
import { createCover, deleteCover, getCover } from './covers';
import { addExport, deleteExport, listAllExports } from './exports';
import { addKeyword, listKeywords, replaceAutoKeywords, setKeywordState } from './keywords';
import { loadMaster, loadRenderModel, loadResolvedVersion } from './load';
import { openDatabase } from './migrations';
import { seedMaster } from './seed';
import { setSetting } from './settings';
import { includeSuggestion, setBulletIncluded, setEntryIncluded, setSectionIncluded } from './version-items';
import { createVersion, getVersion, updateVersion } from './versions';
import { wipeAllData } from './wipe';

const NOW = Date.UTC(2026, 9, 1, 12);

/** The EN example the way "Look at an example" seeds it: version 2 = "Northwind Freight" with its ad and hidden volunteer section. */
async function exampleDb() {
  const db = createTestDb();
  await openDatabase(db);
  const sample = SAMPLE_PROFILES.en;
  const ids = await seedMaster(db, sample.master, NOW);
  const versions: number[] = [];
  for (const v of sample.versions) {
    const id = await createVersion(db, { ...v, isExample: true }, NOW + 1_000);
    for (const s of v.hiddenSections) await setSectionIncluded(db, id, ids.sections[s], false, NOW + 1_000);
    for (const [s, e] of v.hiddenEntries) await setEntryIncluded(db, id, ids.entries[s][e], false, NOW + 1_000);
    for (const [s, e, b] of v.hiddenBullets) await setBulletIncluded(db, id, ids.bullets[s][e][b], false, NOW + 1_000);
    versions.push(id);
  }
  return { db, ids, versions };
}

async function jobView(db: Awaited<ReturnType<typeof exampleDb>>['db'], versionId: number) {
  const [version, resolved, stored] = await Promise.all([getVersion(db, versionId), loadResolvedVersion(db, versionId), listKeywords(db, versionId)]);
  return buildJobView(version!.jobAd, stored, resolved);
}

describe('Job tab (F9, A5)', () => {
  it('lists the ad’s keywords with counts, found / variant / missing and no score', async () => {
    const { db, versions } = await exampleDb();
    const view = await jobView(db, versions[1]);
    expect(view.empty).toBe(false);
    expect(view.shown.length).toBeGreaterThan(5);
    expect(view.summary.shown).toBe(view.shown.length);
    expect(view.summary.found + view.summary.variants + view.summary.missing).toBe(view.summary.shown);
    expect(Object.keys(view.summary).sort()).toEqual(['found', 'missing', 'shown', 'variants']); // counts only, no percentage (D16)
    const row = view.shown.find((r) => r.item.term === 'route planning');
    expect(row?.match.status).toBe('missing');
    expect(row?.match.hidden).toEqual([expect.objectContaining({ kind: 'entry', entryTitle: 'Route planning volunteer', sectionHidden: true })]);
    expect(filterRows(view.shown, 'missing').every((r) => r.match.status === 'missing')).toBe(true);
    expect(filterRows(view.shown, 'all')).toHaveLength(view.shown.length);
  });

  it('"include" shows the hidden entry and its section in this resume only: the keyword becomes found, the profile is untouched', async () => {
    const { db, versions } = await exampleDb();
    const masterBefore = JSON.stringify(await loadMaster(db));
    const before = await jobView(db, versions[1]);
    const suggestion = before.shown.find((r) => r.item.term === 'route planning')!.match.hidden[0];
    if (suggestion.kind !== 'entry') throw new Error('entry expected');
    await includeSuggestion(db, versions[1], suggestion);
    const after = await jobView(db, versions[1]);
    expect(after.shown.find((r) => r.item.term === 'route planning')?.match.status).toBe('found');
    expect(after.summary.missing).toBe(before.summary.missing - 1);
    expect(JSON.stringify(await loadMaster(db))).toBe(masterBefore);
    // the other resume is unchanged: its volunteer section stays hidden or shown as before
    const other = await loadResolvedVersion(db, versions[0]);
    expect(other.sections.find((s) => s.id === suggestion.sectionId)?.included).toBe(true);
  });

  it('include of a hidden bullet of a shown entry', async () => {
    const { db, versions } = await exampleDb();
    const resolved = await loadResolvedVersion(db, versions[1]);
    const hidden = resolved.sections.flatMap((s) => s.entries).flatMap((e) => e.bullets.map((b) => ({ e, b }))).find(({ b }) => !b.included)!;
    await includeSuggestion(db, versions[1], { kind: 'bullet', bulletId: hidden.b.id });
    const after = await loadResolvedVersion(db, versions[1]);
    expect(after.sections.flatMap((s) => s.entries).flatMap((e) => e.bullets).find((b) => b.id === hidden.b.id)?.included).toBe(true);
  });

  it('saving the ad stores the top 25 automatic terms; pin / ignore / own phrase survive the next ad edit', async () => {
    const { db, versions } = await exampleDb();
    const v = versions[1];
    const ad = (await getVersion(db, v))!.jobAd;
    await replaceAutoKeywords(db, v, autoTermsToStore(extractKeywords(ad)));
    const stored = await listKeywords(db, v);
    expect(stored.length).toBeLessThanOrEqual(25);
    expect(stored.every((k) => k.source === 'auto' && k.state === 'normal')).toBe(true);
    const first = (await jobView(db, v)).shown[0].item.term;
    await setKeywordState(db, v, first, 'pinned');
    await setKeywordState(db, v, 'power bi', 'ignored');
    await addKeyword(db, v, 'forklift');
    await updateVersion(db, v, { jobAd: 'Requirements:\n- Excel\n- SQL' });
    await replaceAutoKeywords(db, v, autoTermsToStore(extractKeywords('Requirements:\n- Excel\n- SQL')));
    const view = await jobView(db, v);
    expect(view.shown[0].item).toMatchObject({ term: first, state: 'pinned' });
    expect(view.ignored.map((r) => r.item.term)).toContain('power bi');
    expect(view.shown.map((r) => r.item.term)).toEqual(expect.arrayContaining(['forklift', 'excel', 'sql']));
    expect(view.shown.map((r) => r.item.term)).not.toContain('power bi');
  });

  it('setKeywordState creates a row for a term only in "Show all" (D38) — and a restored term shows again', async () => {
    const { db, versions } = await exampleDb();
    const v = versions[1];
    await setKeywordState(db, v, 'rare term', 'ignored');
    expect(await listKeywords(db, v)).toEqual([{ term: 'rare term', source: 'auto', state: 'ignored' }]);
    await setKeywordState(db, v, 'rare term', 'normal');
    expect(await listKeywords(db, v)).toEqual([{ term: 'rare term', source: 'auto', state: 'normal' }]);
  });

  it('an empty ad explains instead of listing; a long ad is cut with a notice; a German ad on an English resume is noted', async () => {
    const { db, versions } = await exampleDb();
    await updateVersion(db, versions[0], { jobAd: '' });
    expect((await jobView(db, versions[0])).empty).toBe(true);
    await updateVersion(db, versions[0], { jobAd: `Requirements:\n- Excel\n${'x '.repeat(30_000)}` });
    expect((await jobView(db, versions[0])).truncated).toBe(true);
    await updateVersion(db, versions[0], { jobAd: 'Anforderungen:\n- Erfahrung mit SAP und Excel\n- Sie arbeiten gern im Team und haben Freude an der Planung von Touren' });
    expect((await jobView(db, versions[0])).languageNote).toEqual({ adLanguage: 'de', versionLanguage: 'en' });
  });

  it('term slugs are stable ids', () => {
    expect(termSlug('Route Planning')).toBe('route-planning');
    expect(termSlug('C++')).toBe('c');
    expect(termSlug('ci/cd')).toBe('ci-cd');
    expect(termSlug('Übergabe')).toBe('übergabe');
    expect(termSlug('!!!')).toBe('term');
  });
});

describe('Check tab feed (F8, C11/C12/C15)', () => {
  it('uses the newest PDF export: size, pages and the read-back; none → "not checked yet"', async () => {
    const { db, versions } = await exampleDb();
    const v = versions[1];
    const model = await loadRenderModel(db, v);
    const today = { year: 2026, month: 10 };
    const status = (ctx: ReturnType<typeof checkExportContext>) => Object.fromEntries(runChecks(model, { today, ...ctx }).map((r) => [r.id, r.status]));
    expect(checkExportContext([])).toEqual({ lastExport: null, readback: null, stale: false });
    expect(status(checkExportContext([]))).toMatchObject({ C11: 'notChecked', C12: 'notChecked', C15: 'notChecked' });

    const add = (readback: string | null, bytes: number, pages: number, at: number) =>
      addExport(db, { versionId: v, coverLetterId: null, kind: 'resume_pdf', fileName: 'a.pdf', filePath: exportFilePath({ versionId: v }, at, 'a.pdf'), pageCount: pages, bytes, snapshotJson: snapshotJson({ v: 1, kind: 'resume_pdf', model }), readbackJson: readback }, at);
    await add(readbackJson({ unavailable: true, reason: 'timeout' }), 20_000, 1, NOW);
    expect(status(checkExportContext(await rows(db, v)))).toMatchObject({ C11: 'ok', C12: 'ok', C15: 'notChecked' });
    await add(null, 2_600_000, 3, NOW + 1);
    expect(status(checkExportContext(await rows(db, v)))).toMatchObject({ C11: 'attention', C12: 'info', C15: 'notChecked' });
    // a plain-text export does not count as a PDF
    await addExport(db, { versionId: v, coverLetterId: null, kind: 'plain_text', fileName: 'a.txt', filePath: null, pageCount: null, bytes: 100, snapshotJson: snapshotJson({ v: 1, kind: 'plain_text', model }), readbackJson: null }, NOW + 2);
    expect(checkExportContext(await rows(db, v)).lastExport).toEqual({ bytes: 2_600_000, pages: 3 });
  });
});

describe('stale export-based checks (D95, REVIEW_V1 #6)', () => {
  it('export → C15 pass; change the template, a master entry or the style → C11/C12/C15 "not checked: export again"', async () => {
    const { db, versions } = await exampleDb();
    const v = versions[1];
    const today = { year: 2026, month: 10 };
    const model = await loadRenderModel(db, v);
    const pass = readbackJson({ pass: true, reader: 'pdf.js 6.3.289', words: { expected: 1, found: 1 }, lines: { total: 1, inOrder: 1, moved: [], split: [] } } as never);
    await addExport(db, { versionId: v, coverLetterId: null, kind: 'resume_pdf', fileName: 'a.pdf', filePath: null, pageCount: 1, bytes: 20_000, snapshotJson: snapshotJson({ v: 1, kind: 'resume_pdf', model }), readbackJson: pass }, NOW);
    const check = async () => {
      const now = await loadRenderModel(db, v);
      const ctx = checkExportContext(await rows(db, v), now);
      return { ctx, by: Object.fromEntries(runChecks(now, { today, ...ctx }).map((r) => [r.id, [r.status, r.noteKey]])) };
    };
    let r = await check();
    expect(r.ctx.stale).toBe(false);
    expect(r.by.C15).toEqual(['ok', 'check.C15.pass']);
    await updateVersion(db, v, { template: model.template === 'classic' ? 'modern' : 'classic' });
    r = await check();
    expect(r.ctx.stale).toBe(true);
    for (const id of ['C11', 'C12', 'C15']) expect(r.by[id]).toEqual(['notChecked', 'check.stale']);
    await updateVersion(db, v, { template: model.template });
    expect((await check()).ctx.stale).toBe(false); // back to the exported state
    await setSetting(db, 'unrelated', 'x'); // settings are not the document
    expect((await check()).ctx.stale).toBe(false);
  });
});

async function rows(db: Awaited<ReturnType<typeof exampleDb>>['db'], versionId: number) {
  return (await listAllExports(db)).filter((r) => r.versionId === versionId);
}

describe('cover letters (F10, A15) and the history', () => {
  it('a cover export is a row of its own: owner = the letter, path in c<id>/, listed with resume exports newest first, deletable', async () => {
    const { db, versions } = await exampleDb();
    const cover = await createCover(db, { versionId: versions[1], language: 'en', recipientCompany: 'Northwind Freight', subject: 'Application' }, NOW);
    const model = await loadRenderModel(db, versions[1]);
    const path = exportFilePath({ coverLetterId: cover }, NOW + 5, 'Alex-Morgan-Cover-Letter-Northwind-Freight.pdf');
    const id = await addExport(db, { versionId: null, coverLetterId: cover, kind: 'cover_pdf', fileName: 'Alex-Morgan-Cover-Letter-Northwind-Freight.pdf', filePath: path, pageCount: 1, bytes: 12_000, snapshotJson: '{"v":1,"kind":"cover_pdf","cover":{},"design":{},"today":"2026-10-01"}', readbackJson: null }, NOW + 5);
    await addExport(db, { versionId: versions[1], coverLetterId: null, kind: 'resume_pdf', fileName: 'r.pdf', filePath: null, pageCount: 1, bytes: 1, snapshotJson: snapshotJson({ v: 1, kind: 'resume_pdf', model }), readbackJson: null }, NOW + 6);
    expect((await listAllExports(db)).map((r) => r.kind)).toEqual(['resume_pdf', 'cover_pdf']);
    // a cover export never marks a resume as exported
    expect((await getVersion(db, versions[1]))!.lastExportedAt).toBe(NOW + 6);
    // the file path of another owner is refused (D59)
    await expect(addExport(db, { versionId: null, coverLetterId: cover, kind: 'cover_pdf', fileName: 'x.pdf', filePath: exportFilePath({ coverLetterId: cover + 1 }, 1, 'x.pdf'), pageCount: 1, bytes: 1, snapshotJson: '{}', readbackJson: null })).rejects.toThrow(/Unsafe/);
    expect(await deleteExport(db, id)).toBe(path);
    expect(await deleteCover(db, cover)).toEqual([]);
    expect(await getCover(db, cover)).toBeNull();
  });

  it('deleting the letter returns its safe export paths and removes the rows', async () => {
    const { db } = await exampleDb();
    const cover = await createCover(db, { language: 'de' }, NOW);
    const path = exportFilePath({ coverLetterId: cover }, NOW, 'a.pdf');
    await addExport(db, { versionId: null, coverLetterId: cover, kind: 'cover_pdf', fileName: 'a.pdf', filePath: path, pageCount: 1, bytes: 5, snapshotJson: '{}', readbackJson: null }, NOW);
    expect(await deleteCover(db, cover)).toEqual([path]);
    expect(await listAllExports(db)).toEqual([]);
  });
});

describe('restore round trip (A10) and "Delete all data"', () => {
  it('the data fingerprint is the same before the backup and after its restore; a change shows; settings do not count', async () => {
    const { db, versions } = await exampleDb();
    await createCover(db, { versionId: versions[1], body: 'Hello', language: 'en' }, NOW);
    await setSetting(db, 'theme', 'dark');
    const h1 = await readDataFingerprint(db);
    expect(h1).toMatch(/^[0-9a-f]{14}$/);
    const text = serializeBackup(buildBackup(await readBackupData(db), null, { name: 'Resume Builder', version: '1.0.0', schema: 2 }, new Date(NOW)));
    await setSetting(db, 'last_backup_at', '123');
    expect(await readDataFingerprint(db)).toBe(h1);
    await updateVersion(db, versions[0], { name: 'changed' });
    expect(await readDataFingerprint(db)).not.toBe(h1);
    const parsed = parseBackup(text, new Date(NOW));
    if (!parsed.ok) throw new Error('backup must parse');
    await restoreBackupData(db, parsed.backup, null);
    expect(await readDataFingerprint(db)).toBe(h1);
    expect(parsed.summary).toMatchObject({ fullName: 'Alex Morgan', versions: 2, coverLetters: 1 });
  });

  it('counts: the example has data, an empty phone has none; delete-all wipes every table and the ids restart', async () => {
    const { db } = await exampleDb();
    const counts = await readDataCounts(db);
    expect(counts).toMatchObject({ versions: 2, coverLetters: 0, hasData: true });
    expect(counts.entries).toBeGreaterThan(3);
    await wipeAllData(db);
    expect(await readDataCounts(db)).toEqual({ sections: 0, entries: 0, versions: 0, coverLetters: 0, exports: 0, hasData: false });
    expect(countData({ profile: [{ full_name: 'A' }] }).hasData).toBe(true);
    expect(dataFingerprint({})).toBe(dataFingerprint({ settings: [{ key: 'x', value: 'y' }] }));
    const id = await createVersion(db, { name: 'again' }, NOW);
    expect(id).toBe(1);
  });
});
