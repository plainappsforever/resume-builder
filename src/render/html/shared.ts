// Shared HTML builder for all templates (SPEC §5.6 rules). PURE.
// Every printed line goes through `Doc.line`, which writes the HTML AND records the expected line (SPEC §5.7 E), so
// the read-back always compares against exactly what was rendered. Rules kept here for every template: one column,
// normal block flow, dates inline or on their own line (never right-aligned), literal "• " bullets with a hanging
// indent, no letter-spacing / text-transform / hyphenation, no header/footer content, entries kept together.
import { formatDateRange } from '@/engine/dates';
import type { RenderEntry, RenderModel, RenderSection } from '@/engine/resolve';
import { PHOTO_TEMPLATES } from '@/engine/style';
import type { Lang, TemplateId } from '@/engine/types';

import type { ExpectedLine, LineRole } from '../expected-lines';
import { FONT_CSS, FONT_FAMILY_CSS } from '../fonts.generated';
import { DOC_LABELS, displayUrl, formatFullDate, sectionTitle, upper } from '../labels';
import type { DocStyle, PhotoData, TemplateDefaults } from '../model';
import { fitsOneLine, nameFitEm } from '../name-fit';

/** How an entry's title, organisation, location and dates are laid out (all in normal inline flow). */
export type EntryHead =
  | 'inline' // Title · Org · Location · 03/2019 – Present
  | 'titleThenDate' // Title, Org, Location  /  03/2019 – Present (own line)
  | 'titleThenMeta' // Title  /  Org · Location · 03/2019 – Present
  | 'dateFirst'; // 03/2019 – heute  Title, Org, Location (German CV, hanging indent)

export type TemplateSpec = TemplateDefaults & {
  id: TemplateId;
  head: EntryHead;
  /** Separator between title/org/location/dates. */
  sep: string;
  centerHeader: boolean;
  /** Personal details as their own section (German CV) or as a line under the contact line. */
  personal: 'section' | 'contact';
  /** Template-specific CSS (receives the computed style). */
  css: (s: DocStyle) => string;
  /** The name's font size in em and the photo's width in mm as set in `css` (the name fit reads them, D90; a test keeps them equal). */
  nameEm: number;
  photoMm: number;
};

// ---- escaping and text ----------------------------------------------------------------------------------------------

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** HTML collapses ASCII white space; the expected text does the same (NBSP and other spaces stay). */
export function clean(text: string): string {
  return text.replace(/[ \t\n\r\f]+/g, ' ').trim();
}

/** Non-empty lines of a multi-line field, each cleaned. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l !== '');
}

/**
 * A piece of a printed line: plain text, or bold/italic/date-span text, or a run kept together (`nw`: no line break
 * inside; contact items D89, hyphenated name parts D90).
 */
export type Part = string | { b: string } | { i: string } | { d: string } | { nw: string };

const partText = (p: Part) => (typeof p === 'string' ? p : 'b' in p ? p.b : 'i' in p ? p.i : 'd' in p ? p.d : p.nw);
const partHtml = (p: Part) =>
  typeof p === 'string'
    ? esc(p)
    : 'b' in p
      ? `<b>${esc(p.b)}</b>`
      : 'i' in p
        ? `<i>${esc(p.i)}</i>`
        : 'd' in p
          ? `<span class="d">${esc(p.d)}</span>`
          : `<span class="nw">${esc(p.nw)}</span>`;
const cleanPart = (p: Part): Part =>
  typeof p === 'string'
    ? p
    : 'b' in p
      ? { b: clean(p.b) }
      : 'i' in p
        ? { i: clean(p.i) }
        : 'd' in p
          ? { d: clean(p.d) }
          : { nw: clean(p.nw) };

/** Joins non-empty parts with a separator (separators are plain text). */
export function joinParts(parts: (Part | null)[], sep: string): Part[] {
  const kept = parts.filter((p): p is Part => p !== null && clean(partText(p)) !== '');
  return kept.flatMap((p, i) => (i === 0 ? [p] : [sep, p]));
}

