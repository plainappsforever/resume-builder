// The reference document set (72): every template × fixture × paper, the photo samples, a cover letter per
// template × language and (v1.1, D90) a 71-character double name per template (with the photo where it has one). Written for the Mac referee by samples.test.ts (RENDER_SAMPLES=1) and rendered on the phones by
// the dev-only PDF gate (src/debug/pdf-gate-screen.tsx, P5), so both prove the same documents. PURE.
import { TEMPLATE_IDS, type Lang } from '@/engine/types';

import { renderCoverHtml, renderHtml, type RenderResult } from '../index';
import type { PhotoData } from '../model';
import { COVER_FIXTURES } from './covers';
import { FIXTURES, modelFor, type FixtureId } from './models';

export type Sample = { name: string; result: RenderResult };

/** The independent review's long-name probe (REVIEW_V1 #8): it wrapped over 2–3 lines in v1. */
export const LONG_NAME = 'Dr. Maximilian-Alexander Schäfer-Grünwald von Hohenzollern-Sigmaringen';

export function referenceSamples(photo: PhotoData): Sample[] {
  const out: Sample[] = [];
  for (const template of TEMPLATE_IDS)
    for (const fixture of Object.keys(FIXTURES) as FixtureId[])
      for (const paper of ['a4', 'letter'] as const) {
        const { lang, draft } = FIXTURES[fixture];
        const pageBreaks = fixture === 'stress-en' ? [6] : [];
        out.push({ name: `${template}-${fixture}-${paper}`, result: renderHtml(modelFor(draft, lang, { template, style: { paper }, pageBreaks })) });
      }
  // The photo floats top right inside the body flow (D27): it must not change the reading order.
  for (const template of ['modern', 'executive', 'lebenslauf'] as const)
    for (const fixture of ['sample-de', 'stress-en'] as const) {
      const { lang, draft } = FIXTURES[fixture];
      const withPhoto = { ...draft, profile: { ...draft.profile, photoFile: 'photos/profile.png' } };
      out.push({ name: `${template}-${fixture}-a4-photo`, result: renderHtml(modelFor(withPhoto, lang, { template, style: { photo: true } }), { photo }) });
    }
  for (const template of TEMPLATE_IDS) {
    const { lang, draft } = FIXTURES['sample-de'];
    const photoTemplate = (['modern', 'executive', 'lebenslauf'] as const).some((t) => t === template);
    const long = { ...draft, profile: { ...draft.profile, fullName: LONG_NAME, photoFile: photoTemplate ? 'photos/profile.png' : null } };
    out.push({
      name: `${template}-longname-a4${photoTemplate ? '-photo' : ''}`,
      result: renderHtml(modelFor(long, lang, { template, style: { photo: photoTemplate } }), { photo: photoTemplate ? photo : null }),
    });
  }
  for (const template of TEMPLATE_IDS)
    for (const lang of ['en', 'de'] as Lang[])
      out.push({
        name: `cover-${template}-${lang}`,
        result: renderCoverHtml(COVER_FIXTURES[lang], { template, style: JSON.stringify({ paper: lang === 'en' ? 'letter' : 'a4' }) }, '2026-10-01'),
      });
  return out;
}

