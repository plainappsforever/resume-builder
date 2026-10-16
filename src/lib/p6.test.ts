/**
 * @jest-environment node
 */
// P6 glue that needs no phone: where a check's "Fix" leads, the cover letter's inputs, design, examples and plain text,
// and that an example letter prints the name once (A15 pure part).
import type { CoverLetter } from '@/db/covers';
import type { FixTarget } from '@/engine/checks';
import { COVER_EXAMPLES } from '@/engine/content/cover-examples';
import { documentFileName } from '@/engine/filenames';
import { de } from '@/i18n/de';
import { en } from '@/i18n/en';
import { parseSnapshot, snapshotJson } from '@/data/history';
import { renderCoverHtml } from '@/render';

import { coverDesign, coverExampleFields, coverInput, coverPlainText, todayIso } from './cover-input';
import { fixAction } from './fix-target';

const SENDER = { fullName: 'Alex Morgan', email: 'alex@example.com', phone: '+1 555 0142', city: 'Milwaukee', region: 'WI' };
const COVER: CoverLetter = {
  id: 3, versionId: 2, language: 'en', recipientCompany: 'Northwind Freight', contactPerson: '', address: '', letterDate: null, subject: '', salutation: '',
  body: '', closing: '', signatureName: '', isExample: false, createdAt: 1, updatedAt: 1,
};

describe('fixAction (every check opens the place to fix it)', () => {
  const cases: [FixTarget, unknown][] = [
    [{ kind: 'profile', field: 'email' }, { kind: 'route', href: '/profile' }],
    [{ kind: 'profile', field: 'fullName' }, { kind: 'route', href: '/profile' }],
    [{ kind: 'profile', field: 'summary' }, { kind: 'tab', tab: 'content' }],
    [{ kind: 'profile', field: 'headline' }, { kind: 'tab', tab: 'content' }],
    [{ kind: 'link', index: 1 }, { kind: 'route', href: '/profile' }],
    [{ kind: 'section', sectionId: 4 }, { kind: 'route', href: '/profile/section/4' }],
    [{ kind: 'entry', entryId: 7, field: 'url' }, { kind: 'route', href: '/version/9/entry/7' }],
    [{ kind: 'bullet', entryId: 7, bulletId: 21 }, { kind: 'route', href: '/version/9/entry/7' }],
    [{ kind: 'design' }, { kind: 'tab', tab: 'design' }],
    [{ kind: 'export' }, { kind: 'tab', tab: 'export' }],
  ];
  it.each(cases)('%j', (target, want) => {
    expect(fixAction(target, 9)).toEqual(want);
  });
});

