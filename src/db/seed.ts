// Writes a MasterDraft (fixtures, example data P2/P4, debug seed links) into the database in ONE transaction.
import type { MasterDraft } from '@/engine/types';

import { addBullets } from './bullets';
import { addEntry } from './entries';
import { addLink, updateProfile } from './profile';
import { addSection } from './sections';
import { withTransaction } from './tx';
import type { Db } from './types';

export type SeededIds = { sections: number[]; entries: number[][]; bullets: number[][][] };

/** Appends the draft's sections after any existing ones; the profile fields in the draft overwrite. */
export function seedMaster(db: Db, draft: MasterDraft, now = Date.now()): Promise<SeededIds> {
  return withTransaction(db, async (tx) => {
    await updateProfile(tx, draft.profile, now);
    for (const link of draft.links ?? []) await addLink(tx, link);
    const ids: SeededIds = { sections: [], entries: [], bullets: [] };
    for (const section of draft.sections) {
      const sectionId = await addSection(tx, section.kind, section.customTitle ?? null);
      const entryIds: number[] = [];
      const bulletIds: number[][] = [];
      for (const { bullets = [], ...fields } of section.entries) {
        const entryId = await addEntry(tx, sectionId, fields, now);
        entryIds.push(entryId);
        bulletIds.push(await addBullets(tx, entryId, bullets, now));
      }
      ids.sections.push(sectionId);
      ids.entries.push(entryIds);
      ids.bullets.push(bulletIds);
    }
    return ids;
  });
}
