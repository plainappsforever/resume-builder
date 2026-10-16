// A version's keyword list (SPEC §5.3–5.4). Terms are stored as given; normalisation is the keyword engine's job (P2).
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

export type KeywordSource = 'auto' | 'added';
export type KeywordState = 'normal' | 'pinned' | 'ignored';
export type VersionKeyword = { term: string; source: KeywordSource; state: KeywordState };

export function listKeywords(db: Db, versionId: number): Promise<VersionKeyword[]> {
  return withRead(db, async (db) => {
    return db.getAllAsync<VersionKeyword>(
      'SELECT term, source, state FROM version_keywords WHERE version_id = ? ORDER BY rowid',
      versionId
    );
  });
}

/**
 * Replaces the automatic terms after the job ad changed: auto terms the user never touched (state normal) and that
 * are no longer extracted go; new ones are added; pinned/ignored and user-added terms always stay.
 */
export async function replaceAutoKeywords(db: Db, versionId: number, terms: readonly string[]): Promise<void> {
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  await withTransaction(db, async (tx) => {
    const keep = new Set(unique);
    const autos = await tx.getAllAsync<{ term: string }>(
      "SELECT term FROM version_keywords WHERE version_id = ? AND source = 'auto' AND state = 'normal'",
      versionId
    );
    for (const { term } of autos) {
      if (!keep.has(term)) await tx.runAsync('DELETE FROM version_keywords WHERE version_id = ? AND term = ?', versionId, term);
    }
    for (const term of unique) {
      await tx.runAsync(
        "INSERT INTO version_keywords (version_id, term, source) VALUES (?, ?, 'auto') ON CONFLICT DO NOTHING",
        versionId,
        term
      );
    }
  });
}

/** A term the user adds by hand. Returns false if the version already has it. */
export function addKeyword(db: Db, versionId: number, term: string): Promise<boolean> {
  return withWrite(db, async (tx) => {
    const r = await tx.runAsync(
      "INSERT INTO version_keywords (version_id, term, source) VALUES (?, ?, 'added') ON CONFLICT DO NOTHING",
      versionId,
      term.trim()
    );
    return r.changes > 0;
  });
}

/**
 * Pins / ignores / restores a term. A term that is only in the ad's "Show all" part has no row yet: it gets one
 * (source 'auto'), so the choice survives the next ad edit (D38: only the top 25 automatic terms are stored).
 */
export async function setKeywordState(db: Db, versionId: number, term: string, state: KeywordState): Promise<void> {
  await withWrite(db, (tx) =>
    tx.runAsync(
      "INSERT INTO version_keywords (version_id, term, source, state) VALUES (?, ?, 'auto', ?) ON CONFLICT(version_id, term) DO UPDATE SET state = excluded.state",
      versionId,
      term.trim(),
      state
    )
  );
}

/** Removes a term (user-added ones; automatic ones are ignored instead, so they do not come back). */
export async function removeKeyword(db: Db, versionId: number, term: string): Promise<void> {
  await withWrite(db, (tx) => tx.runAsync('DELETE FROM version_keywords WHERE version_id = ? AND term = ?', versionId, term));
}
