/**
 * @jest-environment node
 */
// Step 4 of scripts/pdf-referee.mjs (REFEREE=1): compares every proxy PDF's read-back (pdf.js in Node + Apple PDFKit)
// with the expected lines and writes artifacts/samples/referee.json. Skipped in normal Jest runs (needs the PDFs).
// scripts/device-referee.mjs runs the same comparison over PDFs printed on the phones (REFEREE_DIR).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FONT_NAME } from '@/render/fonts.generated';
import type { ExpectedLine } from '@/render/expected-lines';
import type { FontId } from '@/engine/style';

import { compareReadback, readInputFromPdfjs, readInputFromText, type ReadbackResult } from './compare';
import type { RawExtraction } from './pdfjs-extract';

// REFEREE_DIR: a pulled device run (scripts/device-referee.mjs, P5) instead of the macOS proxy samples.
const DIR = process.env.REFEREE_DIR ?? join(__dirname, '..', '..', 'artifacts', 'samples');
const enabled = Boolean(process.env.REFEREE) && existsSync(join(DIR, 'index.json'));

type Row = {
  name: string;
  pass: boolean;
  problems: string[];
  notes: string[];
  pages: number;
  bytes: number;
  size: string;
  fonts: string[];
  pdfjs: ReadbackResult;
  pdfkit: ReadbackResult;
  printMs: number;
  pdfjsMs: number;
};

const describeResult = (r: ReadbackResult) =>
  `${r.words.found}/${r.words.expected} words, ${r.lines.inOrder}/${r.lines.total} lines` +
  (r.lines.moved.length ? `, moved: ${r.lines.moved.map((l) => JSON.stringify(l.text)).join('; ')}` : '') +
  (r.lines.split.length ? `, split: ${r.lines.split.map((l) => JSON.stringify(l.text)).join('; ')}` : '') +
  (r.missing.length ? `, missing: ${r.missing.slice(0, 12).join(' ')}` : '') +
  (r.spacedLetters.length ? `, spaced: ${r.spacedLetters.join('; ')}` : '') +
  (r.contacts.broken.length ? `, contact not in one piece: ${r.contacts.broken.map((c) => JSON.stringify(c.text)).join('; ')}` : '');

