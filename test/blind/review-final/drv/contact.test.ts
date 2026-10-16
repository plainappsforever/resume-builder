import fx from '@/readback/__fixtures__/pass-modern-sample-en-a4.json';
import { compareReadback, readInputFromPdfjs, readInputFromText } from '@/readback/compare';

const mutate = (f: (s: string) => string) => {
  const raw = JSON.parse(JSON.stringify(fx.pdfjs));
  for (const p of raw.pages) for (const it of p.items) it.s = f(it.s);
  return raw;
};
const cases: [string, (s: string) => string][] = [
  ['original', (s) => s],
  ['@ lost', (s) => s.replace('@', ' ')],
  ['@ and dots lost', (s) => s.replace('alex.morgan@example.com', 'alex morgan example com')],
  ['+ lost in phone', (s) => s.replace('+1 555', '1 555')],
  ['url slash lost', (s) => s.replace('linkedin.com/in/', 'linkedin com in ')],
  ['email split by space', (s) => s.replace('alex.morgan@example.com', 'alex.morgan @ example.com')],
  ['phone digits regrouped', (s) => s.replace('+1 555 0142', '+15550142')],
];
test('contact punctuation', () => {
  const out: string[] = [];
  for (const [name, f] of cases) {
    const r = compareReadback(fx.expectedLines as never, readInputFromPdfjs(mutate(f), fx.bytes), 0);
    out.push(`${name}: pass=${r.pass} words=${r.words.found}/${r.words.expected} missing=${r.missing.join(',')}`);
  }
  // pdfkit text too
  const t = (fx.pdfkit as string[]).map((p) => p.replace('alex.morgan@example.com', 'alex morgan example com'));
  const r2 = compareReadback(fx.expectedLines as never, readInputFromText('Apple PDFKit', t, fx.bytes), 0);
  out.push(`pdfkit email mangled: pass=${r2.pass}`);
  console.log(out.join('\n'));
});
