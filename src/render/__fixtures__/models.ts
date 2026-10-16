// Render fixtures (original, invented people): the two example profiles (EN/DE) and two "stress" masters that use
// every section kind, every line type, escaping traps, ligature words, diacritics, a section page break and enough
// text for two pages. PURE: drafts → Master → resolve (no database), so render tests and the referee need no SQLite.
import { SAMPLE_PROFILES } from '@/engine/content/sample-profiles';
import { resolve, type RenderModel } from '@/engine/resolve';
import type { Lang, Master, MasterDraft, TemplateId, VersionState } from '@/engine/types';

export function draftToMaster(draft: MasterDraft, now = 1_700_000_000_000): Master {
  const master: Master = {
    profile: {
      fullName: '',
      headline: '',
      email: '',
      phone: '',
      city: '',
      region: '',
      countryCode: '',
      birthDate: null,
      nationality: null,
      showPersonal: false,
      photoFile: null,
      summary: '',
      isExample: false,
      ...draft.profile,
      updatedAt: now,
    },
    links: (draft.links ?? []).map((l, i) => ({ id: i + 1, position: i, label: l.label, customLabel: l.customLabel ?? null, url: l.url })),
    sections: [],
    entries: [],
    bullets: [],
  };
  let entryId = 0;
  let bulletId = 0;
  draft.sections.forEach((s, si) => {
    master.sections.push({ id: si + 1, kind: s.kind, customTitle: s.customTitle ?? null, position: si });
    s.entries.forEach((e, ei) => {
      const id = ++entryId;
      master.entries.push({
        id,
        sectionId: si + 1,
        position: ei,
        title: e.title ?? '',
        organization: e.organization ?? '',
        location: e.location ?? '',
        startDate: e.startDate ?? null,
        endDate: e.endDate ?? null,
        isCurrent: e.isCurrent ?? false,
        url: e.url ?? '',
        description: e.description ?? '',
        extra: e.extra ?? {},
        createdAt: now,
        updatedAt: now,
      });
      (e.bullets ?? []).forEach((text, bi) =>
        master.bullets.push({ id: ++bulletId, entryId: id, position: bi, text, createdAt: now, updatedAt: now })
      );
    });
  });
  return master;
}

export type ModelOptions = {
  template: TemplateId;
  language?: Lang;
  style?: Record<string, unknown>;
  /** Section ids that start on a new page. */
  pageBreaks?: number[];
};

export function modelFor(draft: MasterDraft, lang: Lang, opts: ModelOptions): RenderModel {
  const master = draftToMaster(draft);
  const state: VersionState = {
    version: {
      id: 1,
      name: 'Fixture',
      targetCompany: '',
      targetRole: '',
      jobAd: '',
      language: opts.language ?? lang,
      template: opts.template,
      styleJson: JSON.stringify(opts.style ?? {}),
      headlineOverride: null,
      summaryOverride: null,
      sourceVersionId: null,
      archived: false,
      isExample: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      lastExportedAt: null,
    },
    sections: (opts.pageBreaks ?? []).map((sectionId) => ({ sectionId, included: true, position: null, titleOverride: null, pageBreakBefore: true })),
    entries: [],
    bullets: [],
  };
  return resolve(master, state);
}

