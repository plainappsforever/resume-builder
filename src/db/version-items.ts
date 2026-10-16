// A version's deviations from the master (D17, SPEC §5.1): include flags, order, overrides, "Apply to master".
// Every function here writes ONLY version tables — except the apply* functions, which deliberately move an override
// into the master and clear it in this version only (other versions keep their own overrides).
import { versionOrder } from '@/engine/resolve';
import { ENTRY_OVERRIDE_FIELDS, type EntryField, type EntryOverrides } from '@/engine/types';

import { updateBullet } from './bullets';
import { updateEntry, type EntryInput } from './entries';
import { NotFoundError } from './errors';
import { updateProfile } from './profile';
import { withTransaction } from './tx';
import type { Db } from './types';

type Kind = 'section' | 'entry' | 'bullet';
const TABLE: Record<Kind, { table: string; key: string }> = {
  section: { table: 'version_sections', key: 'section_id' },
  entry: { table: 'version_entries', key: 'entry_id' },
  bullet: { table: 'version_bullets', key: 'bullet_id' },
};

async function ensureRow(tx: Db, kind: Kind, versionId: number, itemId: number) {
  const { table, key } = TABLE[kind];
  await tx.runAsync(`INSERT INTO ${table} (version_id, ${key}) VALUES (?, ?) ON CONFLICT DO NOTHING`, versionId, itemId);
}

async function setColumn(tx: Db, kind: Kind, versionId: number, itemId: number, column: string, value: string | number | null) {
  const { table, key } = TABLE[kind];
  await ensureRow(tx, kind, versionId, itemId);
  await tx.runAsync(`UPDATE ${table} SET ${column} = ? WHERE version_id = ? AND ${key} = ?`, value, versionId, itemId);
}

async function touchVersion(tx: Db, versionId: number, now: number) {
  const r = await tx.runAsync('UPDATE versions SET updated_at = ? WHERE id = ?', now, versionId);
  if (r.changes === 0) throw new NotFoundError('version', versionId);
}

function versionWrite(db: Db, versionId: number, now: number, fn: (tx: Db) => Promise<void>): Promise<void> {
  return withTransaction(db, async (tx) => {
    await touchVersion(tx, versionId, now);
    await fn(tx);
  });
}

// ---- include / exclude ---------------------------------------------------------------------------------------

export function setSectionIncluded(db: Db, versionId: number, sectionId: number, included: boolean, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) => setColumn(tx, 'section', versionId, sectionId, 'included', included ? 1 : 0));
}

export function setEntryIncluded(db: Db, versionId: number, entryId: number, included: boolean, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) => setColumn(tx, 'entry', versionId, entryId, 'included', included ? 1 : 0));
}

export function setBulletIncluded(db: Db, versionId: number, bulletId: number, included: boolean, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) => setColumn(tx, 'bullet', versionId, bulletId, 'included', included ? 1 : 0));
}

/**
 * "Include" on a hidden-entry suggestion of the Job tab (SPEC §5.4, D39): shows the entry (and its section, when the whole
 * section is hidden) or the hidden bullet in this version — one transaction, version tables only.
 */
export function includeSuggestion(
  db: Db,
  versionId: number,
  suggestion: { kind: 'entry'; sectionId: number; entryId: number; sectionHidden: boolean } | { kind: 'bullet'; bulletId: number },
  now = Date.now()
) {
  return versionWrite(db, versionId, now, async (tx) => {
    if (suggestion.kind === 'bullet') return setColumn(tx, 'bullet', versionId, suggestion.bulletId, 'included', 1);
    if (suggestion.sectionHidden) await setColumn(tx, 'section', versionId, suggestion.sectionId, 'included', 1);
    await setColumn(tx, 'entry', versionId, suggestion.entryId, 'included', 1);
  });
}

// ---- section options -------------------------------------------------------------------------------------------

/** NULL or blank = the master's title. */
export function setSectionTitleOverride(db: Db, versionId: number, sectionId: number, title: string | null, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) =>
    setColumn(tx, 'section', versionId, sectionId, 'title_override', title?.trim() ? title.trim() : null)
  );
}

