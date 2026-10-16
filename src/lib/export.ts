// Export glue (SPEC F6/F7, §5.9, §10; D50, D59): the document as it is at the tap → PDF (expo-print) → read-back
// (pdf.js in the WebView) → a history row with snapshot + result. Share, print, plain text, re-share and the removal of
// a deleted resume's files live here too. Every database write goes through src/db (write queue).
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { exportFilePath, isSafeExportPath, parseSnapshot, readbackJson, snapshotJson, type StoredReadback } from '@/data/history';
import { getCover } from '@/db/covers';
import { exampleExportPaths, removeExample } from '@/db/example';
import { addExport, getExport, setRemadeExport } from '@/db/exports';
import { loadRenderModel } from '@/db/load';
import { getProfile } from '@/db/profile';
import { getDocumentDefaults } from '@/db/settings';
import type { Db } from '@/db/types';
import { getVersion } from '@/db/versions';
import { exportBlocked } from '@/engine/checks';
import { documentFileName } from '@/engine/filenames';
import { plainText } from '@/engine/plaintext';
import type { RenderModel } from '@/engine/resolve';
import { readBackWithRetry, type HarnessClient } from '@/readback/bridge';
import { renderCoverHtml, renderHtml, type RenderResult } from '@/render';
import type { PhotoData } from '@/render/model';

import { coverDesign, coverInput, todayIso } from './cover-input';
import { printPdf, type PdfFile } from './pdf';

/** The version's photo as the renderer wants it (D27/D69: JPEG in `photos/`), or null. */
export async function photoData(model: RenderModel): Promise<PhotoData | null> {
  const rel = model.person.photoFile;
  if (!rel || !rel.startsWith('photos/') || rel.includes('..')) return null;
  const file = new File(Paths.document, rel);
  if (!file.exists) return null;
  return { mime: rel.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', base64: await file.base64() };
}

export async function renderModel(model: RenderModel): Promise<RenderResult> {
  return renderHtml(model, { photo: await photoData(model) });
}

export class ExportBlockedError extends Error {}

export type PdfExport = {
  exportId: number;
  uri: string;
  fileName: string;
  pdf: Omit<PdfFile, 'data'>;
  readback: StoredReadback;
  readbackMs: number;
  /** Total time from the tap to the stored row. */
  totalMs: number;
};

/** Resume → PDF in `<document>/exports/v<id>/<time>/<name>.pdf`, read back, recorded (resets the badges, D31). */
export async function exportResumePdf(db: Db, versionId: number, reader: () => HarnessClient | null): Promise<PdfExport> {
  const started = Date.now();
  const [model, version] = await Promise.all([loadRenderModel(db, versionId), getVersion(db, versionId)]);
  if (exportBlocked(model)) throw new ExportBlockedError('name missing');
  const doc = await renderModel(model);
  const fileName = documentFileName({ fullName: model.person.fullName, company: version?.targetCompany, language: model.language, kind: 'resume', ext: 'pdf' });
  const createdAt = Date.now();
  const rel = exportFilePath({ versionId }, createdAt, fileName);
  const { data, ...pdf } = await printPdf(doc, new File(Paths.document, rel));
  const base64 = await new File(pdf.uri).base64();
  const run = await readBackWithRetry(reader, base64, data.length, doc.expectedLines);
  const exportId = await addExport(
    db,
    {
      versionId,
      coverLetterId: null,
      kind: 'resume_pdf',
      filePath: rel,
      fileName,
      pageCount: run.raw?.numPages ?? pdf.pages,
      bytes: pdf.bytes,
      snapshotJson: snapshotJson({ v: 1, kind: 'resume_pdf', model }),
      readbackJson: readbackJson(run.result),
    },
    createdAt
  );
  return { exportId, uri: pdf.uri, fileName, pdf, readback: run.result, readbackMs: run.ms, totalMs: Date.now() - started };
}

/** The cover letter as it prints now: the letter, the profile, the resume whose design it uses, and the rendered document. */
export async function coverDocument(db: Db, coverId: number) {
  const cover = await getCover(db, coverId);
  if (!cover) throw new Error('cover letter not found');
  const [profile, version, defaults] = await Promise.all([getProfile(db), cover.versionId === null ? null : getVersion(db, cover.versionId), getDocumentDefaults(db)]);
  const input = coverInput(cover, profile);
  const design = coverDesign(version, cover.language, defaults.paper);
  const today = todayIso();
  return { cover, profile, version, input, design, today, doc: renderCoverHtml(input, design, today) };
}

/**
 * Cover letter → PDF through the SAME path as a resume (F10, A15): renderCoverHtml (the linked resume's template and style) →
 * expo-print → pdf.js read-back in the hidden harness → a history row with snapshot + result (re-shareable, D50).
 */
export async function exportCoverPdf(db: Db, coverId: number, reader: () => HarnessClient | null): Promise<PdfExport> {
  const started = Date.now();
  const { cover, profile, input, design, today, doc } = await coverDocument(db, coverId);
  if (profile.fullName.trim() === '') throw new ExportBlockedError('name missing');
  const fileName = documentFileName({ fullName: profile.fullName, company: cover.recipientCompany, language: cover.language, kind: 'cover', ext: 'pdf' });
  const createdAt = Date.now();
  const rel = exportFilePath({ coverLetterId: coverId }, createdAt, fileName);
  const { data, ...pdf } = await printPdf(doc, new File(Paths.document, rel));
  const base64 = await new File(pdf.uri).base64();
  const run = await readBackWithRetry(reader, base64, data.length, doc.expectedLines);
  const exportId = await addExport(
    db,
    {
      versionId: null,
      coverLetterId: coverId,
      kind: 'cover_pdf',
      filePath: rel,
      fileName,
      pageCount: run.raw?.numPages ?? pdf.pages,
      bytes: pdf.bytes,
      snapshotJson: snapshotJson({ v: 1, kind: 'cover_pdf', cover: input, design, today }),
      readbackJson: readbackJson(run.result),
    },
    createdAt
  );
  // Dev builds: the same files the PDF gate writes, so scripts/device-referee.mjs can check this real export (P6).
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be a require: Metro drops it from release bundles
    await (require('@/debug/gate-files') as typeof import('@/debug/gate-files')).writeGateFiles('cover-maestro', `cover-${coverId}-${cover.language}-${design.template}`, doc, pdf, run);
  }
  return { exportId, uri: pdf.uri, fileName, pdf, readback: run.result, readbackMs: run.ms, totalMs: Date.now() - started };
}

