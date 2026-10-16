// The write-queue / withRead rollback probe (V1_PLAN P4, the P3.5 device check), run on the REAL expo-sqlite by the
// dev route `debug/probe` on a scratch database. Lives in src/db because it issues raw SQL inside write units.
//   A. a unit that rolls back while reads and a write are issued during it (D60): queued reads see 0 rows, the
//      concurrent write survives; a direct read (no queue) is reported for information (shows the hazard is real).
//   B. 25 overlapping writes + one failing unit: exactly the 25 survive, positions are contiguous.
import type { SQLiteDatabase } from 'expo-sqlite';

import { readBackupData } from './backup';
import { loadMaster } from './load';
import { openDatabase } from './migrations';
import { addSection, listSections } from './sections';
import { withRead, withTransaction } from './tx';
import { wipeAllData } from './wipe';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `db` must be a scratch database (probe.db), never the app's. */
export async function runWriteProbe(db: SQLiteDatabase, platform: string, log: (line: string) => void): Promise<boolean> {
  await openDatabase(db);
  await wipeAllData(db);
  const version = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v');
  log(`${platform} sqlite ${version?.v}`);
  let ok = true;
  const check = (name: string, pass: boolean, detail: string) => {
    log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
    if (!pass) ok = false;
  };

  // A
  const seen: number[] = [];
  let direct = -1;
  const failing = withTransaction(db, async (tx) => {
    await tx.runAsync("INSERT INTO sections (kind, position) VALUES ('experience', 0)");
    await sleep(60);
    const inside = (await loadMaster(tx)).sections.length;
    if (inside !== 1) throw new Error(`inside the unit its own row must be visible, saw ${inside}`);
    await sleep(60);
    throw new Error('boom');
  });
  const during = (async () => {
    await sleep(30);
    direct = (await db.getAllAsync('SELECT id FROM sections')).length; // NOT queued: for information
    await Promise.all([
      loadMaster(db).then((m) => seen.push(m.sections.length)),
      withRead(db, async (r) => seen.push((await r.getAllAsync('SELECT id FROM sections')).length)),
      readBackupData(db).then((d) => seen.push(d.sections.length)),
      listSections(db).then((s) => seen.push(s.length)),
      addSection(db, 'skills'),
    ]);
  })();
  let failed = '';
  await failing.catch((e: Error) => (failed = e.message));
  await during;
  check('unit rolled back with its own error', failed === 'boom', failed);
  check('queued reads during the unit saw 0 rows', seen.length === 4 && seen.every((n) => n === 0), JSON.stringify(seen));
  log(`info direct read during the unit (no queue) saw ${direct} row(s) — ${direct > 0 ? 'the dirty-read hazard is real here' : 'no dirty row this time'}`);
  const after = await listSections(db);
  check('the concurrent write survived the rollback', after.length === 1 && after[0].kind === 'skills', JSON.stringify(after.map((s) => s.kind)));

  // B
  await wipeAllData(db);
  const kinds = Array.from({ length: 25 }, (_, i) => (i % 2 ? 'skills' : 'education') as 'skills' | 'education');
  const writes = kinds.map((k) => addSection(db, k));
  const doomed = withTransaction(db, async (tx) => {
    await tx.runAsync("INSERT INTO sections (kind, position) VALUES ('awards', 99)");
    await sleep(40);
    throw new Error('boom2');
  }).catch(() => 'rolled back');
  await Promise.all([...writes, doomed]);
  const all = await listSections(db);
  check('25 overlapping writes all kept, the failing unit gone', all.length === 25 && !all.some((s) => s.kind === 'awards'), `${all.length} rows`);
  const positions = all.map((s) => s.position).sort((a, b) => a - b);
  check('positions contiguous 0..24', positions.every((p, i) => p === i), positions.slice(0, 5).join(','));

  await wipeAllData(db);
  return ok;
}

