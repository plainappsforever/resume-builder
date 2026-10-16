// Export history (SPEC §4 exports): every PDF/text export with the resolved snapshot and the read-back result, so
// the user can re-share exactly what was sent. A resume export also marks the version as exported ("new" badges).
import { isSafeExportPath } from '@/data/history';

import { NotFoundError } from './errors';
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

export type ExportKind = 'resume_pdf' | 'cover_pdf' | 'plain_text';

export type ExportRecord = {
  id: number;
  versionId: number | null;
  coverLetterId: number | null;
  kind: ExportKind;
  filePath: string | null;
  fileName: string;
  pageCount: number | null;
  bytes: number | null;
  snapshotJson: string;
  readbackJson: string | null;
  createdAt: number;
};

type ExportRow = {
  id: number;
  version_id: number | null;
  cover_letter_id: number | null;
  kind: ExportKind;
  file_path: string | null;
  file_name: string;
  page_count: number | null;
  bytes: number | null;
  snapshot_json: string;
  readback_json: string | null;
  created_at: number;
};

function toExport(r: ExportRow): ExportRecord {
  return {
    id: r.id,
    versionId: r.version_id,
    coverLetterId: r.cover_letter_id,
    kind: r.kind,
    filePath: r.file_path,
    fileName: r.file_name,
    pageCount: r.page_count,
    bytes: r.bytes,
    snapshotJson: r.snapshot_json,
    readbackJson: r.readback_json,
    createdAt: r.created_at,
  };
}

export type ExportInput = Omit<ExportRecord, 'id' | 'createdAt'>;

/** Records an export. Exactly one of versionId / coverLetterId (CHECK constraint). */
export function addExport(db: Db, input: ExportInput, now = Date.now()): Promise<number> {
  // D59: the file path must be the app's own export folder of this owner (exportFilePath).
  if (input.filePath !== null && !isSafeExportPath(input.filePath, input)) {
    return Promise.reject(new Error(`Unsafe export path: ${input.filePath}`));
  }
  return withTransaction(db, async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO exports (version_id, cover_letter_id, kind, file_path, file_name, page_count, bytes, snapshot_json,
         readback_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.versionId,
      input.coverLetterId,
      input.kind,
      input.filePath,
      input.fileName,
      input.pageCount,
      input.bytes,
      input.snapshotJson,
      input.readbackJson,
      now
    );
    if (input.versionId !== null) {
      await tx.runAsync('UPDATE versions SET last_exported_at = ? WHERE id = ?', now, input.versionId);
    }
    return result.lastInsertRowId;
  });
}

export function getExport(db: Db, id: number): Promise<ExportRecord | null> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<ExportRow>('SELECT * FROM exports WHERE id = ?', id);
    return row ? toExport(row) : null;
  });
}

/** Newest first. */
export function listExports(db: Db, owner: { versionId: number } | { coverLetterId: number }): Promise<ExportRecord[]> {
  return withRead(db, async (db) => {
    const rows =
      'versionId' in owner
        ? await db.getAllAsync<ExportRow>('SELECT * FROM exports WHERE version_id = ? ORDER BY created_at DESC, id DESC', owner.versionId)
        : await db.getAllAsync<ExportRow>(
            'SELECT * FROM exports WHERE cover_letter_id = ? ORDER BY created_at DESC, id DESC',
            owner.coverLetterId
          );
    return rows.map(toExport);
  });
}

/** Every export of the phone, newest first (Settings → Export history). */
export function listAllExports(db: Db): Promise<ExportRecord[]> {
  return withRead(db, async (db) => {
    return (await db.getAllAsync<ExportRow>('SELECT * FROM exports ORDER BY created_at DESC, id DESC')).map(toExport);
  });
}

/** Read-back finishes after the file exists: its result is stored on the row afterwards. */
export async function setExportReadback(db: Db, id: number, readbackJson: string): Promise<void> {
  await withWrite(db, async (tx) => {
    const r = await tx.runAsync('UPDATE exports SET readback_json = ? WHERE id = ?', readbackJson, id);
    if (r.changes === 0) throw new NotFoundError('export', id);
  });
}

/** v1.1 (D96): a history file made again from its snapshot (restored backup): the new size, pages and read-back. */
export async function setRemadeExport(db: Db, id: number, input: { readbackJson: string; bytes: number; pageCount: number }): Promise<void> {
  await withWrite(db, async (tx) => {
    const r = await tx.runAsync('UPDATE exports SET readback_json = ?, bytes = ?, page_count = ? WHERE id = ?', input.readbackJson, input.bytes, input.pageCount, id);
    if (r.changes === 0) throw new NotFoundError('export', id);
  });
}

/** Removes one history row; returns its file path for the app to remove (P5 glue). */
export function deleteExport(db: Db, id: number): Promise<string | null> {
  return withWrite(db, async (tx) => {
    const row = await tx.getFirstAsync<{ file_path: string | null }>('SELECT file_path FROM exports WHERE id = ?', id);
    await tx.runAsync('DELETE FROM exports WHERE id = ?', id);
    const path = row?.file_path ?? null;
    return path !== null && isSafeExportPath(path) ? path : null; // D59
  });
}
