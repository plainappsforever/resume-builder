// A6 fixtures: one clean document that triggers no check, and per check id a change that makes exactly that check
// fire (plus one that must not fire). Invented people and companies.
import type { CheckContext, CheckId } from '../checks';
import type { RenderModel } from '../resolve';

export const TODAY = { year: 2026, month: 10 };

export function cleanModel(): RenderModel {
  return {
    versionId: 1,
    name: 'Clean',
    language: 'en',
    template: 'modern',
    style: { font: 'inter', accent: null, sizeStep: 0, marginStep: 0, spacingStep: 0, headingCase: null, photo: false, paper: 'a4', dateStyle: 'Mon YYYY' },
    person: {
      fullName: 'Robin Example',
      headline: 'Senior Data Analyst',
      email: 'robin@example.com',
      phone: '+1 555 0199',
      city: 'Denver',
      region: 'CO',
      countryCode: 'US',
      birthDate: null,
      nationality: null,
      photoFile: null,
      links: [{ label: 'linkedin', customLabel: null, url: 'linkedin.com/in/robin-example' }],
    },
    summary: 'Analyst with 7 years in retail data — dashboards, SQL and clear reports.',
    sections: [
      {
        id: 10,
        kind: 'experience',
        title: null,
        pageBreakBefore: false,
        entries: [
          {
            id: 11, title: 'Senior Data Analyst', organization: 'Fernway Outdoor', location: 'Denver, CO', description: '',
            startDate: '2021-03', endDate: null, isCurrent: true, url: 'https://fernway.example.com', extra: {},
            bullets: [
              { id: 111, text: 'Built 15 Tableau dashboards used by 120 people' },
              { id: 112, text: 'Reduced report errors by 60% with automated checks' },
            ],
          },
          {
            id: 12, title: 'Data Analyst', organization: 'Copper Kettle', location: 'Portland, OR', description: '',
            startDate: '2018-06', endDate: '2021-02', isCurrent: false, url: '', extra: {},
            bullets: [{ id: 121, text: 'Wrote 200 SQL queries for weekly sales reports' }],
          },
        ],
      },
      {
        id: 20,
        kind: 'skills',
        title: 'Technical Skills',
        pageBreakBefore: false,
        entries: [{ id: 21, title: 'Tools', organization: '', location: '', description: '', startDate: null, endDate: null, isCurrent: false, url: '', extra: {}, bullets: [{ id: 211, text: 'SQL' }, { id: 212, text: 'Tableau' }] }],
      },
    ],
    droppedSections: [],
  };
}

export const CLEAN_CONTEXT: CheckContext = {
  today: TODAY,
  lastExport: { bytes: 96_000, pages: 1 },
  readback: { pass: true },
};

type Change = (m: RenderModel, ctx: CheckContext) => void;
export type CheckCase = { id: CheckId; name: string; change: Change; codes: string[] };

const exp = (m: RenderModel) => m.sections[0].entries[0];
const bullet = (m: RenderModel) => exp(m).bullets[0];

