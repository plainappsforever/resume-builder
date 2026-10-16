// Executive: larger centred name, small upper-case headings (upper-cased text, no font-variant), title line then an
// italic line with organisation, location and dates.
import type { TemplateSpec } from './shared';

export const executive: TemplateSpec = {
  id: 'executive',
  baseSizePt: 11,
  lineHeight: 1.3,
  accent: '#5A2A4A',
  headingCase: 'upper',
  colour: true,
  head: 'titleThenMeta',
  sep: ' · ',
  centerHeader: true,
  personal: 'contact',
  nameEm: 2.4,
  photoMm: 28,
  css: (s) =>
    [
      '.hd{text-align:center;}',
      '.name{font-size:2.4em;font-weight:400;}',
      `.h{font-size:0.92em;color:${s.accent};border-bottom:0.5pt solid ${s.accent};padding-bottom:1pt;}`,
      '.em{font-style:italic;}',
      '.photo{width:28mm;}',
    ].join('\n'),
};
