/**
 * @jest-environment node
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { renderHtml } from '@/render';
import { FIXTURES, modelFor } from '@/render/__fixtures__/models';

function png(): string {
  const w = 240, h = 300;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 90; raw[o + 1] = 120; raw[o + 2] = 150; }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const LONG = 'Dr. Maximilian-Alexander Schäfer-Grünwald von Hohenzollern-Sigmaringen';
test('write probes', () => {
  const photo = { mime: 'image/png' as const, base64: png() };
  const jobs: unknown[] = [];
  const meta: Record<string, unknown> = {};
  for (const [template, fixture] of [['lebenslauf', 'sample-de'], ['modern', 'sample-en'], ['executive', 'sample-en'], ['classic', 'sample-en']] as const) {
    for (const withPhoto of [true, false]) {
      if (!withPhoto && template === 'classic') continue;
      const { lang, draft } = (FIXTURES as any)[fixture];
      const d = { ...draft, profile: { ...draft.profile, fullName: LONG, headline: 'Senior Projektleiterin Digitalisierung und Prozessmanagement im Gesundheitswesen', photoFile: withPhoto ? 'photos/p.png' : null, birthDate: '1990-04-12', showPersonal: true } };
      const r = renderHtml(modelFor(d, lang, { template, style: { photo: withPhoto } }), { photo: withPhoto ? photo : null });
      const name = template + (withPhoto ? '-photo' : '') + '-longname';
      writeFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/' + name + '.html', r.html);
      meta[name] = { expectedLines: r.expectedLines, page: r.page, print: r.print };
      jobs.push({ html: '/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/' + name + '.html', pdf: '/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/' + name + '.pdf', width: r.print.width, height: r.print.height, margin: r.page.marginPt });
    }
  }
  writeFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/jobs.json', JSON.stringify(jobs));
  writeFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/meta.json', JSON.stringify(meta));
  console.log(Object.keys(meta).join(' '));
});
