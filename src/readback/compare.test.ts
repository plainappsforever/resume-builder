/**
 * @jest-environment node
 */
// Read-back comparator (SPEC §5.7): unit cases, synthetic scrambles that must never pass, and REAL macOS-WebKit PDFs
// read with the app's pdf.js extraction (fixtures from scripts/readback-fixtures.mjs: passing referee outputs, the
// spec session's trap layouts, and a ligatures-on variant).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExpectedLine } from '@/render/expected-lines';

import {
  compareReadback,
  contactKind,
  contactTokens,
  itemsToLayout,
  itemsToLines,
  normalizeText,
  readInputFromPdfjs,
  readInputFromText,
  words,
  type ReadInput,
} from './compare';
import type { RawExtraction, RawItem } from './pdfjs-extract';

type Fixture = { name: string; expectedLines: ExpectedLine[]; pdfjs: RawExtraction; pdfkit: string[]; bytes: number };
const fixture = (name: string): Fixture => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));
const E = (...texts: string[]): ExpectedLine[] => texts.map((text) => ({ text, role: 'text' as const }));
const read = (...pages: string[][]): ReadInput => ({ reader: 'test', pages, fonts: [], images: 0, bytes: 100 });

// Deterministic PRNG (mulberry32) for the scramble tests.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('normalisation and words', () => {
  it('NFKC maps ligatures, folds case, typographic dashes and quotes, drops bullets and invisible characters', () => {
    expect(normalizeText('Eﬃcient ﬁle — “Quote” ‘x’ • A·B­​c d')).toBe('efficient file - "quote" \'x\' a bc d');
  });
  it('words are letter/digit runs, so a wrap inside a token cannot change them', () => {
    expect(words('linkedin.com/in/jordan-lee')).toEqual(['linkedin', 'com', 'in', 'jordan', 'lee']);
    expect(words('linkedin.com/in/jor\ndan-lee')).not.toEqual(words('linkedin.com/in/jordan-lee'));
    expect(words('alert("x")\n</script>')).toEqual(words('alert("x")</script>'));
    expect(words('• 03/2019 – heute')).toEqual(['03', '2019', 'heute']);
    expect(words('Müller-Özdemir, ẞ, Ünïcödé')).toEqual(['müller', 'özdemir', 'ß', 'ünïcödé']);
    expect(words('– · • |')).toEqual([]);
  });
});

describe('items → lines', () => {
  const item = (s: string, x: number, y: number, w: number, e = false, h = 10): RawItem => ({ s, x, y, w, h, e });
  it('keeps the reader order (never re-sorts), breaks on EOL and baseline change, inserts spaces at gaps', () => {
    const items = [item('Second', 50, 700, 30, true), item('First', 50, 720, 25), item('line', 77, 720, 20), item('', 0, 0, 0, true), item('x', 50, 680, 5)];
    expect(itemsToLines(items)).toEqual(['Second', 'First line', 'x']);
  });
  it('joins touching items without a space and reports gaps of ≥ 1 em', () => {
    const { lines, gaps } = itemsToLayout([item('Senior PM', 50, 700, 60), item('ager', 110, 700, 20), item('03/2019', 400, 700, 40)]);
    expect(lines).toEqual(['Senior PMager 03/2019']);
    expect(gaps).toEqual([{ page: 1, before: 'Senior PMager', after: '03/2019', em: 27 }]);
  });
});