export function setSectionPageBreak(db: Db, versionId: number, sectionId: number, on: boolean, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) => setColumn(tx, 'section', versionId, sectionId, 'page_break_before', on ? 1 : 0));
}

// ---- order -----------------------------------------------------------------------------------------------------

/** The siblings of an item in the version's current order (same rule as resolve.ts), hidden ones included. */
async function currentOrder(tx: Db, kind: Kind, versionId: number, itemId: number): Promise<number[]> {
  let rows: { id: number; vpos: number | null }[];
  if (kind === 'section') {
    rows = await tx.getAllAsync(
      `SELECT s.id, vs.position AS vpos FROM sections s
         LEFT JOIN version_sections vs ON vs.section_id = s.id AND vs.version_id = ?
       ORDER BY s.position, s.id`,
      versionId
    );
  } else if (kind === 'entry') {
    rows = await tx.getAllAsync(
      `SELECT e.id, ve.position AS vpos FROM entries e
         LEFT JOIN version_entries ve ON ve.entry_id = e.id AND ve.version_id = ?
       WHERE e.section_id = (SELECT section_id FROM entries WHERE id = ?)
       ORDER BY e.position, e.id`,
      versionId,
      itemId
    );
  } else {
    rows = await tx.getAllAsync(
      `SELECT b.id, vb.position AS vpos FROM bullets b
         LEFT JOIN version_bullets vb ON vb.bullet_id = b.id AND vb.version_id = ?
       WHERE b.entry_id = (SELECT entry_id FROM bullets WHERE id = ?)
       ORDER BY b.position, b.id`,
      versionId,
      itemId
    );
  }
  return versionOrder(rows, (r) => r.vpos).map((r) => r.id);
}

/**
 * Moves an item to `toIndex` (clamped) in this version only. Writes positions for ALL its siblings, so the version's
 * order is fixed from now on; master items added later appear after them (rule 1).
 */
async function moveInVersion(db: Db, kind: Kind, versionId: number, itemId: number, toIndex: number, now: number) {
  await versionWrite(db, versionId, now, async (tx) => {
    const ids = await currentOrder(tx, kind, versionId, itemId);
    if (!ids.includes(itemId)) throw new NotFoundError(kind, itemId);
    const rest = ids.filter((id) => id !== itemId);
    rest.splice(Math.max(0, Math.min(rest.length, Math.trunc(toIndex))), 0, itemId);
    for (let i = 0; i < rest.length; i++) await setColumn(tx, kind, versionId, rest[i], 'position', i);
  });
}

export const moveSectionInVersion = (db: Db, versionId: number, sectionId: number, toIndex: number, now = Date.now()) =>
  moveInVersion(db, 'section', versionId, sectionId, toIndex, now);
export const moveEntryInVersion = (db: Db, versionId: number, entryId: number, toIndex: number, now = Date.now()) =>
  moveInVersion(db, 'entry', versionId, entryId, toIndex, now);
export const moveBulletInVersion = (db: Db, versionId: number, bulletId: number, toIndex: number, now = Date.now()) =>
  moveInVersion(db, 'bullet', versionId, bulletId, toIndex, now);

/** Back to master order for the item's siblings in this version. */
export async function resetOrderInVersion(db: Db, kind: Kind, versionId: number, itemId: number, now = Date.now()) {
  await versionWrite(db, versionId, now, async (tx) => {
    for (const id of await currentOrder(tx, kind, versionId, itemId)) {
      const { table, key } = TABLE[kind];
      await tx.runAsync(`UPDATE ${table} SET position = NULL WHERE version_id = ? AND ${key} = ?`, versionId, id);
    }
  });
}

// ---- overrides ("edit for this version only") ----------------------------------------------------------------------

