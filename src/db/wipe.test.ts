/**
 * @jest-environment node
 */
// v1.1 D91 (REVIEW_V1 #10): "Delete all data" must not leave the deleted rows readable in the database file's free
// pages. Fails without the VACUUM in wipeAllData (the name is still in the file bytes).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FIXTURES } from '@/render/__fixtures__/models';

import { createTestDb } from '../../test/node-sqlite-db';
import { openDatabase } from './migrations';
import { seedMaster } from './seed';
import { wipeAllData } from './wipe';

it('after wipeAllData the database file holds no byte of the deleted profile', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'rb-wipe-')), 'app.db');
  const db = createTestDb(file);
  await openDatabase(db);
  const draft = FIXTURES['stress-en'].draft;
  await seedMaster(db, draft);
  const name = draft.profile.fullName as string;
  const email = draft.profile.email as string;
  expect(readFileSync(file).includes(name)).toBe(true);
  await wipeAllData(db);
  const bytes = readFileSync(file);
  expect(bytes.includes(name)).toBe(false);
  expect(bytes.includes(email)).toBe(false);
  expect(await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')).toEqual({ n: 0 });
});
