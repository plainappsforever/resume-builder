// What the Job tab shows (SPEC §5.3–5.4, D38/D39): the ad's keywords merged with the user's choices (list.ts), each matched
// against the resolved version (match.ts). PURE: counts only, never a score or a percentage (D16).
import type { ResolvedVersion } from '../resolve';
import type { Lang } from '../types';
import { extractKeywords } from './extract';
import { buildKeywordList, type KeywordItem, type StoredKeyword } from './list';
import { matchKeywords, summarizeMatches, type KeywordMatch, type MatchSummary } from './match';

export type JobRow = { item: KeywordItem; match: KeywordMatch };
export type JobFilter = 'all' | 'found' | 'variant' | 'missing';

export type JobView = {
  /** No ad text: the tab explains instead of listing. */
  empty: boolean;
  truncated: boolean;
  /** Set when the ad is clearly in the other language than the version (both stop-word lists apply anyway). */
  languageNote: { adLanguage: Lang; versionLanguage: Lang } | null;
  /** The first 25: pinned, own phrases, then the ad's keywords in order. */
  shown: JobRow[];
  /** "Show all": the rest. */
  more: JobRow[];
  ignored: JobRow[];
  /** Over the shown rows: found · variants · missing of N. */
  summary: MatchSummary;
};

/** `company` = the resume's target company: its words are never listed (D94). */
export function buildJobView(ad: string, stored: readonly StoredKeyword[], resolved: ResolvedVersion, company?: string | null): JobView {
  const extraction = extractKeywords(ad, { company });
  const list = buildKeywordList(ad, extraction, stored);
  const all = [...list.shown, ...list.more, ...list.ignored];
  const matches = matchKeywords(all.map((i) => ({ term: i.term, tf: i.tf })), resolved);
  const rows = all.map((item, i): JobRow => ({ item, match: matches[i] }));
  const shown = rows.slice(0, list.shown.length);
  const adLanguage = extraction.language;
  return {
    empty: ad.trim() === '',
    truncated: extraction.truncated,
    languageNote: (adLanguage === 'en' || adLanguage === 'de') && adLanguage !== resolved.language ? { adLanguage, versionLanguage: resolved.language } : null,
    shown,
    more: rows.slice(list.shown.length, list.shown.length + list.more.length),
    ignored: rows.slice(list.shown.length + list.more.length),
    summary: summarizeMatches(shown.map((r) => r.match)),
  };
}

export function filterRows(rows: readonly JobRow[], filter: JobFilter): JobRow[] {
  return filter === 'all' ? [...rows] : rows.filter((r) => r.match.status === filter);
}

/** A stable id fragment for a term (Maestro/testIDs): lower-case letters and digits, other runs → "-". */
export function termSlug(term: string): string {
  return term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'term';
}
