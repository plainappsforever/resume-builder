/**
 * @jest-environment node
 */
// Structural guards (V1_PLAN rule 8, CLAUDE.md layout): writes only through the write queue inside src/db; the
// engines stay pure (no React/Expo/database imports), so they run unchanged in Node, the app and the referee.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path);

describe('guards', () => {
  it('no source file outside src/db calls runAsync/execAsync (they would bypass the write queue)', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((path) => !rel(path).startsWith('src/db/'))
      .filter((path) => /\.(runAsync|execAsync)\(/.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('inside src/db, writes outside tx.ts happen only on a write-unit handle (non-test files)', () => {
    // Every runAsync/execAsync in a data module must sit in a function that received the handle (`tx`), except
    // migrations.ts (PRAGMA foreign_keys must run outside a transaction; migrate() uses withTransaction) and
    // native-retry.ts (the retry layer INSIDE tx.ts's handles; only tx.ts imports it, checked below).
    const offenders: string[] = [];
    for (const path of sourceFiles(join(ROOT, 'src', 'db'))) {
      const name = rel(path);
      if (name.endsWith('.test.ts') || name.endsWith('/tx.ts') || name.endsWith('/native-retry.ts') || name.endsWith('/migrations.ts')) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\b(?!tx\b)\w+\.(runAsync|execAsync)\(/.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('only tx.ts uses the native retry layer (it would otherwise bypass the queue)', () => {
    const users = sourceFiles(join(ROOT, 'src'))
      .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('native-retry.ts'))
      .filter((path) => /from '(\.\/|@\/db\/)native-retry'/.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(users).toEqual(['src/db/tx.ts']);
  });

  it('src/engine is pure: no React, Expo, React Native or database imports', () => {
    const offenders = sourceFiles(join(ROOT, 'src', 'engine'))
      .filter((path) => /from '(react|react-native|expo[\w-]*|@\/db\/[\w/-]+|@\/lib\/[\w/-]+)'/.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('render, read-back (except the P5 bridge) and data formats are pure too', () => {
    const offenders = ['render', 'readback', 'data']
      .flatMap((dir) => sourceFiles(join(ROOT, 'src', dir)))
      .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('/bridge.ts'))
      .filter((path) => /from '(react|react-native|expo[\w-]*|@\/db\/[\w/-]+|@\/lib\/[\w/-]+|\.\.\/db\/[\w/-]+)'/.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
