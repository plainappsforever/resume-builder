// Copies one PDF of a pulled device run (scripts/device-referee.mjs) into the comparator's device fixtures:
//   node scripts/device-fixture.mjs <run-folder> <document> <fixture-prefix>
//   e.g. node scripts/device-fixture.mjs ios-maestro executive-stress-en-letter pass-ios
// writes src/readback/__fixtures__/device/<prefix>-<document>.json = { name, run, expectedLines, pdfjs, pdfkit, bytes }.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [run, name, prefix] = process.argv.slice(2);
if (!run || !name || !prefix) {
  console.error('Usage: node scripts/device-fixture.mjs <run-folder> <document> <fixture-prefix>');
  process.exit(2);
}
const dir = join(root, 'artifacts', 'device-pdfs', run);
const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), 'utf8'));
const read = JSON.parse(readFileSync(join(dir, `${name}.read.json`), 'utf8'));
const out = join(root, 'src', 'readback', '__fixtures__', 'device', `${prefix}-${name}.json`);
writeFileSync(out, JSON.stringify({ name, run, expectedLines: expected.expectedLines, pdfjs: read.pdfjs, pdfkit: read.pdfkit, bytes: read.facts.bytes }) + '\n');
console.log(out);
