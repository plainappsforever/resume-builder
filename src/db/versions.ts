// Versions (D17): name, target job, design, headline/summary overrides. Their content deviations live in
// version-items.ts. No version function ever writes a master table (A2 property test).
import type { Lang, TemplateId, Version } from '@/engine/types';

import { isSafeExportPath } from '@/data/history';

import { NotFoundError } from './errors';
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

type VersionRow = {
  id: number;
  name: string;
  target_company: string;
  target_role: string;
  job_ad: string;
  language: Lang;
  template: TemplateId;
  style_json: string;
  headline_override: string | null;
  summary_override: string | null;
  source_version_id: number | null;
  archived: number;
  is_example: number;
  created_at: number;
  updated_at: number;
  last_exported_at: number | null;
};

export function toVersion(r: VersionRow): Version {
  return {
    id: r.id,
    name: r.name,
    targetCompany: r.target_company,
    targetRole: r.target_role,
    jobAd: r.job_ad,
    language: r.language,
    template: r.template,
    styleJson: r.style_json,
    headlineOverride: r.headline_override,
    summaryOverride: r.summary_override,
    sourceVersionId: r.source_version_id,
    archived: r.archived === 1,
    isExample: r.is_example === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastExportedAt: r.last_exported_at,
  };
}

export function getVersion(db: Db, id: number): Promise<Version | null> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<VersionRow>('SELECT * FROM versions WHERE id = ?', id);
    return row ? toVersion(row) : null;
  });
}

/** Newest activity first; archived ones only on request. */
export function listVersions(db: Db, { archived = false } = {}): Promise<Version[]> {
  return withRead(db, async (db) => {
    const rows = await db.getAllAsync<VersionRow>(
      'SELECT * FROM versions WHERE archived = ? ORDER BY updated_at DESC, id DESC',
      archived ? 1 : 0
    );
    return rows.map(toVersion);
  });
}

export type VersionInput = {
  name: string;
  targetCompany?: string;
  targetRole?: string;
  jobAd?: string;
  language?: Lang;
  template?: TemplateId;
  styleJson?: string;
  isExample?: boolean;
};

export function createVersion(db: Db, input: VersionInput, now = Date.now()): Promise<number> {
  return withWrite(db, async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO versions (name, target_company, target_role, job_ad, language, template, style_json, is_example,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name.trim(),
      input.targetCompany ?? '',
      input.targetRole ?? '',
      input.jobAd ?? '',
      input.language ?? 'en',
      input.template ?? 'modern',
      input.styleJson ?? '{}',
      input.isExample ? 1 : 0,
      now,
      now
    );
    return result.lastInsertRowId;
  });
}

export type VersionPatch = Partial<
  Pick<
    Version,
    | 'name'
    | 'targetCompany'
    | 'targetRole'
    | 'jobAd'
    | 'language'
    | 'template'
    | 'styleJson'
    | 'headlineOverride'
    | 'summaryOverride'
    | 'archived'
  >
>;

const COLUMNS: Record<keyof VersionPatch, string> = {
  name: 'name',
  targetCompany: 'target_company',
  targetRole: 'target_role',
  jobAd: 'job_ad',
  language: 'language',
  template: 'template',
  styleJson: 'style_json',
  headlineOverride: 'headline_override',
  summaryOverride: 'summary_override',
  archived: 'archived',
};

/** Version-only fields (headline/summary override NULL = master text). */
export async function updateVersion(db: Db, id: number, patch: VersionPatch, now = Date.now()): Promise<void> {
  const keys = (Object.keys(patch) as (keyof VersionPatch)[]).filter((k) => k in COLUMNS && patch[k] !== undefined);
  const values = keys.map((k) => {
    const v = patch[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | null);
  });
  await withWrite(db, async (tx) => {
    const r = await tx.runAsync(
      `UPDATE versions SET ${[...keys.map((k) => `${COLUMNS[k]} = ?`), 'updated_at = ?'].join(', ')} WHERE id = ?`,
      ...values,
      now,
      id
    );
    if (r.changes === 0) throw new NotFoundError('version', id);
  });
}

/** "Name" → "Name (2)", "Name (2)" → "Name (3)" … — the first free one (SPEC §10). */
export function nextCopyName(name: string, taken: readonly string[]): string {
  const base = name.replace(/ \(\d+\)$/, '');
  const used = new Set(taken);
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** Copies the version row and ALL its deviation rows (sections, entries, bullets, keywords). Not its exports. */
export function duplicateVersion(db: Db, id: number, now = Date.now()): Promise<number> {
  return withTransaction(db, async (tx) => {
    const source = await getVersion(tx, id);
    if (!source) throw new NotFoundError('version', id);
    const names = (await tx.getAllAsync<{ name: string }>('SELECT name FROM versions')).map((r) => r.name);
    const result = await tx.runAsync(
      `INSERT INTO versions (name, target_company, target_role, job_ad, language, template, style_json, headline_override,
         summary_override, source_version_id, archived, is_example, created_at, updated_at, last_exported_at)
       SELECT ?, target_company, target_role, job_ad, language, template, style_json, headline_override,
         summary_override, id, 0, is_example, ?, ?, NULL FROM versions WHERE id = ?`,
      nextCopyName(source.name, names),
      now,
      now,
      id
    );
    const copy = result.lastInsertRowId;
    await tx.runAsync(
      `INSERT INTO version_sections (version_id, section_id, included, position, title_override, page_break_before)
       SELECT ?, section_id, included, position, title_override, page_break_before FROM version_sections WHERE version_id = ?`,
      copy,
      id
    );
    await tx.runAsync(
      `INSERT INTO version_entries (version_id, entry_id, included, position, override_json, seen_master_at)
       SELECT ?, entry_id, included, position, override_json, seen_master_at FROM version_entries WHERE version_id = ?`,
      copy,
      id
    );
    await tx.runAsync(
      `INSERT INTO version_bullets (version_id, bullet_id, included, position, text_override)
       SELECT ?, bullet_id, included, position, text_override FROM version_bullets WHERE version_id = ?`,
      copy,
      id
    );
    await tx.runAsync(
      `INSERT INTO version_keywords (version_id, term, source, state)
       SELECT ?, term, source, state FROM version_keywords WHERE version_id = ?`,
      copy,
      id
    );
    return copy;
  });
}

/**
 * Deletes the version, its deviation rows and its export rows (cascade); cover letters stay, unlinked. Returns the
 * file paths of the deleted export rows so the app can remove those PDFs from its own export folder (P5 glue).
 */
export function deleteVersion(db: Db, id: number): Promise<string[]> {
  return withTransaction(db, async (tx) => {
    const files = await tx.getAllAsync<{ file_path: string }>(
      'SELECT file_path FROM exports WHERE version_id = ? AND file_path IS NOT NULL',
      id
    );
    await tx.runAsync('DELETE FROM versions WHERE id = ?', id);
    // D59: only paths inside the app's own export folder are ever handed to the file glue for deletion.
    return files.map((f) => f.file_path).filter((p) => isSafeExportPath(p));
  });
}
