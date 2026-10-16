// Read-back comparison (SPEC §5.7, D15) — the proof that the exported PDF's text layer says what the document says,
// in the same order. PURE (runs in Jest, in the Node referee and in the app).
//
// Input: the expected lines E from the renderer and what a reader (pdf.js) returned: text items per page IN THE
// ORDER THE READER RETURNS THEM (never re-sorted: a parser reads that order too), joined into lines by position.
// Honest output (L26): what was read back (the text per page, and the document lines in the order they were found),
// which words are missing or extra, which lines moved or broke apart. Pass = every word found, every line in order,
// no letter-spaced words, no wide gap inside a line (D48), no reading back up the page (D53), every
// e-mail address, phone number and link of a contact line read as one piece on one line (D89). Nothing here says anything about a particular applicant-tracking system.
import type { ExpectedLine, LineRole } from '@/render/expected-lines';

import type { RawExtraction, RawFont, RawItem } from './pdfjs-extract';

// ---- normalisation and words -------------------------------------------------------------------------------------

const DASHES = /[‐-―−﹘﹣－]/g;
const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
const INVISIBLE = /[­​-‍⁠﻿]/g;
/** Bullet and separator characters: dropped for the word comparison. */
const BULLETS = /[•·‣⁃∙●▪◦‧・|]/g;
const WORD = /[\p{L}\p{N}\p{M}]+/gu;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

/** SPEC §5.7 step 1: NFKC (ligatures → letters), case-fold, typographic dashes/quotes → ASCII, bullets out. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(DASHES, '-')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(BULLETS, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words of a text = runs of letters, digits and combining marks after normalisation. Punctuation separates words and
 * is not compared: a line may wrap inside a space-free token at many places ("jordan-|lee", "linkedin.com/|in",
 * 'alert("x")|</script>'), and the reader cannot say whether a space was there — so "C++" counts as the word "c"
 * and a reader that loses a lone "+" or "€" is not detected (C13 covers symbols). A ligature read as "!" still
 * breaks its word ("e", "iziente" ≠ "effiziente") and is detected.
 */
export function words(text: string): string[] {
  return normalizeText(text).match(WORD) ?? [];
}

// ---- contact items (D89) ----------------------------------------------------------------------------------------------

