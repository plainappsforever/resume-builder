// Files of the Data screen (SPEC F12, §9, §11; D22, D50, D62): the backup file, the file picker and the restore around the
// pure format (src/data/backup.ts) and the one-transaction database side (src/db/backup.ts), the safety copy, the text
// export of all resumes, and the files "Delete all data" removes. Every database write is in src/db (write queue).
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  BACKUP_SCHEMA,
  backupFileName,
  buildBackup,
  MAX_PHOTO_BASE64,
  parseBackup,
  photoRestorePlan,
  serializeBackup,
  type Backup,
  type BackupError,
  type BackupPhoto,
  type BackupSummary,
} from '@/data/backup';
import { listAllExports } from '@/db/exports';
import { loadRenderModel } from '@/db/load';
import { getProfile } from '@/db/profile';
import { readBackupData, readDataCounts, restoreBackupData } from '@/db/backup';
import { getThemePreference, setSetting } from '@/db/settings';
import { listVersions } from '@/db/versions';
import { wipeAllData } from '@/db/wipe';
import { plainText } from '@/engine/plaintext';

import { isDevVariant } from './app-variant';
import { removeExportFiles } from './export';
import { initUiLanguage } from './locale';
import { applyThemePreference } from './theme-preference';

const BACKUP_DIR = 'backup';

function cacheFile(dir: string, name: string): File {
  const folder = new Directory(Paths.cache, dir);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return new File(folder, name);
}

function writeText(file: File, text: string) {
  if (!file.exists) file.create({ intermediates: true });
  file.write(text);
}

/** Share sheet for a file we just wrote; false when this phone has no share sheet. */
export async function shareDataFile(file: File, kind: 'json' | 'txt'): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, kind === 'json' ? { mimeType: 'application/json', UTI: 'public.json', dialogTitle: file.name } : { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: file.name });
  return true;
}

// ---- Backup ----------------------------------------------------------------------------------------------------------

/** The profile photo as the backup carries it (a missing or oversized file is left out; the app stores JPEG ≤ 600 px, D69). */
async function backupPhoto(photoFile: string | null): Promise<BackupPhoto | null> {
  if (!photoFile || !photoFile.startsWith('photos/') || photoFile.includes('..')) return null;
  const file = new File(Paths.document, photoFile);
  if (!file.exists) return null;
  const base64 = await file.base64();
  if (base64.length > MAX_PHOTO_BASE64) return null;
  return { mime: photoFile.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', base64 };
}

export async function buildBackupFile(db: SQLiteDatabase, now: Date = new Date()): Promise<Backup> {
  const data = await readBackupData(db);
  const profile = await getProfile(db);
  return buildBackup(data, await backupPhoto(profile.photoFile), { name: 'Resume Builder', version: String(Constants.expoConfig?.version ?? ''), schema: BACKUP_SCHEMA }, now);
}

const devBackupFile = () => new File(Paths.document, 'dev-backup', 'last.json');

/** Writes `Resume-Builder-Backup-YYYY-MM-DD.json` into the cache and returns it for the share sheet. */
export async function writeBackupFile(db: SQLiteDatabase): Promise<{ file: File; name: string; bytes: number }> {
  const now = new Date();
  const text = serializeBackup(await buildBackupFile(db, now));
  const name = backupFileName(now);
  const file = cacheFile(BACKUP_DIR, name);
  writeText(file, text);
  if (isDevVariant) writeText(devBackupFile(), text); // survives "Delete all data": a flow restores it without the system picker
  return { file, name, bytes: text.length };
}

/** Development builds: the last backup made on this phone. */
export function lastDevBackup(): File | null {
  const file = devBackupFile();
  return isDevVariant && file.exists ? file : null;
}

// ---- Safety copy (SPEC §10 "nothing changed"; invoice-maker D92) ---------------------------------------------------------
// Right before a restore replaces everything, the current data is written to `<document>/safety/before-restore.json`
// (one file, the newest replaces the older); "Undo the last restore" brings it back. Not written when the phone has no data
// (an empty copy would replace a useful one). "Delete all data" removes it with everything else: a delete must delete.
const safetyFile = () => new File(Paths.document, 'safety', 'before-restore.json');

export async function writeSafetyCopy(db: SQLiteDatabase): Promise<void> {
  if (!(await readDataCounts(db)).hasData) return;
  writeText(safetyFile(), serializeBackup(await buildBackupFile(db)));
}

export function safetyCopy(): { file: File; modified: number | null } | null {
  const file = safetyFile();
  return file.exists ? { file, modified: file.modificationTime ?? null } : null;
}

// ---- Restore -----------------------------------------------------------------------------------------------------------

export type PickedBackup = { canceled: true } | { canceled: false; text: string } | { canceled: false; error: string };

/** The app's temporary folder (iOS `tmp/`), where the iOS document picker puts its copy of a picked file (`<bundle id>-Inbox/`). */
function tmpRootUri(): string {
  return Paths.cache.uri.replace(/Library\/Caches\/?$/, 'tmp/');
}

/**
 * v1.1 (D91, found while proving REVIEW_V1 #11): the iOS document picker hands the app a COPY of the chosen backup (all of the
 * user's data) in `tmp/<bundle id>-Inbox/`; it is removed as soon as its text is read. Android hands a content:// URI to the
 * user's own file, which is never touched.
 */
function removePickedCopy(file: File) {
  const uri = file.uri;
  if (!uri.startsWith('file://') || uri.includes('..') || !(uri.startsWith(tmpRootUri()) || uri.startsWith(Paths.cache.uri))) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // Delete all data removes the Inbox folders as well.
  }
}