export const STRESS_EN: MasterDraft = {
  profile: {
    fullName: 'Morgan "Mo" O\'Neill-Kowalczyk',
    headline: 'Senior Data & Operations Analyst <Supply Chain>',
    email: 'mo.oneill@example.org',
    phone: '+44 20 7946 0958',
    city: 'Manchester',
    region: 'Greater Manchester',
    countryCode: 'GB',
    summary:
      'Analyst with eleven years in retail and logistics: efficient reporting, office automation and affluent-customer insight.\nI build models that finance and operations both trust, and I explain them in plain words.',
  },
  links: [
    { label: 'linkedin', url: 'https://www.linkedin.com/in/mo-oneill-kowalczyk-example/' },
    { label: 'github', url: 'github.com/mo-example' },
  ],
  sections: [
    {
      kind: 'experience',
      entries: [
        {
          title: 'Senior Data Analyst',
          organization: 'Fieldfare & Finch Retail Ltd',
          location: 'Manchester',
          startDate: '2020-01',
          isCurrent: true,
          description: 'Reporting lead for 140 stores; team of 4 analysts.',
          bullets: [
            'Rebuilt the weekly sales forecast in Python and SQL; forecast error fell from 14% to 6% across 2,300 product lines',
            'Automated 22 office reports with Power BI, saving finance about 30 hours a month',
            'Ran 12 A/B tests on promotions with the marketing team and stopped 3 that lost money',
            'Wrote the data dictionary (180 fields) and trained 35 colleagues to use it <script>alert("x")</script>',
            'Presented quarterly findings to the board; the "efficient shelf" proposal was adopted in 2023 & 2024',
          ],
        },
        {
          title: 'Operations Analyst',
          organization: 'Kestrel Freight',
          location: 'Leeds',
          startDate: '2016-05',
          endDate: '2019-12',
          bullets: [
            'Modelled warehouse staffing for 3 sites and reduced overtime by 18% in the first year',
            'Built a route cost model in Excel that the pricing team still uses for every tender',
            'Cut the monthly close from 6 days to 3 by fixing 40 broken spreadsheet links and duplicated lookups that had grown over five years of quick fixes, so finance could publish figures before the board meeting instead of after it',
          ],
        },
        {
          title: 'Graduate Analyst',
          organization: 'Brannock Stores',
          location: 'Sheffield',
          startDate: '2013-09',
          endDate: '2016-04',
          bullets: ['Maintained stock reports for 60 stores', 'Answered 25 ad-hoc data requests a week from buyers'],
        },
      ],
    },
    {
      kind: 'projects',
      entries: [
        {
          title: 'Open shelf-gap detector',
          url: 'https://github.com/mo-example/shelf-gap',
          startDate: '2022',
          description: 'Weekend project: photos of shelves → gaps flagged with a small vision model.',
          bullets: ['Used by 2 local shops; 95% of gaps found in a 4-week trial'],
        },
      ],
    },
    {
      kind: 'education',
      entries: [
        { title: 'BSc Mathematics', organization: 'University of York', startDate: '2010', endDate: '2013', extra: { grade: 'First Class Honours' } },
      ],
    },
    {
      kind: 'certifications',
      entries: [
        { title: 'Microsoft Certified: Power BI Data Analyst Associate', organization: 'Microsoft', startDate: '2021-06', extra: { credentialId: 'PL300-0042' } },
      ],
    },
    {
      kind: 'skills',
      entries: [
        { title: 'Languages & tools', bullets: ['Python', 'SQL', 'R', 'Power BI', 'Excel (VBA)', 'C#', '.NET'] },
        { title: 'Methods', description: 'Forecasting, A/B testing, regression, cohort analysis' },
      ],
    },
    { kind: 'languages', entries: [{ title: 'English', extra: { level: 'Native' } }, { title: 'Polish', extra: { level: 'C1' } }] },
    {
      kind: 'awards',
      entries: [{ title: 'Analyst of the Year', organization: 'Fieldfare & Finch', startDate: '2022' }],
    },
    {
      kind: 'publications',
      entries: [{ title: 'Forecasting fresh food in small stores', organization: 'Retail Analytics Review', startDate: '2023-03' }],
    },
    {
      kind: 'volunteer',
      entries: [
        { title: 'Treasurer', organization: 'Ancoats Community Garden', startDate: '2019', isCurrent: true, bullets: ['Keep the books for a £12,000 yearly budget'] },
      ],
    },
    { kind: 'interests', entries: [{ description: 'Fell running, chess, baking sourdough' }] },
    { kind: 'custom', customTitle: 'Conferences & Talks', entries: [{ title: 'Speaker', organization: 'PyData Manchester', startDate: '2024-02' }] },
    { kind: 'references', entries: [{ description: 'Available on request.' }] },
  ],
};

