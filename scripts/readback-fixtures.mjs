// Regenerates the read-back comparator fixtures in src/readback/__fixtures__/ from REAL macOS-WebKit PDFs read with
// the app's pdf.js extraction (run `node scripts/pdf-referee.mjs` first; it builds artifacts/bin/webkit-pdf and the
// samples). Fixtures:
//   proxy-{a_single,b_traps,c_layouts}.json  the spec session's trap layouts (docs/research/webkit-pdf-proxy):
//                                            flex rows with right-aligned dates, a CSS grid, a table, absolute
//                                            positioning — the comparator must FAIL them, naming the lines
//   ligatures-on.json                        lebenslauf-stress-de with ligatures switched back on (D45) — must FAIL
//   pass-*.json                              four referee outputs that must PASS
//   *.pdf                                    two small PDFs for the Node pdf.js test (one pass, one trap layout)
// Each JSON = { name, expectedLines, pdfjs (RawExtraction), pdfkit (page texts), bytes }.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFile } from './pdfjs-extract.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const samples = join(root, 'artifacts', 'samples');
const probe = join(root, 'artifacts', 'readback-fixtures');
const out = join(root, 'src', 'readback', '__fixtures__');
const bin = join(root, 'artifacts', 'bin', 'webkit-pdf');
const research = join(root, 'docs', 'research', 'webkit-pdf-proxy');
mkdirSync(probe, { recursive: true });
mkdirSync(out, { recursive: true });

const L = (text, role = 'text') => ({ text, role });
// Expected lines of the research pages in the order a person reads them (DOM order; a row = one line).
const RESEARCH = {
  a_single: [
    L('Jürgen Müller-Øster', 'name'),
    L('jurgen@example.com | +49 151 2345678 | Berlin, Germany | linkedin.com/in/jmo', 'contact'),
    L('Summary', 'heading'),
    L('Certified office manager with efficient workflow skills and 8 years of experience.'),
    L('Experience', 'heading'),
    L('Senior Project Manager, Acme Logistics GmbH 03/2019 – Present', 'entry'),
    L('Led a team of 12 across 3 sites; cut delivery time by 18%.', 'bullet'),
    L('Introduced Jira and Confluence; reduced reporting effort by 6 hours per week.', 'bullet'),
    L('Project Coordinator, Beta Freight Inc. 01/2015 – 02/2019', 'entry'),
    L('Coordinated 40+ shipments a week with SAP S/4HANA.', 'bullet'),
    L('Education', 'heading'),
    L('B.Sc. Business Administration, TU München 2014', 'entry'),
    L('Skills', 'heading'),
    L('Project management, SAP, Excel, Scrum, stakeholder communication, C++, C#, Node.js'),
  ],
  b_traps: [
    L('Experience Heading', 'heading'),
    L('Ligatures: office efficient affluent fjord Certified'),
    L('Skills', 'heading'),
    L('Python'),
    L('SQL'),
    L('Tableau'),
    L('Languages', 'heading'),
    L('German'),
    L('English'),
    L('Experience', 'heading'),
    L('Data Analyst, Gamma AG, 2020 – 2024', 'entry'),
    L('Built dashboards used by 300 staff.'),
    L('Automated weekly KPI report.'),
    L('Icons: ✉ mail@example.com ☎ 0151 1234'),
  ],
  c_layouts: [
    L('L1 INLINE: Senior Project Manager | Acme GmbH | 03/2019 – Present', 'entry'),
    L('• Literal bullet one with text that is long enough to wrap onto a second line in this layout to test hanging indents and reading order.', 'bullet'),
    L('• Literal bullet two.', 'bullet'),
    L('L2 OWNLINE: Project Coordinator, Beta Freight Inc.', 'entry'),
    L('01/2015 – 02/2019', 'date'),
    L('L3 FLOAT: Assistant, Delta AG 06/2012 – 12/2014', 'entry'),
    L('L4 TABLE: Intern, Epsilon SE 2011 – 2012', 'entry'),
    L('L5 ABS: Trainee, Zeta Ltd 2010 – 2011', 'entry'),
    L('L6 FLEX: Clerk, Eta LLC 2009 – 2010', 'entry'),
    L('END'),
  ],
};

const jobs = [];
for (const name of Object.keys(RESEARCH)) {
  copyFileSync(join(research, `${name}.html`), join(probe, `${name}.html`));
  jobs.push({ html: join(probe, `${name}.html`), pdf: join(probe, `${name}.pdf`), width: 595, height: 842, margin: 0 });
}
const ligSrc = readFileSync(join(samples, 'lebenslauf-stress-de-a4.html'), 'utf8').replace('font-variant-ligatures:none;', '').replace(/font-feature-settings:[^;]*;/, '');
writeFileSync(join(probe, 'ligatures-on.html'), ligSrc);
jobs.push({ html: join(probe, 'ligatures-on.html'), pdf: join(probe, 'ligatures-on.pdf'), width: 595, height: 842, margin: 51.02 });
writeFileSync(join(probe, 'jobs.json'), JSON.stringify(jobs));
const printed = spawnSync(bin, ['print', join(probe, 'jobs.json')], { encoding: 'utf8', timeout: 120_000 });
if (printed.status !== 0) throw new Error(`webkit-pdf failed: ${printed.stderr}`);

const pdfkitText = (pdf) => JSON.parse(spawnSync(bin, ['text', pdf], { encoding: 'utf8' }).stdout).pages;
async function fixture(name, pdf, expectedLines) {
  const data = { name, expectedLines, pdfjs: await extractFile(pdf), pdfkit: pdfkitText(pdf), bytes: statSync(pdf).size };
  writeFileSync(join(out, `${name}.json`), JSON.stringify(data) + '\n');
  console.log(`${name}.json  ${data.pdfjs.numPages} page(s), ${data.bytes} bytes`);
}

for (const name of Object.keys(RESEARCH)) await fixture(`proxy-${name}`, join(probe, `${name}.pdf`), RESEARCH[name]);
const lebenslaufExpected = JSON.parse(readFileSync(join(samples, 'lebenslauf-stress-de-a4.expected.json'), 'utf8')).expectedLines;
await fixture('ligatures-on', join(probe, 'ligatures-on.pdf'), lebenslaufExpected);
for (const name of ['modern-sample-en-a4', 'lebenslauf-stress-de-a4', 'executive-stress-en-letter', 'cover-classic-de']) {
  const expected = JSON.parse(readFileSync(join(samples, `${name}.expected.json`), 'utf8')).expectedLines;
  await fixture(`pass-${name}`, join(samples, `${name}.pdf`), expected);
}
copyFileSync(join(samples, 'modern-sample-en-a4.pdf'), join(out, 'modern-sample-en-a4.pdf'));
writeFileSync(
  join(out, 'modern-sample-en-a4.expected.json'),
  JSON.stringify(JSON.parse(readFileSync(join(samples, 'modern-sample-en-a4.expected.json'), 'utf8')).expectedLines) + '\n'
);
copyFileSync(join(probe, 'c_layouts.pdf'), join(out, 'proxy-c_layouts.pdf'));
