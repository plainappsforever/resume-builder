/**
 * @jest-environment node
 */
// Read-backs of PDFs printed ON THE DEVICES in P5 (simulator iOS 26.5 / emulator Android 16, expo-print), pulled to the
// Mac by scripts/device-referee.mjs: pdf.js (the app's extraction) and Apple PDFKit page texts. The passing files must
// pass with both readers and never pass when scrambled; the two failures found in P5 must keep failing:
//   fail-android-webfont-type3: Chromium/Skia wrote the web font as Type 3 → PDFKit breaks words (D72)
//   fail-ios-hiragino-arrow: "→" fell back to Hiragino Sans, which pdf.js cannot map → a 1.6 em hole (D73)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExpectedLine } from '@/render/expected-lines';

import { compareReadback, readInputFromPdfjs, readInputFromText } from './compare';
import type { RawExtraction } from './pdfjs-extract';

type Fixture = { name: string; run: string; expectedLines: ExpectedLine[]; pdfjs: RawExtraction; pdfkit: string[]; bytes: number };
const DIR = join(__dirname, '__fixtures__', 'device');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const load = (f: string): Fixture => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const pdfjs = (f: Fixture) => compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0);
const pdfkit = (f: Fixture) => compareReadback(f.expectedLines, readInputFromText('Apple PDFKit', f.pdfkit, f.bytes), 0);

it('has device fixtures from both platforms', () => {
  expect(files.filter((f) => f.startsWith('pass-ios')).length).toBeGreaterThanOrEqual(3);
  expect(files.filter((f) => f.startsWith('pass-android')).length).toBeGreaterThanOrEqual(3);
});

describe.each(files.filter((f) => f.startsWith('pass-')))('%s', (file) => {
  const f = load(file);
  it('passes with pdf.js and Apple PDFKit', () => {
    expect(pdfjs(f)).toMatchObject({ pass: true, wideGaps: [], upJumps: [] });
    expect(pdfkit(f).pass).toBe(true);
  });
  it('never passes with two lines swapped (100 random swaps)', () => {
    const original = readInputFromPdfjs(f.pdfjs, f.bytes);
    const lines = original.pages.flat();
    let seed = file.length * 977;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 100; i++) {
      const copy = [...lines];
      const a = Math.floor(random() * copy.length);
      const b = Math.floor(random() * copy.length);
      if (copy[a] === copy[b]) continue;
      [copy[a], copy[b]] = [copy[b], copy[a]];
      expect(compareReadback(f.expectedLines, { ...original, pages: [copy] }, 0).pass).toBe(false);
    }
  });
});

it('Android web-font Type 3: pdf.js reads it, Apple PDFKit does not (D72)', () => {
  const f = load(files.find((x) => x.startsWith('fail-android-webfont-type3'))!);
  expect(pdfjs(f).pass).toBe(true);
  expect(pdfjs(f).fontsEmbedded).toBe(false); // Type 3
  const kit = pdfkit(f);
  expect(kit.pass).toBe(false);
  expect(kit.words.found).toBeLessThan(kit.words.expected);
});

it('iOS fallback glyph without text: the hole is reported as a wide gap (D73)', () => {
  const f = load(files.find((x) => x.startsWith('fail-ios-hiragino-arrow'))!);
  const r = pdfjs(f);
  expect(r.pass).toBe(false);
  expect(r.wideGaps).toEqual([expect.objectContaining({ before: expect.stringContaining('photos of shelves'), after: expect.stringContaining('gaps flagged') })]);
});

it('v1 device PDFs with the LinkedIn link split over two lines: all words in order, but not a pass (D89)', () => {
  const split = files.filter((x) => x.startsWith('fail-split-url-'));
  expect(split.map((x) => x.split('-')[3])).toEqual(expect.arrayContaining(['android', 'ios']));
  for (const file of split) {
    const f = load(file);
    for (const r of [pdfjs(f), pdfkit(f)]) {
      expect(r.words.found).toBe(r.words.expected);
      expect(r.lines.inOrder).toBe(r.lines.total);
      expect(r.pass).toBe(false);
      expect(r.contacts.broken.map((c) => c.kind)).toEqual(['url']);
    }
  }
});