/** Plain text (SPEC §5.9) recorded as an export; `file` = also written as .txt for the share sheet. */
export async function exportPlainText(db: Db, versionId: number, file: boolean): Promise<{ text: string; uri: string | null; fileName: string }> {
  const [model, version] = await Promise.all([loadRenderModel(db, versionId), getVersion(db, versionId)]);
  if (exportBlocked(model)) throw new ExportBlockedError('name missing');
  const text = plainText(model);
  const fileName = documentFileName({ fullName: model.person.fullName, company: version?.targetCompany, language: model.language, kind: 'resume', ext: 'txt' });
  const createdAt = Date.now();
  let rel: string | null = null;
  let uri: string | null = null;
  if (file) {
    rel = exportFilePath({ versionId }, createdAt, fileName);
    const f = new File(Paths.document, rel);
    ensureParent(f);
    f.write(text);
    uri = f.uri;
  }
  await addExport(
    db,
    {
      versionId,
      coverLetterId: null,
      kind: 'plain_text',
      filePath: rel,
      fileName,
      pageCount: null,
      bytes: text.length,
      snapshotJson: snapshotJson({ v: 1, kind: 'plain_text', model }),
      readbackJson: null,
    },
    createdAt
  );
  return { text, uri, fileName };
}

export async function copyPlainText(db: Db, versionId: number): Promise<string> {
  const { text } = await exportPlainText(db, versionId, false);
  await Clipboard.setStringAsync(text);
  return text;
}

