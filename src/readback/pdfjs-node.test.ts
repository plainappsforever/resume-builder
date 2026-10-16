/**
 * @jest-environment node
 */
// pdf.js 6.3.289 (pdfjs-dist, Node) reads REAL PDFs through the app's own extraction source — the same code the
// WebView harness runs — and the comparator judges them (SPEC §5.7, D15). The PDFs are macOS-WebKit proxy outputs.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { ExpectedLine } from '@/render/expected-lines';

import { compareReadback, readInputFromPdfjs } from './compare';
import { PDFJS_EXTRACT_SOURCE, type RawExtraction } from './pdfjs-extract';

const ROOT = join(__dirname, '..', '..');
const FIX = join(__dirname, '__fixtures__');

function extract(pdf: string): RawExtraction {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'pdfjs-extract.mjs'), pdf], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as RawExtraction;
}

it('the Node runner uses exactly the exported extraction source (no backticks or ${} inside)', () => {
  const ts = readFileSync(join(__dirname, 'pdfjs-extract.ts'), 'utf8');
  expect(/export const PDFJS_EXTRACT_SOURCE = `([^`]*)`;/.exec(ts)?.[1]).toBe(PDFJS_EXTRACT_SOURCE);
  expect(PDFJS_EXTRACT_SOURCE).not.toMatch(/\$\{|\beval\b|fetch|XMLHttpRequest/);
});

it('pdf.js in Node reads a Modern EN proxy PDF: every word, every line in order, fonts embedded, A4', () => {
  const pdf = join(FIX, 'modern-sample-en-a4.pdf');
  const raw = extract(pdf);
  expect(raw).toMatchObject({ reader: 'pdf.js 6.3.289', numPages: 1 });
  expect(raw.pages[0]).toMatchObject({ width: 595.28, height: 841.89, images: 0 });
  const fonts = raw.fonts.map((f) => f.name.replace(/^[A-Z]{6}\+/, ''));
  expect(new Set(fonts)).toEqual(new Set(['Inter-Bold', 'Inter-Regular']));
  expect(raw.fonts.every((f) => f.embedded && !f.type3)).toBe(true);
  const expected = JSON.parse(readFileSync(join(FIX, 'modern-sample-en-a4.expected.json'), 'utf8')) as ExpectedLine[];
  const result = compareReadback(expected, readInputFromPdfjs(raw, statSync(pdf).size), 1);
  expect(result).toMatchObject({ pass: true, pages: 1, fontsEmbedded: true, bytes: statSync(pdf).size });
  expect(result.words.found).toBe(result.words.expected);
  expect(result.lines.inOrder).toBe(result.lines.total);
  expect(result.readOrder).toEqual(expected.map((_, i) => i));
});

it('pdf.js in Node reads the research trap layout PDF and the comparator fails it', () => {
  const pdf = join(FIX, 'proxy-c_layouts.pdf');
  const stored = JSON.parse(readFileSync(join(FIX, 'proxy-c_layouts.json'), 'utf8')) as { expectedLines: ExpectedLine[]; pdfjs: RawExtraction };
  const raw = extract(pdf);
  expect(raw).toEqual(stored.pdfjs); // deterministic extraction
  expect(compareReadback(stored.expectedLines, readInputFromPdfjs(raw, statSync(pdf).size), 0).pass).toBe(false);
});