describe('compareReadback (synthetic)', () => {
  const lines = E('Jordan Lee', 'Warehouse Team Lead', 'Experience', '• Led a team of 14 pickers', '• Reduced errors by 32%', 'Education');
  it('identical text passes with full counts', () => {
    const r = compareReadback(lines, read(lines.map((l) => l.text)), 5);
    expect(r).toMatchObject({ pass: true, words: { expected: 17, found: 17 }, lines: { total: 6, inOrder: 6, moved: [], split: [] }, readOrder: [0, 1, 2, 3, 4, 5], checkedAt: 5 });
  });
  it('lines wrapped differently and spread over pages still pass; page words are counted', () => {
    const r = compareReadback(lines, read(['Jordan Lee Warehouse', 'Team Lead Experience'], ['• Led a team of', '14 pickers • Reduced errors by 32% Education']), 0);
    expect(r.pass).toBe(true);
    expect(r.pageWords).toEqual([6, 11]);
    expect(r.pages).toBe(2);
  });
  it('a line read out of place is "moved" — only that line', () => {
    const t = lines.map((l) => l.text);
    const r = compareReadback(lines, read([t[0], t[1], t[3], t[4], t[5], t[2]]), 0);
    expect(r.pass).toBe(false);
    expect(r.lines.moved.map((l) => l.index)).toEqual([2]);
    expect(r.readOrder).toEqual([0, 1, 3, 4, 5, 2]);
  });
  it('a line whose words are not contiguous is "split"; missing words are listed', () => {
    const r = compareReadback(lines, read(['Jordan Lee Warehouse Team Lead Experience', '• Led a team of 14', 'Education pickers', '• Reduced errors by 32%']), 0);
    expect(r.lines.split.map((l) => l.text)).toEqual(['• Led a team of 14 pickers']);
    expect(r.lines.moved.map((l) => l.text)).toEqual(['Education']);
    const dropped = compareReadback(lines, read(['Jordan Lee Warehouse Team Lead Experience • Led a team of 14 • Reduced errors by 32% Education']), 0);
    expect(dropped).toMatchObject({ pass: false, missing: ['pickers'], words: { expected: 17, found: 16 } });
  });
  it('letter-spaced text is a finding; the same single letters printed on purpose are not', () => {
    const r = compareReadback(E('Jordan Lee'), read(['J o r d a n Lee']), 0);
    expect(r.spacedLetters).toEqual(['j o r d a n']);
    expect(r.pass).toBe(false);
    expect(compareReadback(E('Grades a b c', 'Plan B'), read(['Grades a b c', 'Plan B']), 0).pass).toBe(true);
  });
  it('extra words (a page number) are info only', () => {
    const r = compareReadback(lines, read([...lines.map((l) => l.text), '1']), 0);
    expect(r).toMatchObject({ pass: true, extras: ['1'] });
  });
  it('an empty document never passes; a reader with no text fails with everything missing', () => {
    expect(compareReadback([], read([]), 0).pass).toBe(false);
    expect(compareReadback(lines, read([]), 0)).toMatchObject({ pass: false, words: { found: 0 } });
  });
  it('repeated identical lines are matched in order', () => {
    const rep = E('Python', 'SQL', 'Python');
    expect(compareReadback(rep, read(['Python SQL Python']), 0).pass).toBe(true);
    expect(compareReadback(rep, read(['Python Python SQL']), 0).pass).toBe(false);
  });
});

const PASS = ['pass-modern-sample-en-a4', 'pass-lebenslauf-stress-de-a4', 'pass-executive-stress-en-letter', 'pass-cover-classic-de'];

describe('scrambled read-backs never pass (P3.5 probe: "a scrambled PDF must never pass")', () => {
  it.each(PASS)('%s: 300 random line/word scrambles of the real read text all fail', (name) => {
    const f = fixture(name);
    const original = readInputFromPdfjs(f.pdfjs, f.bytes);
    const lines = original.pages.flat();
    const sig = (ls: string[]) => words(ls.join(' ')).join(' ');
    const random = rng(name.length * 7919);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const copy = [...lines];
      const mode = i % 3;
      if (mode === 0) {
        // swap two random lines
        const a = Math.floor(random() * copy.length);
        const b = Math.floor(random() * copy.length);
        [copy[a], copy[b]] = [copy[b], copy[a]];
      } else if (mode === 1) {
        // move a random block of lines elsewhere
        const a = Math.floor(random() * copy.length);
        const block = copy.splice(a, 1 + Math.floor(random() * 4));
        copy.splice(Math.floor(random() * (copy.length + 1)), 0, ...block);
      } else {
        // swap two words inside the whole text
        const ws = copy.join(' ').split(' ');
        const a = Math.floor(random() * ws.length);
        const b = Math.floor(random() * ws.length);
        [ws[a], ws[b]] = [ws[b], ws[a]];
        copy.splice(0, copy.length, ws.join(' '));
      }
      if (sig(copy) === sig(lines)) continue; // the scramble changed nothing a reader could see
      checked++;
      expect(compareReadback(f.expectedLines, { ...original, pages: [copy] }, 0).pass).toBe(false);
    }
    expect(checked).toBeGreaterThan(250);
  });
});

