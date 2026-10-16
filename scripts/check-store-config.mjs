#!/usr/bin/env node
// Adapted from invoice-maker. The store variants' Info.plist (expo config --type introspect, no files written) has the
// export-compliance key and no dev-client residue; the development variant still has its dev-client scheme. The Android
// side (no INTERNET, allowBackup=false) is checked on a built APK with aapt (V1_LOG P6) and by plugins/*.test.ts.
// Usage: node scripts/check-store-config.mjs  (exit 1 on a problem; needs scripts/env.sh for expo's node)
import { execFileSync } from 'node:child_process';

const plist = (variant) => {
  const out = execFileSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], {
    env: { ...process.env, APP_VARIANT: variant }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out).ios.infoPlist ?? {};
};
const problems = [];
for (const variant of ['preview', 'production']) {
  const p = plist(variant);
  const schemes = (p.CFBundleURLTypes ?? []).flatMap((t) => t.CFBundleURLSchemes ?? []);
  const check = (ok, what) => { if (!ok) problems.push(`${variant}: ${what}`); };
  check(p.ITSAppUsesNonExemptEncryption === false, 'ITSAppUsesNonExemptEncryption is not false');
  check(p.NSLocalNetworkUsageDescription === undefined, 'NSLocalNetworkUsageDescription present');
  check(!(p.NSBonjourServices ?? []).includes('_expo._tcp'), '_expo._tcp Bonjour service present');
  check(!schemes.some((s) => s.startsWith('exp+')), `dev scheme present (${schemes.join(', ')})`);
  check(!Object.keys(p).some((k) => k.startsWith('EXDevMenu')), 'EXDevMenu* keys present');
  check(!p.NSAppTransportSecurity?.NSAllowsLocalNetworking, 'NSAllowsLocalNetworking present');
  console.log(`${variant}: schemes ${schemes.join(', ')}; encryption key ${p.ITSAppUsesNonExemptEncryption}`);
}
const dev = plist('development');
if (!(dev.CFBundleURLTypes ?? []).flatMap((t) => t.CFBundleURLSchemes ?? []).some((s) => s.startsWith('exp+'))) problems.push('development: the dev-client scheme is missing');
if (problems.length) {
  console.error(`PROBLEMS:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('store config OK');
