// Master bullets. Adding, editing, moving or deleting a bullet is a content change of its entry: the entry's
// updated_at moves too (it drives the "changed in master" badge in versions, D31).
import type { Bullet } from '@/engine/types';

import { NotFoundError } from './errors';
import { compactPositions, moveTo, nextPosition, openGap } from './positions';
import { withRead, withTransaction } from './tx';
import type { Db } from './types';

type BulletRow = { id: number; entry_id: number; position: number; text: string; created_at: number; updated_at: number };

export function toBullet(r: BulletRow): Bullet {
  return { id: r.id, entryId: r.entry_id, position: r.position, text: r.text, createdAt: r.created_at, updatedAt: r.updated_at };
}

const bulletsOf = (entryId: number) => ({ table: 'bullets', column: 'entry_id', value: entryId }) as const;

async function touchEntry(tx: Db, entryId: number, now: number) {
  await tx.runAsync('UPDATE entries SET updated_at = ? WHERE id = ?', now, entryId);
}

async function getBullet(db: Db, id: number): Promise<Bullet> {
  const row = await db.getFirstAsync<BulletRow>('SELECT * FROM bullets WHERE id = ?', id);
  if (!row) throw new NotFoundError('bullet', id);
  return toBullet(row);
}

/** All bullets (entryId omitted) or one entry's, in master order. */
export function listBullets(db: Db, entryId?: number): Promise<Bullet[]> {
  return withRead(db, async (db) => {
    const rows =
      entryId === undefined
        ? await db.getAllAsync<BulletRow>('SELECT * FROM bullets ORDER BY entry_id, position, id')
        : await db.getAllAsync<BulletRow>('SELECT * FROM bullets WHERE entry_id = ? ORDER BY position, id', entryId);
    return rows.map(toBullet);
  });
}

/** Adds bullets (one per text, e.g. pasted lines) at `atIndex` (default: the end); returns their ids. */
export function addBullets(db: Db, entryId: number, texts: readonly string[], now = Date.now(), atIndex?: number): Promise<number[]> {
  return withTransaction(db, async (tx) => {
    const scope = bulletsOf(entryId);
    const end = await nextPosition(tx, scope);
    const start = atIndex === undefined ? end : Math.max(0, Math.min(end, Math.trunc(atIndex)));
    const ids: number[] = [];
    for (let i = 0; i < texts.length; i++) {
      if (start < end) await openGap(tx, scope, start + i);
      const result = await tx.runAsync(
        'INSERT INTO bullets (entry_id, position, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        entryId,
        start + i,
        texts[i],
        now,
        now
      );
      ids.push(result.lastInsertRowId);
    }
    if (ids.length > 0) await touchEntry(tx, entryId, now);
    return ids;
  });
}

export async function addBullet(db: Db, entryId: number, text: string, now = Date.now(), atIndex?: number): Promise<number> {
  return (await addBullets(db, entryId, [text], now, atIndex))[0];
}

/** Writes only when the text changed; returns whether it did. */
export function updateBullet(db: Db, id: number, text: string, now = Date.now()): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const bullet = await getBullet(tx, id);
    if (bullet.text === text) return false;
    await tx.runAsync('UPDATE bullets SET text = ?, updated_at = ? WHERE id = ?', text, now, id);
    await touchEntry(tx, bullet.entryId, now);
    return true;
  });
}

export async function moveBullet(db: Db, id: number, toIndex: number, now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    const bullet = await getBullet(tx, id);
    const before = await listBullets(tx, bullet.entryId);
    await moveTo(tx, bulletsOf(bullet.entryId), id, toIndex);
    const after = await listBullets(tx, bullet.entryId);
    if (before.map((b) => b.id).join() !== after.map((b) => b.id).join()) await touchEntry(tx, bullet.entryId, now);
  });
}

/** Deletes the bullet (its version rows cascade). */
export async function deleteBullet(db: Db, id: number, now = Date.now()): Promise<void> {
  await withTransaction(db, async (tx) => {
    const bullet = await getBullet(tx, id);
    await tx.runAsync('DELETE FROM bullets WHERE id = ?', id);
    await compactPositions(tx, bulletsOf(bullet.entryId));
    await touchEntry(tx, bullet.entryId, now);
  });
}