describe('real macOS-WebKit PDFs (proxy, not iOS/Android)', () => {
  it.each(PASS)('%s passes with pdf.js and with Apple PDFKit', (name) => {
    const f = fixture(name);
    const r = compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 1);
    expect(r).toMatchObject({ pass: true, reader: 'pdf.js 6.3.289', fontsEmbedded: true, missing: [], wideGaps: [] });
    expect(r.words.found).toBe(r.words.expected);
    expect(r.text.join('\n').length).toBeGreaterThan(200);
    expect(compareReadback(f.expectedLines, readInputFromText('Apple PDFKit', f.pdfkit, f.bytes), 1).pass).toBe(true);
  });

  it('trap: right-aligned dates in flex rows — pdf.js order looks right, but the wide gaps fail it; PDFKit splits the lines', () => {
    const f = fixture('proxy-a_single');
    const r = compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0);
    expect(r.pass).toBe(false);
    expect(r.wideGaps.map((g) => g.after)).toEqual(['03/2019 – Present', '01/2015 – 02/2019', '2014']);
    const kit = compareReadback(f.expectedLines, readInputFromText('Apple PDFKit', f.pdfkit, f.bytes), 0);
    expect(kit.lines.split.map((l) => l.text)).toEqual([
      'Senior Project Manager, Acme Logistics GmbH 03/2019 – Present',
      'Project Coordinator, Beta Freight Inc. 01/2015 – 02/2019',
      'B.Sc. Business Administration, TU München 2014',
    ]);
  });

  it('trap: letter-spaced heading and a two-column grid', () => {
    const f = fixture('proxy-b_traps');
    const r = compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0);
    expect(r.pass).toBe(false);
    expect(r.spacedLetters).toEqual(['e x p e r i e n c e h e a d i n g']);
    expect(r.missing).toEqual(['heading', 'experience']);
    const kit = compareReadback(f.expectedLines, readInputFromText('Apple PDFKit', f.pdfkit, f.bytes), 0);
    expect(kit.lines.moved.map((l) => l.text)).toEqual(['Experience', 'Data Analyst, Gamma AG, 2020 – 2024', 'Built dashboards used by 300 staff.', 'Automated weekly KPI report.']);
  });

  it('trap: float, table, absolute and flex dates are reported as split/moved with wide gaps', () => {
    const f = fixture('proxy-c_layouts');
    const r = compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0);
    expect(r.pass).toBe(false);
    expect(r.words.found).toBe(r.words.expected);
    expect(r.lines.split.map((l) => l.text)).toEqual(['L3 FLOAT: Assistant, Delta AG 06/2012 – 12/2014']);
    expect(r.lines.moved.map((l) => l.text)).toEqual(['L5 ABS: Trainee, Zeta Ltd 2010 – 2011']);
    expect(r.wideGaps.map((g) => g.before.slice(0, 8))).toEqual(['L4 TABLE', 'L6 FLEX:', 'L5 ABS: ']);
  });

  it('ligatures on: the PDF text says "E!iziente", "o!ene", "Elektrofachkra!" — words missing, lines split', () => {
    const f = fixture('ligatures-on');
    const r = compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0);
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual(['effiziente', 'offene', 'elektrofachkraft', 'software', 'office']);
    expect(r.text.join('\n')).toContain('E!iziente');
  });
});

