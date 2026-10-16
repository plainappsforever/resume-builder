// The keyword list a version shows (SPEC §5.3 step 7, D38): the ad's extraction merged with the user's stored
// choices (version_keywords: pinned, ignored, added). PURE.
import { countInAd, SHOWN_KEYWORDS, type ExtractedKeyword, type Extraction } from './extract';
import { normalizeTerm } from './tokenize';

export type StoredKeyword = { term: string; source: 'auto' | 'added'; state: 'normal' | 'pinned' | 'ignored' };

export type KeywordItem = {
  term: string;
  tf: number;
  source: 'auto' | 'added';
  state: 'normal' | 'pinned' | 'ignored';
  /** Extraction details (snippet, requirements, dictionary); null for an added phrase the ad does not yield. */
  extracted: ExtractedKeyword | null;
};

export type KeywordList = {
  /** Pinned first, then the user's own phrases, then the ad's keywords in order — at most SHOWN_KEYWORDS. */
  shown: KeywordItem[];
  /** "Show all": the rest, same order. */
  more: KeywordItem[];
  ignored: KeywordItem[];
};

export function buildKeywordList(ad: string, extraction: Extraction, stored: readonly StoredKeyword[]): KeywordList {
  const byTerm = new Map(extraction.keywords.map((k) => [k.term, k]));
  const storedByTerm = new Map(stored.map((s) => [normalizeTerm(s.term), s]));
  const item = (term: string): KeywordItem => {
    const s = storedByTerm.get(term);
    const extracted = byTerm.get(term) ?? null;
    return {
      term,
      tf: extracted?.tf ?? countInAd(ad, term),
      source: s?.source ?? 'auto',
      state: s?.state ?? 'normal',
      extracted,
    };
  };
  const pinned = stored.filter((s) => s.state === 'pinned').map((s) => item(normalizeTerm(s.term)));
  const added = stored.filter((s) => s.source === 'added' && s.state === 'normal').map((s) => item(normalizeTerm(s.term)));
  const taken = new Set([...pinned, ...added].map((i) => i.term));
  const ignoredTerms = new Set(stored.filter((s) => s.state === 'ignored').map((s) => normalizeTerm(s.term)));
  const auto = extraction.keywords.filter((k) => !taken.has(k.term) && !ignoredTerms.has(k.term)).map((k) => item(k.term));
  const ordered = [...pinned, ...added, ...auto];
  return {
    shown: ordered.slice(0, SHOWN_KEYWORDS),
    more: ordered.slice(SHOWN_KEYWORDS),
    ignored: [...ignoredTerms].map(item),
  };
}

/** The automatic terms worth storing (D38): the shown ones; "Show all" is recomputed from the ad. */
export function autoTermsToStore(extraction: Extraction): string[] {
  return extraction.keywords.slice(0, SHOWN_KEYWORDS).map((k) => k.term);
}
