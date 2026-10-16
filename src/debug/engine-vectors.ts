// The keyword engine's oracle vectors as one pure function, run by Jest in Node AND by the dev screen `debug/hermes` on the
// phone's Hermes (P3.5 / P4 device check: `normalize('NFKC')`, `\p{L}`, look-behind and `toLocaleUpperCase` run inside the
// engine; only Node had run them so far). Vectors with a file name (the 12 job-ad fixtures) need the file system and are
// covered by Jest only; the generated ads, the tokenizer and the matching vectors run everywhere.
import vectors from '../engine/__fixtures__/oracle/keywords.json';
import { extractKeywords } from '../engine/keywords/extract';
import { countOccurrences } from '../engine/keywords/match';
import { normalizeTerm, textSegments } from '../engine/keywords/tokenize';

export type VectorReport = { tokenizer: number; extraction: number; matching: number; mismatches: string[] };

type Extraction = { name: string; truncated: boolean; keywords: unknown[]; file?: string; text?: string };

export function runEngineVectors(): VectorReport {
  const mismatches: string[] = [];
  for (const v of vectors.tokenizer) {
    if (JSON.stringify(textSegments(v.text).map((seg) => seg.map((t) => t.low))) !== JSON.stringify(v.segments)) {
      mismatches.push(`tokenizer ${JSON.stringify(v.text)}`);
    }
  }
  const generated = (vectors.extraction as Extraction[]).filter((v) => !v.file && v.text !== undefined);
  for (const v of generated) {
    const got = extractKeywords(v.text as string, { company: (v as { company?: string }).company });
    const keywords = got.keywords.map((k) => ({ term: k.term, tf: k.tf, score: k.score, inRequirements: k.inRequirements, inDictionary: k.inDictionary }));
    if (got.truncated !== v.truncated || JSON.stringify(keywords) !== JSON.stringify(v.keywords)) mismatches.push(`extraction ${v.name}`);
  }
  for (const v of vectors.matching) {
    const occ = countOccurrences(normalizeTerm(v.term), v.pieces);
    const status = occ.exactCount > 0 ? 'found' : occ.count > 0 ? 'variant' : 'missing';
    const got = { status, count: occ.count, exactCount: occ.exactCount, pieces: occ.pieces };
    const want = { status: v.status, count: v.count, exactCount: v.exactCount, pieces: v.hits };
    if (JSON.stringify(got) !== JSON.stringify(want)) mismatches.push(`matching ${JSON.stringify(v.term)}`);
  }
  return { tokenizer: vectors.tokenizer.length, extraction: generated.length, matching: vectors.matching.length, mismatches };
}

/** Language features the engine relies on, as [name, ok, detail]; `required` ones decide the verdict. */
export function runLanguageProbes(): { name: string; ok: boolean; detail: string; required: boolean }[] {
  const out: { name: string; ok: boolean; detail: string; required: boolean }[] = [];
  const probe = (name: string, required: boolean, fn: () => [boolean, string]) => {
    try {
      const [ok, detail] = fn();
      out.push({ name, ok, detail, required });
    } catch (e) {
      out.push({ name, ok: false, detail: `threw ${e instanceof Error ? e.message : String(e)}`, required });
    }
  };
  probe('NFKC ligature and full-width', true, () => {
    const a = 'ﬁnance Ａ１'.normalize('NFKC');
    return [a === 'finance A1', JSON.stringify(a)];
  });
  probe('\\p{L} and \\p{M} with the u flag', true, () => {
    const m = 'Müller Çağrı straße Zoë'.match(/\p{L}[\p{L}\p{M}]*/gu);
    return [JSON.stringify(m) === JSON.stringify(['Müller', 'Çağrı', 'straße', 'Zoë']), JSON.stringify(m)];
  });
  probe('look-behind', true, () => [/(?<=Java)-\w+/.exec('Java-Entwicklung')?.[0] === '-Entwicklung', 'ok']);
  probe('toLocaleUpperCase ß → SS (de)', true, () => {
    const u = 'Straße'.toLocaleUpperCase('de');
    return [u === 'STRASSE', u];
  });
  probe('toUpperCase ß → SS', true, () => [('Straße'.toUpperCase() === 'STRASSE'), 'Straße'.toUpperCase()]);
  probe('toLocaleUpperCase i → İ (tr)', false, () => {
    const u = 'istanbul'.toLocaleUpperCase('tr');
    return [u === 'İSTANBUL', u];
  });
  probe('Intl month name März (de-DE)', false, () => {
    const m = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(2026, 2, 15));
    return [m === 'März', m];
  });
  probe('Intl collator / localeCompare (de)', false, () => {
    const r = ['Zebra', 'Äpfel', 'Apfel'].sort((a, b) => a.localeCompare(b, 'de'));
    return [r.join() === 'Apfel,Äpfel,Zebra', r.join()];
  });
  return out;
}