export function parseOverrides(json: string | null | undefined): EntryOverrides {
  try {
    const value: unknown = JSON.parse(json || '{}');
    const out: EntryOverrides = {};
    if (value && typeof value === 'object') {
      for (const f of ENTRY_OVERRIDE_FIELDS) {
        const v = (value as Record<string, unknown>)[f];
        if (typeof v === 'string') out[f] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function getOverrides(tx: Db, versionId: number, entryId: number): Promise<EntryOverrides> {
  const row = await tx.getFirstAsync<{ override_json: string }>(
    'SELECT override_json FROM version_entries WHERE version_id = ? AND entry_id = ?',
    versionId,
    entryId
  );
  return parseOverrides(row?.override_json);
}

/** Sets (string, also empty = blank in this version) or clears (NULL) one field override of an entry. */
export function setEntryOverride(
  db: Db,
  versionId: number,
  entryId: number,
  field: EntryField,
  value: string | null,
  now = Date.now()
) {
  return versionWrite(db, versionId, now, async (tx) => {
    const overrides = await getOverrides(tx, versionId, entryId);
    if (value === null) delete overrides[field];
    else overrides[field] = value;
    await setColumn(tx, 'entry', versionId, entryId, 'override_json', JSON.stringify(overrides));
  });
}

/** Sets or clears (NULL or blank = master text) a bullet's text in this version. */
export function setBulletOverride(db: Db, versionId: number, bulletId: number, text: string | null, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) =>
    setColumn(tx, 'bullet', versionId, bulletId, 'text_override', text !== null && text.trim() !== '' ? text : null)
  );
}

/** The user has looked at a "changed in master" entry: the badge goes away for this version. */
export function markEntrySeen(db: Db, versionId: number, entryId: number, now = Date.now()) {
  return versionWrite(db, versionId, now, (tx) => setColumn(tx, 'entry', versionId, entryId, 'seen_master_at', now));
}

// ---- Apply to master ------------------------------------------------------------------------------------------------

/**
 * Moves the entry's overrides (all, or the given fields) into the master and clears them in this version only. This
 * version then counts the master change as seen; other versions see "changed in master" and keep their overrides.
 */
export function applyEntryOverrideToMaster(
  db: Db,
  versionId: number,
  entryId: number,
  fields: readonly EntryField[] = ENTRY_OVERRIDE_FIELDS,
  now = Date.now()
) {
  return versionWrite(db, versionId, now, async (tx) => {
    const overrides = await getOverrides(tx, versionId, entryId);
    const patch: EntryInput = {};
    for (const f of fields) {
      if (typeof overrides[f] === 'string') {
        patch[f] = overrides[f];
        delete overrides[f];
      }
    }
    if (Object.keys(patch).length === 0) return;
    await updateEntry(tx, entryId, patch, now);
    await setColumn(tx, 'entry', versionId, entryId, 'override_json', JSON.stringify(overrides));
    await setColumn(tx, 'entry', versionId, entryId, 'seen_master_at', now);
  });
}

/** Moves a bullet's version text into the master bullet and clears it in this version only. */
export function applyBulletOverrideToMaster(db: Db, versionId: number, bulletId: number, now = Date.now()) {
  return versionWrite(db, versionId, now, async (tx) => {
    const row = await tx.getFirstAsync<{ text_override: string | null; entry_id: number }>(
      `SELECT vb.text_override, b.entry_id FROM version_bullets vb JOIN bullets b ON b.id = vb.bullet_id
       WHERE vb.version_id = ? AND vb.bullet_id = ?`,
      versionId,
      bulletId
    );
    if (!row || row.text_override === null) return;
    await updateBullet(tx, bulletId, row.text_override, now);
    await setColumn(tx, 'bullet', versionId, bulletId, 'text_override', null);
    await setColumn(tx, 'entry', versionId, row.entry_id, 'seen_master_at', now);
  });
}

/** Headline or summary override → master profile; cleared in this version only. */
export function applyProfileOverrideToMaster(db: Db, versionId: number, field: 'headline' | 'summary', now = Date.now()) {
  const column = field === 'headline' ? 'headline_override' : 'summary_override';
  return versionWrite(db, versionId, now, async (tx) => {
    const row = await tx.getFirstAsync<{ value: string | null }>(`SELECT ${column} AS value FROM versions WHERE id = ?`, versionId);
    if (row?.value === null || row?.value === undefined) return;
    await updateProfile(tx, { [field]: row.value }, now);
    await tx.runAsync(`UPDATE versions SET ${column} = NULL WHERE id = ?`, versionId);
  });
}
