// Keyword extraction from a job ad (SPEC §5.3, D37, D38, D42, D43). PURE and deterministic: the same ad always gives
// the same list, so only the user's choices (pin/ignore/add) need storing. No score is ever shown to the user (D16):
// `score` only orders the list; the UI shows tf, "listed under requirements" and "known skill".
import { charLength, linesOf } from './normalize';
import { isSkill } from './skills';
import { FUNCTION_WORDS_DE, FUNCTION_WORDS_EN, LEGAL_FORMS, STOP_WORDS } from './stopwords';
import { lineSegments, PROTECTED, textSegments, type Token } from './tokenize';

export const MAX_AD_LENGTH = 50_000;
export const SHOWN_KEYWORDS = 25;
const SNIPPET_LENGTH = 120;

/** Lines that start a requirements block (D38), compared without leading bullets/# and the trailing colon. */
export const REQUIREMENT_HEADINGS: ReadonlySet<string> = new Set([
  'requirements',
  'qualifications',
  'what you bring',
  'must have',
  'must-have',
  'must haves',
  'nice to have',
  'nice-to-have',
  'skills',
  'your profile',
  'anforderungen',
  'ihr profil',
  'dein profil',
  'das bringst du mit',
  'qualifikationen',
]);

/**
 * D57: headings that end a requirements block without being requirements. Benefits headings start a benefits block
 * (its words weigh less); the others (tasks, about us, contact) are neutral. Matched with or without a colon, and as an
 * inline prefix ("Benefits: remote-first, learning budget").
 */
export const BENEFIT_HEADINGS: ReadonlySet<string> = new Set([
  'benefits',
  'perks',
  'what we offer',
  'we offer',
  'our offer',
  'what you get',
  "what's in it for you",
  'why join us',
  'why us',
  'wir bieten',
  'wir bieten dir',
  'wir bieten ihnen',
  'was wir bieten',
  'das bieten wir',
  'unser angebot',
  'deine vorteile',
  'ihre vorteile',
  'deine benefits',
  'ihre benefits',
]);
export const OTHER_HEADINGS: ReadonlySet<string> = new Set([
  'about the role',
  'the role',
  'your role',
  'your tasks',
  'tasks',
  'responsibilities',
  'your responsibilities',
  'key responsibilities',
  "what you'll do",
  'what you will do',
  'deine aufgaben',
  'ihre aufgaben',
  'aufgaben',
  'dein aufgabengebiet',
  'ihr aufgabengebiet',
  'deine rolle',
  'ihre rolle',
  'was dich erwartet',
  'was sie erwartet',
]);
/**
 * v1.1 (D94): headings of the employer's own text (about us, contact, how to apply). Their words — and those of the intro
 * before the first heading — weigh less than tasks: the company's name, city and self-description are rarely what the
 * resume should contain (REVIEW_V1 #7).
 */
export const COMPANY_HEADINGS: ReadonlySet<string> = new Set([
  'about us',
  'who we are',
  'the company',
  'about the company',
  'contact',
  'how to apply',
  'über uns',
  'wer wir sind',
  'das unternehmen',
  'kontakt',
  'so bewirbst du dich',
]);


type Zone = 'requirements' | 'benefits' | 'company' | null;

/** D57 + D94: weight of a zone (× 4 of the score): requirements 1.5, tasks/other 1, company text 0.75, benefits 0.5. */
const ZONE_WEIGHT = { requirements: 6, other: 4, company: 3, benefits: 2 } as const;
const zoneWeight = (z: Zone) => ZONE_WEIGHT[z ?? 'other'];

/** D38 + D57: the block a heading line starts (undefined = the line is not a known heading). */
function headingZone(line: string): Zone | undefined {
  const keys = [headingKey(line)];
  const colon = line.indexOf(':');
  if (colon > 0 && charLength(line.slice(0, colon).trim()) <= 40) keys.push(headingKey(line.slice(0, colon)));
  for (const key of keys) {
    if (REQUIREMENT_HEADINGS.has(key)) return 'requirements';
    if (BENEFIT_HEADINGS.has(key)) return 'benefits';
    if (COMPANY_HEADINGS.has(key)) return 'company';
    if (OTHER_HEADINGS.has(key)) return null;
  }
  return undefined;
}

