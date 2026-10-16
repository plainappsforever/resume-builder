import { readFileSync, writeFileSync } from 'node:fs';
import { extractFile } from '../../../scripts/pdfjs-extract.mjs';
const meta = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/meta.json', 'utf8'));
const out = {};
for (const name of Object.keys(meta)) out[name] = await extractFile('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/' + name + '.pdf');
writeFileSync('/private/tmp/claude-501/-Users-tim-Developer-mobile-starter/d97465a4-0c37-458f-9b0f-4584d9e762c0/scratchpad/rb-review-final/pdf/pdfjs.json', JSON.stringify(out));
console.log('ok', Object.keys(out).length);
