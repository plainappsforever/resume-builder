// Matching keywords against a version (SPEC §5.4, D39). PURE. Works on the resolved version (resolve.ts), so it sees
// exactly what the document shows — and, for suggestions, what the version hides. Counts only, never a score (D16).
import type { ResolvedEntry, ResolvedVersion } from '../resolve';
import type { SectionKind } from '../types';
import { charLength } from './normalize';
import { acronymPartners } from './skills';
import { PROTECTED, textSegments } from './tokenize';

export type KeywordStatus = 'found' | 'variant' | 'missing';
export type VariantKind = 'stem' | 'compact' | 'acronym';

export type MatchLocation =
  | { kind: 'headline' }
  | { kind: 'summary' }
  | { kind: 'entry'; sectionId: number; sectionKind: SectionKind; sectionTitle: string | null; entryId: number; entryTitle: string };

export type HiddenSuggestion =
  | { kind: 'entry'; sectionId: number; entryId: number; entryTitle: string; sectionHidden: boolean }
  | { kind: 'bullet'; entryId: number; bulletId: number; text: string };

export type HaystackPiece = { text: string; location: MatchLocation };

export type Occurrences = { count: number; exactCount: number; variantKind: VariantKind | null; pieces: number[] };

export type KeywordMatch = Occurrences & {
  term: string;
  tf: number;
  status: KeywordStatus;
  /** Distinct places in the version (headline, summary, entries) in document order. */
  locations: MatchLocation[];
  /** count > max(4, 2 × tf): "used N times — consider fewer". */
  repeated: boolean;
  /** Hidden master content containing the keyword (only for missing and variant keywords). */
  hidden: HiddenSuggestion[];
};

/**
 * D39: {t} plus one-suffix reductions (EN 's/ies/es/s; DE en/n/e/er/s for tokens of ≥ 5 characters). D54: a reduction
 * is kept only when at least 3 characters remain, so short words never meet acronyms: "its" ≠ IT, "HRs" ≠ HR,
 * "goes" ≠ Go, "CSS" ≠ CS, "QAs" ≠ QA (while "APIs" ↔ API, "KPIs" ↔ KPI still meet).
 */
export const MIN_STEM_LENGTH = 3;

export function stems(token: string): Set<string> {
  const out = new Set([token]);
  const add = (stem: string) => {
    if (charLength(stem) >= MIN_STEM_LENGTH) out.add(stem);
  };
  const n = charLength(token);
  if (token.endsWith("'s") && n >= 4) add(token.slice(0, -2));
  if (token.endsWith('ies') && n >= 5) add(token.slice(0, -3) + 'y');
  if (token.endsWith('es') && n >= 4) add(token.slice(0, -2));
  if (token.endsWith('s') && n >= 3) add(token.slice(0, -1));
  if (n >= 5) for (const suffix of ['en', 'n', 'e', 'er', 's']) if (token.endsWith(suffix)) add(token.slice(0, -suffix.length));
  return out;
}

const stemCache = new Map<string, Set<string>>();
function stemsOf(token: string): Set<string> {
  let s = stemCache.get(token);
  if (!s) {
    s = stems(token);
    if (stemCache.size > 5000) stemCache.clear();
    stemCache.set(token, s);
  }
  return s;
}

function sameStem(a: string, b: string): boolean {
  const sa = stemsOf(a);
  for (const x of stemsOf(b)) if (sa.has(x)) return true;
  return false;
}

function seqAt(segment: string[], i: number, want: string[], stem: boolean): boolean {
  if (want.length === 0 || i + want.length > segment.length) return false;
  for (let j = 0; j < want.length; j++) {
    if (stem ? !sameStem(segment[i + j], want[j]) : segment[i + j] !== want[j]) return false;
  }
  return true;
}

