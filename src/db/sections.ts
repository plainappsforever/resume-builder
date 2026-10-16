// Master sections. Deleting one cascades to its entries, bullets and every version row of them (FKs).
import type { Section, SectionKind } from '@/engine/types';

import { NotFoundError } from './errors';
import { compactPositions, moveTo, nextPosition } from './positions';
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

type SectionRow = { id: number; kind: SectionKind; custom_title: string | null; position: number };
const SECTIONS = { table: 'sections' } as const;

export function toSection(r: SectionRow): Section {
  return { id: r.id, kind: r.kind, customTitle: r.custom_title, position: r.position };
}

export function listSections(db: Db): Promise<Section[]> {
  return withRead(db, async (db) => {
    return (await db.getAllAsync<SectionRow>('SELECT * FROM sections ORDER BY position, id')).map(toSection);
  });
}

export function addSection(db: Db, kind: SectionKind, customTitle: string | null = null): Promise<number> {
  return withWrite(db, async (tx) => {
    const result = await tx.runAsync(
      'INSERT INTO sections (kind, custom_title, position) VALUES (?, ?, ?)',
      kind,
      customTitle?.trim() || null,
      await nextPosition(tx, SECTIONS)
    );
    return result.lastInsertRowId;
  });
}

/** NULL or blank = back to the standard label. */
export async function renameSection(db: Db, id: number, customTitle: string | null): Promise<void> {
  await withWrite(db, async (tx) => {
    const r = await tx.runAsync('UPDATE sections SET custom_title = ? WHERE id = ?', customTitle?.trim() || null, id);
    if (r.changes === 0) throw new NotFoundError('section', id);
  });
}

export async function moveSection(db: Db, id: number, toIndex: number): Promise<void> {
  await withTransaction(db, (tx) => moveTo(tx, SECTIONS, id, toIndex));
}

export async function deleteSection(db: Db, id: number): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM sections WHERE id = ?', id);
    await compactPositions(tx, SECTIONS);
  });
}
