// Backup/restore on the database (SPEC §9, D22). Reading = every table in key order. Restoring = replace EVERYTHING
// in ONE write-queue transaction (src/db/tx.ts): any failure rolls back to exactly the data before. Validation
// happens first, in src/data/backup.ts (parseBackup); this module trusts only a parsed Backup.
import { BACKUP_TABLES, countData, dataFingerprint, restorePlan, TABLE_ORDER, type Backup, type BackupData, type DataCounts, type Row } from '@/data/backup';

import { withRead, withTransaction } from './tx';
import type { Db } from './types';

export function readBackupData(db: Db): Promise<BackupData> {
  return withRead(db, async (db) => {
    const data: BackupData = {};
    for (const table of TABLE_ORDER) {
      const spec = BACKUP_TABLES[table];
      const cols = Object.keys(spec.columns);
      data[table] = await db.getAllAsync<Row>(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${spec.key.join(', ')}`);
    }
    return data;
  });
}

/** Replaces all data with the backup's. `photoFile` = where the glue wrote the backup's photo (or null). */
export function restoreBackupData(db: Db, backup: Backup, photoFile: string | null): Promise<void> {
  return withTransaction(db, async (tx) => {
    for (const table of [...TABLE_ORDER].reverse()) await tx.runAsync(`DELETE FROM ${table}`);
    const sources: Row[] = [];
    for (const { table, rows } of restorePlan(backup, photoFile)) {
      const cols = Object.keys(BACKUP_TABLES[table].columns);
      const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      for (const row of rows) {
        // A copy may point at a version with a higher id: insert without the link, set it once all versions exist.
        const values = cols.map((c) => (table === 'versions' && c === 'source_version_id' ? null : row[c]));
        await tx.runAsync(sql, ...values);
        if (table === 'versions' && row.source_version_id !== null) sources.push(row);
      }
      if (table === 'versions') {
        for (const v of sources) await tx.runAsync('UPDATE versions SET source_version_id = ? WHERE id = ?', v.source_version_id, v.id);
      }
    }
  });
}

export async function readDataCounts(db: Db): Promise<DataCounts> {
  return countData(await readBackupData(db));
}

/** Dev-only A10 label: the fingerprint of every table except the settings (src/data/backup.ts). */
export async function readDataFingerprint(db: Db): Promise<string> {
  return dataFingerprint(await readBackupData(db));
}