export class Doc {
  readonly html: string[] = [];
  readonly lines: ExpectedLine[] = [];

  raw(html: string) {
    this.html.push(html);
  }

  /** One printed line (a block element). Parts are cleaned; an empty line prints nothing. `style` = inline CSS. */
  line(tag: 'h1' | 'h2' | 'p', cls: string, role: LineRole, parts: Part[], style?: string) {
    const cleaned = parts.map(cleanPart);
    const text = clean(cleaned.map(partText).join(''));
    if (!text) return;
    this.lines.push({ text, role });
    this.html.push(`<${tag} class="${cls}"${style ? ` style="${esc(style)}"` : ''}>${cleaned.map(partHtml).join('')}</${tag}>`);
  }
}

// ---- CSS ---------------------------------------------------------------------------------------------------------------

const n = (x: number) => String(Math.round(x * 1000) / 1000);
/** Space between the floated photo and the text beside it, and below it (mm). */
export const PHOTO_GAP_MM = 5;
const PHOTO_GAP_BELOW_MM = 3;

export function baseCss(s: DocStyle): string {
  const sp = s.spacing;
  const { page } = s;
  return [
    FONT_CSS[s.font],
    `@page{size:${n(page.widthMm)}mm ${n(page.heightMm)}mm;margin:${n(page.marginMm)}mm;}`,
    'html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
    '*{box-sizing:border-box;}',
    `body{margin:0;padding:0;font-family:${FONT_FAMILY_CSS[s.font]};font-size:${n(s.sizePt)}pt;line-height:${n(s.lineHeight)};color:#1A1A1A;` +
      'hyphens:none;-webkit-hyphens:none;overflow-wrap:break-word;-webkit-text-size-adjust:100%;' +
      // Ligatures off (D45): the WebKit proxy wrote ligature glyphs (ff, ffi, ft) into the PDF text as "!".
      'font-variant-ligatures:none;font-feature-settings:"liga" 0,"clig" 0,"dlig" 0;}',
    'h1,h2,p{margin:0;padding:0;font-size:inherit;font-weight:inherit;}',
    'b{font-weight:700;}',
    `.name{font-size:2em;font-weight:700;line-height:${n(s.lineHeight)};}`,
    `.headline{font-size:1.15em;margin-top:${n(0.15 * sp)}em;}`,
    `.contact{margin-top:${n(0.3 * sp)}em;}`,
    `.s{margin-top:${n(1.0 * sp)}em;}`,
    '.pb{break-before:page;page-break-before:always;}',
    `.h{font-weight:700;font-size:1.1em;margin-bottom:${n(0.35 * sp)}em;break-after:avoid;page-break-after:avoid;}`,
    '.k,.e{break-inside:avoid;page-break-inside:avoid;}',
    `.e{margin-top:${n(0.55 * sp)}em;}`,
    '.k>.e:first-of-type,.k>.e:first-child{margin-top:0;}',
    `.t,.x{margin-top:${n(0.12 * sp)}em;}`,
    '.dt{font-style:italic;}',
    `.b{padding-left:1.1em;text-indent:-1.1em;margin-top:${n(0.12 * sp)}em;}`,
    `.photo{float:right;width:30mm;height:auto;margin:0 0 ${PHOTO_GAP_BELOW_MM}mm ${PHOTO_GAP_MM}mm;}`,
    // D89/D90: contact items and hyphenated name parts never break inside (only items that fit a whole line get it).
    '.nw{white-space:nowrap;}',
    '.clr{clear:both;}',
  ].join('\n');
}

export function page(lang: Lang, title: string, css: string, body: string, template: TemplateId): string {
  return (
    `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${esc(title)}</title><style>\n${css}\n</style></head>` +
    `<body class="t-${template}">\n${body}\n</body></html>`
  );
}

// ---- the resume ------------------------------------------------------------------------------------------------------

export function dates(e: Pick<RenderEntry, 'startDate' | 'endDate' | 'isCurrent'>, model: RenderModel): string {
  return formatDateRange(e, model.style.dateStyle, model.language);
}

