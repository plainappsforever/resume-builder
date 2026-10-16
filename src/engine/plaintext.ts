// Plain-text export (SPEC §5.9) for application forms: headings in capitals, one line per entry with the dates
// inline, bullets as "- ", one blank line between sections; copy or share as .txt (P5). PURE. Same content and
// document labels as the PDF (render/labels.ts), so the text and the PDF never disagree.
import { DOC_LABELS, displayUrl, formatFullDate, sectionTitle, upper } from '@/render/labels';

import { formatDateRange } from './dates';
import type { RenderEntry, RenderModel } from './resolve';

const one = (s: string) => s.replace(/\s+/g, ' ').trim();
const lines = (s: string) => s.split(/\r?\n/).map(one).filter(Boolean);
const join = (parts: (string | null | undefined)[], sep: string) => parts.map((p) => one(p ?? '')).filter(Boolean).join(sep);

function extras(e: RenderEntry, model: RenderModel, skip: string[] = []): string {
  const L = DOC_LABELS[model.language];
  return Object.keys(e.extra)
    .sort()
    .filter((k) => !skip.includes(k) && one(e.extra[k]))
    .map((k) => (k === 'grade' ? `${L.grade}: ${one(e.extra[k])}` : k === 'credentialId' ? `${L.credentialId}: ${one(e.extra[k])}` : one(e.extra[k])))
    .join(' · ');
}

export function plainText(model: RenderModel): string {
  const { person: p, language: lang } = model;
  const L = DOC_LABELS[lang];
  const blocks: string[][] = [];

  const head = [one(p.fullName), one(p.headline), join([join([p.city, p.region], ', '), p.email, p.phone, ...p.links.map((l) => displayUrl(l.url))], ' · ')];
  const personal = join(
    [
      p.birthDate ? `${L.birthDate}: ${formatFullDate(p.birthDate, lang, model.style.paper)}` : null,
      p.nationality ? `${L.nationality}: ${p.nationality}` : null,
    ],
    ' · '
  );
  blocks.push([...head, personal].filter(Boolean));

  const summary = lines(model.summary);
  if (summary.length) blocks.push([upper(L.summary, lang), ...summary]);

  for (const s of model.sections) {
    const out = [upper(sectionTitle(s.kind, s.title, lang), lang)];
    for (const e of s.entries) {
      const bullets = e.bullets.map((b) => one(b.text)).filter(Boolean);
      if (s.kind === 'skills' || s.kind === 'interests') {
        const items = [...lines(e.description), ...bullets].join(', ');
        out.push(e.title ? (items ? `${one(e.title)}: ${items}` : one(e.title)) : items);
        const x = extras(e, model);
        if (x) out.push(x);
        continue;
      }
      if (s.kind === 'languages') out.push(join([e.title, e.extra.level], ' – '));
      else out.push(join([e.title, e.organization, e.location, formatDateRange(e, model.style.dateStyle, lang)], ', '));
      if (one(e.url)) out.push(displayUrl(e.url));
      out.push(...lines(e.description));
      const x = extras(e, model, s.kind === 'languages' ? ['level'] : []);
      if (x) out.push(x);
      out.push(...bullets.map((b) => `- ${b}`));
    }
    blocks.push(out.filter(Boolean));
  }
  return blocks.map((b) => b.join('\n')).join('\n\n') + '\n';
}
