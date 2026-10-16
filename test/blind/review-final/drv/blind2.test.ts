/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { extractKeywords, SHOWN_KEYWORDS } from '@/engine/keywords/extract';

const DIR = '/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/ads';
const expected = JSON.parse(readFileSync(DIR + '/expected.json', 'utf8')) as Record<string, string[]>;
test('blind recall by block', () => {
  const out: string[] = [];
  for (const [name, must] of Object.entries(expected)) {
    const ex = extractKeywords(readFileSync(DIR + '/' + name, 'utf8'));
    const rows = must.map((m) => { const i = ex.keywords.findIndex((k) => k.term === m); return i < 0 ? m + ':absent' : m + ':' + (i + 1) + (ex.keywords[i].inRequirements ? 'R' : 'T') + (ex.keywords[i].inDictionary ? 'D' : ''); });
    const org = ex.keywords.slice(0, SHOWN_KEYWORDS).filter((k) => !k.inRequirements && !k.inDictionary).map((k) => k.term);
    out.push(name + '\n  ' + rows.join(' ') + '\n  top25 neither requirement nor skill: ' + org.join(', '));
  }
  console.log(out.join('\n'));
});