function heading(doc: Doc, text: string, s: DocStyle, lang: Lang) {
  doc.line('h2', 'h', 'heading', [s.headingCase === 'upper' ? upper(text, lang) : text]);
}

function extrasLine(e: RenderEntry, lang: Lang, skip: readonly string[] = []): string {
  const L = DOC_LABELS[lang];
  return Object.keys(e.extra)
    .sort()
    .filter((k) => !skip.includes(k) && clean(e.extra[k]) !== '')
    .map((k) => (k === 'grade' ? `${L.grade}: ${e.extra[k]}` : k === 'credentialId' ? `${L.credentialId}: ${e.extra[k]}` : e.extra[k]))
    .join(' · ');
}

function entryHead(doc: Doc, e: RenderEntry, spec: TemplateSpec, model: RenderModel) {
  const d = dates(e, model);
  const title = e.title ? { b: e.title } : null;
  const org = e.organization || null;
  const loc = e.location || null;
  switch (spec.head) {
    case 'inline':
      doc.line('p', 'eh', 'entry', joinParts([title, org, loc, d ? d : null], spec.sep));
      break;
    case 'titleThenDate':
      doc.line('p', 'eh', 'entry', joinParts([title, org, loc], spec.sep));
      doc.line('p', 'dt', 'date', d ? [{ i: d }] : []);
      break;
    case 'titleThenMeta':
      doc.line('p', 'eh', 'entry', title ? [title] : []);
      doc.line('p', 'em', 'meta', joinParts([org, loc, d ? d : null], spec.sep));
      break;
    case 'dateFirst': {
      // Date, ONE space, then the bold title — plain inline flow. Apple PDFKit (the referee's second reader) read an
      // aligned date column, and even a two-space gap, as a separate column ("09/2008 – 07/2011 Zertifikate"), D46.
      const rest = joinParts([title, org, loc], ', ');
      doc.line('p', 'eh', 'entry', d ? [{ d }, ' ', ...rest] : rest);
      break;
    }
  }
}

function entryBody(doc: Doc, e: RenderEntry, lang: Lang) {
  if (clean(e.url)) doc.line('p', 'x', 'meta', [displayUrl(e.url)]);
  for (const para of paragraphs(e.description)) doc.line('p', 't', 'text', [para]);
  const extras = extrasLine(e, lang);
  if (extras) doc.line('p', 'x', 'meta', [extras]);
  for (const b of e.bullets) if (clean(b.text)) doc.line('p', 'b', 'bullet', [`• ${b.text}`]);
}

function entry(doc: Doc, e: RenderEntry, section: RenderSection, spec: TemplateSpec, model: RenderModel) {
  const lang = model.language;
  doc.raw('<div class="e">');
  if (section.kind === 'skills' || section.kind === 'interests') {
    // "Category: item, item, item" — one line a parser reads as a list.
    const items = [...paragraphs(e.description), ...e.bullets.map((b) => clean(b.text))].filter(Boolean);
    const extras = extrasLine(e, lang);
    if (e.title) doc.line('p', 'eh', 'entry', items.length ? [{ b: `${e.title}:` }, ` ${items.join(', ')}`] : [{ b: e.title }]);
    else doc.line('p', 'eh', 'entry', [items.join(', ')]);
    if (extras) doc.line('p', 'x', 'meta', [extras]);
  } else if (section.kind === 'languages') {
    const level = clean(e.extra.level ?? '');
    doc.line('p', 'eh', 'entry', joinParts([e.title ? { b: e.title } : null, level || null], ' – '));
    for (const para of paragraphs(e.description)) doc.line('p', 't', 'text', [para]);
    const extras = extrasLine(e, lang, ['level']);
    if (extras) doc.line('p', 'x', 'meta', [extras]);
    for (const b of e.bullets) if (clean(b.text)) doc.line('p', 'b', 'bullet', [`• ${b.text}`]);
  } else {
    entryHead(doc, e, spec, model);
    entryBody(doc, e, lang);
  }
  doc.raw('</div>');
}

