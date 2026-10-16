// Master entries. Dates are validated (SPEC §5.2) before anything is written; "current" clears the end date.
// updated_at changes only when content changes (it drives the "changed in master" badge, D31).
import { normalizeDateRange, validateDateRange } from '@/engine/dates';
import type { Entry } from '@/engine/types';

import { ValidationError, NotFoundError } from './errors';
import { compactPositions, moveTo, nextPosition, openGap } from './positions';
import { insertRow, type RawRow } from './rows';
import { withRead, withTransaction } from './tx';
import type { Db } from './types';

type EntryRow = {
  id: number;
  section_id: number;
  position: number;
  title: string;
  organization: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  is_current: number;
  url: string;
  description: string;
  extra_json: string;
  created_at: number;
  updated_at: number;
};

function parseExtra(json: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function toEntry(r: EntryRow): Entry {
  return {
    id: r.id,
    sectionId: r.section_id,
    position: r.position,
    title: r.title,
    organization: r.organization,
    location: r.location,
    startDate: r.start_date,
    endDate: r.end_date,
    isCurrent: r.is_current === 1,
    url: r.url,
    description: r.description,
    extra: parseExtra(r.extra_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type EntryInput = Partial<
  Pick<Entry, 'title' | 'organization' | 'location' | 'startDate' | 'endDate' | 'isCurrent' | 'url' | 'description' | 'extra'>
>;

type Content = Required<EntryInput>;

function contentOf(e: Entry): Content {
  const { title, organization, location, startDate, endDate, isCurrent, url, description, extra } = e;
  return { title, organization, location, startDate, endDate, isCurrent, url, description, extra };
}

/** Merges, normalizes and validates; throws ValidationError (field → i18n key) before any write. */
function prepare(base: Content, input: EntryInput, now: number): Content {
  const merged: Content = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  const dates = normalizeDateRange(merged);
  const errors = validateDateRange(dates, new Date(now).getFullYear());
  if (errors.start || errors.end) throw new ValidationError(errors);
  return { ...merged, ...dates };
}

const EMPTY: Content = {
  title: '',
  organization: '',
  location: '',
  startDate: null,
  endDate: null,
  isCurrent: false,
  url: '',
  description: '',
  extra: {},
};

const entriesIn = (sectionId: number) => ({ table: 'entries', column: 'section_id', value: sectionId }) as const;

export function getEntry(db: Db, id: number): Promise<Entry | null> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE id = ?', id);
    return row ? toEntry(row) : null;
  });
}

/** All entries (sectionId omitted) or one section's, in master order. */
export function listEntries(db: Db, sectionId?: number): Promise<Entry[]> {
  return withRead(db, async (db) => {
    const rows =
      sectionId === undefined
        ? await db.getAllAsync<EntryRow>('SELECT * FROM entries ORDER BY section_id, position, id')
        : await db.getAllAsync<EntryRow>('SELECT * FROM entries WHERE section_id = ? ORDER BY position, id', sectionId);
    return rows.map(toEntry);
  });
}

async function insertEntry(tx: Db, sectionId: number, position: number, c: Content, now: number): Promise<number> {
  const result = await tx.runAsync(
    `INSERT INTO entries (section_id, position, title, organization, location, start_date, end_date, is_current, url,
       description, extra_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sectionId,
    position,
    c.title,
    c.organization,
    c.location,
    c.startDate,
    c.endDate,
    c.isCurrent ? 1 : 0,
    c.url,
    c.description,
    JSON.stringify(c.extra),
    now,
    now
  );
  return result.lastInsertRowId;
}

/** Appends an entry to a section. A new master entry appears in every version (D17), badged "new". */
export async function addEntry(db: Db, sectionId: number, input: EntryInput = {}, now = Date.now()): Promise<number> {
  const content = prepare(EMPTY, input, now); // throws (as a rejection) before anything is queued
  return withTransaction(db, async (tx) => insertEntry(tx, sectionId, await nextPosition(tx, entriesIn(sectionId)), content, now));
}

/** Writes only when something changed; returns whether it did. */
export function updateEntry(db: Db, id: number, input: EntryInput, now = Date.now()): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const current = await getEntry(tx, id);
    if (!current) throw new NotFoundError('entry', id);
    const before = contentOf(current);
    const next = prepare(before, input, now);
    if (JSON.stringify(next) === JSON.stringify(before)) return false;
    await tx.runAsync(
      `UPDATE entries SET title = ?, organization = ?, location = ?, start_date = ?, end_date = ?, is_current = ?, url = ?,
         description = ?, extra_json = ?, updated_at = ? WHERE id = ?`,
      next.title,
      next.organization,
      next.location,
      next.startDate,
      next.endDate,
      next.isCurrent ? 1 : 0,
      next.url,
      next.description,
      JSON.stringify(next.extra),
      now,
      id
    );
    return true;
  });
}

/** Reorders within the section. Not a content change: updated_at stays. */
export async function moveEntry(db: Db, id: number, toIndex: number): Promise<void> {
  await withTransaction(db, async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry) throw new NotFoundError('entry', id);
    await moveTo(tx, entriesIn(entry.sectionId), id, toIndex);
  });
}

/** Copies the entry and its bullets directly below the original (master only; versions treat it as new). */
export function duplicateEntry(db: Db, id: number, now = Date.now()): Promise<number> {
  return withTransaction(db, async (tx) => {
    const entry = await getEntry(tx, id);
    if (!entry) throw new NotFoundError('entry', id);
    await openGap(tx, entriesIn(entry.sectionId), entry.position + 1);
    const copy = await insertEntry(tx, entry.sectionId, entry.position + 1, contentOf(entry), now);
    await tx.runAsync(
      `INSERT INTO bullets (entry_id, position, text, created_at, updated_at)
         SELECT ?, position, text, ?, ? FROM bullets WHERE entry_id = ? ORDER BY position, id`,
      copy,
      now,
      now,
      id
    );
    return copy;
  });
}

/** Everything a delete removes, for undo (SPEC §10: re-insert from the deleted snapshot). */
export type DeletedEntry = { entry: RawRow; bullets: RawRow[]; versionEntries: RawRow[]; versionBullets: RawRow[] };

/** Deletes the entry (bullets and version rows cascade) and returns the snapshot for undo. */
export function deleteEntry(db: Db, id: number): Promise<DeletedEntry> {
  return withTransaction(db, async (tx) => {
    const entry = await tx.getFirstAsync<RawRow>('SELECT * FROM entries WHERE id = ?', id);
    if (!entry) throw new NotFoundError('entry', id);
    const snapshot: DeletedEntry = {
      entry,
      bullets: await tx.getAllAsync<RawRow>('SELECT * FROM bullets WHERE entry_id = ? ORDER BY position, id', id),
      versionEntries: await tx.getAllAsync<RawRow>('SELECT * FROM version_entries WHERE entry_id = ?', id),
      versionBullets: await tx.getAllAsync<RawRow>(
        'SELECT vb.* FROM version_bullets vb JOIN bullets b ON b.id = vb.bullet_id WHERE b.entry_id = ?',
        id
      ),
    };
    await tx.runAsync('DELETE FROM entries WHERE id = ?', id);
    await compactPositions(tx, entriesIn(Number(entry.section_id)));
    return snapshot;
  });
}

/** Undo of deleteEntry: same ids, same place, same version rows (for versions that still exist). */
export async function restoreEntry(db: Db, snapshot: DeletedEntry): Promise<void> {
  await withTransaction(db, async (tx) => {
    const scope = entriesIn(Number(snapshot.entry.section_id));
    // The section may have been deleted since (review finding 16): a typed error the undo snackbar can explain.
    if (!(await tx.getFirstAsync('SELECT id FROM sections WHERE id = ?', Number(snapshot.entry.section_id)))) {
      throw new NotFoundError('section', Number(snapshot.entry.section_id));
    }
    await openGap(tx, scope, Number(snapshot.entry.position));
    await insertRow(tx, 'entries', snapshot.entry);
    for (const b of snapshot.bullets) await insertRow(tx, 'bullets', b);
    const versions = new Set(
      (await tx.getAllAsync<{ id: number }>('SELECT id FROM versions')).map((v) => v.id)
    );
    for (const r of snapshot.versionEntries) if (versions.has(Number(r.version_id))) await insertRow(tx, 'version_entries', r);
    for (const r of snapshot.versionBullets) if (versions.has(Number(r.version_id))) await insertRow(tx, 'version_bullets', r);
    await compactPositions(tx, scope);
  });
}