export type ContactKind = 'email' | 'phone' | 'url';
export type ContactToken = { kind: ContactKind; text: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const URL_LIKE = /^(?:https?:\/\/)?[^\s@/]+\.[\p{L}]{2,}(?:[/?#:]\S*)?$/iu;
const PHONE = /^[+(]?\d[\d\s().\/-]*$/u;

/** One contact item: an e-mail address, a phone number (at least 6 digits) or a link; null for anything else (a place). */
export function contactKind(part: string): ContactKind | null {
  const t = part.trim();
  if (EMAIL.test(t)) return 'email';
  if (PHONE.test(t) && (t.match(/\d/g) ?? []).length >= 6) return 'phone';
  if (URL_LIKE.test(t)) return 'url';
  return null;
}

/** The e-mail addresses, phone numbers and links of the document's contact lines (items joined by " · "). */
export function contactTokens(expected: readonly ExpectedLine[]): ContactToken[] {
  return expected
    .filter((l) => l.role === 'contact')
    .flatMap((l) => l.text.split(/\s[·|]\s/))
    .map((text) => ({ text: text.trim(), kind: contactKind(text) }))
    .filter((t): t is ContactToken => t.kind !== null);
}

/** NFKC, invisible characters out, typographic dashes → "-", case-folded; punctuation KEPT (it is what is checked). */
function contactForm(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE, '').replace(DASHES, '-').toLowerCase();
}

/**
 * A contact item came back whole when one read line holds it unbroken: an e-mail or link as part of ONE
 * whitespace-free run (a parser reads it as one token), a phone number with all its characters ("+" included) on
 * one line (its own spaces may vary). Split at a line end, a lost "@", "+" or "/", or a space inside an address = broken.
 */
export function brokenContacts(tokens: readonly ContactToken[], pages: readonly (readonly string[])[]): ContactToken[] {
  const lines = pages.flat().map((l) => contactForm(l).replace(BULLETS, ' '));
  return tokens.filter((t) => {
    const key = contactForm(t.text).replace(/\s+/g, '');
    if (t.kind === 'phone') return !lines.some((l) => l.replace(/\s+/g, '').includes(key));
    return !lines.some((l) => l.split(/\s+/).some((chunk) => chunk.includes(key)));
  });
}

/** True when one read line holds all the words of the document's name line, in order (D90). */
export function nameOnOneLine(expected: readonly ExpectedLine[], pages: readonly (readonly string[])[]): boolean | null {
  const name = expected.find((l) => l.role === 'name');
  const want = name ? words(name.text) : [];
  if (!want.length) return null;
  return pages.flat().some((line) => {
    const got = words(line);
    for (let k = 0; k + want.length <= got.length; k++) if (want.every((w, j) => got[k + j] === w)) return true;
    return false;
  });
}

// ---- items → lines --------------------------------------------------------------------------------------------------

/** A visible gap inside one line, in em of the font height (D48). Our templates stay below 0.3 em (referee). */
export const WIDE_GAP_EM = 1;

export type WideGap = { page: number; before: string; after: string; em: number };

/** Text read after text that sits lower on the same page (D53): the content stream went back up the page. */
export type UpJump = { page: number; before: string; after: string; em: number };

/**
 * Joins a page's items into lines in the reader's order: a new line when the reader marks an end of line or the
 * baseline moves by more than half a line; a space when two items on one line are separated by a visible gap.
 * Whitespace-only items (pdf.js inserts them for gaps, sometimes as ONE item spanning the whole gap) are text but
 * never a position: gaps and baselines are measured from the last item with visible text (D53).
 * Gaps of WIDE_GAP_EM or more inside a line are reported: layout-analysing parsers (Apple PDFKit in the referee)
 * read such lines as separate columns (right-aligned dates, tables, flex rows) even when pdf.js's stream order is
 * right. So is every item whose baseline is more than half a line ABOVE the previous text item on the page
 * ("reading went back up the page"): columns, floats and boxes drawn side by side, which pdf.js reads in stream
 * order while layout-analysing parsers do not (D53).
 */
export function itemsToLayout(items: readonly RawItem[], page = 1): { lines: string[]; gaps: WideGap[]; upJumps: UpJump[] } {
  const lines: string[] = [];
  const gaps: WideGap[] = [];
  const upJumps: UpJump[] = [];
  let current = '';
  let prev: RawItem | null = null;
  const push = () => {
    const line = current.replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
    current = '';
  };
  for (const item of items) {
    const visible = item.s.trim() !== '';
    if (prev && visible) {
      const height = Math.max(1, Math.min(prev.h || item.h, item.h || prev.h));
      const rise = item.y - prev.y;
      if (Math.abs(rise) > height * 0.5) {
        const line = Math.max(1, prev.h, item.h);
        if (rise > line * 0.5) {
          upJumps.push({ page, before: prev.s.trim().slice(-40), after: item.s.trim().slice(0, 40), em: Math.round((rise / line) * 10) / 10 });
        }
        push();
      } else {
        const gap = item.x - (prev.x + prev.w);
        if (current && !/\s$/.test(current) && !/^\s/.test(item.s) && gap > height * 0.15) current += ' ';
        const em = gap / Math.max(1, prev.h, item.h);
        if (em >= WIDE_GAP_EM && current.trim()) {
          gaps.push({ page, before: current.trim().slice(-40), after: item.s.trim().slice(0, 40), em: Math.round(em * 10) / 10 });
        }
      }
    }
    current += item.s;
    if (visible) prev = item;
    if (item.e) push();
  }
  push();
  return { lines, gaps, upJumps };
}

export function itemsToLines(items: readonly RawItem[]): string[] {
  return itemsToLayout(items).lines;
}

// ---- comparison -----------------------------------------------------------------------------------------------------

export type ReadInput = {
  /** "pdf.js 6.3.289", "Apple PDFKit" … */
  reader: string;
  /** Lines per page, in reading order. */
  pages: readonly (readonly string[])[];
  fonts: readonly RawFont[];
  images: number;
  bytes: number;
  /** Wide gaps inside lines (only readers that report positions). */
  gaps?: readonly WideGap[];
  /** Places where reading went back up the page (only readers that report positions, D53). */
  upJumps?: readonly UpJump[];
};

export type LineRef = { index: number; text: string; role: LineRole; page: number | null };

export type ReadbackResult = {
  reader: string;
  pass: boolean;
  words: { expected: number; found: number };
  lines: { total: number; inOrder: number; moved: LineRef[]; split: LineRef[] };
  /** Expected words the reader did not return (distinct, document order, at most 100). */
  missing: string[];
  /** Words the reader returned that the document does not contain (distinct, at most 100) — info only. */
  extras: string[];
  /**
   * Very long words (≥ WRAPPED_WORD_MIN characters, e.g. a URL path) split at a line end by the template's
   * overflow-wrap and joined back for the comparison (D63) — info only: other programs may read two words.
   */
  wrappedWords: string[];
  /** Letter-spaced runs that spell an expected word ("j o r d a n"). */
  spacedLetters: string[];
  /** Lines with a gap of ≥ 1 em between words: other parsers may split them into columns (D48). */
  wideGaps: WideGap[];
  /** Text read after text below it on the same page: columns or side-by-side boxes (D53). Fails like a wide gap. */
  upJumps: UpJump[];
  /** Contact items (e-mail, phone, link) checked as whole tokens, and those not read back as one piece (D89). Fails. */
  contacts: { checked: number; broken: ContactToken[] };
  /** The name came back on ONE read line (parsers often take the first line as the name, D90); null = no name line. Info. */
  nameOnOneLine: boolean | null;
  pages: number;
  /** Words read per page. */
  pageWords: number[];
  bytes: number;
  /** All fonts embedded and none a Type 3 (bitmap-like) font; null = no font information. */
  fontsEmbedded: boolean | null;
  fonts: string[];
  images: number;
  /** Indexes of the expected lines in the order the reader returned them (lines that were not found are absent). */
  readOrder: number[];
  /** What the reader returned, per page (lines joined with "\n"). */
  text: string[];
  checkedAt: number;
};

type ReadWord = { w: string; page: number };

/** D63: only a word at least this long can be split by overflow-wrap (it must be wider than a whole line). */
export const WRAPPED_WORD_MIN = 30;

function findRun(hay: readonly ReadWord[], needle: readonly string[], from: number, to = hay.length): number {
  outer: for (let k = from; k + needle.length <= to; k++) {
    for (let j = 0; j < needle.length; j++) if (hay[k + j].w !== needle[j]) continue outer;
    return k;
  }
  return -1;
}

function multisetMinus(a: readonly string[], b: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const w of b) counts.set(w, (counts.get(w) ?? 0) + 1);
  const out: string[] = [];
  for (const w of a) {
    const c = counts.get(w) ?? 0;
    if (c > 0) counts.set(w, c - 1);
    else out.push(w);
  }
  return out;
}

const distinct = (list: string[], max = 100) => [...new Set(list)].slice(0, max);

function spacedRuns(read: readonly ReadWord[], expectedWords: ReadonlySet<string>, expectedSeq: string): string[] {
  const found: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) {
      const joined = run.join('');
      const spells = [...expectedWords].some((w) => w.length >= 3 && joined.includes(w));
      // The same single characters printed on purpose in the document ("a b c") are not a finding.
      if (spells && !expectedSeq.includes(` ${run.join(' ')} `)) found.push(run.join(' '));
    }
    run = [];
  };
  for (const { w } of read) {
    if ([...w].length === 1 && HAS_WORD_CHAR.test(w)) run.push(w);
    else flush();
  }
  flush();
  return distinct(found, 20);
}

