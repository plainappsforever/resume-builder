// The optional date of birth (profile.birth_date, stored as ISO `YYYY-MM-DD`). PURE. Accepts what people type:
// `12.04.1994`, `12/04/1994`, `1994-04-12`. Closes the L11 row "birth_date is free text" (P3.5, P4 validates).
export type BirthDateResult = { iso: string | null; error: boolean };

export function parseBirthDate(text: string, currentYear: number): BirthDateResult {
  const value = text.trim();
  if (value === '') return { iso: null, error: false };
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return { iso: null, error: true };
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!real || y < 1900 || y > currentYear) return { iso: null, error: true };
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, error: false };
}

/** Stored ISO date → what the field shows (the UI language's habit: DE 12.04.1994, EN 1994-04-12). */
export function displayBirthDate(iso: string | null, lang: 'en' | 'de'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return lang === 'de' ? `${m[3]}.${m[2]}.${m[1]}` : iso!;
}
