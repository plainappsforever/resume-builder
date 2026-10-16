// Contiguous 0-based `position` columns of the master lists (links, sections, entries per section, bullets per
// entry). Table and scope names are fixed strings from this module's callers, never user input.
import type { Db } from './types';

export type Scope =
  | { table: 'profile_links' | 'sections'; column?: undefined; value?: undefined }
  | { table: 'entries'; column: 'section_id'; value: number }
  | { table: 'bullets'; column: 'entry_id'; value: number };

function where(scope: Scope): { sql: string; params: number[] } {
  return scope.column ? { sql: `WHERE ${scope.column} = ?`, params: [scope.value] } : { sql: '', params: [] };
}

export async function orderedIds(db: Db, scope: Scope): Promise<number[]> {
  const w = where(scope);
  const rows = await db.getAllAsync<{ id: number }>(`SELECT id FROM ${scope.table} ${w.sql} ORDER BY position, id`, ...w.params);
  return rows.map((r) => r.id);
}

export async function nextPosition(db: Db, scope: Scope): Promise<number> {
  const w = where(scope);
  const row = await db.getFirstAsync<{ n: number | null }>(`SELECT MAX(position) + 1 AS n FROM ${scope.table} ${w.sql}`, ...w.params);
  return row?.n ?? 0;
}

/** Writes positions 0…n−1 in the given order (call with a write-unit handle). */
export async function writePositions(tx: Db, table: Scope['table'], ids: readonly number[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    await tx.runAsync(`UPDATE ${table} SET position = ? WHERE id = ? AND position IS NOT ?`, i, ids[i], i);
  }
}

/** Renumbers a scope after a delete (call with a write-unit handle). */
export async function compactPositions(tx: Db, scope: Scope): Promise<void> {
  await writePositions(tx, scope.table, await orderedIds(tx, scope));
}

/** Moves `id` to `toIndex` (clamped) within its scope and renumbers (call with a write-unit handle). */
export async function moveTo(tx: Db, scope: Scope, id: number, toIndex: number): Promise<void> {
  const ids = (await orderedIds(tx, scope)).filter((x) => x !== id);
  const index = Math.max(0, Math.min(ids.length, Math.trunc(toIndex)));
  ids.splice(index, 0, id);
  await writePositions(tx, scope.table, ids);
}

/** Inserts a gap at `index` (positions ≥ index shift by one) so a row can be placed there. */
export async function openGap(tx: Db, scope: Scope, index: number): Promise<void> {
  const w = where(scope);
  await tx.runAsync(
    `UPDATE ${scope.table} SET position = position + 1 ${w.sql ? `${w.sql} AND` : 'WHERE'} position >= ?`,
    ...w.params,
    index
  );
}
