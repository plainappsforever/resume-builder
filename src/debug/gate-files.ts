// Dev-only (required under `__DEV__` by src/lib/export.ts, so release builds do not contain it): copies what a REAL export of
// the app produced into `<document>/pdf-gate/<run>/` in the layout `scripts/device-referee.mjs` reads (P6: the cover-letter
// export is checked by the same device referee as the 66 gate documents — pdf.js in Node + Apple PDFKit + the comparator).
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { defaultTuning } from '@/lib/pdf';
import type { ReadbackRun } from '@/readback/bridge';
import type { RenderResult } from '@/render';

export async function writeGateFiles(runName: string, name: string, doc: RenderResult, pdf: { uri: string; pages: number; bytes: number; ms: number }, run: ReadbackRun) {
  const dir = new Directory(Paths.document, 'pdf-gate', runName);
  dir.create({ intermediates: true, idempotent: true });
  await new File(pdf.uri).copy(new File(dir, `${name}.pdf`), { overwrite: true });
  new File(dir, `${name}.expected.json`).write(JSON.stringify({ name, font: doc.font, page: doc.page, print: doc.print, expectedLines: doc.expectedLines }));
  new File(dir, `${name}.device.json`).write(
    JSON.stringify({ raw: run.raw, result: run.result, printMs: pdf.ms, readbackMs: run.ms, pdfjsMs: run.pdfjsMs, reportedPages: pdf.pages, pages: pdf.pages })
  );
  const reportFile = new File(dir, 'report.json');
  const report = reportFile.exists ? (JSON.parse(reportFile.textSync()) as { names: string[]; rows: Record<string, unknown>[] }) : { names: [], rows: [] };
  const row = { name, attempts: 1, pages: pdf.pages, bytes: pdf.bytes, printMs: pdf.ms, readbackMs: run.ms, pdfjsMs: run.pdfjsMs, pass: !('unavailable' in run.result) && run.result.pass };
  const at = report.names.indexOf(name);
  if (at === -1) {
    report.names.push(name);
    report.rows.push(row);
  } else report.rows[at] = row;
  reportFile.write(
    JSON.stringify({ platform: Platform.OS === 'ios' ? 'ios' : 'android', version: Platform.Version, reader: 'pdf.js', loadMs: 0, tuning: defaultTuning(), run: runName, names: report.names, rows: report.rows, errors: [] }, null, 1)
  );
}
