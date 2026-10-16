// Text normalisation for keyword extraction and matching (SPEC §5.3 step 1, D37). PURE.
// NFKC (ligatures → letters, decomposed umlauts → composed), typographic quotes/dashes → ASCII, soft hyphens removed.
// Lower-casing happens per token (tokenize.ts) so the original case is still known (D37: "IT", "HR").

const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[‐-―−]/g;

export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(/­/g, '');
}

/** Lines of a normalised text (CRLF, CR and LF all end a line). */
export function linesOf(text: string): string[] {
  return normalizeText(text).replace(/\r\n?/g, '\n').split('\n');
}

const LETTER = /\p{L}/u;
export const isLetter = (ch: string) => LETTER.test(ch);

/** Length in code points (what a reader counts as characters). */
export const charLength = (text: string) => [...text].length;
