/**
 * @jest-environment node
 */
// Rendering (SPEC §5.6, §13): template linter on every template × fixture × paper, escaping, document labels and
// dates per language, photo only where allowed, expected lines = the HTML's text, deterministic output, snapshots.
import { TEMPLATE_IDS, type TemplateId } from '@/engine/types';

import { FIXTURES, modelFor, type FixtureId } from './__fixtures__/models';
import { COVER_FIXTURES } from './__fixtures__/covers';
import { FONT_EXTENT } from './fonts.generated';
import { renderCoverHtml, renderHtml } from './index';
import { lintHtml } from './lint';

const FIXTURE_IDS = Object.keys(FIXTURES) as FixtureId[];
const PHOTO = { mime: 'image/jpeg' as const, base64: '/9j/4AAQSkZJRgABAQ==' };
const model = (fixture: FixtureId, template: TemplateId, style: Record<string, unknown> = {}) =>
  modelFor(FIXTURES[fixture].draft, FIXTURES[fixture].lang, { template, style });

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** The text of every block line of the body, in order, as a browser shows it. */
function htmlLines(html: string): string[] {
  const body = html.slice(html.indexOf('<body'));
  return [...body.matchAll(/<(h1|h2|p) class="[^"]*">([\s\S]*?)<\/\1>/g)].map((m) =>
    m[2].replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
  );
}
const withoutFonts = (html: string) => html.replace(/@font-face\{[^}]*\}/g, '@font-face{…}').replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,…');

describe('template rules (SPEC §5.6) on every template × fixture × paper', () => {
  it.each(TEMPLATE_IDS.flatMap((t) => FIXTURE_IDS.flatMap((f) => (['a4', 'letter'] as const).map((p) => [t, f, p] as const))))(
    '%s × %s × %s: linter clean, expected lines = HTML text',
    (template, fixture, paper) => {
      const out = renderHtml(model(fixture, template, { paper, photo: true }), { photo: PHOTO });
      expect(lintHtml(out.html)).toEqual([]);
      expect(htmlLines(out.html)).toEqual(out.expectedLines.map((l) => l.text));
    }
  );

  it.each(TEMPLATE_IDS)('%s cover letter: linter clean, expected lines = HTML text', (template) => {
    for (const lang of ['en', 'de'] as const) {
      const out = renderCoverHtml(COVER_FIXTURES[lang], { template, style: '{}' }, '2026-10-01');
      expect(lintHtml(out.html)).toEqual([]);
      expect(htmlLines(out.html)).toEqual(out.expectedLines.map((l) => l.text));
    }
  });

  it('the linter catches every forbidden construct', () => {
    const ok = renderHtml(model('sample-en', 'modern')).html;
    const bad = (css: string, body = '') => lintHtml(ok.replace('</style>', `${css}</style>`).replace('</body>', `${body}</body>`)).map((i) => i.rule);
    expect(bad('', '<table><tr><td>x</td></tr></table>')).toEqual(['table']);
    expect(bad('', '<ul><li>x</li></ul>')).toEqual(['list-markers']);
    expect(bad('.d{position:absolute;right:0}')).toEqual(['positioning']);
    expect(bad('.h{letter-spacing:2px}')).toEqual(['letter-spacing']);
    expect(bad('.g{display:grid}')).toEqual(['grid']);
    expect(bad('.r{display:flex;justify-content:space-between}')).toEqual(['flex-push', 'side-by-side']);
    // P3.5 review finding 14: false negatives …
    expect(bad('.r{display:flex}')).toEqual(['side-by-side']);
    expect(bad('.c{display:inline-block;width:30%}')).toEqual(['side-by-side']);
    expect(bad('.o{order:2}')).toEqual(['side-by-side']);
    expect(bad('.u{unicode-bidi:bidi-override}')).toEqual(['right-align']);
    expect(bad('.p{position:relative;top:3em}')).toEqual(['positioning']);
    expect(bad('.p{inset:0}')).toEqual(['positioning']);
    expect(bad('.p{position: /*x*/ absolute}')).toEqual(['positioning']);
    // … and false positives: the user's words are text, not CSS or markup.
    expect(bad('', '<p class="b">Content: strategy and transform: plan (one = two) onload = x, top: 3, order: 1</p>')).toEqual([]);
    expect(bad('.c{column-count:2}')).toEqual(['columns']);
    expect(bad('.d{text-align:right}')).toEqual(['right-align']);
    expect(bad('.d{float:right}')).toEqual(['float']);
    expect(bad('.h{text-transform:uppercase}')).toEqual(['text-transform']);
    expect(bad('.h{font-variant:small-caps}')).toEqual(['small-caps']);
    expect(bad('.h::before{content:"•"}')).toEqual(['generated-content']);
    expect(bad('@page{@top-center{content:"x"}}')).toEqual(expect.arrayContaining(['page-margin-boxes']));
    expect(bad('', '<footer>p. 1</footer>')).toEqual(['header-footer']);
    expect(bad('', '<img src="https://example.com/x.png">')).toEqual(['external-resource']);
    expect(bad('', '<svg></svg>')).toEqual(['graphics']);
    expect(lintHtml(ok.replace('font-variant-ligatures:none;', '')).map((i) => i.rule)).toEqual(['ligatures']);
    expect(lintHtml(ok.replace(/hyphens:none;/g, '')).map((i) => i.rule)).toEqual(['hyphenation']);
  });
});