/** The system file picker (Files / document UI), then the text of the chosen file. */
export async function pickBackupText(): Promise<PickedBackup> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream', '*/*'] });
  if (picked.canceled) return { canceled: true };
  try {
    return { canceled: false, text: await picked.result.text() };
  } catch (e) {
    return { canceled: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    removePickedCopy(picked.result);
  }
}

export type Reviewed = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: BackupError };

/** Full validation of a file's text; nothing changes (D50, D59). */
export function reviewBackup(text: string): Reviewed {
  return parseBackup(text);
}

function removePhoto(relative: string | null) {
  if (!relative || !relative.startsWith('photos/') || relative.includes('..')) return;
  try {
    const file = new File(Paths.document, relative);
    if (file.exists) file.delete();
  } catch {
    // A leftover photo file is harmless; the database is the source of truth.
  }
}

/**
 * Restores a validated backup: safety copy first (a failure stops here, nothing replaced), the backup's photo into a NEW
 * file (D62), then ONE database transaction; the old photo and the export files no restored row points to go only after
 * COMMIT, the new photo goes if the transaction fails.
 */
export async function applyRestore(db: SQLiteDatabase, backup: Backup): Promise<void> {
  await writeSafetyCopy(db);
  const [profile, oldExports] = await Promise.all([getProfile(db), listAllExports(db)]);
  const plan = photoRestorePlan(backup, profile.photoFile, Date.now());
  if (plan.write) {
    const file = new File(Paths.document, plan.write.path);
    new Directory(Paths.document, 'photos').create({ intermediates: true, idempotent: true });
    if (!file.exists) file.create();
    file.write(plan.write.photo.base64, { encoding: 'base64' });
  }
  try {
    await restoreBackupData(db, backup, plan.write?.path ?? null);
  } catch (e) {
    removePhoto(plan.deleteOnFailure);
    throw e;
  }
  removePhoto(plan.deleteAfterCommit);
  const keep = new Set(backup.data.exports.map((r) => r.file_path as string | null));
  removeExportFiles(oldExports.map((e) => e.filePath).filter((p): p is string => p !== null && !keep.has(p)));
  await initUiLanguage(db); // the settings table was replaced: language override (dev) and theme come from the backup
  applyThemePreference(await getThemePreference(db));
}

// ---- Plain text of all resumes -------------------------------------------------------------------------------------------

/** Every resume (not archived) as plain text in one file; returns null when there is no resume. */
export async function writeAllResumesText(db: SQLiteDatabase): Promise<{ file: File; name: string } | null> {
  const versions = await listVersions(db);
  if (versions.length === 0) return null;
  const parts: string[] = [];
  for (const v of versions) parts.push(`=== ${v.name} ===\n\n${plainText(await loadRenderModel(db, v.id))}`);
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `Resume-Builder-All-Resumes-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.txt`;
  const file = cacheFile('text', name);
  writeText(file, parts.join('\n\n'));
  return { file, name };
}

// ---- Delete all data -----------------------------------------------------------------------------------------------------

const DOCUMENT_DIRS = ['exports', 'photos', 'safety', 'pdf-gate'];
/**
 * The app's cache folders, incl. the libraries' own (v1.1, D91): expo-image-picker's copies (`ImagePicker`),
 * expo-image-manipulator's output (`ImageManipulator`) and expo-print's files (`Print`, a print that finished after
 * its time-out). Checked by listing the app's cache on both platforms after import, remove and delete all.
 */
export const CACHE_DIRS = ['preview', BACKUP_DIR, 'text', 'ImagePicker', 'ImageManipulator', 'Print'];

/**
 * "Delete all data" (two confirmations in the screen): every table, then the app's own files — exports, photos, the safety
 * copy, previews and shared copies. Development builds keep `dev-backup/` so a flow can restore the last backup afterwards.
 */
export async function deleteAllData(db: SQLiteDatabase): Promise<void> {
  await wipeAllData(db);
  for (const name of DOCUMENT_DIRS) {
    const dir = new Directory(Paths.document, name);
    if (dir.exists) dir.delete();
  }
  for (const name of CACHE_DIRS) {
    const dir = new Directory(Paths.cache, name);
    if (dir.exists) dir.delete();
  }
  // iOS: the document picker's copies of picked backup files (`tmp/<bundle id>-Inbox/`), should one have survived.
  try {
    const tmp = new Directory(tmpRootUri());
    if (tmp.exists) for (const item of tmp.list()) if (item instanceof Directory && item.name.endsWith('-Inbox')) item.delete();
  } catch {
    // Android has no such folder.
  }
  // expo-image keeps decoded images in memory and (by default) on disk; the profile photo uses cachePolicy "none",
  // this clears anything an earlier version kept.
  await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).catch(() => undefined);
  await initUiLanguage(db);
  applyThemePreference(await getThemePreference(db));
}

export const recordBackupTime = (db: SQLiteDatabase) => setSetting(db, 'last_backup_at', String(Date.now()));