/** Middle tokens that make a 3-gram an enumeration rather than a phrase (D42). */
const CONJUNCTIONS: ReadonlySet<string> = new Set(['and', 'or', 'und', 'oder', 'sowie', 'bzw', '&']);

export type ExtractedKeyword = {
  /** Normalised phrase (lower-case tokens joined by a space). */
  term: string;
  /** Number of tokens (1–3). */
  n: number;
  /** Occurrences in the ad. */
  tf: number;
  /** Ordering weight tf × wPos × wDict (SPEC step 5) — never shown. */
  score: number;
  inRequirements: boolean;
  inDictionary: boolean;
  /** Token index of the first occurrence. */
  firstIndex: number;
  /** The ad line of the first occurrence (≤ 120 characters). */
  snippet: string;
};

export type AdLanguage = 'en' | 'de' | 'mixed' | null;

export type Extraction = {
  /** All keywords in display order; the first SHOWN_KEYWORDS are shown, the rest under "Show all". */
  keywords: ExtractedKeyword[];
  /** The ad was longer than MAX_AD_LENGTH and was cut there. */
  truncated: boolean;
  language: AdLanguage;
};

function isStop(token: Token): boolean {
  if (!STOP_WORDS.has(token.low)) return false;
  // D37: "IT", "HR", "QA" written in capitals are skills, "it" is a pronoun.
  return !(token.caps && token.letters >= 2 && token.letters <= 4 && isSkill(token.low));
}

/** Unigram candidate / allowed first and last token of a phrase (D37). */
export function isEligible(token: Token): boolean {
  return token.letters > 0 && (charLength(token.low) >= 2 || PROTECTED.has(token.low)) && !isStop(token);
}

