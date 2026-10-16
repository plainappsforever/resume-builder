// Lebenslauf: German conventions — personal details block, optional photo top right inside the body flow, date first
// on each entry line ("03/2019 – heute  Titel, Firma"), in plain inline flow (no aligned date column, D46).
import type { TemplateSpec } from './shared';

export const lebenslauf: TemplateSpec = {
  id: 'lebenslauf',
  baseSizePt: 10.5,
  lineHeight: 1.35,
  accent: '#1F4E79',
  headingCase: 'normal',
  colour: true,
  head: 'dateFirst',
  sep: ', ',
  centerHeader: false,
  personal: 'section',
  nameEm: 2,
  photoMm: 32,
  css: (s) =>
    [
      `.name{color:${s.accent};}`,
      `.h{font-size:1.15em;color:${s.accent};border-bottom:0.75pt solid ${s.accent};padding-bottom:1.5pt;}`,
      '.photo{width:32mm;}',
    ].join('\n'),
};