export const STRESS_DE: MasterDraft = {
  profile: {
    fullName: 'Jörg-Peter Weiß',
    headline: 'Elektroniker für Betriebstechnik & Teamleiter',
    email: 'jp.weiss@example.de',
    phone: '+49 711 123456',
    city: 'Stuttgart',
    countryCode: 'DE',
    birthDate: '1988-11-03',
    nationality: 'deutsch',
    showPersonal: true,
    summary:
      'Elektroniker mit 14 Jahren Erfahrung in Instandhaltung und Inbetriebnahme. Effiziente Fehlersuche, offene Kommunikation und Verantwortung für ein Team von sechs Personen.',
  },
  links: [{ label: 'website', url: 'https://jp-weiss.example.de/' }],
  sections: [
    {
      kind: 'experience',
      entries: [
        {
          title: 'Teamleiter Instandhaltung',
          organization: 'Neckarwerk Süd GmbH & Co. KG',
          location: 'Stuttgart',
          startDate: '2019-03',
          isCurrent: true,
          bullets: [
            'Leitung eines Teams von 6 Elektronikern im Dreischichtbetrieb',
            'Senkung der ungeplanten Stillstände um 27 % durch vorbeugende Wartungspläne',
            'Einführung der digitalen Störungsdokumentation in SAP PM für 3 Hallen',
            'Planung und Abnahme von Schaltschränken nach DIN VDE 0100 und DGUV V3',
          ],
        },
        {
          title: 'Elektroniker für Betriebstechnik',
          organization: 'Fildermaschinen AG',
          location: 'Filderstadt',
          startDate: '2011-09',
          endDate: '2019-02',
          bullets: [
            'Inbetriebnahme von 40 Fertigungsanlagen mit Siemens S7 und TIA Portal',
            'Fehlersuche an Antrieben, Sensorik und Bussystemen (Profibus, Profinet)',
            'Betreuung von 5 Auszubildenden bis zur Gesellenprüfung',
          ],
        },
      ],
    },
    {
      kind: 'education',
      entries: [
        { title: 'Industriemeister Elektrotechnik (IHK)', organization: 'IHK Region Stuttgart', startDate: '2016-09', endDate: '2018-07', extra: { grade: '1,9' } },
        { title: 'Ausbildung zum Elektroniker für Betriebstechnik', organization: 'Fildermaschinen AG', startDate: '2008-09', endDate: '2011-07' },
      ],
    },
    {
      kind: 'certifications',
      entries: [{ title: 'Elektrofachkraft für festgelegte Tätigkeiten – Ausbilderschein (AEVO)', organization: 'IHK', startDate: '2017' }],
    },
    {
      kind: 'skills',
      entries: [
        { title: 'Steuerungstechnik', bullets: ['Siemens S7', 'TIA Portal', 'KNX', 'Profinet'] },
        { title: 'Software', bullets: ['SAP PM', 'EPLAN Electric P8', 'MS Office'] },
      ],
    },
    {
      kind: 'languages',
      entries: [
        { title: 'Deutsch', extra: { level: 'Muttersprache' } },
        { title: 'Englisch', extra: { level: 'B2' } },
        { title: 'Französisch', extra: { level: 'A2' } },
      ],
    },
    { kind: 'volunteer', entries: [{ title: 'Gruppenführer', organization: 'Freiwillige Feuerwehr Degerloch', startDate: '2010', isCurrent: true }] },
    { kind: 'custom', customTitle: 'Führerscheine & Straßenverkehr', entries: [{ description: 'Klasse B, C1E; Staplerschein' }] },
    { kind: 'interests', entries: [{ description: 'Modellbau, Radfahren, Ehrenamt' }] },
  ],
};

export type FixtureId = 'sample-en' | 'sample-de' | 'stress-en' | 'stress-de';
export const FIXTURES: Record<FixtureId, { lang: Lang; draft: MasterDraft }> = {
  'sample-en': { lang: 'en', draft: SAMPLE_PROFILES.en.master },
  'sample-de': { lang: 'de', draft: SAMPLE_PROFILES.de.master },
  'stress-en': { lang: 'en', draft: STRESS_EN },
  'stress-de': { lang: 'de', draft: STRESS_DE },
};
