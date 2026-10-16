// Erases every table (dev reset link now; "Delete all data" in P6). One transaction; photo/export FILES are the
// caller's business (they are outside the database).
import { TABLE_ORDER } from '@/data/backup';

import { withTransaction, withWrite } from './tx';
import type { Db } from './types';

export async function wipeAllData(db: Db): Promise<void> {
  await withTransaction(db, async (tx) => {
    for (const table of [...TABLE_ORDER].reverse()) await tx.runAsync(`DELETE FROM ${table}`);
    // Ids start at 1 again (the dev seed links and the Maestro flows rely on predictable ids).
    await tx.runAsync('DELETE FROM sqlite_sequence');
  });
  // v1.1 (D91, REVIEW_V1 #10): deleted rows stay readable in the file's free pages (and the WAL) until overwritten.
  // VACUUM rewrites the file without them (it cannot run inside a transaction: its own queue unit); the checkpoints
  // move the WAL into the file and truncate it.
  await withWrite(db, async (tx) => {
    await tx.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    await tx.execAsync('VACUUM;');
    await tx.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  });
}
