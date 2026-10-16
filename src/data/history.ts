// Export history (SPEC §4 exports, F6, A9): what an export row stores and how the history list reads it. PURE.
// snapshot_json = the exact document state at the tap (RenderModel or cover input + design), so a missing file can be
// re-rendered identically; readback_json = the full SPEC §5.7 result or "could not read back".
import type { RenderModel } from '@/engine/resolve';
import type { VersionStyle } from '@/engine/style';
import type { TemplateId } from '@/engine/types';
import type { ReadbackResult } from '@/readback/compare';
import type { CoverInput } from '@/render/html/cover';

export const SNAPSHOT_VERSION = 1;

export type ExportKind = 'resume_pdf' | 'cover_pdf' | 'plain_text';

export type ExportSnapshot =
  | { v: 1; kind: 'resume_pdf' | 'plain_text'; model: RenderModel }
  | { v: 1; kind: 'cover_pdf'; cover: CoverInput; design: { template: TemplateId; style: VersionStyle }; today: string };

/** `remadeAt` (v1.1, D96): the file was made again from the snapshot at this time (restored backup) and this is ITS read-back. */
export type StoredReadback = (ReadbackResult | { unavailable: true; reason: string }) & { remadeAt?: number };

export function snapshotJson(snapshot: ExportSnapshot): string {
  return JSON.stringify(snapshot);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function parseSnapshot(json: string): ExportSnapshot | null {
  try {
    const s: unknown = JSON.parse(json);
    if (!isObj(s) || s.v !== SNAPSHOT_VERSION) return null;
    if ((s.kind === 'resume_pdf' || s.kind === 'plain_text') && isObj(s.model) && Array.isArray(s.model.sections)) return s as ExportSnapshot;
    if (s.kind === 'cover_pdf' && isObj(s.cover) && isObj(s.design) && typeof s.today === 'string') return s as ExportSnapshot;
    return null;
  } catch {
    return null;
  }
}

export function readbackJson(result: StoredReadback): string {
  return JSON.stringify(result);
}

/** D92: only a read-back that passed opens the share sheet at once; anything else (fail, could not read back) is shown first. */
export function readbackPassed(r: StoredReadback | null): boolean {
  return r !== null && !('unavailable' in r) && r.pass;
}

/** null = no read-back stored (plain text, or the read-back never finished: shown as "not checked"). */
export function parseReadback(json: string | null): StoredReadback | null {
  if (json === null) return null;
  try {
    const r: unknown = JSON.parse(json);
    if (!isObj(r)) return null;
    if (r.unavailable === true)
      return { unavailable: true, reason: typeof r.reason === 'string' ? r.reason : '', ...(typeof r.remadeAt === 'number' ? { remadeAt: r.remadeAt } : {}) };
    if (typeof r.pass === 'boolean' && typeof r.reader === 'string' && isObj(r.words) && isObj(r.lines)) return r as ReadbackResult;
    return null;
  } catch {
    return null;
  }
}

/** Where the app keeps an export, relative to the document directory: one folder per export, the file keeps its name. */
export function exportFilePath(owner: { versionId: number } | { coverLetterId: number }, createdAt: number, fileName: string): string {
  const who = 'versionId' in owner ? `v${owner.versionId}` : `c${owner.coverLetterId}`;
  return `exports/${who}/${createdAt}/${fileName}`;
}

const EXPORT_PATH = /^exports\/([vc])([1-9]\d*)\/(\d+)\/([^/\\]+)$/;

/**
 * D59: a stored export path the app may open or DELETE: exactly `exports/v<id>|c<id>/<digits>/<file name>` relative to
 * the document directory — no "..", no absolute path, no backslash, no control character, and (when the row is given)
 * the folder of the row's own owner. Everything else is refused by the backup validation and never handed to the
 * file glue for deletion. Symlinks: the app creates none under `exports/`; the P5 glue still deletes only a file whose
 * resolved path lies inside `<document>/exports/` (resolveExportFile + a canonical-path check on the device).
 */
export function isSafeExportPath(path: string, owner?: { versionId: number | null; coverLetterId: number | null }): boolean {
  const m = EXPORT_PATH.exec(path);
  if (!m) return false;
  const name = m[4];
  if (name === '.' || name === '..' || name.length > 255 || /[\u0000-\u001f\u007f]/.test(name)) return false;
  if (owner) {
    const want = owner.versionId !== null ? `v${owner.versionId}` : `c${owner.coverLetterId}`;
    if (`${m[1]}${m[2]}` !== want) return false;
  }
  return true;
}

/** The absolute file URI of a stored export path, or null when the path is not safe (D59). `documentDir` ends with "/". */
export function resolveExportFile(documentDir: string, path: string | null): string | null {
  if (path === null || !isSafeExportPath(path)) return null;
  return documentDir.endsWith('/') ? documentDir + path : `${documentDir}/${path}`;
}

export type HistoryRecord = {
  id: number;
  kind: ExportKind;
  fileName: string;
  filePath: string | null;
  pageCount: number | null;
  bytes: number | null;
  snapshotJson: string;
  readbackJson: string | null;
  createdAt: number;
};

export type HistoryItem = {
  id: number;
  kind: ExportKind;
  fileName: string;
  createdAt: number;
  pages: number | null;
  bytes: number | null;
  readback: 'pass' | 'passType3' | 'fail' | 'unavailable' | 'notChecked';
  /** Re-share sends the stored file; if it is gone, the snapshot re-renders the same document (P5). */
  reshare: 'file' | 'rerender' | 'none';
  /** D96: when the file was made again from the snapshot (restored backup); null = the original file. */
  remadeAt: number | null;
};

export function historyItem(r: HistoryRecord): HistoryItem {
  const rb = parseReadback(r.readbackJson);
  const snapshot = parseSnapshot(r.snapshotJson);
  return {
    id: r.id,
    kind: r.kind,
    fileName: r.fileName,
    createdAt: r.createdAt,
    pages: r.pageCount,
    bytes: r.bytes,
    // D93: a pass whose PDF stores a font as drawings (Type 3: Android phones printing with Roboto) is labelled as such.
    readback: rb === null ? 'notChecked' : 'unavailable' in rb ? 'unavailable' : rb.pass ? (rb.fontsEmbedded === false ? 'passType3' : 'pass') : 'fail',
    reshare: r.filePath ? 'file' : snapshot ? 'rerender' : 'none',
    remadeAt: rb && typeof rb.remadeAt === 'number' ? rb.remadeAt : null,
  };
}

/**
 * What the Check tab feeds C11, C12 and C15 with (SPEC §5.5): the newest PDF export of the resume — its size, page count and
 * stored read-back. No PDF export yet → both null (those checks say "not checked yet"). `rows` newest first.
 */
export function checkExportContext(
  rows: readonly Pick<HistoryRecord, 'kind' | 'bytes' | 'pageCount' | 'readbackJson' | 'snapshotJson'>[],
  current?: RenderModel
): {
  lastExport: { bytes: number; pages: number } | null;
  readback: StoredReadback | null;
  stale: boolean;
} {
  const row = rows.find((r) => r.kind === 'resume_pdf');
  if (!row) return { lastExport: null, readback: null, stale: false };
  return {
    lastExport: row.bytes !== null && row.pageCount !== null ? { bytes: row.bytes, pages: row.pageCount } : null,
    readback: parseReadback(row.readbackJson),
    stale: current ? isStale(row.snapshotJson, current) : false,
  };
}

/**
 * D95: the newest export describes an older document when its snapshot (the exact RenderModel at the tap, D50) differs from
 * the resume as it is now — any content, master, template, style, language or photo change. An unreadable snapshot counts
 * as stale (export again).
 */
export function isStale(snapshotJsonText: string, current: RenderModel): boolean {
  const snapshot = parseSnapshot(snapshotJsonText);
  if (!snapshot || snapshot.kind !== 'resume_pdf') return true;
  return JSON.stringify(snapshot.model) !== JSON.stringify(current);
}