function ensureParent(file: File) {
  const dir = file.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

/** Opens the system share sheet. Cancelling keeps the file in the history (SPEC §10). */
export async function shareFile(uri: string, kind: 'pdf' | 'txt', title: string): Promise<void> {
  await Sharing.shareAsync(uri, kind === 'pdf' ? { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title } : { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: title });
}

/** The system print dialog for a PDF file; closing it is a cancel, not an error (invoice-maker D69). */
export async function printFile(uri: string): Promise<'printed' | 'cancelled'> {
  try {
    await Print.printAsync({ uri });
    return 'printed';
  } catch (e) {
    if (e instanceof Error && /did not complete|cancel/i.test(e.message)) return 'cancelled';
    throw e;
  }
}

/**
 * The file of a history row for re-sharing: the stored file itself (identical bytes, A9), or — when it is gone (a
 * restored backup has rows but no files, D50) — the snapshot rendered again into the same place with THIS phone's
 * engine and fonts (it may differ from the file that was sent). v1.1 (D96): a re-made PDF is read back like a new export
 * and its own result (with `remadeAt`, size and pages) replaces the row's old one, so the row never claims a check the
 * new file did not get.
 */
export async function historyFile(
  db: Db,
  exportId: number,
  reader: () => HarnessClient | null = () => null
): Promise<{ uri: string; kind: 'pdf' | 'txt'; rerendered: boolean; readback?: StoredReadback } | null> {
  const row = await getExport(db, exportId);
  if (!row || !row.filePath || !isSafeExportPath(row.filePath, row)) return null;
  const file = new File(Paths.document, row.filePath);
  const kind = row.kind === 'plain_text' ? 'txt' : 'pdf';
  if (file.exists) return { uri: file.uri, kind, rerendered: false };
  const snapshot = parseSnapshot(row.snapshotJson);
  if (!snapshot) return null;
  if (snapshot.kind === 'plain_text') {
    ensureParent(file);
    file.write(plainText(snapshot.model));
    return { uri: file.uri, kind, rerendered: true };
  }
  const doc = snapshot.kind === 'cover_pdf' ? renderCoverHtml(snapshot.cover, snapshot.design, snapshot.today) : await renderModel(snapshot.model);
  const { data, ...pdf } = await printPdf(doc, file);
  const run = await readBackWithRetry(reader, await new File(pdf.uri).base64(), data.length, doc.expectedLines);
  const readback: StoredReadback = { ...run.result, remadeAt: Date.now() };
  await setRemadeExport(db, exportId, { readbackJson: readbackJson(readback), bytes: pdf.bytes, pageCount: run.raw?.numPages ?? pdf.pages });
  return { uri: file.uri, kind, rerendered: true, readback };
}

/** True when `uri` (canonical) lies inside `<document>/exports/` — the only place the app ever deletes exports (D59). */
export function insideExports(uri: string): boolean {
  const root = new Directory(Paths.document, 'exports').uri.replace(/\/?$/, '/');
  const decoded = decodeURI(uri);
  return decoded.startsWith(decodeURI(root)) && !decoded.slice(root.length).split('/').includes('..');
}

/** "Remove example data" (D64) together with the PDF files of the example resumes (v1.1, REVIEW_V1 #17: they were orphans). */
export async function removeExampleAndFiles(db: Db): Promise<boolean> {
  const paths = await exampleExportPaths(db);
  const removed = await removeExample(db);
  if (removed) removeExportFiles(paths);
  return removed;
}

/** Removes the files of deleted history rows / a deleted resume (paths from deleteVersion / deleteExport). */
export function removeExportFiles(paths: readonly string[]): number {
  let removed = 0;
  for (const rel of paths) {
    if (!isSafeExportPath(rel)) continue;
    try {
      const file = new File(Paths.document, rel);
      if (!insideExports(file.uri) || !file.exists) continue;
      file.delete();
      const folder = file.parentDirectory; // exports/v<id>/<time>/ — created for this one file
      if (folder.exists && folder.list().length === 0 && insideExports(folder.uri)) folder.delete();
      removed++;
    } catch {
      // A file that cannot be removed stays; the database no longer points at it.
    }
  }
  return removed;
}