/** D58: the compact form drops "-" and "." and spells umlauts out (ä→ae, ö→oe, ü→ue, ß→ss): "Teamfaehigkeit", "NodeJS". */
export function compactForm(text: string): string {
  return text.replace(/[-.]/g, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function compactAt(segment: string[], i: number, target: string): boolean {
  let acc = '';
  for (let m = i; m < segment.length; m++) {
    acc += compactForm(segment[m]);
    if (acc === target) return true;
    if (acc.length >= target.length) return false;
  }
  return false;
}

/** D55: the hyphen parts of a text token ("java-entwicklung" → java, entwicklung); none for protected terms (t-sql). */
function hyphenParts(token: string): string[] | null {
  if (!token.includes('-') || PROTECTED.has(token)) return null;
  const parts = token.split('-').filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

/**
 * D55: the keyword's parts are a contiguous run of a hyphen compound's parts, shorter than the whole compound ("Java" in
 * "Java-Entwicklung", "C++" in "C++-Entwicklung", "IT" in "IT-Support"). `stem` only for one-part keywords.
 */
function partAt(token: string, wantParts: readonly string[], stem: boolean): boolean {
  const parts = hyphenParts(token);
  if (!parts || wantParts.length === 0 || wantParts.length >= parts.length) return false;
  if (stem) return wantParts.length === 1 && parts.some((p) => sameStem(p, wantParts[0]));
  outer: for (let k = 0; k + wantParts.length <= parts.length; k++) {
    for (let j = 0; j < wantParts.length; j++) if (parts[k + j] !== wantParts[j]) continue outer;
    return true;
  }
  return false;
}

type Tokenized = string[][][]; // pieces → segments → lower-case tokens

const tokenizeTexts = (texts: readonly string[]): Tokenized => texts.map((t) => textSegments(t).map((seg) => seg.map((x) => x.low)));

function countIn(term: string, pieces: Tokenized): Occurrences {
  const want = term.split(' ').filter(Boolean);
  const target = compactForm(want.join(''));
  const wantParts = want.join('-').split('-').filter(Boolean);
  const partners = acronymPartners(term).map((p) => p.split(' '));
  let count = 0;
  let exactCount = 0;
  let variantKind: VariantKind | null = null;
  const hitPieces: number[] = [];
  pieces.forEach((segments, pieceIndex) => {
    let hit = false;
    for (const lows of segments) {
      for (let i = 0; i < lows.length; i++) {
        let kind: VariantKind | 'exact' | null = null;
        if (seqAt(lows, i, want, false) || partAt(lows[i], wantParts, false)) kind = 'exact';
        else if (seqAt(lows, i, want, true) || partAt(lows[i], wantParts, true)) kind = 'stem';
        else if (target !== '' && compactAt(lows, i, target)) kind = 'compact';
        else if (partners.some((p) => seqAt(lows, i, p, false) || seqAt(lows, i, p, true))) kind = 'acronym';
        if (kind === null) continue;
        count++;
        hit = true;
        if (kind === 'exact') exactCount++;
        else variantKind ??= kind;
      }
    }
    if (hit) hitPieces.push(pieceIndex);
  });
  return { count, exactCount, variantKind, pieces: hitPieces };
}

/** Occurrences of a normalised term in some texts: found / variant (stem, compact, acronym) per D39. */
export function countOccurrences(term: string, texts: readonly string[]): Occurrences {
  return countIn(term, tokenizeTexts(texts));
}

function entryTexts(entry: ResolvedEntry, bullets: 'included' | 'all'): string[] {
  const texts = [entry.title, entry.organization, entry.location, entry.description, ...Object.values(entry.extra)];
  for (const b of entry.bullets) if (bullets === 'all' || b.included) texts.push(b.text);
  return texts.filter((t) => t.trim() !== '');
}

/** The visible text of a version (D39): headline, summary, included entries of included sections. */
export function versionHaystack(resolved: ResolvedVersion): HaystackPiece[] {
  const pieces: HaystackPiece[] = [];
  if (resolved.headline.trim()) pieces.push({ text: resolved.headline, location: { kind: 'headline' } });
  if (resolved.summary.trim()) pieces.push({ text: resolved.summary, location: { kind: 'summary' } });
  for (const section of resolved.sections) {
    if (!section.included) continue;
    for (const entry of section.entries) {
      if (!entry.included) continue;
      const location: MatchLocation = {
        kind: 'entry',
        sectionId: section.id,
        sectionKind: section.kind,
        sectionTitle: section.title,
        entryId: entry.id,
        entryTitle: entry.title,
      };
      for (const text of entryTexts(entry, 'included')) pieces.push({ text, location });
    }
  }
  return pieces;
}

const sameLocation = (a: MatchLocation, b: MatchLocation) =>
  a.kind === b.kind && (a.kind !== 'entry' || (b.kind === 'entry' && a.entryId === b.entryId));

type HiddenText = { suggestion: HiddenSuggestion; pieces: Tokenized };

/** Hidden master content of this version (entries hidden or in a hidden section; hidden bullets of shown entries). */
function hiddenTexts(resolved: ResolvedVersion): HiddenText[] {
  const out: HiddenText[] = [];
  for (const section of resolved.sections) {
    for (const entry of section.entries) {
      if (!section.included || !entry.included) {
        out.push({
          suggestion: { kind: 'entry', sectionId: section.id, entryId: entry.id, entryTitle: entry.title, sectionHidden: !section.included },
          pieces: tokenizeTexts(entryTexts(entry, 'all')),
        });
        continue;
      }
      for (const bullet of entry.bullets)
        if (!bullet.included && bullet.text.trim())
          out.push({ suggestion: { kind: 'bullet', entryId: entry.id, bulletId: bullet.id, text: bullet.text }, pieces: tokenizeTexts([bullet.text]) });
    }
  }
  return out;
}

export function isRepeated(count: number, tf: number): boolean {
  return count > Math.max(4, 2 * tf);
}

/** Matches every keyword against the version; `tf` = the keyword's count in the job ad. */
export function matchKeywords(keywords: readonly { term: string; tf: number }[], resolved: ResolvedVersion): KeywordMatch[] {
  const haystack = versionHaystack(resolved);
  const pieces = tokenizeTexts(haystack.map((p) => p.text));
  let hidden: HiddenText[] | null = null; // tokenised once, only if a keyword is missing or a variant
  return keywords.map(({ term, tf }) => {
    const occ = countIn(term, pieces);
    const status: KeywordStatus = occ.exactCount > 0 ? 'found' : occ.count > 0 ? 'variant' : 'missing';
    const locations: MatchLocation[] = [];
    for (const i of occ.pieces) {
      const loc = haystack[i].location;
      if (!locations.some((l) => sameLocation(l, loc))) locations.push(loc);
    }
    if (status !== 'found') hidden ??= hiddenTexts(resolved);
    return {
      term,
      tf,
      status,
      ...occ,
      locations,
      repeated: isRepeated(occ.count, tf),
      hidden: status === 'found' ? [] : (hidden as HiddenText[]).filter((h) => countIn(term, h.pieces).count > 0).map((h) => h.suggestion),
    };
  });
}

export type MatchSummary = { found: number; variants: number; missing: number; shown: number };

/** "Found 14 · Variants 3 · Missing 8 of the 25 shown" — counts, no percentage (D16). */
export function summarizeMatches(matches: readonly KeywordMatch[]): MatchSummary {
  return {
    found: matches.filter((m) => m.status === 'found').length,
    variants: matches.filter((m) => m.status === 'variant').length,
    missing: matches.filter((m) => m.status === 'missing').length,
    shown: matches.length,
  };
}
