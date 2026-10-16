// Example data (SPEC §6 "Look at an example", D21) and the "adopted" rule (D64): an example profile can be removed in
// one tap until the user changes anything. All writes go through the write queue (tx.ts).
import { SAMPLE_PROFILES } from '@/engine/content/sample-profiles';
import type { Lang } from '@/engine/types';

import { seedMaster } from './seed';
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';
import { setBulletIncluded, setEntryIncluded, setSectionIncluded } from './version-items';
import { createVersion } from './versions';

/** True when the database holds anything the user (or an example) put there: a name, a section or a version. */
export function hasProfileData(db: Db): Promise<boolean> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM sections) + (SELECT COUNT(*) FROM versions)
            + (SELECT COUNT(*) FROM profile WHERE full_name <> '' OR headline <> '' OR summary <> '') AS n`
    );
    return (row?.n ?? 0) > 0;
  });
}

export class ExampleRefusedError extends Error {
  constructor() {
    super('Example data is only loaded into an empty app');
    this.name = 'ExampleRefusedError';
  }
}

/** Seeds the example profile + its two versions (is_example = 1). Refused when the app already has data. */
export function loadExample(db: Db, lang: Lang, now = Date.now()): Promise<number[]> {
  return withTransaction(db, async (tx) => {
    if (await hasProfileData(tx)) throw new ExampleRefusedError();
    const sample = SAMPLE_PROFILES[lang];
    const ids = await seedMaster(tx, { ...sample.master, profile: { ...sample.master.profile, isExample: true } }, now);
    const versionIds: number[] = [];
    for (const [i, v] of sample.versions.entries()) {
      const { hiddenSections, hiddenEntries, hiddenBullets, ...input } = v;
      // Created one second apart so the library lists them in the sample's order (newest first = last one).
      const at = now + 1_000 * (sample.versions.length - i);
      const id = await createVersion(tx, { ...input, isExample: true }, at);
      for (const s of hiddenSections) await setSectionIncluded(tx, id, ids.sections[s], false, at);
      for (const [s, e] of hiddenEntries) await setEntryIncluded(tx, id, ids.entries[s][e], false, at);
      for (const [s, e, b] of hiddenBullets) await setBulletIncluded(tx, id, ids.bullets[s][e][b], false, at);
      versionIds.push(id);
    }
    return versionIds;
  });
}

/** True while the master is an unchanged example (the "Remove example data" button is offered). */
export function isExampleActive(db: Db): Promise<boolean> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<{ is_example: number }>('SELECT is_example FROM profile WHERE id = 1');
    return row?.is_example === 1;
  });
}

/** The user changed something: the data is theirs now and is no longer removable as "example" (D64). */
export function adoptExample(db: Db): Promise<void> {
  return withWrite(db, async (tx) => {
    await tx.runAsync('UPDATE profile SET is_example = 0 WHERE is_example = 1');
    await tx.runAsync('UPDATE versions SET is_example = 0 WHERE is_example = 1');
  });
}

/** v1.1 (REVIEW_V1 #17): the stored files of the example resumes' exports (the glue removes them with the example). */
export function exampleExportPaths(db: Db): Promise<string[]> {
  return withRead(db, async (db) =>
    (
      await db.getAllAsync<{ file_path: string }>(
        'SELECT e.file_path FROM exports e JOIN versions v ON v.id = e.version_id WHERE v.is_example = 1 AND e.file_path IS NOT NULL'
      )
    ).map((r) => r.file_path)
  );
}

/** Removes the example profile (sections cascade to entries, bullets and version rows) and the example versions. */
export function removeExample(db: Db): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    if (!(await isExampleActive(tx))) return false;
    await tx.runAsync('DELETE FROM versions WHERE is_example = 1');
    await tx.runAsync('DELETE FROM sections');
    await tx.runAsync('DELETE FROM profile_links');
    await tx.runAsync('DELETE FROM profile');
    return true;
  });
}