/** `codes` = the finding codes the case must produce, all from check `id`, and nothing else anywhere. */
export const FIRING: CheckCase[] = [
  { id: 'C1', name: 'no name', change: (m) => void (m.person.fullName = ' '), codes: ['name'] },
  { id: 'C1', name: 'no e-mail', change: (m) => void (m.person.email = ''), codes: ['email'] },
  { id: 'C1', name: 'no phone', change: (m) => void (m.person.phone = ''), codes: ['phone'] },
  { id: 'C4', name: 'photo on', change: (m) => void (m.person.photoFile = 'photos/me.jpg'), codes: ['photo'] },
  { id: 'C5', name: 'custom section title', change: (m) => void (m.sections[1].title = 'Cool Stuff'), codes: ['customTitle'] },
  { id: 'C6', name: 'Sr. in a job title', change: (m) => void (exp(m).title = 'Sr. Data Analyst'), codes: ['abbreviation'] },
  { id: 'C6', name: 'VP in the headline', change: (m) => void (m.person.headline = 'VP Analytics'), codes: ['abbreviation'] },
  { id: 'C7', name: 'spaced letters in the name', change: (m) => void (m.person.fullName = 'R O B I N Example'), codes: ['spacedLetters'] },
  { id: 'C8', name: 'experience without start', change: (m) => void (exp(m).startDate = null), codes: ['noStart'] },
  { id: 'C8', name: 'end before start', change: (m) => void (m.sections[0].entries[1].endDate = '2017-01'), codes: ['endBeforeStart'] },
  { id: 'C8', name: 'start in the future', change: (m) => void (exp(m).startDate = '2026-11'), codes: ['futureStart'] },
  { id: 'C8', name: 'year and month mixed', change: (m) => void (m.sections[0].entries[1].startDate = '2018'), codes: ['mixedPrecision'] },
  {
    id: 'C9',
    name: 'empty section dropped',
    change: (m) => void m.droppedSections.push({ id: 30, kind: 'awards', title: null }),
    codes: ['emptySection'],
  },
  {
    id: 'C9',
    name: 'empty entry',
    change: (m) => void m.sections[1].entries.push({ id: 22, title: ' ', organization: '', location: 'Berlin', description: '', startDate: null, endDate: null, isCurrent: false, url: '', extra: { level: '' }, bullets: [] }),
    codes: ['emptyEntry'],
  },
  { id: 'C9', name: 'empty bullet', change: (m) => void m.sections[1].entries[0].bullets.push({ id: 213, text: '  ' }), codes: ['emptyBullet'] },
  { id: 'C10', name: 'bullet over 300 characters', change: (m) => void (bullet(m).text = 'Built 1 ' + 'x'.repeat(293)), codes: ['long'] },
  { id: 'C10', name: 'first person', change: (m) => void (bullet(m).text = 'I built 15 Tableau dashboards'), codes: ['firstPerson', 'noVerb'] },
  { id: 'C10', name: 'no number', change: (m) => void (bullet(m).text = 'Built Tableau dashboards for sales'), codes: ['noNumber'] },
  { id: 'C10', name: 'no action word', change: (m) => void (bullet(m).text = 'Responsible for 15 dashboards'), codes: ['noVerb'] },
  { id: 'C10', name: 'duplicate bullet', change: (m) => void (m.sections[0].entries[1].bullets[0].text = 'built 15 tableau dashboards used by 120 people.'), codes: ['duplicate'] },
  { id: 'C11', name: 'file over 2.5 MB', change: (_m, c) => void (c.lastExport = { bytes: 2_600_000, pages: 1 }), codes: ['fileSize'] },
  { id: 'C12', name: 'three pages', change: (_m, c) => void (c.lastExport = { bytes: 120_000, pages: 3 }), codes: ['pages'] },
  { id: 'C13', name: 'emoji', change: (m) => void (m.summary = 'Analyst 🚀 with 7 years'), codes: ['glyphs'] },
  { id: 'C13', name: 'Cyrillic with a Latin-only font', change: (m) => void ((m.style.font = 'merriweather'), (exp(m).organization = 'Ромашка')), codes: ['glyphs'] },
  { id: 'C14', name: 'bad e-mail', change: (m) => void (m.person.email = 'robin@example'), codes: ['email'] },
  { id: 'C14', name: 'bad link', change: (m) => void (m.person.links[0].url = 'linkedin com/in/robin'), codes: ['url'] },
  { id: 'C14', name: 'bad entry URL', change: (m) => void (exp(m).url = 'ftp://fernway.example.com'), codes: ['url'] },
  { id: 'C15', name: 'read-back failed', change: (_m, c) => void (c.readback = { pass: false }), codes: ['readbackFailed'] },
];

/** Changes that look close to a rule but must NOT fire anything. */
export const NOT_FIRING: { name: string; change: Change }[] = [
  { name: 'standard custom title (C5)', change: (m) => void (m.sections[1].title = 'Berufserfahrung') },
  { name: 'B.Eng. degree is not "Eng." (C6)', change: (m) => void (exp(m).title = 'Data Analyst, B.Eng.') },
  { name: '"VPN" is not "VP" (C6)', change: (m) => void (exp(m).title = 'VPN Data Analyst') },
  { name: 'initials "J. R." are not spaced letters (C7)', change: (m) => void (m.person.fullName = 'J. R. Example') },
  { name: 'two single letters are fine (C7)', change: (m) => void (m.summary = 'Analyst for A B testing with 7 years') },
  { name: 'year-only dates in a whole section (C8)', change: (m) => void ((exp(m).startDate = '2021'), (m.sections[0].entries[1].startDate = '2018'), (m.sections[0].entries[1].endDate = '2021')) },
  { name: 'start this month (C8)', change: (m) => void (exp(m).startDate = '2026-10') },
  { name: 'end in the start year with year-only precision (C8)', change: (m) => void ((m.sections[0].entries[1].startDate = '2018'), (m.sections[0].entries[1].endDate = '2018'), (exp(m).startDate = '2021')) },
  { name: 'German noun start "Leitung" (C10)', change: (m) => void (bullet(m).text = 'Leitung von 15 Dashboards') },
  { name: 'British spelling "Organised" (C10)', change: (m) => void (bullet(m).text = 'Organised 15 dashboards') },
  { name: 'bullet of exactly 300 characters (C10)', change: (m) => void (bullet(m).text = 'Built 1 ' + 'x'.repeat(292)) },
  { name: 'skills items are not checked as bullets (C10)', change: (m) => void (m.sections[1].entries[0].bullets[0].text = 'responsible stuff') },
  { name: 'file of exactly 2,500,000 bytes, 2 pages (C11, C12)', change: (_m, c) => void (c.lastExport = { bytes: 2_500_000, pages: 2 }) },
  { name: 'German, French and Polish letters, € and – (C13)', change: (m) => void (m.summary = 'Müller, Garçon, Łódź – 5 € and “quotes” • ok™') },
  { name: 'Greek with Inter (C13)', change: (m) => void (exp(m).organization = 'Ωmega Labs') },
  { name: 'URL with path, port and https (C14)', change: (m) => void (exp(m).url = 'HTTPS://example.co.uk:8080/a?b=1#c') },
  { name: 'umlaut domain (C14)', change: (m) => void (m.person.email = 'lena@müller.de') },
];
