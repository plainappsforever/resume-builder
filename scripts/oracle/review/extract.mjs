import { extractFile } from '../../pdfjs-extract.mjs';
import { readdirSync, writeFileSync } from 'node:fs';
const dir = process.argv[2]; const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.pdf'))) out[f.replace('.pdf', '')] = await extractFile(`${dir}/${f}`);
writeFileSync(`${dir}/pdfjs.json`, JSON.stringify(out));
console.log(Object.keys(out).length);
