/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { extractKeywords, SHOWN_KEYWORDS } from '@/engine/keywords/extract';
import { countOccurrences } from '@/engine/keywords/match';

const DIR = '/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/ads';
const expected = JSON.parse(readFileSync(DIR + '/expected.json', 'utf8')) as Record<string, string[]>;
test('blind recall', () => {
  const out: string[] = [];
  let exact = 0, lenient = 0, total = 0;
  for (const [name, must] of Object.entries(expected)) {
    const ex = extractKeywords(readFileSync(DIR + '/' + name, 'utf8'));
    const top = ex.keywords.slice(0, SHOWN_KEYWORDS);
    const terms = top.map((k) => k.term);
    const all = ex.keywords.map((k) => k.term);
    const e = must.filter((m) => terms.includes(m));
    const l = must.filter((m) => terms.some((t) => t === m || countOccurrences(m, [t]).count > 0 || countOccurrences(t, [m]).count > 0 && t.split(' ').length === m.split(' ').length));
    const miss = must.filter((m) => !l.includes(m)).map((m) => m + '@' + (all.indexOf(m) + 1));
    exact += e.length; lenient += l.length; total += must.length;
    const plain = top.filter((k) => !k.inDictionary && k.tf === 1 && !k.term.includes(' ')).map((k) => k.term + (k.inRequirements ? '(R)' : ''));
    out.push(name + ': exact ' + e.length + '/' + must.length + ', lenient ' + l.length + '/' + must.length + '\n  top25: ' + top.map((k) => k.term + ':' + k.tf + (k.inDictionary ? 'D' : '') + (k.inRequirements ? 'R' : '')).join(', ') + '\n  missed: ' + miss.join(', ') + '\n  tf1 non-skill single words in top25 (' + plain.length + '): ' + plain.join(', '));
  }
  out.push('TOTAL exact ' + exact + '/' + total + ', lenient ' + lenient + '/' + total);
  console.log(out.join('\n'));
});
