// Modern: sans, accent-coloured name, headings with an accent rule, everything of an entry on one line.
import type { TemplateSpec } from './shared';

export const modern: TemplateSpec = {
  id: 'modern',
  baseSizePt: 10,
  lineHeight: 1.35,
  accent: '#1F4E79',
  headingCase: 'normal',
  colour: true,
  head: 'inline',
  sep: ' · ',
  centerHeader: false,
  personal: 'contact',
  nameEm: 2,
  photoMm: 26,
  css: (s) =>
    [
      `.name{color:${s.accent};}`,
      `.h{font-size:1.15em;color:${s.accent};border-bottom:1pt solid ${s.accent};padding-bottom:1.5pt;}`,
      '.photo{width:26mm;}',
    ].join('\n'),
};
