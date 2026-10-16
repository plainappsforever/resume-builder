/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { compareReadback, readInputFromPdfjs, readInputFromText } from '@/readback/compare';
test('compare probes', () => {
  const meta = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/meta.json', 'utf8'));
  const pj = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/pdfjs.json', 'utf8'));
  const pk = readFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/pdfkit.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const out: string[] = [];
  for (const name of Object.keys(meta)) {
    const raw = pj[name];
    const a = compareReadback(meta[name].expectedLines, readInputFromPdfjs(raw, 1), 0);
    const kit = pk.find((p: any) => p.pdf.endsWith('/' + name + '.pdf'));
    const b = compareReadback(meta[name].expectedLines, readInputFromText('PDFKit', kit.pages, 1), 0);
    out.push(name + ': pdfjs pass=' + a.pass + ' moved=' + a.lines.moved.map((l) => l.text.slice(0, 30)).join('|') + ' split=' + a.lines.split.map((l) => l.text.slice(0, 30)).join('|') + ' up=' + a.upJumps.length + ' gaps=' + a.wideGaps.length + ' || pdfkit pass=' + b.pass + ' moved=' + b.lines.moved.map((l) => l.text.slice(0, 30)).join('|') + ' split=' + b.lines.split.map((l) => l.text.slice(0, 30)).join('|'));
    out.push('   pdfkit first lines: ' + JSON.stringify(kit.pages[0].split('\n').slice(0, 6)));
  }
  console.log(out.join('\n'));
});
