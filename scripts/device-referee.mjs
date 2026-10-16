// Device PDF referee (V1_PLAN P5 gate, D14/D15): pulls a run of the dev-only PDF gate (resumebuilder-dev://debug/pdf-gate,
// src/debug/pdf-gate-screen.tsx) from OUR simulator/emulator and checks every PDF the phone printed with expo-print:
//   1. copies <document>/pdf-gate/<run>/ to artifacts/device-pdfs/<platform>-<run>/ (simctl app container / adb run-as)
//   2. reads every PDF on the Mac with pdf.js in Node (the app's extraction source) and Apple PDFKit (webkit-pdf text)
//   3. compares both with src/readback/compare.ts (Jest referee, REFEREE_DIR) → referee.json in that folder
//   4. checks that the phone's own read-back (pdf.js inside the app's WebView) saw exactly what Node's pdf.js saw
// Usage: node scripts/device-referee.mjs <ios|android> <run> [name-filter]     Exit 0 = everything passes.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFile } from './pdfjs-extract.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [platform, run, filter = ''] = process.argv.slice(2);
if (!['ios', 'android'].includes(platform) || !run) {
  console.error('Usage: node scripts/device-referee.mjs <ios|android> <run> [name-filter]');
  process.exit(2);
}
const APP_ID = 'com.tim.resumebuilder.dev';
const UDID = process.env.IOS_UDID ?? '3C8B1EEC-4DB4-4AFD-9E9D-467E128935F6'; // ResumeBuilder iPhone (D11)
const SERIAL = process.env.ANDROID_SERIAL ?? 'emulator-5646'; // ResumeBuilder_API_36 (D11)
const out = join(root, 'artifacts', 'device-pdfs', run.startsWith(platform) ? run : `${platform}-${run}`);
const bin = join(root, 'artifacts', 'bin', 'webkit-pdf');
const t0 = Date.now();
const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${msg}`);

step(`1/4 pull ${platform} run ${run}`);
mkdirSync(out, { recursive: true });
if (platform === 'ios') {
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', UDID, APP_ID, 'data'], { encoding: 'utf8' }).trim();
  cpSync(join(container, 'Documents', 'pdf-gate', run), out, { recursive: true });
} else {
  const tar = execFileSync('adb', ['-s', SERIAL, 'exec-out', 'run-as', APP_ID, 'sh', '-c', `cd files/pdf-gate/${run} && tar cf - .`], {
    maxBuffer: 512 * 1024 * 1024,
  });
  execFileSync('tar', ['xf', '-', '-C', out], { input: tar });
}
const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
const names = report.names.filter((n) => n.includes(filter));
writeFileSync(join(out, 'index.json'), JSON.stringify(names));

/** Font names and font-file streams written in the PDF (D26). */
function fontFacts(pdf) {
  const text = readFileSync(pdf).toString('latin1');
  const names = [...new Set([...text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+#._-]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, '')))];
  return { baseFonts: names, fontFiles: (text.match(/\/FontFile[23]?\b/g) ?? []).length, type3: /\/Subtype\s*\/Type3/.test(text) };
}

step(`2/4 read ${names.length} PDFs with pdf.js (Node) and Apple PDFKit`);
if (!existsSync(bin)) execFileSync('xcrun', ['swiftc', '-O', join(root, 'scripts', 'webkit-pdf.swift'), '-o', bin]);
const pdfs = names.map((n) => join(out, `${n}.pdf`));
const pdfkit = Object.fromEntries(
  execFileSync(bin, ['text', ...pdfs], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .map((r) => [r.pdf, r.pages])
);
const sameExtraction = [];
for (const name of names) {
  const pdf = join(out, `${name}.pdf`);
  const device = JSON.parse(readFileSync(join(out, `${name}.device.json`), 'utf8'));
  const started = Date.now();
  const raw = await extractFile(pdf);
  const facts = { bytes: statSync(pdf).size, printMs: device.printMs, pdfjsMs: Date.now() - started, ...fontFacts(pdf) };
  writeFileSync(join(out, `${name}.read.json`), JSON.stringify({ pdfjs: raw, pdfkit: pdfkit[pdf], facts }));
  // The phone's WebView pdf.js must have returned exactly what Node's pdf.js returns for the same file.
  sameExtraction.push({ name, same: device.raw !== null && JSON.stringify(device.raw) === JSON.stringify(raw), devicePass: device.result.pass === true });
}

step('3/4 compare (Jest referee, REFEREE_DIR)');
const r = spawnSync('npx', ['jest', 'src/readback/referee.test.ts', '--silent'], {
  cwd: root,
  env: { ...process.env, REFEREE: '1', REFEREE_DIR: out, REFEREE_DEVICE: platform, REFEREE_FONTS: report.tuning.fonts ?? 'web' },
  encoding: 'utf8',
});
const result = JSON.parse(readFileSync(join(out, 'referee.json'), 'utf8'));
console.log(result.table);
console.log(result.summary);

step('4/4 phone read-back vs Node');
const differ = sameExtraction.filter((s) => !s.same);
const rows = Object.fromEntries(result.rows.map((row) => [row.name, row]));
const verdictDiffer = sameExtraction.filter((s) => rows[s.name] && rows[s.name].pdfjs.pass !== s.devicePass);
console.log(
  `phone pdf.js (WebView) extraction identical to Node pdf.js: ${sameExtraction.length - differ.length}/${sameExtraction.length}` +
    (differ.length ? ` — differ: ${differ.map((d) => d.name).join(', ')}` : '') +
    `; same verdict: ${sameExtraction.length - verdictDiffer.length}/${sameExtraction.length}`
);
const timing = report.rows.filter((row) => names.includes(row.name));
const per = (key) => timing.map((row) => row[key]).filter((v) => typeof v === 'number');
const stats = (xs) => (xs.length ? `median ${xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]} ms, max ${Math.max(...xs)} ms` : 'n/a');
const perPage = timing.map((row) => Math.round(row.printMs / Math.max(1, row.pages)));
console.log(
  `${platform}: pdf.js loaded in the WebView in ${report.loadMs} ms; print ${stats(per('printMs'))} (per page ${stats(perPage)}); ` +
    `read-back ${stats(per('readbackMs'))}; pdf.js inside ${stats(per('pdfjsMs'))}`
);
writeFileSync(join(out, 'device-summary.json'), JSON.stringify({ platform, run, loadMs: report.loadMs, tuning: report.tuning, sameExtraction, verdictDiffer: verdictDiffer.map((d) => d.name) }, null, 1));
step(r.status === 0 && differ.length === 0 && verdictDiffer.length === 0 ? 'ALL PASS' : 'FAILURES — see above');
process.exit(r.status === 0 && differ.length === 0 && verdictDiffer.length === 0 ? 0 : 1);
