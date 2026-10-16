// Device-free PDF referee (V1_PLAN P3.4). Proxy evidence only: macOS WebKit, NOT iOS UIPrintPageRenderer and NOT
// Android Chromium (the real-device gate is P5).
//   1. writes every template × fixture × paper (+ cover letters) as HTML + expected lines (Jest, RENDER_SAMPLES=1)
//   2. prints them to PDF with macOS WebKit (scripts/webkit-pdf.swift → artifacts/bin/webkit-pdf)
//   3. reads every PDF with pdf.js in Node (the app's own extraction source) and with Apple PDFKit
//   4. compares both readers with src/readback/compare.ts (Jest, REFEREE=1) → artifacts/samples/referee.json
// Usage: node scripts/pdf-referee.mjs [name-filter]      Exit code 0 = every file passes with both readers.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFile } from './pdfjs-extract.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const samples = join(root, 'artifacts', 'samples');
const bin = join(root, 'artifacts', 'bin', 'webkit-pdf');
const swift = join(root, 'scripts', 'webkit-pdf.swift');
const filter = process.argv[2] ?? '';
const t0 = Date.now();
const step = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${msg}`);

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error((r.stdout ?? '').split('\n').slice(-30).join('\n'), (r.stderr ?? '').split('\n').slice(-30).join('\n'));
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  }
  return r.stdout;
}

/** Runs the printer with a watchdog on its own PID (never by name). */
function printAll(jobsFile, count) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['print', jobsFile], { cwd: root });
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('webkit-pdf timed out'));
    }, 30_000 + count * 5_000);
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    });
  });
}

/** Font names and font-file streams written in the PDF (first evidence for D26: embedded @font-face fonts). */
function fontFacts(pdf) {
  const text = readFileSync(pdf).toString('latin1');
  const names = [...new Set([...text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+#._-]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, '')))];
  return { baseFonts: names, fontFiles: (text.match(/\/FontFile[23]?\b/g) ?? []).length, type3: /\/Subtype\s*\/Type3/.test(text) };
}

mkdirSync(join(root, 'artifacts', 'bin'), { recursive: true });
step('1/4 render HTML + expected lines (Jest)');
run('npx', ['jest', 'src/render/samples.test.ts', '--silent'], { RENDER_SAMPLES: '1' });
const names = JSON.parse(readFileSync(join(samples, 'index.json'), 'utf8')).filter((n) => n.includes(filter));

if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(swift).mtimeMs) {
  step('compile scripts/webkit-pdf.swift');
  run('xcrun', ['swiftc', '-O', swift, '-o', bin]);
}

step(`2/4 print ${names.length} files with macOS WebKit`);
const jobs = names.map((name) => {
  const e = JSON.parse(readFileSync(join(samples, `${name}.expected.json`), 'utf8'));
  return { html: join(samples, `${name}.html`), pdf: join(samples, `${name}.pdf`), width: e.print.width, height: e.print.height, margin: e.print.margins.top };
});
const jobsFile = join(samples, 'jobs.json');
writeFileSync(jobsFile, JSON.stringify(jobs));
const printed = await printAll(jobsFile, jobs.length);
const failedPrints = printed.filter((p) => !p.ok);
if (printed.length !== jobs.length || failedPrints.length) throw new Error(`printing failed: ${JSON.stringify(failedPrints)}`);
const printMs = Object.fromEntries(printed.map((p) => [p.pdf, p.ms]));

step('3/4 read back with pdf.js (Node) and Apple PDFKit');
const pdfkit = Object.fromEntries(
  run(bin, ['text', ...jobs.map((j) => j.pdf)])
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .map((r) => [r.pdf, r.pages])
);
for (const job of jobs) {
  const name = job.pdf.slice(samples.length + 1, -4);
  const started = Date.now();
  const raw = await extractFile(job.pdf);
  const facts = { bytes: statSync(job.pdf).size, printMs: printMs[job.pdf], pdfjsMs: Date.now() - started, ...fontFacts(job.pdf) };
  writeFileSync(join(samples, `${name}.read.json`), JSON.stringify({ pdfjs: raw, pdfkit: pdfkit[job.pdf], facts }));
}

step('4/4 compare (Jest, REFEREE=1)');
const filterEnv = filter ? { REFEREE_FILTER: filter } : {};
const r = spawnSync('npx', ['jest', 'src/readback/referee.test.ts', '--silent'], {
  cwd: root,
  env: { ...process.env, REFEREE: '1', ...filterEnv },
  encoding: 'utf8',
});
const report = JSON.parse(readFileSync(join(samples, 'referee.json'), 'utf8'));
console.log(report.table);
console.log(report.summary);
step(r.status === 0 ? 'ALL PASS (macOS WebKit proxy — not iOS/Android)' : 'FAILURES — see the table above');
process.exit(r.status ?? 1);
