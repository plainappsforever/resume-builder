// Cover letter (F10): the same template, font, accent, size and margins as its version; one column, left-aligned
// date (a right-aligned DIN 5008 date would be read out of place, SPEC §5.6). PURE.
import type { Lang } from '@/engine/types';

import { DOC_LABELS } from '../labels';
import type { DocStyle } from '../model';
import { clean, contactParts, Doc, nameLine, paragraphs, type TemplateSpec } from './shared';

/** Everything the letter prints (the glue maps the cover_letters row + the profile into it). */
export type CoverInput = {
  language: Lang;
  sender: { fullName: string; email: string; phone: string; city: string; region: string };
  recipientCompany: string;
  contactPerson: string;
  /** Multi-line postal address. */
  address: string;
  /** ISO `YYYY-MM-DD`; NULL = `today` (the export date). */
  letterDate: string | null;
  subject: string;
  salutation: string;
  /** Paragraphs separated by blank lines; single line breaks are kept as lines. */
  body: string;
  closing: string;
  signatureName: string;
};

/** Letter date: DE `1. Oktober 2026`; EN `1 October 2026` (A4) / `October 1, 2026` (Letter). */
export function formatLetterDate(iso: string, lang: Lang, paper: 'a4' | 'letter'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return iso.trim();
  const name = DOC_LABELS[lang].months[month - 1];
  if (lang === 'de') return `${day}. ${name} ${year}`;
  return paper === 'letter' ? `${name} ${day}, ${year}` : `${day} ${name} ${year}`;
}

const n = (x: number) => String(Math.round(x * 1000) / 1000);

export function coverCss(s: DocStyle): string {
  return [
    `.cv-from{margin-bottom:${n(1.6 * s.spacing)}em;}`,
    `.cv-to{margin-bottom:${n(1.4 * s.spacing)}em;}`,
    `.cv-date{margin-bottom:${n(1.4 * s.spacing)}em;}`,
    `.cv-subject{font-weight:700;margin-bottom:${n(1.2 * s.spacing)}em;}`,
    `.cv-p{margin-bottom:${n(0.8 * s.spacing)}em;}`,
    `.cv-close{margin-top:${n(0.6 * s.spacing)}em;margin-bottom:${n(2.2 * s.spacing)}em;}`,
  ].join('\n');
}

export function coverBody(input: CoverInput, s: DocStyle, today: string, spec: TemplateSpec): Doc {
  const doc = new Doc();
  const { sender } = input;
  doc.raw('<div class="cv-from">');
  nameLine(doc, sender.fullName, spec, s, false);
  const place = [sender.city, sender.region].map(clean).filter(Boolean).join(', ');
  doc.line('p', 'contact', 'contact', contactParts([place, sender.email, sender.phone], spec, s, false));
  doc.raw('</div>');

  doc.raw('<div class="cv-to">');
  doc.line('p', 'cv-l', 'letter', [input.recipientCompany]);
  doc.line('p', 'cv-l', 'letter', [input.contactPerson]);
  for (const l of paragraphs(input.address)) doc.line('p', 'cv-l', 'letter', [l]);
  doc.raw('</div>');

  const date = formatLetterDate(input.letterDate ?? today, input.language, s.page.paper);
  const dateLine = input.language === 'de' && clean(sender.city) ? `${clean(sender.city)}, ${date}` : date;
  doc.line('p', 'cv-date', 'letter', [dateLine]);
  doc.line('p', 'cv-subject', 'letter', [input.subject]);
  doc.line('p', 'cv-p', 'letter', [input.salutation]);

  for (const block of input.body.split(/\r?\n[ \t]*\r?\n/)) {
    const lines = paragraphs(block);
    if (!lines.length) continue;
    doc.raw('<div class="cv-p">');
    for (const l of lines) doc.line('p', 'cv-l', 'letter', [l]);
    doc.raw('</div>');
  }
  doc.line('p', 'cv-close', 'letter', [input.closing]);
  doc.line('p', 'cv-l', 'letter', [input.signatureName || sender.fullName]);
  return doc;
}
