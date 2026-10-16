// Writes src/data/licences.generated.ts — every third-party component the app ships, for the About screen (v1.1, RELEASE_KIT
// §1c item 13; v1 listed only the direct "dependencies"):
//   npm    every production package (transitive: `npm ls --omit=dev --all`) + the build-time packages whose files are embedded
//          in the app or its PDFs: pdf.js (assets/pdfjs, Apache-2.0) and the six @fontsource families (OFL-1.1)
//   pod    every iOS pod in ios/Podfile.lock (licence from the npm package for local pods, else the pod's LICENSE file)
//   maven  every Android library on the release runtime classpath (Gradle, offline), licence from its POM in ~/.gradle
// `direct` marks the app's own dependencies (shown first). Needs generated ios/ and android/ folders. Read-only otherwise.
// Run after changing a dependency: node scripts/licences.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const embedded = ['pdfjs-dist', ...Object.keys(pkg.devDependencies).filter((n) => n.startsWith('@fontsource/'))];
const direct = new Set([...Object.keys(pkg.dependencies), ...embedded]);
const licenceOf = (p) => (typeof p.license === 'string' ? p.license : (p.license?.type ?? (p.licenses ?? []).map((l) => l.type).join(' OR '))) || 'see package';

// ---- npm --------------------------------------------------------------------------------------------------------------
const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--long', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const npm = new Map();
(function walk(node) {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (!dep.version) continue;
    const key = `${name}@${dep.version}`;
    if (npm.has(key)) continue;
    const file = dep.path ? join(dep.path, 'package.json') : join('node_modules', name, 'package.json');
    const license = existsSync(file) ? licenceOf(JSON.parse(readFileSync(file, 'utf8'))) : (dep.license ?? 'see package');
    npm.set(key, { name, version: dep.version, license, source: 'npm', direct: direct.has(name) });
    walk(dep);
  }
})(tree);
for (const name of embedded) {
  const p = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
  npm.set(`${name}@${p.version}`, { name, version: p.version, license: licenceOf(p), source: 'npm', direct: true });
}

// ---- iOS pods ---------------------------------------------------------------------------------------------------------
const pods = [];
const lock = readFileSync('ios/Podfile.lock', 'utf8');
const podSection = lock.slice(lock.indexOf('PODS:'), lock.indexOf('DEPENDENCIES:'));
const npmByName = new Map([...npm.values()].map((r) => [r.name, r]));
function podLicence(name) {
  const spec = join('ios', 'Pods', 'Local Podspecs', `${name}.podspec.json`);
  if (existsSync(spec)) {
    const s = JSON.parse(readFileSync(spec, 'utf8'));
    const l = typeof s.license === 'string' ? s.license : s.license?.type;
    if (l) return l;
  }
  const dir = join('ios', 'Pods', name.split('/')[0]);
  for (const f of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'License.txt', 'COPYING']) {
    if (!existsSync(join(dir, f))) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    if (/Apache License/i.test(text)) return 'Apache-2.0';
    if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
    if (/Redistribution and use in source and binary forms/i.test(text)) return 'BSD';
    return 'see LICENSE';
  }
  return 'see pod';
}
for (const m of podSection.matchAll(/^ {2}- "?([^ "]+) \(([^)]+)\)/gm)) {
  const [, name, version] = m;
  if (name.includes('/')) continue; // subspecs share their pod's licence
  pods.push({ name, version, license: podLicence(name), source: 'pod', direct: false });
}

// ---- Android Maven ----------------------------------------------------------------------------------------------------
// Same JDK and SDK as scripts/env.sh.
const javaHome = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home';
const gradle = execFileSync('./gradlew', [':app:dependencies', '--configuration', 'releaseRuntimeClasspath', '-q', '--offline'], {
  cwd: 'android',
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: process.env.ANDROID_HOME ?? join(homedir(), 'Library', 'Android', 'sdk') },
});
const coords = new Map();
for (const m of gradle.matchAll(/([\w.-]+):([\w.-]+):([\w.-]+)(?: -> ([\w.-]+))?/g)) {
  const [, group, artifact, v, resolved] = m;
  const version = resolved ?? v;
  if (!/^\d/.test(version)) continue;
  coords.set(`${group}:${artifact}`, { group, artifact, version });
}
const cache = join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
function pomLicence(group, artifact, version, depth = 0) {
  const dir = join(cache, group, artifact, version);
  if (!existsSync(dir) || depth > 4) return 'see library';
  for (const hash of readdirSync(dir)) {
    const pom = join(dir, hash, `${artifact}-${version}.pom`);
    if (!existsSync(pom)) continue;
    const xml = readFileSync(pom, 'utf8');
    const names = [...xml.matchAll(/<license>\s*<name>([^<]+)<\/name>/g)].map((x) => x[1].trim());
    if (names.length) return [...new Set(names)].join(' OR ');
    // No licence in the POM itself: its parent POM usually declares it (Guava, Commons).
    const parent = xml.match(/<parent>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/parent>/);
    return parent ? pomLicence(parent[1].trim(), parent[2].trim(), parent[3].trim(), depth + 1) : 'see library';
  }
  return 'see library';
}
// Expo modules are published from their npm packages (node_modules/expo-*/local-maven-repo, all MIT): the npm licence applies.
const EXPO_GROUPS = /^(expo\.modules\.|host\.exp\.exponent$)/;
const maven = [...coords.values()].map((c) => {
  let license = pomLicence(c.group, c.artifact, c.version);
  if (license === 'see library' && EXPO_GROUPS.test(c.group)) license = 'MIT (Expo module, npm package)';
  return { name: `${c.group}:${c.artifact}`, version: c.version, license, source: 'maven', direct: false };
});

// ---- write ------------------------------------------------------------------------------------------------------------
const order = { npm: 0, pod: 1, maven: 2 };
const rows = [...npm.values(), ...pods, ...maven].sort((a, b) => Number(b.direct) - Number(a.direct) || order[a.source] - order[b.source] || a.name.localeCompare(b.name));
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const body = rows.map((r) => `  { name: ${q(r.name)}, version: ${q(r.version)}, license: ${q(r.license)}, source: '${r.source}', direct: ${r.direct} },`).join('\n');
writeFileSync(
  'src/data/licences.generated.ts',
  '// Generated by scripts/licences.mjs from npm, ios/Podfile.lock and the Android release classpath — do not edit by hand.\n' +
    "export type Licence = { name: string; version: string; license: string; source: 'npm' | 'pod' | 'maven'; direct: boolean };\n" +
    `export const LICENCES: readonly Licence[] = [\n${body}\n];\n`
);
const count = (s) => rows.filter((r) => r.source === s).length;
const unknown = rows.filter((r) => /^see /.test(r.license));
console.log(`${rows.length} components: npm ${count('npm')}, pods ${count('pod')}, maven ${count('maven')}; direct ${rows.filter((r) => r.direct).length}`);
console.log(`licences: ${[...new Set(rows.map((r) => r.license))].sort().join(' | ')}`);
console.log(`without a licence name (${unknown.length}): ${unknown.map((r) => `${r.source}:${r.name}`).join(', ')}`);
