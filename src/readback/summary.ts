// What the Export tab and history show about a read-back (SPEC §5.7 step 7, L26): counts, what moved or is missing,
// a hint per likely cause, and the reader's own text in order. i18n keys + params only. PURE.
import type { Lang } from '@/engine/types';
import type { TranslationKey } from '@/i18n/en';
import { translate } from '@/i18n/index';

import type { ReadbackResult } from './compare';

export type Msg = { key: TranslationKey; params: Record<string, string | number> };
export type ReadbackOutcomeView = ReadbackResult | { unavailable: true };

const m = (key: TranslationKey, params: Msg['params'] = {}): Msg => ({ key, params });
const MAX_LISTED = 5;

export function sizeMsg(bytes: number): Msg {
  return bytes >= 1_000_000 ? m('readback.size.mb', { mb: (bytes / 1_000_000).toFixed(1) }) : m('readback.size.kb', { kb: Math.max(1, Math.round(bytes / 1000)) });
}

export type ReadbackView = {
  pass: boolean;
  /** "Read back with pdf.js: 412 of 412 words, all 58 lines in the right order, 1 page, 96 KB." */
  headline: Msg;
  details: Msg[];
  hints: Msg[];
  note: Msg;
};

export function readbackView(outcome: ReadbackOutcomeView, lang: Lang): ReadbackView {
  const note = m('readback.note');
  if ('unavailable' in outcome) return { pass: false, headline: m('readback.unavailable'), details: [], hints: [], note };
  const r = outcome;
  const pages = r.pages === 1 ? translate(lang, 'readback.pages.one') : translate(lang, 'readback.pages.other', { count: r.pages });
  const size = sizeMsg(r.bytes);
  const common = {
    reader: r.reader,
    found: r.words.found,
    expected: r.words.expected,
    lines: r.lines.total,
    pages,
    size: translate(lang, size.key, size.params),
  };
  // D63: info, also on a pass. Results stored before D63 have no wrappedWords.
  const wrapped = (r.wrappedWords ?? []).slice(0, MAX_LISTED).map((w) => m('readback.wrapped', { word: w.length > 40 ? `${w.slice(0, 40)}…` : w }));
  // D90: info, also on a pass (results stored before v1.1 have no nameOnOneLine).
  if (r.nameOnOneLine === false) wrapped.unshift(m('readback.nameSplit'));
  // D93 (REVIEW_V1 #5): a pass with a font stored as drawings (Type 3, Android phones that print with Roboto) is shown
  // as a warning: pdf.js reads it, layout-reading programs (Apple PDFKit in our tests) may not.
  if (r.pass)
    return { pass: true, headline: m('readback.pass', common), details: r.fontsEmbedded === false ? [m('readback.type3'), ...wrapped] : wrapped, hints: [], note };

  const details: Msg[] = [
    ...r.lines.moved.slice(0, MAX_LISTED).map((l) => m('readback.moved', { text: l.text })),
    ...r.lines.split.slice(0, MAX_LISTED).map((l) => m('readback.split', { text: l.text })),
  ];
  if (r.missing.length) details.push(m('readback.missing', { words: r.missing.slice(0, 20).join(', ') }));
  for (const s of r.spacedLetters.slice(0, MAX_LISTED)) details.push(m('readback.spaced', { text: s }));
  for (const g of r.wideGaps.slice(0, MAX_LISTED)) details.push(m('readback.gap', { before: g.before, after: g.after }));
  // Results stored before D53 have no upJumps.
  const upJumps = r.upJumps ?? [];
  for (const u of upJumps.slice(0, MAX_LISTED)) details.push(m('readback.upJump', { before: u.before, after: u.after }));
  // D89. Results stored before v1.1 have no contacts.
  const broken = r.contacts?.broken ?? [];
  for (const c of broken.slice(0, MAX_LISTED)) details.push(m(`readback.contact.${c.kind}`, { text: c.text }));
  if (r.fontsEmbedded === false) details.push(m('readback.fontsNotEmbedded'));
  details.push(...wrapped);

  const hints: Msg[] = [];
  const roles = new Set([...r.lines.moved, ...r.lines.split].map((l) => l.role));
  if (roles.has('date') || roles.has('meta')) hints.push(m('readback.hint.dates'));
  if ([...roles].some((role) => role !== 'date' && role !== 'meta')) hints.push(m('readback.hint.layout'));
  if (r.missing.length) hints.push(m('readback.hint.missing'));
  if (r.spacedLetters.length) hints.push(m('readback.hint.spaced'));
  if (r.wideGaps.length) hints.push(m('readback.hint.gaps'));
  if (upJumps.length) hints.push(m('readback.hint.upJump'));
  if (broken.length) hints.push(m('readback.hint.contacts'));
  return { pass: false, headline: m('readback.fail', { ...common, inOrder: r.lines.inOrder }), details, hints, note };
}