describe('content and escaping', () => {
  it('user text is escaped; no script or attribute injection is possible', () => {
    const out = renderHtml(model('stress-en', 'modern'));
    expect(out.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(out.html).toContain('Morgan &quot;Mo&quot; O&#39;Neill-Kowalczyk');
    expect(out.html).toContain('Senior Data &amp; Operations Analyst &lt;Supply Chain&gt;');
    expect(out.html).not.toMatch(/<script/i);
    expect(out.expectedLines.find((l) => l.role === 'bullet' && l.text.includes('dictionary'))?.text).toContain('<script>alert("x")</script>');
  });

  it('English labels and dates; links printed as text without scheme; skills and languages as one line', () => {
    const lines = renderHtml(model('stress-en', 'modern')).expectedLines.map((l) => l.text);
    expect(lines.slice(0, 4)).toEqual([
      'Morgan "Mo" O\'Neill-Kowalczyk',
      'Senior Data & Operations Analyst <Supply Chain>',
      'Manchester, Greater Manchester · mo.oneill@example.org · +44 20 7946 0958 · linkedin.com/in/mo-oneill-kowalczyk-example · github.com/mo-example',
      'Summary',
    ]);
    expect(lines).toContain('Senior Data Analyst · Fieldfare & Finch Retail Ltd · Manchester · Jan 2020 – Present');
    expect(lines).toContain('Languages & tools: Python, SQL, R, Power BI, Excel (VBA), C#, .NET');
    expect(lines).toContain('English – Native');
    expect(lines).toContain('Grade: First Class Honours');
    expect(lines).toContain('Credential ID: PL300-0042');
    expect(lines).toContain('github.com/mo-example/shelf-gap');
    expect(lines).toContain('Conferences & Talks');
    expect(lines).toContain('Fell running, chess, baking sourdough');
  });

  it('German labels, dates and date-first lines (Lebenslauf), personal details section, ß upper-cased in headings', () => {
    const out = renderHtml(model('stress-de', 'lebenslauf'));
    const lines = out.expectedLines.map((l) => l.text);
    expect(lines.slice(3, 6)).toEqual(['Persönliche Daten', 'Geburtsdatum: 03.11.1988', 'Staatsangehörigkeit: deutsch']);
    expect(lines).toContain('03/2019 – heute Teamleiter Instandhaltung, Neckarwerk Süd GmbH & Co. KG, Stuttgart');
    expect(lines).toContain('Berufserfahrung');
    const upperDe = renderHtml(model('stress-de', 'classic')).expectedLines.map((l) => l.text);
    expect(upperDe).toContain('FÜHRERSCHEINE & STRASSENVERKEHR');
    expect(upperDe).toContain('KURZPROFIL');
    expect(upperDe).toContain('Geburtsdatum: 03.11.1988 · Staatsangehörigkeit: deutsch');
    const mon = renderHtml(model('stress-de', 'modern', { dateStyle: 'Mon YYYY' })).expectedLines.map((l) => l.text);
    expect(mon).toContain('Teamleiter Instandhaltung · Neckarwerk Süd GmbH & Co. KG · Stuttgart · März 2019 – heute');
    expect(mon).toContain('Elektroniker für Betriebstechnik · Fildermaschinen AG · Filderstadt · Sept. 2011 – Feb. 2019');
  });

  it('every template keeps date and title together in one entry line or in the line right below', () => {
    for (const template of TEMPLATE_IDS) {
      const lines = renderHtml(model('sample-en', template)).expectedLines;
      const i = lines.findIndex((l) => l.text.includes('Harbourline Logistics') || l.text.includes('Operations Coordinator ·'));
      const near = lines.slice(Math.max(0, i - 1), i + 2).map((l) => l.text).join(' | ');
      expect([template, near.includes('Apr 2021 – Present')]).toEqual([template, true]);
    }
  });

  it('photo only in Modern, Executive and Lebenslauf, only when switched on and supplied, inside the body flow', () => {
    for (const template of TEMPLATE_IDS) {
      const on = renderHtml(modelFor({ ...FIXTURES['sample-en'].draft, profile: { ...FIXTURES['sample-en'].draft.profile, photoFile: 'photos/p.jpg' } }, 'en', { template, style: { photo: true } }), { photo: PHOTO }).html;
      expect([template, on.includes('<img class="photo"')]).toEqual([template, ['modern', 'executive', 'lebenslauf'].includes(template)]);
    }
    const off = renderHtml(modelFor({ ...FIXTURES['sample-en'].draft, profile: { ...FIXTURES['sample-en'].draft.profile, photoFile: 'photos/p.jpg' } }, 'en', { template: 'modern', style: { photo: false } }), { photo: PHOTO });
    expect(off.html).not.toContain('<img');
    const html = renderHtml(modelFor({ ...FIXTURES['sample-en'].draft, profile: { ...FIXTURES['sample-en'].draft.profile, photoFile: 'p.jpg' } }, 'en', { template: 'lebenslauf', style: { photo: true } }), { photo: { mime: 'image/jpeg', base64: 'AB"onerror=x' } }).html;
    expect(html).toContain('base64,ABonerror=x" alt="">');
  });
});

describe('page, style and determinism', () => {
  it('A4 and Letter page CSS and print options; margins and sizes follow the style steps', () => {
    const a4 = renderHtml(model('sample-en', 'modern'));
    expect(a4.html).toContain('@page{size:210mm 297mm;margin:18mm;}');
    expect(a4.print).toEqual({ width: 595, height: 842, margins: { top: 51.02, right: 51.02, bottom: 51.02, left: 51.02 } });
    const letter = renderHtml(model('sample-en', 'modern', { paper: 'letter', marginStep: -2, sizeStep: 2, spacingStep: -1 }));
    expect(letter.html).toContain('@page{size:215.9mm 279.4mm;margin:12.7mm;}');
    expect(letter.print).toMatchObject({ width: 612, height: 792, margins: { top: 36 } });
    expect(letter.style).toMatchObject({ sizePt: 11, spacing: 0.8, font: 'inter' });
    expect(renderHtml(model('sample-en', 'compact', { sizeStep: -2 })).style.sizePt).toBe(9);
  });

  it('template default fonts, chosen font, one family per document, line height never below the font extent', () => {
    const fonts = TEMPLATE_IDS.map((t) => renderHtml(model('sample-en', t)).font);
    expect(fonts).toEqual(['merriweather', 'inter', 'lato', 'eb-garamond', 'source-sans-3', 'noto-sans']);
    const chosen = renderHtml(model('sample-en', 'classic', { font: 'lato' }));
    expect(chosen.font).toBe('lato');
    expect(new Set([...chosen.html.matchAll(/font-family:'([^']+)'/g)].map((m) => m[1]))).toEqual(new Set(['Lato']));
    for (const t of TEMPLATE_IDS) {
      const s = renderHtml(model('sample-en', t)).style;
      expect(s.lineHeight).toBeGreaterThanOrEqual(FONT_EXTENT[s.font] + 0.04 - 1e-9);
    }
  });

  it('accent: chosen colour, template default, and none at all in Plain', () => {
    expect(renderHtml(model('sample-en', 'modern', { accent: '#7a2e2e' })).html).toContain('.name{color:#7A2E2E;}');
    expect(renderHtml(model('sample-en', 'modern')).style.accent).toBe('#1F4E79');
    expect(renderHtml(model('sample-en', 'plain', { accent: '#7a2e2e' })).style.accent).toBe('#000000');
  });

  it('a section can start on a new page', () => {
    const out = renderHtml(modelFor(FIXTURES['stress-en'].draft, 'en', { template: 'modern', pageBreaks: [3] }));
    expect(out.html.match(/class="s pb"/g)).toHaveLength(1);
  });

  it('is deterministic', () => {
    for (const t of TEMPLATE_IDS) expect(renderHtml(model('stress-de', t)).html).toBe(renderHtml(model('stress-de', t)).html);
  });

  it.each(TEMPLATE_IDS)('%s HTML snapshot (EN + DE examples, fonts elided)', (template) => {
    expect(withoutFonts(renderHtml(model('sample-en', template)).html)).toMatchSnapshot('en');
    expect(withoutFonts(renderHtml(model('sample-de', template)).html)).toMatchSnapshot('de');
  });
});

describe('cover letter', () => {
  it('uses the version design and prints a left-aligned date; German date line with the city', () => {
    const en = renderCoverHtml(COVER_FIXTURES.en, { template: 'executive', style: '{"paper":"letter","accent":"#3D3D8F"}' }, '2026-10-01');
    expect(en.font).toBe('eb-garamond');
    expect(en.print.width).toBe(612);
    expect(en.expectedLines.map((l) => l.text)).toEqual([
      'Alex Morgan',
      'Milwaukee, WI · alex.morgan@example.com · +1 555 0142',
      'Northwind Freight',
      'Ms. Dana Whitfield',
      '200 Lake Shore Drive',
      'Chicago, IL 60601',
      'October 1, 2026',
      'Application: Operations Analyst',
      'Dear Ms. Whitfield,',
      expect.stringMatching(/^I am applying/),
      expect.stringMatching(/^Your ad mentions/),
      expect.stringMatching(/^I would be glad/),
      'Kind regards,',
      'Alex Morgan',
    ]);
    const de = renderCoverHtml(COVER_FIXTURES.de, { template: 'lebenslauf', style: '{}' }, '2026-12-24');
    expect(de.expectedLines.map((l) => l.text)).toContain('Stuttgart, 1. Oktober 2026');
    expect(renderCoverHtml({ ...COVER_FIXTURES.de, letterDate: null }, { template: 'plain', style: '{}' }, '2026-12-24').expectedLines.map((l) => l.text)).toContain('Stuttgart, 24. Dezember 2026');
  });
});