(enabled ? it : it.skip)('every proxy PDF reads back completely and in order with pdf.js and Apple PDFKit', () => {
  const filter = process.env.REFEREE_FILTER ?? '';
  const names = (JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as string[]).filter((n) => n.includes(filter));
  const rows: Row[] = [];
  for (const name of names) {
    const exp = JSON.parse(readFileSync(join(DIR, `${name}.expected.json`), 'utf8')) as {
      font: FontId;
      page: { widthPt: number; heightPt: number; paper: string };
      expectedLines: ExpectedLine[];
    };
    const read = JSON.parse(readFileSync(join(DIR, `${name}.read.json`), 'utf8')) as {
      pdfjs: RawExtraction;
      pdfkit: string[];
      facts: { bytes: number; printMs: number; pdfjsMs: number; baseFonts: string[]; fontFiles: number; type3: boolean };
    };
    const pdfjs = compareReadback(exp.expectedLines, readInputFromPdfjs(read.pdfjs, read.facts.bytes), 0);
    const pdfkit = compareReadback(exp.expectedLines, readInputFromText('Apple PDFKit', read.pdfkit, read.facts.bytes), 0);
    const problems: string[] = [];
    if (!pdfjs.pass) problems.push(`pdf.js: ${describeResult(pdfjs)}`);
    if (!pdfkit.pass) problems.push(`PDFKit: ${describeResult(pdfkit)}`);
    // D90: a name that does not fit on one line even at the smallest name size wraps at a space; the app shows it as
    // info, the referee counts it in the summary ("name on one line").
    const nameSplit = pdfjs.nameOnOneLine === false || pdfkit.nameOnOneLine === false;
    const first = read.pdfjs.pages[0];
    // MediaBox within 1 pt of the requested paper (A4 595.28×841.89 from CSS mm, Letter 612×792).
    if (!first || Math.abs(first.width - exp.page.widthPt) > 1 || Math.abs(first.height - exp.page.heightPt) > 1) {
      problems.push(`page size ${first?.width}×${first?.height}, expected ${exp.page.widthPt}×${exp.page.heightPt}`);
    }
    if (read.pdfjs.pages.some((p) => Math.abs(p.width - first.width) > 0.5 || Math.abs(p.height - first.height) > 0.5)) problems.push('mixed page sizes');
    if (read.pdfkit.length !== read.pdfjs.numPages) problems.push(`page count differs: pdf.js ${read.pdfjs.numPages}, PDFKit ${read.pdfkit.length}`);
    const family = FONT_NAME[exp.font].replace(/\s+/g, '');
    const notes: string[] = [];
    // Device runs with the phone's own families (Android, D72): the template family is not expected in the file.
    if (process.env.REFEREE_FONTS === 'system') notes.push(`system fonts: ${read.facts.baseFonts.join(', ') || '(Type 3 only)'}`);
    else if (!read.facts.baseFonts.some((f) => f.replace(/\s+/g, '').startsWith(family))) problems.push(`font ${family} not in the PDF (${read.facts.baseFonts.join(', ')})`);
    const wantImages = name.endsWith('-photo') ? 1 : 0;
    if (pdfjs.images !== wantImages) problems.push(`${pdfjs.images} images, expected ${wantImages}`);
    // Type 3 (glyph procedures + ToUnicode) is how Android's Chromium writes some fonts; on device runs both readers
    // judge the text directly, so it is a note there. The macOS proxy must still embed real font files (D26).
    const notEmbedded = read.pdfjs.fonts.filter((f) => !f.embedded);
    if (nameSplit) notes.push(`name over more than one line (pdf.js ${pdfjs.nameOnOneLine}, PDFKit ${pdfkit.nameOnOneLine})`);
    if (notEmbedded.length) problems.push(`fonts not embedded: ${JSON.stringify(notEmbedded)}`);
    else if (read.facts.type3) (process.env.REFEREE_DEVICE ? notes : problems).push(`Type 3 fonts: ${read.pdfjs.fonts.filter((f) => f.type3).map((f) => f.name).join(', ')}`);
    rows.push({
      name,
      pass: problems.length === 0,
      problems,
      notes,
      pages: read.pdfjs.numPages,
      bytes: read.facts.bytes,
      size: `${first?.width}×${first?.height}`,
      fonts: read.facts.baseFonts,
      pdfjs,
      pdfkit,
      printMs: read.facts.printMs,
      pdfjsMs: read.facts.pdfjsMs,
    });
  }
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const table = [
    `${pad('file', 34)} ${pad('ok', 4)} ${pad('pages', 5)} ${pad('KB', 5)} ${pad('page pt', 14)} ${pad('pdf.js words/lines', 20)} ${pad('PDFKit words/lines', 20)} fonts`,
    ...rows.map(
      (r) =>
        `${pad(r.name, 34)} ${pad(r.pass ? 'yes' : 'NO', 4)} ${pad(r.pages, 5)} ${pad(Math.round(r.bytes / 1024), 5)} ${pad(r.size, 14)} ` +
        `${pad(`${r.pdfjs.words.found}/${r.pdfjs.words.expected} ${r.pdfjs.lines.inOrder}/${r.pdfjs.lines.total}`, 20)} ` +
        `${pad(`${r.pdfkit.words.found}/${r.pdfkit.words.expected} ${r.pdfkit.lines.inOrder}/${r.pdfkit.lines.total}`, 20)} ${r.fonts.join(',')}`
    ),
    ...rows.filter((r) => !r.pass).flatMap((r) => [`--- ${r.name}`, ...r.problems.map((p) => `    ${p}`)]),
  ].join('\n');
  const bytes = rows.map((r) => r.bytes);
  const summary =
    `${rows.filter((r) => r.pass).length}/${rows.length} files pass with both readers; pages ${Math.min(...rows.map((r) => r.pages))}–` +
    `${Math.max(...rows.map((r) => r.pages))}; ${Math.round(Math.min(...bytes) / 1024)}–${Math.round(Math.max(...bytes) / 1024)} KB; ` +
    `print ${Math.round(rows.reduce((n, r) => n + r.printMs, 0) / rows.length)} ms/file, pdf.js ${Math.round(rows.reduce((n, r) => n + r.pdfjsMs, 0) / rows.length)} ms/file (this Mac); ` +
    `name on one line: ${rows.filter((r) => r.pdfjs.nameOnOneLine !== false && r.pdfkit.nameOnOneLine !== false).length}/${rows.length}` +
    ` (split: ${rows.filter((r) => r.pdfjs.nameOnOneLine === false || r.pdfkit.nameOnOneLine === false).map((r) => r.name).join(', ') || 'none'}); ` +
    `contacts checked: ${rows.reduce((n, r) => n + r.pdfjs.contacts.checked, 0)}, not in one piece: ${rows.reduce((n, r) => n + r.pdfjs.contacts.broken.length + r.pdfkit.contacts.broken.length, 0)}`;
  writeFileSync(join(DIR, 'referee.json'), JSON.stringify({ table, summary, rows }, null, 1));
  expect(rows.filter((r) => !r.pass).map((r) => `${r.name}: ${r.problems.join(' | ')}`)).toEqual([]);
});
