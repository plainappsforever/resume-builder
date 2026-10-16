/**
 * @jest-environment node
 */
// Example profiles (SPEC §6 "Look at an example", D21, D41) seeded through the real data functions: they must load,
// resolve, pass every check that needs attention, and show what the Job tab is for (found keywords + a hidden entry).
import { runChecks } from '@/engine/checks';
import { SAMPLE_PROFILES } from '@/engine/content/sample-profiles';
import { extractKeywords } from '@/engine/keywords/extract';
import { matchKeywords, summarizeMatches } from '@/engine/keywords/match';
import { LANGS } from '@/engine/types';

import { createTestDb } from '../../test/node-sqlite-db';
import { loadRenderModel, loadResolvedVersion } from './load';
import { openDatabase } from './migrations';
import { seedMaster } from './seed';
import { setBulletIncluded, setEntryIncluded, setSectionIncluded } from './version-items';
import { createVersion } from './versions';

const NOW = Date.UTC(2026, 9, 1, 12);

async function seedSample(lang: 'en' | 'de') {
  const db = createTestDb();
  await openDatabase(db);
  const sample = SAMPLE_PROFILES[lang];
  const ids = await seedMaster(db, sample.master, NOW);
  const versionIds: number[] = [];
  for (const v of sample.versions) {
    const id = await createVersion(db, { ...v, isExample: true }, NOW + 1_000);
    for (const s of v.hiddenSections) await setSectionIncluded(db, id, ids.sections[s], false, NOW + 1_000);
    for (const [s, e] of v.hiddenEntries) await setEntryIncluded(db, id, ids.entries[s][e], false, NOW + 1_000);
    for (const [s, e, b] of v.hiddenBullets) await setBulletIncluded(db, id, ids.bullets[s][e][b], false, NOW + 1_000);
    versionIds.push(id);
  }
  return { db, versionIds, sample };
}

describe.each(LANGS)('example profile %s', (lang) => {
  it('seeds, resolves and has no check that needs attention or warns', async () => {
    const { db, versionIds } = await seedSample(lang);
    for (const id of versionIds) {
      const model = await loadRenderModel(db, id);
      expect(model.person.fullName).not.toBe('');
      expect(model.droppedSections).toEqual([]);
      const serious = runChecks(model, { today: { year: 2026, month: 10 } }).flatMap((r) =>
        r.findings.filter((f) => f.severity !== 'info').map((f) => `${r.id}:${f.code}`)
      );
      expect([id, serious]).toEqual([id, []]);
    }
  });

  it('the tailored version finds most of its ad’s keywords', async () => {
    const { db, versionIds, sample } = await seedSample(lang);
    const tailored = sample.versions[1];
    const extraction = extractKeywords(tailored.jobAd);
    const shown = extraction.keywords.slice(0, 25);
    const matches = matchKeywords(shown, await loadResolvedVersion(db, versionIds[1]));
    const summary = summarizeMatches(matches);
    expect(summary.shown).toBe(shown.length);
    // The ad's known skills and tools are what the example is tailored for: at least 3 in 4 are there.
    const skills = matches.filter((m, i) => shown[i].inDictionary);
    expect(skills.length).toBeGreaterThanOrEqual(5);
    expect(skills.filter((m) => m.status !== 'missing').length / skills.length).toBeGreaterThanOrEqual(0.75);
    expect(extraction.language).toBe(lang);
  });
});

it('EN: the Job tab suggests the hidden volunteer section for "route planning"', async () => {
  const { db, versionIds } = await seedSample('en');
  const [m] = matchKeywords([{ term: 'route planning', tf: 1 }], await loadResolvedVersion(db, versionIds[1]));
  expect(m.status).toBe('missing');
  expect(m.hidden).toEqual([expect.objectContaining({ kind: 'entry', entryTitle: 'Route planning volunteer', sectionHidden: true })]);
});
