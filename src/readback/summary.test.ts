/**
 * @jest-environment node
 */
// What the user reads about a read-back (SPEC §5.7 step 7, L26): exact counts, what moved/is missing, hints, never a
// verdict about any application system.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bannedIn } from '@/engine/wording';
import { translate } from '@/i18n/index';

import { compareReadback, readInputFromPdfjs } from './compare';
import { readbackView } from './summary';

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8'));
const result = (name: string) => {
  const f = fixture(name);
  return compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0);
};

it('pass: "Read back with pdf.js: N of N words, all M lines in the right order, 1 page, KB."', () => {
  const r = result('pass-modern-sample-en-a4');
  const v = readbackView(r, 'en');
  expect(translate('en', v.headline.key, v.headline.params)).toBe(
    `Read back with pdf.js 6.3.289: ${r.words.expected} of ${r.words.expected} words, all ${r.lines.total} lines in the right order, 1 page, 20 KB.`
  );
  expect(v).toMatchObject({ pass: true, details: [], hints: [] });
  const de = readbackView(result('pass-executive-stress-en-letter'), 'de');
  expect(translate('de', de.headline.key, de.headline.params)).toMatch(/^Mit pdf\.js 6\.3\.289 zurückgelesen: \d+ von \d+ Wörtern, alle \d+ Zeilen in der richtigen Reihenfolge, 3 Seiten, 46 KB\.$/);
});

it('fail: counts, every moved/split line, missing words, gaps, and a hint per cause', () => {
  const v = readbackView(result('proxy-c_layouts'), 'en');
  expect(v.pass).toBe(false);
  expect(translate('en', v.headline.key, v.headline.params)).toMatch(/^Read back with pdf\.js 6\.3\.289: 80 of 80 words, 8 of 10 lines in the right order, 1 page, 11 KB\.$/);
  expect(v.details.map((d) => translate('en', d.key, d.params))).toEqual([
    'Read out of place: “L5 ABS: Trainee, Zeta Ltd 2010 – 2011”',
    'Not read as one line: “L3 FLOAT: Assistant, Delta AG 06/2012 – 12/2014”',
    'Wide gap inside a line (other programs may read it as two columns): “L4 TABLE: Intern, Epsilon SE” … “2011 – 2012”',
    'Wide gap inside a line (other programs may read it as two columns): “L6 FLEX: Clerk, Eta LLC” … “2009 – 2010”',
    'Wide gap inside a line (other programs may read it as two columns): “L5 ABS: Trainee, Zeta Ltd” … “2010 – 2011”',
    'Read back up the page (other programs may read this part as a separate column): “L1 INLINE: Senior Project Manager | Acme” came after “06/2012 – 12/2014”, which is lower on the page',
    'Read back up the page (other programs may read this part as a separate column): “L5 ABS: Trainee, Zeta Ltd” came after “END”, which is lower on the page',
  ]);
  expect(v.hints.map((h) => h.key)).toEqual(['readback.hint.layout', 'readback.hint.gaps', 'readback.hint.upJump']);
  // A result stored before D53 (no upJumps field) still renders.
  const old = { ...result('proxy-c_layouts') } as Partial<ReturnType<typeof result>>;
  delete old.upJumps;
  expect(readbackView(old as ReturnType<typeof result>, 'en').hints.map((h) => h.key)).not.toContain('readback.hint.upJump');
  const lig = readbackView(result('ligatures-on'), 'de');
  expect(lig.details.map((d) => translate('de', d.key, d.params))).toContain('Im Text des PDFs nicht gefunden: effiziente, offene, elektrofachkraft, software, office');
  expect(lig.hints.map((h) => h.key)).toContain('readback.hint.missing');
});

it('unavailable is never a pass; no banned phrase in any rendered sentence', () => {
  const v = readbackView({ unavailable: true }, 'en');
  expect(v).toMatchObject({ pass: false, headline: { key: 'readback.unavailable' } });
  for (const lang of ['en', 'de'] as const)
    for (const name of ['pass-modern-sample-en-a4', 'proxy-c_layouts', 'proxy-b_traps', 'ligatures-on']) {
      const view = readbackView(result(name), lang);
      for (const msg of [view.headline, view.note, ...view.details, ...view.hints]) expect(bannedIn(translate(lang, msg.key, msg.params))).toEqual([]);
    }
});

it('a contact item not read in one piece is named, with its hint; a name over two lines is info on a pass (D89, D90)', () => {
  const f = fixture('fail-split-url-executive-stress-en-letter');
  const v = readbackView(compareReadback(f.expectedLines, readInputFromPdfjs(f.pdfjs, f.bytes), 0), 'en');
  expect(v.pass).toBe(false);
  expect(v.details.map((d) => translate('en', d.key, d.params))).toContain('Your link was not read as one piece: “linkedin.com/in/mo-oneill-kowalczyk-example”');
  expect(v.hints.map((h) => h.key)).toEqual(['readback.hint.contacts']);
  const ok = result('pass-modern-sample-en-a4');
  expect(readbackView({ ...ok, nameOnOneLine: false }, 'de').details.map((d) => d.key)).toEqual(['readback.nameSplit']);
  // Results stored before v1.1 have neither field.
  const old = { ...ok } as Partial<typeof ok>;
  delete old.contacts;
  delete old.nameOnOneLine;
  expect(readbackView(old as typeof ok, 'en').pass).toBe(true);
});

it('a pass with a Type 3 font shows the warning first, and the history says so (D93)', () => {
  const ok = result('pass-modern-sample-en-a4');
  const v = readbackView({ ...ok, fontsEmbedded: false }, 'en');
  expect(v.pass).toBe(true);
  expect(v.details[0].key).toBe('readback.type3');
  expect(translate('de', v.details[0].key, v.details[0].params)).toContain('Type 3');
  expect(readbackView(ok, 'en').details).toEqual([]);
});
