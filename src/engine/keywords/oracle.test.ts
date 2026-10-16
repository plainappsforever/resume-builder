/**
 * @jest-environment node
 */
// The keyword engine against the Python oracle (scripts/keywords-checks-oracle.py, written from SPEC §5.3–5.4 and
// D37–D43 before this engine existed; same author, so not independent in the L27 sense — P3.5 repeats it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import vectors from '../__fixtures__/oracle/keywords.json';
import { extractKeywords } from './extract';
import { countOccurrences } from './match';
import { normalizeTerm, textSegments } from './tokenize';

const ADS = join(__dirname, '..', '__fixtures__', 'job-ads');

type AdVector = (typeof vectors.extraction)[number] & { file?: string; text?: string; company?: string };

describe('oracle: tokenizer', () => {
  it(`all ${vectors.tokenizer.length} vectors`, () => {
    const mismatches = vectors.tokenizer.filter(
      (v) => JSON.stringify(textSegments(v.text).map((seg) => seg.map((t) => t.low))) !== JSON.stringify(v.segments)
    );
    expect(mismatches.map((v) => v.text)).toEqual([]);
  });
});

describe('oracle: extraction (all keywords, in order, with tf/score/flags)', () => {
  const fixtures = (vectors.extraction as AdVector[]).filter((v) => v.file);
  const generated = (vectors.extraction as AdVector[]).filter((v) => !v.file);
  it(`${generated.length} generated ads`, () => {
    for (const v of generated) {
      const got = extractKeywords(v.text as string, { company: v.company });
      expect([v.name, got.truncated]).toEqual([v.name, v.truncated]);
      expect([v.name, got.keywords.map((k) => ({ term: k.term, tf: k.tf, score: k.score, inRequirements: k.inRequirements, inDictionary: k.inDictionary }))]).toEqual([v.name, v.keywords]);
    }
  });
  it.each(fixtures.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const text = v.file ? readFileSync(join(ADS, v.file), 'utf8') : (v.text as string);
    const got = extractKeywords(text);
    expect(got.truncated).toBe(v.truncated);
    expect(
      got.keywords.map((k) => ({ term: k.term, tf: k.tf, score: k.score, inRequirements: k.inRequirements, inDictionary: k.inDictionary }))
    ).toEqual(v.keywords);
  });
});

describe('oracle: matching', () => {
  it('every vector: status, count, exact count, pieces', () => {
    const mismatches: string[] = [];
    for (const v of vectors.matching) {
      const occ = countOccurrences(normalizeTerm(v.term), v.pieces);
      const status = occ.exactCount > 0 ? 'found' : occ.count > 0 ? 'variant' : 'missing';
      const got = { status, count: occ.count, exactCount: occ.exactCount, pieces: occ.pieces };
      const want = { status: v.status, count: v.count, exactCount: v.exactCount, pieces: v.hits };
      if (JSON.stringify(got) !== JSON.stringify(want)) mismatches.push(`${JSON.stringify(v.term)} ${JSON.stringify(v.pieces)}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    }
    expect(mismatches).toEqual([]);
    expect(vectors.matching.length).toBeGreaterThan(500);
  });
});
