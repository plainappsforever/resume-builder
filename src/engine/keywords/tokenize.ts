// Tokens and segments (SPEC §5.3 steps 2–3, D37). PURE. Shared by extraction and matching, so both see the same
// tokens: the SPEC token regex, protected terms (C++, C#, .NET, CI/CD, S/4HANA …) kept whole, "/" splits other
// tokens, a trailing stop-word part of a hyphen compound is dropped ("KNX-Kenntnisse" → knx), and phrases never
// cross a segment (line break, sentence end, bullet, comma, bracket, pipe, quote).
import skills from './skills.json';
import { charLength, isLetter, linesOf, normalizeText } from './normalize';
import { STOP_WORDS } from './stopwords';

export type Token = {
  /** As written (after normalisation), original case. */
  text: string;
  /** Lower case: the form used for every comparison. */
  low: string;
  /** Written in capitals ("IT", "HR"). */
  caps: boolean;
  /** Number of letters. */
  letters: number;
};

export const PROTECTED: ReadonlySet<string> = new Set(skills.protected.map((p) => normalizeText(p).toLowerCase()));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DOT_PROTECTED = [...PROTECTED].filter((p) => p.startsWith('.')).sort((a, b) => b.length - a.length);

/** SPEC regex, preceded by the protected terms that start with "." (the regex cannot start a token there). */
const TOKEN_RE = new RegExp(
  (DOT_PROTECTED.length ? `(?<![\\p{L}\\p{N}])(?:${DOT_PROTECTED.map(escapeRe).join('|')})(?![\\p{L}\\p{N}+#])|` : '') +
    "[\\p{L}\\p{N}][\\p{L}\\p{N}+#./&'-]*[\\p{L}\\p{N}+#]|[\\p{L}\\p{N}]",
  'giu'
);

const BULLETS = '•◦▪▫‣⁃●○■□►▶➢➤✓✔·*';
const BOUNDARIES = ',()[]{}|"';
const SEGMENT_CHARS = new Set([...BULLETS, ...BOUNDARIES]);
const SENTENCE_END = new Set(['.', '!', '?', ';', ':']);

function rawTokens(segment: string): string[] {
  return [...segment.matchAll(TOKEN_RE)].map((m) => m[0]);
}

function postProcess(token: string): string[] {
  const t = token.replace(/[.,]+$/, '');
  if (!t) return [];
  if (PROTECTED.has(t.toLowerCase())) return [t];
  // D56: a "/" part starting with "-" is an elided compound tail ("Pflegefachfrau/-mann", "Krankenpfleger/-in"): dropped.
  if (t.includes('/')) return t.split('/').filter((part) => !part.startsWith('-')).flatMap((part) => rawTokens(part).flatMap(postProcess));
  if (t.includes('-')) {
    const parts = t.split('-');
    const last = parts[parts.length - 1];
    // D37 tail drop, D56: only a tail of ≥ 3 characters (a boilerplate word, not "on"/"a": "hands-on", "EX-A" stay whole).
    if (parts.length >= 2 && charLength(last) >= 3 && STOP_WORDS.has(last.toLowerCase())) return [parts.slice(0, -1).join('-')];
  }
  return [t];
}

function makeToken(text: string): Token {
  // D58: "İ".toLowerCase() is "i" + U+0307; the dot is dropped so "İstanbul" equals "Istanbul".
  const low = text.toLowerCase().replace(/i\u0307/g, 'i');
  const letters = [...text].filter(isLetter).length;
  return { text, low, caps: letters > 0 && text === text.toUpperCase() && text !== low, letters };
}

/** Splits one (normalised) line into segment strings. */
export function splitSegments(line: string): string[] {
  const segments: string[] = [];
  let current = '';
  const chars = [...line];
  chars.forEach((ch, i) => {
    if (SEGMENT_CHARS.has(ch) || (SENTENCE_END.has(ch) && (i + 1 === chars.length || /\s/.test(chars[i + 1])))) {
      segments.push(current);
      current = '';
    } else current += ch;
  });
  segments.push(current);
  return segments;
}

/** Non-empty token segments of one normalised line. */
export function lineSegments(line: string): Token[][] {
  return splitSegments(line)
    .map((segment) => rawTokens(segment).flatMap(postProcess).map(makeToken))
    .filter((tokens) => tokens.length > 0);
}

/** All token segments of a text (any number of lines). */
export function textSegments(text: string): Token[][] {
  return linesOf(text).flatMap(lineSegments);
}

/** A phrase (keyword, skill, user-added term) → its lower-case tokens, segments joined. */
export function phraseTokens(text: string): string[] {
  return textSegments(text).flatMap((segment) => segment.map((t) => t.low));
}

/** The stored form of a keyword: lower-case tokens joined by one space ("Projekt-Management" → "projekt-management"). */
export function normalizeTerm(text: string): string {
  return phraseTokens(text).join(' ');
}
