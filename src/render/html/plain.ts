// Plain: no colour, no rules, comma-separated entry lines — the most conservative layout for parsers.
import type { TemplateSpec } from './shared';

export const plain: TemplateSpec = {
  id: 'plain',
  baseSizePt: 10.5,
  lineHeight: 1.35,
  accent: '#000000',
  headingCase: 'upper',
  colour: false,
  head: 'inline',
  sep: ', ',
  centerHeader: false,
  personal: 'contact',
  nameEm: 1.7,
  photoMm: 30,
  css: () => ['body{color:#000000;}', '.name{font-size:1.7em;}', '.h{font-size:1em;}'].join('\n'),
};