describe('cover letter glue (F10, A15)', () => {
  it('takes the linked resume’s design, else Modern with the default paper', () => {
    expect(coverDesign({ template: 'lebenslauf', styleJson: '{"paper":"letter","accent":"#1F4E79"}' }, 'de', 'a4')).toMatchObject({ template: 'lebenslauf', style: { paper: 'letter', accent: '#1F4E79' } });
    expect(coverDesign(null, 'en', 'letter')).toMatchObject({ template: 'modern', style: { paper: 'letter', font: null } });
  });

  it('the letter row + profile become the renderer input', () => {
    expect(coverInput({ ...COVER, subject: 'S', body: 'B' }, SENDER)).toMatchObject({ language: 'en', recipientCompany: 'Northwind Freight', subject: 'S', body: 'B', sender: SENDER });
  });

  it('todayIso is the local date', () => {
    expect(todayIso(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
    expect(todayIso(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it.each(['en', 'de'] as const)('%s examples: placeholders filled, the closing keeps no name line, no contact → neutral salutation', (lang) => {
    for (const example of COVER_EXAMPLES[lang]) {
      const filled = coverExampleFields(example, { role: 'Operations Analyst', company: 'Northwind Freight', contact: 'Ms. Whitfield', name: 'Alex Morgan' }, lang);
      expect(filled.subject).toContain('Operations Analyst');
      expect(filled.body).toContain('Northwind Freight');
      expect(filled.body).not.toMatch(/\{(role|company|contact|name)\}/);
      expect(filled.salutation).toContain('Whitfield');
      expect(filled.closing).not.toContain('Alex');
      expect(filled.closing).not.toContain('{name}');
      const neutral = coverExampleFields(example, { role: '', company: '', contact: ' ', name: '' }, lang);
      expect(neutral.salutation).toBe(lang === 'en' ? 'Dear Hiring Manager,' : 'Sehr geehrte Damen und Herren,');
      expect(neutral.subject).toContain('{role}'); // an unknown value stays visible: the user sees what is missing
    }
  });

  it('an example letter prints the name once under the closing, and every printed line is an expected line', () => {
    const [example] = COVER_EXAMPLES.en;
    const fields = coverExampleFields(example, { role: 'Analyst', company: 'Northwind', contact: 'Ms. Whitfield', name: 'Alex Morgan' }, 'en');
    const input = coverInput({ ...COVER, ...fields }, SENDER);
    const doc = renderCoverHtml(input, coverDesign(null, 'en', 'a4'), '2026-10-03');
    const names = doc.expectedLines.filter((l) => l.text.includes('Alex Morgan'));
    expect(names.map((l) => l.text)).toEqual(['Alex Morgan', 'Alex Morgan']); // header + signature, no third copy in the closing
    expect(doc.expectedLines.some((l) => l.text === 'Kind regards,')).toBe(true);
    expect(doc.expectedLines.some((l) => l.text === '3 October 2026')).toBe(true);
  });

  it('a stored cover snapshot renders the same document again ("Share again" of a missing file, restored backup)', () => {
    const [example] = COVER_EXAMPLES.de;
    const fields = coverExampleFields(example, { role: 'Teamassistenz', company: 'Stadtwerke Talbach', contact: 'Frau Öztürk', name: 'Miriam Kowalski' }, 'de');
    const input = coverInput({ ...COVER, language: 'de', ...fields }, SENDER);
    const design = coverDesign({ template: 'lebenslauf', styleJson: '{"paper":"a4"}' }, 'de', 'a4');
    const first = renderCoverHtml(input, design, '2026-10-03');
    const stored = parseSnapshot(snapshotJson({ v: 1, kind: 'cover_pdf', cover: input, design, today: '2026-10-03' }));
    if (!stored || stored.kind !== 'cover_pdf') throw new Error('snapshot must parse');
    const again = renderCoverHtml(stored.cover, stored.design, stored.today);
    expect(again.html).toBe(first.html);
    expect(again.expectedLines).toEqual(first.expectedLines);
  });

  it('plain text: subject, salutation, body, closing and the name once', () => {
    const text = coverPlainText(coverInput({ ...COVER, subject: 'Application: Analyst', salutation: 'Dear Ms. Whitfield,', body: 'Hello.\n\nSecond.', closing: 'Kind regards,' }, SENDER));
    expect(text).toBe('Application: Analyst\n\nDear Ms. Whitfield,\n\nHello.\n\nSecond.\n\nKind regards,\nAlex Morgan\n');
  });

  it('cover file names use the recipient company (§5.9)', () => {
    expect(documentFileName({ fullName: 'Alex Morgan', company: 'Northwind Freight', language: 'en', kind: 'cover', ext: 'pdf' })).toBe('Alex-Morgan-Cover-Letter-Northwind-Freight.pdf');
    expect(documentFileName({ fullName: 'Jörg Weiß', company: 'Stadtwerke Talbach', language: 'de', kind: 'cover', ext: 'pdf' })).toBe('Joerg-Weiss-Anschreiben-Stadtwerke-Talbach.pdf');
  });
});

describe('P6 wording', () => {
  it('"what ATS means" and the evidence pages exist in both languages and say nothing is promised', () => {
    for (const dict of [en, de]) {
      for (const key of ['help.ats.p1', 'help.ats.p4', 'help.evidence.intro', 'help.evidence.unknown.body', 'about.privacy.noNetwork'] as const) expect(dict[key].length).toBeGreaterThan(20);
    }
    expect(en['help.ats.p4']).toMatch(/promises a result/);
    expect(en['help.evidence.readback.body']).toMatch(/not a promise/);
    expect(de['help.evidence.readback.body']).toMatch(/kein Versprechen/);
  });
});
