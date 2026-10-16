// Node runner of the app's pdf.js extraction (src/readback/pdfjs-extract.ts, the same source the WebView harness
// runs) with pdfjs-dist 6.3.289 (legacy build). Usage: node scripts/pdfjs-extract.mjs <in.pdf> [<out.json>]
// Without <out.json> the RawExtraction JSON goes to stdout.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The source text is the template literal in pdfjs-extract.ts (no backticks or ${} inside; a Jest test checks that
// this extraction equals the exported constant).
export function readExtractSource() {
  const ts = readFileSync(join(root, 'src', 'readback', 'pdfjs-extract.ts'), 'utf8');
  const m = /export const PDFJS_EXTRACT_SOURCE = `([^`]*)`;/.exec(ts);
  if (!m) throw new Error('PDFJS_EXTRACT_SOURCE not found');
  return m[1];
}
const extractPdf = new Function(`return (${readExtractSource()})`)();

export async function extractFile(path) {
  return extractPdf(pdfjsLib, new Uint8Array(readFileSync(path)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  const result = await extractFile(input);
  if (output) writeFileSync(output, JSON.stringify(result));
  else process.stdout.write(JSON.stringify(result));
}
