/**
 * @jest-environment node
 */
// RENDER_SAMPLES=1: writes artifacts/samples/<name>.html + <name>.expected.json for every template × fixture × paper
// and a cover letter per template × language (scripts/render-samples.mjs, scripts/pdf-referee.mjs). Without the
// variable it only checks that the sample list builds (no files written during normal Jest runs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { TEMPLATE_IDS } from '@/engine/types';

import { referenceSamples } from './__fixtures__/samples';

/** A 240×300 RGB PNG (a soft gradient "portrait") built in code, so the samples need no image file. */
function testPhotoPng(): string {
  const w = 240;
  const h = 300;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 80 + Math.round((120 * y) / h);
      raw[o + 1] = 110 + Math.round((80 * x) / w);
      raw[o + 2] = 150;
    }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return png.toString('base64');
}

it('builds the sample list (and writes it with RENDER_SAMPLES=1)', () => {
  const list = referenceSamples({ mime: 'image/png', base64: testPhotoPng() });
  expect(list).toHaveLength(TEMPLATE_IDS.length * 4 * 2 + 6 + TEMPLATE_IDS.length + TEMPLATE_IDS.length * 2);
  if (!process.env.RENDER_SAMPLES) return;
  const dir = join(__dirname, '..', '..', 'artifacts', 'samples');
  mkdirSync(dir, { recursive: true });
  for (const { name, result } of list) {
    writeFileSync(join(dir, `${name}.html`), result.html);
    writeFileSync(
      join(dir, `${name}.expected.json`),
      JSON.stringify({ name, font: result.font, page: result.page, print: result.print, expectedLines: result.expectedLines }, null, 1)
    );
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(list.map((s) => s.name)));
});
