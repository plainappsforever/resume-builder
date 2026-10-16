/**
 * @jest-environment node
 */
// Checks C1–C15 against the Python oracle (scripts/keywords-checks-oracle.py, SPEC §5.5 + D40, written before
// checks.ts; same author — P3.5 repeats it independently). The oracle uses its own small word lists; the first test
// proves the engine's lists agree with them on exactly those words.
import vectors from './__fixtures__/oracle/checks.json';
import { runChecks, STANDARD_HEADINGS, type FixTarget, type Finding } from './checks';
import { ACTION_WORD_FORMS } from './content/action-verbs';
import type { RenderModel } from './resolve';

function targetKey(t: FixTarget): string {
  switch (t.kind) {
    case 'profile':
      return `profile:${t.field}`;
    case 'link':
      return `link:${t.index}`;
    case 'section':
      return `section:${t.sectionId}`;
    case 'entry':
      return t.field === null ? `entry:${t.entryId}` : `entry:${t.entryId}:${t.field}`;
    case 'bullet':
      return `bullet:${t.bulletId}`;
    default:
      return t.kind;
  }
}

function findingKey(id: string, f: Finding): string {
  const base = `${id}:${f.code}:${targetKey(f.target)}`;
  if (id === 'C6') return `${base}:${f.params.abbr}`;
  if (id === 'C13') return `${base}:${String(f.params.chars).split(' ').join('')}`;
  return base;
}

describe('oracle word lists agree with the engine lists', () => {
  it('verbs, non-verbs, standard and custom headings', () => {
    expect(vectors.verbs.filter((w) => !ACTION_WORD_FORMS.has(w))).toEqual([]);
    expect(vectors.nonVerbs.filter((w) => ACTION_WORD_FORMS.has(w))).toEqual([]);
    expect(vectors.standardHeadings.filter((h) => !STANDARD_HEADINGS.has(h))).toEqual([]);
    expect(vectors.customHeadings.filter((h) => STANDARD_HEADINGS.has(h.toLowerCase()))).toEqual([]);
  });
});

describe('oracle: checks', () => {
  it(`all ${vectors.cases.length} generated documents give exactly the oracle's findings`, () => {
    const mismatches: string[] = [];
    for (const c of vectors.cases) {
      const ctx = c.ctx as { today: { year: number; month: number }; export?: { bytes: number; pages: number }; readback?: { pass?: boolean; unavailable?: boolean } };
      const results = runChecks(c.model as unknown as RenderModel, {
        today: ctx.today,
        lastExport: ctx.export ?? null,
        readback: ctx.readback ? (ctx.readback.unavailable ? { unavailable: true } : { pass: Boolean(ctx.readback.pass) }) : null,
      });
      const got = results.flatMap((r) => r.findings.map((f) => findingKey(r.id, f))).sort();
      const want = [...c.findings].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        const missing = want.filter((x) => !got.includes(x));
        const extra = got.filter((x) => !want.includes(x));
        mismatches.push(`case ${c.model.versionId}: missing ${JSON.stringify(missing)} extra ${JSON.stringify(extra)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
