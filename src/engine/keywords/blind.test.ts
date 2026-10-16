/**
 * @jest-environment node
 */
// The independent reviewer's BLIND job-ad set (test/blind/review-final/ads, written before any run of the engine on
// them; REVIEW_V1 #7). A REPORTED number, not a tuning target: the dictionary and the rules are never changed to fit
// these four ads (v1.1 D94). The test prints the recall and guards against falling below the measured values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractKeywords, SHOWN_KEYWORDS } from './extract';
import { countOccurrences } from './match';

const DIR = join(__dirname, '..', '..', '..', 'test', 'blind', 'review-final', 'ads');
const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')) as Record<string, string[]>;

/** Same measure as the reviewer's driver (drv/blind.test.ts): exact term in the first 25, or a variant the app's own matcher accepts. */
export function blindRecall(extract: (ad: string) => { term: string }[]) {
  let exact = 0;
  let lenient = 0;
  let total = 0;
  const perAd: Record<string, { exact: number; lenient: number; total: number; top: string[] }> = {};
  for (const [name, must] of Object.entries(expected)) {
    const top = extract(readFileSync(join(DIR, name), 'utf8')).slice(0, SHOWN_KEYWORDS).map((k) => k.term);
    const e = must.filter((m) => top.includes(m)).length;
    const l = must.filter((m) =>
      top.some((t) => t === m || countOccurrences(m, [t]).count > 0 || (countOccurrences(t, [m]).count > 0 && t.split(' ').length === m.split(' ').length))
    ).length;
    perAd[name] = { exact: e, lenient: l, total: must.length, top };
    exact += e;
    lenient += l;
    total += must.length;
  }
  return { exact, lenient, total, perAd };
}

it('blind recall of the must-have terms in the first 25 (reported, not tuned)', () => {
  const r = blindRecall((ad) => extractKeywords(ad).keywords);
  console.log(
    `BLIND recall: exact ${r.exact}/${r.total} (${Math.round((100 * r.exact) / r.total)} %), with variants ${r.lenient}/${r.total} (${Math.round((100 * r.lenient) / r.total)} %)\n` +
      Object.entries(r.perAd)
        .map(([n, a]) => `  ${n}: ${a.exact}/${a.total} exact, ${a.lenient}/${a.total} with variants\n    top: ${a.top.join(', ')}`)
        .join('\n')
  );
  expect(r.total).toBe(86);
  // Measured: v1 37 exact / 40 with variants; v1.1 (D94) 41 / 45. A floor against regressions, not a target.
  expect(r.exact).toBeGreaterThanOrEqual(41);
  expect(r.lenient).toBeGreaterThanOrEqual(45);
  // D94: no legal form ("GmbH", "Inc" …) in any first 25.
  for (const a of Object.values(r.perAd)) expect(a.top.filter((t) => /\b(gmbh|inc|ltd|llc|ag|kg)\b/.test(t))).toEqual([]);
});
