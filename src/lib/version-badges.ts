// Home library: how many entries of a version are new or changed in the master (D31). PURE.
import type { ResolvedVersion } from '@/engine/resolve';

export type VersionBadges = { newEntries: number; changedEntries: number; edited: boolean };

/** Counts only what the version shows: included sections and included entries. */
export function versionBadges(resolved: ResolvedVersion): VersionBadges {
  let newEntries = 0;
  let changedEntries = 0;
  let edited = resolved.headlineOverridden || resolved.summaryOverridden;
  for (const s of resolved.sections) {
    if (s.titleOverridden) edited = true;
    if (!s.included) continue;
    for (const e of s.entries) {
      if (e.overridden) edited = true;
      if (!e.included) continue;
      if (e.newSinceExport) newEntries++;
      else if (e.masterChanged) changedEntries++;
    }
  }
  return { newEntries, changedEntries, edited };
}
