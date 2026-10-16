// renderHtml(model, opts) → { html, expectedLines, page, print } (V1_PLAN "Rendering and PDF"). PURE.
// The same HTML is the live preview (WebView, JS off) and the PDF source (expo-print, P5); `expectedLines` is E for
// the read-back comparison (src/readback/compare.ts).
import type { RenderModel } from '@/engine/resolve';
import { parseStyle, type FontId, type VersionStyle } from '@/engine/style';
import type { TemplateId } from '@/engine/types';

import type { ExpectedLine } from './expected-lines';
import { coverBody, coverCss, type CoverInput } from './html/cover';
import { TEMPLATES } from './html/index';
import { baseCss, page, resumeBody } from './html/shared';
import { docStyle, printOptions, type DocStyle, type PageSetup, type PrintOptions, type RenderOptions } from './model';

export type RenderResult = {
  html: string;
  expectedLines: ExpectedLine[];
  page: PageSetup;
  print: PrintOptions;
  font: FontId;
  style: DocStyle;
};

export function renderHtml(model: RenderModel, opts: RenderOptions = {}): RenderResult {
  const spec = TEMPLATES[model.template];
  const s = docStyle(model.template, model.style, spec);
  const doc = resumeBody(model, spec, s, opts.photo ?? null);
  const css = `${baseCss(s)}\n${spec.css(s)}`;
  const title = model.person.fullName.trim() || model.name;
  return {
    html: page(model.language, title, css, doc.html.join('\n'), model.template),
    expectedLines: doc.lines,
    page: s.page,
    print: printOptions(s.page),
    font: s.font,
    style: s,
  };
}

/**
 * Cover letter in its version's design (template + style JSON); a letter without a version uses `fallback`
 * (template + style). `today` = ISO date used when the letter has no date of its own.
 */
export function renderCoverHtml(
  input: CoverInput,
  design: { template: TemplateId; style: VersionStyle | string },
  today: string
): RenderResult {
  const spec = TEMPLATES[design.template];
  const style = typeof design.style === 'string' ? parseStyle(design.style, input.language) : design.style;
  const s = docStyle(design.template, style, spec);
  const doc = coverBody(input, s, today, spec);
  const css = `${baseCss(s)}\n${spec.css(s)}\n${coverCss(s)}`;
  return {
    html: page(input.language, input.sender.fullName.trim() || 'Cover letter', css, doc.html.join('\n'), design.template),
    expectedLines: doc.lines,
    page: s.page,
    print: printOptions(s.page),
    font: s.font,
    style: s,
  };
}

export type { CoverInput } from './html/cover';
export type { ExpectedLine, LineRole } from './expected-lines';
