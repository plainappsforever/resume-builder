/**
 * @jest-environment node
 */
// P3.5 review traps (REVIEW_ENGINE.md findings 1–2, D53): 12 hand-made PDFs whose content-stream order is controlled
// (scripts/oracle/review/mkpdf.py). The comparator on pdf.js must never pass a PDF that Apple PDFKit (a layout-
// analysing reader) fails. Before D53 two did: a right-aligned date behind ONE whitespace item spanning the gap, and a
// two-column block drawn column by column.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExpectedLine } from '@/render/expected-lines';

import { compareReadback, itemsToLayout, readInputFromPdfjs, readInputFromText } from './compare';
import type { RawExtraction, RawItem } from './pdfjs-extract';

const DIR = join(__dirname, '__fixtures__', 'traps');
const ROOT = join(__dirname, '..', '..');
type Traps = { expected: string[]; cases: Record<string, { pdfjs: RawExtraction; pdfkit: string[] }> };
const traps = JSON.parse(readFileSync(join(DIR, 'traps.json'), 'utf8')) as Traps;
const expected: ExpectedLine[] = traps.expected.map((text) => ({ text, role: 'text' }));
const names = Object.keys(traps.cases);

// Controls: the correct single-column page, a superscript word and a tiny extra copy of keywords (extras are info).
const MUST_PASS = ['single', 'superscript', 'tiny_hidden_dupe'];

describe('trap PDFs', () => {
  it('there are 12, 9 traps and 3 controls', () => {
    expect(names).toHaveLength(12);
  });

  it.each(names)('%s: pdf.js verdict (fail unless a control) and never a pass where PDFKit fails', (name) => {
    const c = traps.cases[name];
    const js = compareReadback(expected, readInputFromPdfjs(c.pdfjs, 1000), 0);
    const kit = compareReadback(expected, readInputFromText('Apple PDFKit', c.pdfkit, 1000), 0);
    expect(js.pass).toBe(MUST_PASS.includes(name));
    if (!kit.pass) expect(js.pass).toBe(false);
  });

  it('right_dates_inline_far: the gap is measured from the last visible item, not from the spanning space item', () => {
    const r = compareReadback(expected, readInputFromPdfjs(traps.cases.right_dates_inline_far.pdfjs, 1000), 0);
    expect(r.wideGaps).toEqual([{ page: 1, before: 'Data Analyst, Gamma AG,', after: '2020 - 2024', em: 26.4 }]);
    expect(r.upJumps).toEqual([]);
    expect(r.pass).toBe(false);
  });

  it('two_col_streamwise: reading went back up the page (columns) and fails, though every line is in order', () => {
    const r = compareReadback(expected, readInputFromPdfjs(traps.cases.two_col_streamwise.pdfjs, 1000), 0);
    expect(r.lines.moved).toEqual([]);
    expect(r.lines.split).toEqual([]);
    expect(r.upJumps).toEqual([{ page: 1, before: 'Tableau', after: 'LANGUAGES', em: 4.4 }]);
    expect(r.pass).toBe(false);
  });

  it('the committed PDFs still extract to the stored items with the app extraction (pdf.js in Node)', () => {
    for (const name of ['right_dates_inline_far', 'two_col_streamwise', 'single']) {
      const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'pdfjs-extract.mjs'), join(DIR, `${name}.pdf`)], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(traps.cases[name].pdfjs);
    }
  });
});

describe('itemsToLayout: whitespace items and up-jumps (D53)', () => {
  const item = (s: string, x: number, y: number, w: number, h = 10, e = false): RawItem => ({ s, x, y, w, h, e });
  it('a whitespace item spanning a gap neither hides the gap nor becomes the position of the line', () => {
    const { lines, gaps } = itemsToLayout([item('Title', 50, 700, 30), item(' ', 80, 700, 300, 0), item('2024', 380, 700, 20)]);
    expect(lines).toEqual(['Title 2024']);
    expect(gaps.map((g) => g.em)).toEqual([30]);
  });
  it('normal word spaces as separate items stay below the wide-gap limit', () => {
    const { lines, gaps } = itemsToLayout([item('Led', 50, 700, 15), item(' ', 65, 700, 2.5, 0), item('a team', 67.5, 700, 30)]);
    expect(lines).toEqual(['Led a team']);
    expect(gaps).toEqual([]);
  });
  it('a whitespace item on another baseline does not break the line', () => {
    expect(itemsToLayout([item('A', 50, 700, 5), item(' ', 55, 650, 3, 0), item('B', 58, 700, 5)]).lines).toEqual(['A B']);
  });
  it('an item more than half a line above the previous text is an up-jump; a superscript is not', () => {
    expect(itemsToLayout([item('Below', 50, 600, 30, 10, true), item('Above', 300, 620, 30)]).upJumps).toEqual([
      { page: 1, before: 'Below', after: 'Above', em: 2 },
    ]);
    expect(itemsToLayout([item('300', 50, 600, 15, 11), item('staff', 66, 604, 20, 7)]).upJumps).toEqual([]);
    expect(itemsToLayout([item('Top', 50, 700, 20, 10, true), item('Next', 50, 686, 20)]).upJumps).toEqual([]);
  });
});

describe('D63: a very long word wrapped at a line end (review finding 13)', () => {
  type Long = { expectedLines: ExpectedLine[]; pdfjs: RawExtraction; pdfkit: string[]; bytes: number };
  const long = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'long-entry-modern-a4.json'), 'utf8')) as Long;
  it('a 98-character URL path split by overflow-wrap is found and reported as info (pdf.js and PDFKit), 4 pages', () => {
    for (const r of [
      compareReadback(long.expectedLines, readInputFromPdfjs(long.pdfjs, long.bytes), 0),
      compareReadback(long.expectedLines, readInputFromText('Apple PDFKit', long.pdfkit, long.bytes), 0),
    ]) {
      expect(r).toMatchObject({ pass: true, missing: [], upJumps: [], wideGaps: [] });
      expect(r.wrappedWords.map((w) => w.length)).toEqual([98]);
    }
    expect(long.pdfjs.numPages).toBe(4); // an entry taller than a page: no up-jump across its page breaks
  });
  it('a short word split at a line end still fails', () => {
    const E1: ExpectedLine[] = [{ text: 'Senior Project Manager', role: 'text' }];
    const r = compareReadback(E1, { reader: 't', pages: [['Senior Project Man', 'ager']], fonts: [], images: 0, bytes: 1 }, 0);
    expect(r.pass).toBe(false);
    expect(r.wrappedWords).toEqual([]);
  });
});
