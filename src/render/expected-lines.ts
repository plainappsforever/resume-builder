// Expected lines E (SPEC §5.7): every text line the renderer prints, exactly as printed (upper-cased headings
// included), in document order. The renderer records them while it writes the HTML, so E and the HTML cannot drift.
// The role says which template rule a moved/split line most likely broke (read-back failure hints).

export type LineRole =
  | 'name'
  | 'headline'
  | 'contact'
  | 'personal'
  | 'heading'
  | 'entry'
  | 'date'
  | 'meta'
  | 'text'
  | 'bullet'
  | 'letter';

export type ExpectedLine = { text: string; role: LineRole };

/** All expected text as one string (for size checks and the plain comparison in tests). */
export function expectedText(lines: readonly ExpectedLine[]): string {
  return lines.map((l) => l.text).join('\n');
}
