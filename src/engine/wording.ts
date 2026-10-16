// Wording rules (D16, L26, CLAUDE.md): the app shows counts and proofs, never an opaque score or a promise about
// what an applicant tracking system will do. PURE. Used by the Jest tests of every user-facing text source
// (i18n dictionaries now; content, checks and help texts from P2 on). "ATS-friendly" is allowed only in rule
// explanations with their source, so it is not on the list.

/** English and German phrases no user-facing string may contain. */
export const BANNED_PHRASES: readonly RegExp[] = [
  /\bATS[\s-]*(score|rating|grade|approved|proof|certified|compliant|safe|ready|optimi[sz]ed)\b/i,
  /\b100\s*%\s*ATS\b/i,
  /\bATS\s*100\s*%/i,
  /\bguarantee/i,
  /\bbeat(s|ing)?\s+(the\s+|any\s+|every\s+)?ATS/i,
  /\b(pass|passes|get past|bypass|trick)\s+(the\s+|any\s+|every\s+)?ATS/i,
  /\bATS[\s-]*(Score|Punktzahl|Bewertung|Note|geprüft|zertifiziert|sicher|konform|optimiert|tauglich)/i,
  /garantier/i,
  /\bGarantie/i,
  /(überlist|austrick|schlägt|schlagen|knack)\p{L}*(\s+\p{L}+){0,3}?\s+ATS\b/iu,
  /\bATS\s+(überlisten|austricksen|schlagen|knacken)/i,
];

/** The banned patterns a text contains (empty = fine). */
export function bannedIn(text: string): string[] {
  return BANNED_PHRASES.filter((re) => re.test(text)).map((re) => re.source);
}
