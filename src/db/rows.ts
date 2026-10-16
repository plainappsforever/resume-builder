// Small helpers for whole-row copies (duplicate, undo snapshots). Column names come from our own SELECT * rows.
import type { SQLiteBindValue } from 'expo-sqlite';

import type { Db } from './types';

export type RawRow = Record<string, string | number | null>;

/** INSERT of a row as read by SELECT * (call with a write-unit handle). */
export async function insertRow(tx: Db, table: string, row: RawRow): Promise<number> {
  const columns = Object.keys(row);
  const values: SQLiteBindValue[] = columns.map((c) => row[c]);
  const result = await tx.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ...values
  );
  return result.lastInsertRowId;
}
