// Loads the master and a version's deviations from the database and resolves them (SPEC §5.1). Screens, renderer,
// checks and matcher get version content only through here (resolve.ts).
import { resolve, resolveVersion, type RenderModel, type ResolvedVersion } from '@/engine/resolve';
import type { Master, VersionState } from '@/engine/types';

import { listBullets } from './bullets';
import { listEntries } from './entries';
import { NotFoundError } from './errors';
import { getProfile, listLinks } from './profile';
import { listSections } from './sections';
import { withRead } from './tx';
import type { Db } from './types';
import { parseOverrides } from './version-items';
import { getVersion } from './versions';

export function loadMaster(db: Db): Promise<Master> {
  return withRead(db, async (db) => {
    const [profile, links, sections, entries, bullets] = await Promise.all([
      getProfile(db),
      listLinks(db),
      listSections(db),
      listEntries(db),
      listBullets(db),
    ]);
    return { profile, links, sections, entries, bullets };
  });
}

export function loadVersionState(db: Db, versionId: number): Promise<VersionState> {
  return withRead(db, async (db) => {
    const version = await getVersion(db, versionId);
    if (!version) throw new NotFoundError('version', versionId);
    const [sections, entries, bullets] = await Promise.all([
      db.getAllAsync<{ section_id: number; included: number; position: number | null; title_override: string | null; page_break_before: number }>(
        'SELECT * FROM version_sections WHERE version_id = ?',
        versionId
      ),
      db.getAllAsync<{ entry_id: number; included: number; position: number | null; override_json: string; seen_master_at: number | null }>(
        'SELECT * FROM version_entries WHERE version_id = ?',
        versionId
      ),
      db.getAllAsync<{ bullet_id: number; included: number; position: number | null; text_override: string | null }>(
        'SELECT * FROM version_bullets WHERE version_id = ?',
        versionId
      ),
    ]);
    return {
      version,
      sections: sections.map((r) => ({
        sectionId: r.section_id,
        included: r.included === 1,
        position: r.position,
        titleOverride: r.title_override,
        pageBreakBefore: r.page_break_before === 1,
      })),
      entries: entries.map((r) => ({
        entryId: r.entry_id,
        included: r.included === 1,
        position: r.position,
        overrides: parseOverrides(r.override_json),
        seenMasterAt: r.seen_master_at,
      })),
      bullets: bullets.map((r) => ({
        bulletId: r.bullet_id,
        included: r.included === 1,
        position: r.position,
        textOverride: r.text_override,
      })),
    };
  });
}

/** Everything the version shows and hides (Content tab, keyword suggestions). */
export function loadResolvedVersion(db: Db, versionId: number): Promise<ResolvedVersion> {
  return withRead(db, async (db) => {
    const [master, state] = await Promise.all([loadMaster(db), loadVersionState(db, versionId)]);
    return resolveVersion(master, state);
  });
}

/** The visible document (renderer, checks, export snapshot). */
export function loadRenderModel(db: Db, versionId: number): Promise<RenderModel> {
  return withRead(db, async (db) => {
    const [master, state] = await Promise.all([loadMaster(db), loadVersionState(db, versionId)]);
    return resolve(master, state);
  });
}
