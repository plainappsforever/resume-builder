/**
 * @jest-environment node
 */
// v1.1 (REVIEW_V1 #11): WRITE_BACKUP_FIXTURE=1 writes artifacts/release/Resume-Builder-Backup-Example.json — a real backup
// file in the app's own format (the EN example, built by the same code the app uses), which the Release restore flow
// (.maestro/release/restore-release.yaml, scripts/release-restore.sh) puts into the device's files and picks through the
// SYSTEM file picker. Without the variable it only checks that the file parses (no file written in normal Jest runs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BACKUP_SCHEMA, buildBackup, parseBackup, serializeBackup } from '@/data/backup';

import { createTestDb } from '../../test/node-sqlite-db';
import { readBackupData } from './backup';
import { loadExample } from './example';
import { openDatabase } from './migrations';

it('builds a valid example backup file (and writes it with WRITE_BACKUP_FIXTURE=1)', async () => {
  const db = createTestDb();
  await openDatabase(db);
  await loadExample(db, 'en');
  const text = serializeBackup(buildBackup(await readBackupData(db), null, { name: 'Resume Builder', version: '1.1.0', schema: BACKUP_SCHEMA }, new Date('2026-10-04T08:00:00Z')));
  const parsed = parseBackup(text);
  expect(parsed.ok).toBe(true);
  if (!process.env.WRITE_BACKUP_FIXTURE) return;
  const dir = join(__dirname, '..', '..', 'artifacts', 'release');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Resume-Builder-Backup-Example.json'), text);
});
