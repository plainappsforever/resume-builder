// Classic: serif, centred header, upper-case headings with a thin rule, dates on their own line (SPEC §5.6).
import type { TemplateSpec } from './shared';

export const classic: TemplateSpec = {
  id: 'classic',
  baseSizePt: 10,
  lineHeight: 1.35,
  accent: '#1A1A1A',
  headingCase: 'upper',
  colour: true,
  head: 'titleThenDate',
  sep: ', ',
  centerHeader: true,
  personal: 'contact',
  nameEm: 1.9,
  photoMm: 30,
  css: (s) =>
    [
      '.hd{text-align:center;}',
      '.name{font-size:1.9em;}',
      `.h{font-size:1em;color:${s.accent};border-bottom:0.6pt solid ${s.accent};padding-bottom:1pt;}`,
    ].join('\n'),
};
