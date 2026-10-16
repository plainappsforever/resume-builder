import { FIXTURES, modelFor } from '@/render/__fixtures__/models';

import { documentFileName } from './filenames';
import { plainText } from './plaintext';

describe('plain-text export (SPEC §5.9)', () => {
  it('EN example: capital headings, entry lines with inline dates, "- " bullets, one blank line between sections', () => {
    const text = plainText(modelFor(FIXTURES['sample-en'].draft, 'en', { template: 'modern' }));
    const blocks = text.trimEnd().split('\n\n');
    expect(blocks[0].split('\n')).toEqual(['Alex Morgan', 'Operations Coordinator', 'Milwaukee, WI · alex.morgan@example.com · +1 555 0142 · linkedin.com/in/alex-morgan-example']);
    expect(blocks[1].split('\n')[0]).toBe('SUMMARY');
    expect(blocks[2].split('\n').slice(0, 3)).toEqual([
      'EXPERIENCE',
      'Operations Coordinator, Harbourline Logistics, Milwaukee, WI, Apr 2021 – Present',
      '- Built 6 Excel dashboards that the depot uses every morning to plan 40 delivery routes',
    ]);
    expect(text).not.toMatch(/\n\n\n|•|<|&amp;/);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('DE stress: German labels and dates, personal details, skills and languages as one line each, ß upper-cased', () => {
    const text = plainText(modelFor(FIXTURES['stress-de'].draft, 'de', { template: 'lebenslauf' }));
    expect(text).toContain('Geburtsdatum: 03.11.1988 · Staatsangehörigkeit: deutsch');
    expect(text).toContain('BERUFSERFAHRUNG\nTeamleiter Instandhaltung, Neckarwerk Süd GmbH & Co. KG, Stuttgart, 03/2019 – heute');
    expect(text).toContain('Industriemeister Elektrotechnik (IHK), IHK Region Stuttgart, 09/2016 – 07/2018\nNote: 1,9');
    expect(text).toContain('Steuerungstechnik: Siemens S7, TIA Portal, KNX, Profinet');
    expect(text).toContain('SPRACHEN\nDeutsch – Muttersprache\nEnglisch – B2');
    expect(text).toContain('FÜHRERSCHEINE & STRASSENVERKEHR');
  });

  it('escaping traps stay literal text; deterministic', () => {
    const model = modelFor(FIXTURES['stress-en'].draft, 'en', { template: 'plain' });
    const text = plainText(model);
    expect(text).toContain('<script>alert("x")</script>');
    expect(text).toContain('Morgan "Mo" O\'Neill-Kowalczyk');
    expect(plainText(model)).toBe(text);
    expect(documentFileName({ fullName: model.person.fullName, company: 'Acme', language: 'en', kind: 'resume', ext: 'txt' })).toBe(
      'Morgan-Mo-O-Neill-Kowalczyk-Resume-Acme.txt'
    );
  });
});