export function headingKey(line: string): string {
  return line
    .trim()
    .replace(/^(?:[#*\-•◦▪▫‣⁃●○■□►▶➢➤✓✔·]\s*)+/u, '')
    .replace(/\s*:+\s*$/, '')
    .replace(/(?:\s*:)+$/, '')
    .trim()
    .toLowerCase();
}

function snippetOf(line: string, firstToken: string): string {
  const clean = line.replace(/\s+/g, ' ').trim();
  if (charLength(clean) <= SNIPPET_LENGTH) return clean;
  const chars = [...clean];
  const at = Math.max(0, [...clean.toLowerCase().slice(0, Math.max(0, clean.toLowerCase().indexOf(firstToken)))].length);
  const start = Math.max(0, Math.min(at - 40, chars.length - SNIPPET_LENGTH));
  const body = chars.slice(start, start + SNIPPET_LENGTH).join('').trim();
  return (start > 0 ? '…' : '') + body + (start + SNIPPET_LENGTH < chars.length ? '…' : '');
}

/** EN vs DE function words (D38); used for the "ad is in another language" note. */
export function detectLanguage(segments: Token[][]): AdLanguage {
  let en = 0;
  let de = 0;
  for (const segment of segments)
    for (const t of segment) {
      const isEn = FUNCTION_WORDS_EN.has(t.low);
      const isDe = FUNCTION_WORDS_DE.has(t.low);
      if (isEn && !isDe) en++;
      if (isDe && !isEn) de++;
    }
  if (en === 0 && de === 0) return null;
  if (en >= 2 * de) return 'en';
  if (de >= 2 * en) return 'de';
  return 'mixed';
}

/** Cuts at MAX_AD_LENGTH UTF-16 code units without splitting a surrogate pair. */
function truncate(ad: string): { text: string; truncated: boolean } {
  if (ad.length <= MAX_AD_LENGTH) return { text: ad, truncated: false };
  let cut = MAX_AD_LENGTH;
  const code = ad.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut--;
  return { text: ad.slice(0, cut), truncated: true };
}

/** D55: the longest run of leading hyphen parts that is a skill-list term, when the whole token is not one. */
export function compoundHead(low: string): string | null {
  if (!low.includes('-') || PROTECTED.has(low) || isSkill(low)) return null;
  const parts = low.split('-');
  for (let j = parts.length - 1; j >= 1; j--) {
    const head = parts.slice(0, j).join('-');
    if (head && isSkill(head)) return head;
  }
  return null;
}

type Occurrence = { start: number; end: number; zone: Zone };
type Candidate = { term: string; tokens: string[]; n: number; occ: Occurrence[]; line: number };

/**
 * v1.1 (D94): words that name the employer: up to three capitalised words right before a legal form on the same line
 * ("Brenner GmbH", "Riverbend Packaging, Inc."), and the words of the resume's target company. Skill-list words never
 * count as a name ("SAP SE" keeps SAP).
 */
export function employerTokens(lines: readonly string[], company = ''): Set<string> {
  const names = new Set<string>();
  const isNameWord = (t: Token) => /^\p{Lu}/u.test(t.text) && t.letters > 0 && !STOP_WORDS.has(t.low) && !isSkill(t.low);
  for (const line of lines) {
    const toks = lineSegments(line).flat();
    toks.forEach((t, i) => {
      if (!LEGAL_FORMS.has(t.low)) return;
      let j = i - 1;
      while (j >= 0 && (LEGAL_FORMS.has(toks[j].low) || toks[j].low === '&')) j--;
      for (let k = 0; k < 3 && j >= 0 && isNameWord(toks[j]); k++, j--) names.add(toks[j].low);
    });
  }
  for (const t of textSegments(company).flat()) if (t.letters > 0 && !STOP_WORDS.has(t.low) && !isSkill(t.low)) names.add(t.low);
  return names;
}

export type ExtractOptions = {
  /** The resume's target company (D94): its words are never keywords. */
  company?: string | null;
};

export function extractKeywords(ad: string, options: ExtractOptions = {}): Extraction {
  const { text, truncated } = truncate(ad);
  const lines = linesOf(text);
  const candidates = new Map<string, Candidate>();
  const allSegments: Token[][] = [];
  // D94: the intro before the first heading is the employer's text (weighs like "about us") — except the first line,
  // which is usually the job title ("Frontend Engineer, Accessibility Focus").
  let zone: Zone = 'company';
  let titleSeen = false;
  let index = 0;
  const add = (term: string, tokens: string[], n: number, occurrence: Occurrence, line: number) => {
    const existing = candidates.get(term);
    if (existing) existing.occ.push(occurrence);
    else candidates.set(term, { term, tokens, n, occ: [occurrence], line });
  };

  lines.forEach((line, lineNo) => {
    const trimmed = line.trim();
    const heading = headingZone(line);
    if (heading !== undefined) zone = heading;
    else if (charLength(trimmed) <= 40 && trimmed.endsWith(':')) zone = null;
    const lineZone: Zone = !titleSeen && trimmed !== '' && heading === undefined && zone === 'company' ? null : zone;
    if (trimmed !== '') titleSeen = true;
    for (const segment of lineSegments(line)) {
      allSegments.push(segment);
      for (let s = 0; s < segment.length; s++) {
        for (let n = 1; n <= 3 && s + n <= segment.length; n++) {
          const toks = segment.slice(s, s + n);
          const term = toks.map((t) => t.low).join(' ');
          let ok: boolean;
          if (n === 1) ok = isEligible(toks[0]);
          else if (isSkill(term)) ok = true;
          else ok = isEligible(toks[0]) && isEligible(toks[n - 1]) && !(n === 3 && CONJUNCTIONS.has(toks[1].low));
          if (!ok) continue;
          const occurrence = { start: index + s, end: index + s + n, zone: lineZone };
          add(term, toks.map((t) => t.low), n, occurrence, lineNo);
          // D55: the head of a hyphen compound counts when it is a skill-list term ("ITIL-Grundkenntnisse" → itil,
          // "Java-Entwicklung" → java), longest skill-list head first; the whole compound stays a candidate too.
          if (n === 1) {
            const head = compoundHead(toks[0].low);
            if (head) add(head, [head], 1, { ...occurrence }, lineNo);
          }
        }
      }
      index += segment.length;
    }
  });

  // D43: spans of skill-list phrases (≤ 3 tokens), indexed by start, to drop fragments that never occur on their own.
  const dictEnds = new Map<number, number[]>();
  for (const c of candidates.values())
    if (isSkill(c.term))
      for (const o of c.occ) {
        const ends = dictEnds.get(o.start);
        if (ends) ends.push(o.end);
        else dictEnds.set(o.start, [o.end]);
      }
  const isCovered = (o: Occurrence) => {
    for (let st = o.start - 2; st <= o.start; st++)
      for (const end of dictEnds.get(st) ?? []) if (end >= o.end && end - st > o.end - o.start) return true;
    return false;
  };

  // SPEC step 6: longer candidates indexed by every shorter contiguous run they contain.
  const containers = new Map<string, Candidate[]>();
  for (const y of candidates.values())
    for (let len = 1; len < y.n; len++)
      for (let i = 0; i + len <= y.n; i++) {
        const sub = y.tokens.slice(i, i + len).join(' ');
        const list = containers.get(sub);
        if (!list) containers.set(sub, [y]);
        else if (!list.includes(y)) list.push(y);
      }
  const employer = employerTokens(lines, options.company ?? '');
  const kept = [...candidates.values()].filter((x) => {
    const tf = x.occ.length;
    // D94: the employer's name is not a keyword (also not in "Show all").
    if (x.tokens.every((t) => employer.has(t))) return false;
    // D57: a phrase that is not a skill-list term must occur twice ("apprenticeship as freight", "anderen praxissoftware").
    if (x.n >= 2 && tf === 1 && !isSkill(x.term)) return false;
    if (x.n > 2) return true;
    if (!isSkill(x.term) && x.occ.every(isCovered)) return false;
    return !(containers.get(x.term) ?? []).some((y) => y.occ.length === tf && (tf >= 2 || isSkill(y.term)));
  });

  const keywords = kept
    .map((c): ExtractedKeyword & { weight: number } => {
      const tf = c.occ.length;
      const inRequirements = c.occ.some((o) => o.zone === 'requirements');
      const inDictionary = isSkill(c.term);
      // tf × wPos × wDict with wPos = the best zone of its occurrences: 1.5 (requirements) / 1 (tasks, other) / 0.75 (only
      // in the employer's text, D94) / 0.5 (only in benefits, D57) and wDict 3/1, kept as an integer (× 4) for exact ties.
      const weight = tf * Math.max(...c.occ.map((o) => zoneWeight(o.zone))) * (inDictionary ? 3 : 1);
      return {
        term: c.term,
        n: c.n,
        tf,
        score: weight / 4,
        inRequirements,
        inDictionary,
        firstIndex: Math.min(...c.occ.map((o) => o.start)),
        snippet: snippetOf(lines[c.line], c.tokens[0]),
        weight,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.firstIndex - b.firstIndex || b.n - a.n || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0))
    .map(({ weight: _weight, ...k }) => k);

  return { keywords, truncated, language: detectLanguage(allSegments) };
}

/** Exact occurrences of a phrase in the ad (any position): the tf shown for a user-added keyword. */
export function countInAd(ad: string, term: string): number {
  const want = term.split(' ').filter(Boolean);
  if (want.length === 0) return 0;
  let count = 0;
  for (const line of linesOf(truncate(ad).text))
    for (const segment of lineSegments(line))
      for (let i = 0; i + want.length <= segment.length; i++) if (want.every((w, j) => segment[i + j].low === w)) count++;
  return count;
}
