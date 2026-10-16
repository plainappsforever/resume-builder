/**
 * @jest-environment node
 */
// D89/D90 (REVIEW_V1 #1, #8): contact items are kept together when they fit a line; a long name is set smaller so it
// stays on one line. The proof on real PDFs is the referee (72 documents incl. six long-name ones) and the device gate.
import { TEMPLATE_IDS } from '@/engine/types';

import { FIXTURES, modelFor } from './__fixtures__/models';
import { LONG_NAME } from './__fixtures__/samples';
import { TEMPLATES } from './html/index';
import { renderHtml } from './index';
import { NAME_MIN_EM, nameWidthEm } from './name-fit';

const { lang, draft } = FIXTURES['sample-en'];
const render = (fullName: string, template: (typeof TEMPLATE_IDS)[number], photo = false, links?: typeof draft.links) =>
  renderHtml(modelFor({ ...draft, ...(links ? { links } : {}), profile: { ...draft.profile, fullName, photoFile: photo ? 'photos/p.jpg' : null } }, lang, { template, style: { photo } }), {
    photo: photo ? { mime: 'image/jpeg', base64: '/9j/4AAQ' } : null,
  });
const nameTag = (html: string) => html.match(/<h1 class="name"[^>]*>.*?<\/h1>/)![0];

it.each(TEMPLATE_IDS)('%s: nameEm and photoMm match the template CSS', (id) => {
  const spec = TEMPLATES[id];
  const css = spec.css({ accent: '#000000', spacing: 1 } as never);
  const size = css.match(/\.name\{[^}]*font-size:([\d.]+)em/);
  expect(size ? Number(size[1]) : 2).toBe(spec.nameEm);
  const photo = css.match(/\.photo\{[^}]*width:([\d.]+)mm/);
  expect(photo ? Number(photo[1]) : 30).toBe(spec.photoMm);
});

it.each(TEMPLATE_IDS)('%s: a usual name keeps the template size; the 71-character name gets a smaller size, hyphen parts kept together', (id) => {
  expect(nameTag(render('Alex Morgan', id).html)).toBe('<h1 class="name">Alex Morgan</h1>');
  const long = nameTag(render(LONG_NAME, id, true).html);
  const em = Number(long.match(/font-size:([\d.]+)em/)![1]);
  expect(em).toBeLessThan(TEMPLATES[id].nameEm);
  expect(em).toBeGreaterThanOrEqual(NAME_MIN_EM);
  expect(long).toContain('<span class="nw">Maximilian-Alexander</span>');
  expect(long).toContain('<span class="nw">Hohenzollern-Sigmaringen</span>');
  // The expected line is the plain name (the read-back compares text, not markup).
  expect(render(LONG_NAME, id).expectedLines[0]).toEqual({ text: LONG_NAME, role: 'name' });
});

it('a photo beside the name leaves less room: the same name is set smaller with the photo', () => {
  const name = 'Maximilian-Alexander Schäfer-Grünwald';
  const size = (photo: boolean) => Number((nameTag(render(name, 'lebenslauf', photo).html).match(/font-size:([\d.]+)em/) ?? [0, 2])[1]);
  expect(size(true)).toBeLessThan(size(false));
});

it('width estimate: wider letters are wider, unknown characters count as a wide capital', () => {
  expect(nameWidthEm('MMMM', 'inter')).toBeGreaterThan(nameWidthEm('iiii', 'inter'));
  expect(nameWidthEm('李', 'lato')).toBeGreaterThanOrEqual(nameWidthEm('M', 'lato'));
  // Serif documents also budget for Android's Noto Serif (D72).
  expect(nameWidthEm('Alex Morgan', 'eb-garamond')).toBeGreaterThan(0);
});

it('contact items that fit a line are kept together; a link wider than the line may break (the read-back then fails it)', () => {
  const html = render('Alex Morgan', 'modern').html;
  expect(html).toContain('<span class="nw">alex.morgan@example.com</span>');
  expect(html).toContain('<span class="nw">+1 555 0142</span>');
  const longLink = `example.org/${'a-very-long-path-segment/'.repeat(8)}end`;
  const withLong = render('Alex Morgan', 'modern', false, [{ label: 'website', url: `https://${longLink}` }]).html;
  expect(withLong).toContain(longLink);
  expect(withLong).not.toContain(`<span class="nw">${longLink}</span>`);
});
