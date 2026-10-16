// Writes artifacts/samples/*.html (+ *.expected.json): every template × fixture × paper and the cover letters,
// through Jest (which resolves the TypeScript sources and "@/" imports). Optional visual check:
// `open -a Safari artifacts/samples/modern-sample-en-a4.html`. For the proxy PDFs run `node scripts/pdf-referee.mjs`.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('npx', ['jest', 'src/render/samples.test.ts', '--silent'], {
  cwd: root,
  env: { ...process.env, RENDER_SAMPLES: '1' },
  stdio: 'inherit',
});
if (result.status === 0) console.log('samples written to artifacts/samples/');
process.exit(result.status ?? 1);
