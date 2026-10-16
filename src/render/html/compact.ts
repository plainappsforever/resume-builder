// Compact: dense, one-page oriented — smaller name, tighter lines and gaps, upper-case headings.
import type { TemplateSpec } from './shared';

const n = (x: number) => String(Math.round(x * 1000) / 1000);

export const compact: TemplateSpec = {
  id: 'compact',
  baseSizePt: 9.5,
  lineHeight: 1.25,
  accent: '#2E5E4E',
  headingCase: 'upper',
  colour: true,
  head: 'inline',
  sep: ' · ',
  centerHeader: false,
  personal: 'contact',
  nameEm: 1.6,
  photoMm: 30,
  css: (s) =>
    [
      '.name{font-size:1.6em;}',
      `.s{margin-top:${n(0.7 * s.spacing)}em;}`,
      `.e{margin-top:${n(0.35 * s.spacing)}em;}`,
      `.h{font-size:1em;color:${s.accent};border-bottom:0.5pt solid #999999;margin-bottom:${n(0.25 * s.spacing)}em;}`,
      '.b{margin-top:0;}',
    ].join('\n'),
};