/** Indexes of the longest chain of matches that are in document order and do not overlap (O(n²), n = lines). */
function longestChain(found: readonly { index: number; at: number; end: number }[]): Set<number> {
  const n = found.length;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  let best = -1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (found[j].end <= found[i].at && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
    if (best < 0 || len[i] > len[best]) best = i;
  }
  const chain = new Set<number>();
  for (let i = best; i >= 0; i = prev[i]) chain.add(found[i].index);
  return chain;
}

export function compareReadback(expected: readonly ExpectedLine[], read: ReadInput, checkedAt: number): ReadbackResult {
  const lineWords = expected.map((l) => words(l.text));
  const expectedWords = lineWords.flat();
  const expectedSet = new Set(expectedWords);
  // D63: a line's last word + the next line's first word that together spell a long expected word (and are not both
  // words of the document themselves) were one word wrapped by overflow-wrap: compare them as one, report it as info.
  const readWords: ReadWord[] = [];
  const wrapped: string[] = [];
  read.pages.forEach((lines, page) =>
    lines.forEach((line) => {
      const ws = words(line);
      const last = readWords[readWords.length - 1];
      if (last && ws.length > 0) {
        const joined = last.w + ws[0];
        if (joined.length >= WRAPPED_WORD_MIN && expectedSet.has(joined) && !(expectedSet.has(last.w) && expectedSet.has(ws[0]))) {
          last.w = joined;
          wrapped.push(joined);
          ws.shift();
        }
      }
      for (const w of ws) readWords.push({ w, page: page + 1 });
    })
  );
  const readList = readWords.map((r) => r.w);

  const missingAll = multisetMinus(expectedWords, readList);
  const extrasAll = multisetMinus(readList, expectedWords);

  // Step 3 (SPEC §5.7): each line's words as a contiguous run, searched at/after the previous line's match end (greedy),
  // else anywhere. Not found as a run = split. Of the found lines, the longest chain of non-overlapping matches in
  // document order is "in order"; the others are "moved" — so one line read out of place blames that line only.
  const split: LineRef[] = [];
  const found: { index: number; at: number; end: number }[] = [];
  let pointer = 0;
  let total = 0;
  expected.forEach((line, index) => {
    const ws = lineWords[index];
    if (ws.length === 0) return;
    total++;
    const ahead = findRun(readWords, ws, pointer);
    const at = ahead >= 0 ? ahead : findRun(readWords, ws, 0);
    if (at >= 0) {
      found.push({ index, at, end: at + ws.length });
      if (ahead >= 0) pointer = at + ws.length;
      return;
    }
    const first = readWords.findIndex((r) => r.w === ws[0]);
    split.push({ index, text: line.text, role: line.role, page: first >= 0 ? readWords[first].page : null });
  });
  const chain = longestChain(found);
  const moved: LineRef[] = found
    .filter((f) => !chain.has(f.index))
    .map((f) => ({ index: f.index, text: expected[f.index].text, role: expected[f.index].role, page: readWords[f.at].page }));
  const starts = found;

  const spacedLetters = spacedRuns(readWords, expectedSet, ` ${expectedWords.join(' ')} `);
  const foundWords = expectedWords.length - missingAll.length;
  const inOrder = total - moved.length - split.length;
  const wideGaps = [...(read.gaps ?? [])].slice(0, 50);
  const upJumps = [...(read.upJumps ?? [])].slice(0, 50);
  const pageWords = read.pages.map((_, i) => readWords.filter((r) => r.page === i + 1).length);
  const tokens = contactTokens(expected);
  const broken = brokenContacts(tokens, read.pages);
  return {
    reader: read.reader,
    pass:
      expectedWords.length > 0 &&
      missingAll.length === 0 &&
      moved.length === 0 &&
      split.length === 0 &&
      spacedLetters.length === 0 &&
      wideGaps.length === 0 &&
      upJumps.length === 0 &&
      broken.length === 0,
    words: { expected: expectedWords.length, found: foundWords },
    lines: { total, inOrder, moved, split },
    missing: distinct(missingAll),
    extras: distinct(extrasAll),
    wrappedWords: distinct(wrapped, 20),
    spacedLetters,
    wideGaps,
    upJumps,
    contacts: { checked: tokens.length, broken },
    nameOnOneLine: nameOnOneLine(expected, read.pages),
    pages: read.pages.length,
    pageWords,
    bytes: read.bytes,
    fontsEmbedded: read.fonts.length === 0 ? null : read.fonts.every((f) => f.embedded && !f.type3),
    fonts: distinct(read.fonts.map((f) => f.name.replace(/^[A-Z]{6}\+/, '')), 50),
    images: read.images,
    readOrder: [...starts].sort((a, b) => a.at - b.at || a.index - b.index).map((s) => s.index),
    text: read.pages.map((lines) => lines.join('\n')),
    checkedAt,
  };
}

/** A pdf.js extraction (harness or Node) → the comparison input. */
export function readInputFromPdfjs(raw: RawExtraction, bytes: number): ReadInput {
  const layouts = raw.pages.map((p, i) => itemsToLayout(p.items, i + 1));
  return {
    reader: raw.reader,
    pages: layouts.map((l) => l.lines),
    gaps: layouts.flatMap((l) => l.gaps),
    upJumps: layouts.flatMap((l) => l.upJumps),
    fonts: raw.fonts,
    images: raw.pages.reduce((n, p) => n + p.images, 0),
    bytes,
  };
}

/** Plain page texts (e.g. Apple PDFKit in the referee) → the comparison input. */
export function readInputFromText(reader: string, pages: readonly string[], bytes: number): ReadInput {
  return { reader, pages: pages.map((p) => p.split(/\r?\n/).filter((l) => l.trim() !== '')), fonts: [], images: 0, bytes };
}