describe('contact items come back in one piece (D89, REVIEW_V1 #1)', () => {
  it('classifies e-mail, phone and link; a place is not a contact item', () => {
    expect(contactTokens([{ text: 'Milwaukee, WI · alex.morgan@example.com · +1 555 0142 · linkedin.com/in/alex-morgan-example', role: 'contact' }])).toEqual([
      { text: 'alex.morgan@example.com', kind: 'email' },
      { text: '+1 555 0142', kind: 'phone' },
      { text: 'linkedin.com/in/alex-morgan-example', kind: 'url' },
    ]);
    expect(contactKind('Kassel')).toBeNull();
    expect(contactKind('10115 Berlin')).toBeNull();
    expect(contactKind('0561 123456')).toBe('phone');
    expect(contactKind('(030) 1234-5678')).toBe('phone');
    expect(contactKind('github.com/amorgan')).toBe('url');
    expect(contactKind('https://example.org')).toBe('url');
    // Only contact lines are checked (the personal line and body text are not).
    expect(contactTokens([{ text: 'mail@example.com', role: 'text' }])).toEqual([]);
  });

  // The reviewer's probe (test/blind/review-final/drv/contact.test.ts): in v1 every one of these passed.
  const f = fixture('pass-modern-sample-en-a4');
  const original = readInputFromPdfjs(f.pdfjs, f.bytes);
  const mutate = (from: string, to: string): ReadInput => {
    const pages = original.pages.map((p) => p.map((l) => l.replace(from, to)));
    expect(pages).not.toEqual(original.pages); // the mutation hit the text
    return { ...original, pages };
  };
  it('the real PDF passes with every contact item checked', () => {
    const r = compareReadback(f.expectedLines, original, 0);
    expect(r.pass).toBe(true);
    expect(r.contacts).toEqual({ checked: 3, broken: [] });
  });
  it.each([
    ['"@" lost', 'alex.morgan@example.com', 'alex.morgan example.com', 'email'],
    ['"@" and dots lost', 'alex.morgan@example.com', 'alex morgan example com', 'email'],
    ['e-mail split by spaces', 'alex.morgan@example.com', 'alex.morgan @ example.com', 'email'],
    ['"+" lost in the phone number', '+1 555', '1 555', 'phone'],
    ['slashes lost in the link', 'linkedin.com/in/', 'linkedin com in ', 'url'],
    ['link broken at a line end', 'linkedin.com/in/alex-morgan-example', 'linkedin.com/in/alex-morgan-\nexample', 'url'],
  ])('%s fails the read-back', (_, from, to, kind) => {
    const input = mutate(from, to);
    const r = compareReadback(f.expectedLines, { ...input, pages: input.pages.map((p) => p.flatMap((l) => l.split('\n'))) }, 0);
    expect(r.pass).toBe(false);
    expect(r.contacts.broken.map((c) => c.kind)).toEqual([kind]);
  });
  it('Apple PDFKit text is checked the same way', () => {
    const pages = f.pdfkit.map((p) => p.replace('alex.morgan@example.com', 'alex morgan example com'));
    expect(compareReadback(f.expectedLines, readInputFromText('Apple PDFKit', pages, f.bytes), 0).pass).toBe(false);
    expect(compareReadback(f.expectedLines, readInputFromText('Apple PDFKit', f.pdfkit, f.bytes), 0).pass).toBe(true);
  });
  it('v1 macOS-WebKit PDF with the LinkedIn link split over two lines: every word in order, but NOT a pass', () => {
    const old = fixture('fail-split-url-executive-stress-en-letter');
    for (const r of [
      compareReadback(old.expectedLines, readInputFromPdfjs(old.pdfjs, old.bytes), 0),
      compareReadback(old.expectedLines, readInputFromText('Apple PDFKit', old.pdfkit, old.bytes), 0),
    ]) {
      expect(r.words.found).toBe(r.words.expected);
      expect(r.lines.inOrder).toBe(r.lines.total);
      expect(r.pass).toBe(false);
      expect(r.contacts.broken).toEqual([{ kind: 'url', text: 'linkedin.com/in/mo-oneill-kowalczyk-example' }]);
    }
  });
});

describe('name on one line (D90, REVIEW_V1 #8)', () => {
  const lines: ExpectedLine[] = [
    { text: 'Dr. Maximilian-Alexander Schäfer-Grünwald', role: 'name' },
    { text: 'Projektleiterin', role: 'headline' },
  ];
  it('is true when one read line holds the whole name, false when it wraps (info, not a failure)', () => {
    expect(compareReadback(lines, read(['Dr. Maximilian-Alexander Schäfer-Grünwald', 'Projektleiterin']), 0)).toMatchObject({ pass: true, nameOnOneLine: true });
    expect(compareReadback(lines, read(['Dr. Maximilian-Alexander Schäfer-', 'Grünwald', 'Projektleiterin']), 0)).toMatchObject({ pass: true, nameOnOneLine: false });
    expect(compareReadback(E('Text only'), read(['Text only']), 0).nameOnOneLine).toBeNull();
  });
});