/**
 * Contact items joined by " · " (D89): each item that fits on a whole line is kept together (it moves to the next
 * line as a whole); a longer one may break, and the read-back then reports it as not read in one piece.
 */
export function contactParts(items: readonly (string | null | undefined)[], spec: TemplateSpec, s: DocStyle, withPhoto: boolean): Part[] {
  return joinParts(
    items.map((t) => (t && clean(t) ? (fitsOneLine(clean(t), spec, s, withPhoto) ? { nw: t } : t) : null)),
    ' · '
  );
}

/** The name: set smaller when it would not fit on one line (D90); hyphenated parts never break at the hyphen. */
export function nameLine(doc: Doc, fullName: string, spec: TemplateSpec, s: DocStyle, withPhoto: boolean) {
  const words = clean(fullName).split(' ');
  const parts = words.flatMap((w, i): Part[] => [...(i ? [' '] : []), /[-‐‑]/.test(w) ? { nw: w } : w]);
  const em = nameFitEm(clean(fullName), spec, s, withPhoto);
  doc.line('h1', 'name', 'name', parts, em === null ? undefined : `font-size:${em}em`);
}

function personalLines(model: RenderModel): string[] {
  const L = DOC_LABELS[model.language];
  const p = model.person;
  const out: string[] = [];
  if (p.birthDate && clean(p.birthDate)) out.push(`${L.birthDate}: ${formatFullDate(p.birthDate, model.language, model.style.paper)}`);
  if (p.nationality && clean(p.nationality)) out.push(`${L.nationality}: ${p.nationality}`);
  return out;
}

/** Header (name, headline, contact, optional photo), personal details, summary and all sections. */
export function resumeBody(model: RenderModel, spec: TemplateSpec, s: DocStyle, photo: PhotoData | null): Doc {
  const doc = new Doc();
  const lang = model.language;
  const L = DOC_LABELS[lang];
  const p = model.person;

  doc.raw('<div class="hd">');
  const withPhoto = Boolean(photo && p.photoFile && PHOTO_TEMPLATES.includes(spec.id));
  if (photo && withPhoto) {
    doc.raw(`<img class="photo" src="data:${photo.mime};base64,${photo.base64.replace(/[^A-Za-z0-9+/=]/g, '')}" alt="">`);
  }
  nameLine(doc, p.fullName, spec, s, withPhoto);
  doc.line('p', 'headline', 'headline', [p.headline]);
  const place = [p.city, p.region].map(clean).filter(Boolean).join(', ');
  doc.line('p', 'contact', 'contact', contactParts([place, p.email, p.phone, ...p.links.map((l) => displayUrl(l.url))], spec, s, withPhoto));
  const personal = personalLines(model);
  if (spec.personal === 'contact' && personal.length) doc.line('p', 'contact', 'personal', [personal.join(' · ')]);
  doc.raw('<div class="clr"></div>');
  doc.raw('</div>');

  if (spec.personal === 'section' && personal.length) {
    doc.raw('<section class="s"><div class="k">');
    heading(doc, L.personal, s, lang);
    for (const line of personal) doc.line('p', 't', 'personal', [line]);
    doc.raw('</div></section>');
  }

  const summary = paragraphs(model.summary);
  if (summary.length) {
    doc.raw('<section class="s"><div class="k">');
    heading(doc, L.summary, s, lang);
    for (const para of summary) doc.line('p', 't', 'text', [para]);
    doc.raw('</div></section>');
  }

  for (const section of model.sections) {
    doc.raw(`<section class="s${section.pageBreakBefore ? ' pb' : ''}">`);
    // The heading travels with the first entry (break-after:avoid alone is not reliable in WebKit print).
    doc.raw('<div class="k">');
    heading(doc, sectionTitle(section.kind, section.title, lang), s, lang);
    section.entries.forEach((e, i) => {
      entry(doc, e, section, spec, model);
      if (i === 0) doc.raw('</div>');
    });
    doc.raw('</section>');
  }
  return doc;
}
