// Example profiles for "Look at an example" (SPEC §6, D21, D41): invented people and companies, original text.
// Plain drafts; P6 seeds them with seedMaster + createVersion (is_example = 1) and removes them cleanly.
import type { Lang, MasterDraft, TemplateId } from '../types';

export type SampleVersionDraft = {
  name: string;
  targetCompany: string;
  targetRole: string;
  language: Lang;
  template: TemplateId;
  jobAd: string;
  /** Section indexes in the master draft that this version hides (a hidden section is not reported as empty). */
  hiddenSections: readonly number[];
  /** [section index, entry index] in the master draft, hidden in this version. */
  hiddenEntries: readonly (readonly [number, number])[];
  /** [section index, entry index, bullet index], hidden in this version. */
  hiddenBullets: readonly (readonly [number, number, number])[];
};

export type SampleProfile = { lang: Lang; master: MasterDraft; versions: readonly SampleVersionDraft[] };

const EN_AD = `Operations Analyst
Northwind Freight, Chicago (hybrid)

What you'll do:
• Track delivery performance and build weekly dashboards in Power BI
• Find the causes of late deliveries and propose process improvements
• Support route planning with the dispatch team

Requirements:
• 2+ years in logistics or operations
• Advanced Excel; SQL is a plus
• Clear stakeholder communication
• Experience with process improvement or Lean`;

const DE_AD = `Teamassistenz (m/w/d) Netzbetrieb
Stadtwerke Talbach

Deine Aufgaben:
• Terminplanung und Kalenderführung für die Abteilungsleitung
• Vorbereitung von Besprechungen und Protokollführung
• Bestellwesen und Rechnungsprüfung in SAP

Dein Profil:
• Abgeschlossene Ausbildung als Kauffrau/Kaufmann für Büromanagement
• Sehr gute MS-Office-Kenntnisse, besonders Excel und Outlook
• Erfahrung mit SAP
• Organisationstalent und Diskretion`;

export const SAMPLE_PROFILES: Record<Lang, SampleProfile> = {
  en: {
    lang: 'en',
    master: {
      profile: {
        fullName: 'Alex Morgan',
        headline: 'Operations Coordinator',
        email: 'alex.morgan@example.com',
        phone: '+1 555 0142',
        city: 'Milwaukee',
        region: 'WI',
        countryCode: 'US',
        summary:
          'Operations coordinator with six years in logistics and customer service. I like turning messy processes into simple routines and measuring whether they work.',
        isExample: true,
      },
      links: [{ label: 'linkedin', url: 'linkedin.com/in/alex-morgan-example' }],
      sections: [
        {
          kind: 'experience',
          entries: [
            {
              title: 'Operations Coordinator',
              organization: 'Harbourline Logistics',
              location: 'Milwaukee, WI',
              startDate: '2021-04',
              isCurrent: true,
              bullets: [
                'Built 6 Excel dashboards that the depot uses every morning to plan 40 delivery routes',
                'Reduced late deliveries from 9% to 4% by changing the loading order and cut-off times',
                'Coordinated 3 carriers and 12 drivers during the peak season',
                'Introduced a weekly review of delivery data with the dispatch team',
              ],
            },
            {
              title: 'Customer Service Team Lead',
              organization: 'BrightCart',
              location: 'Milwaukee, WI',
              startDate: '2018-02',
              endDate: '2021-03',
              bullets: [
                'Led a team of 7 agents handling 400 orders and complaints a day',
                'Raised customer satisfaction from 86% to 93% in 18 months',
                'Wrote 30 help articles that reduced repeat contacts by 15%',
              ],
            },
            {
              title: 'Barista',
              organization: 'Corner Roast Café',
              location: 'Madison, WI',
              startDate: '2016-09',
              endDate: '2018-01',
              bullets: ['Served up to 250 customers per shift', 'Trained 4 new baristas'],
            },
          ],
        },
        {
          kind: 'projects',
          entries: [
            {
              title: 'Late delivery analysis',
              description: 'Personal project with public city traffic data.',
              startDate: '2023',
              bullets: ['Analyzed 18 months of delivery times with SQL and Power BI and found 3 avoidable delay patterns'],
            },
          ],
        },
        {
          kind: 'volunteer',
          entries: [
            {
              title: 'Route planning volunteer',
              organization: 'Lakeside Food Bank',
              startDate: '2022',
              isCurrent: true,
              bullets: ['Planned weekly routes for 9 volunteer drivers serving 120 families'],
            },
          ],
        },
        {
          kind: 'education',
          entries: [
            {
              title: 'Associate Degree in Business Administration',
              organization: 'Milwaukee Area Technical College',
              startDate: '2014',
              endDate: '2016',
            },
          ],
        },
        {
          kind: 'skills',
          entries: [
            { title: 'Tools', bullets: ['Excel (pivot tables, XLOOKUP)', 'Power BI', 'SQL (basic)', 'Google Workspace'] },
            { title: 'Methods', bullets: ['Process improvement', 'Lean basics', 'Stakeholder communication'] },
          ],
        },
        {
          kind: 'languages',
          entries: [
            { title: 'English', extra: { level: 'Native' } },
            { title: 'Spanish', extra: { level: 'Conversational' } },
          ],
        },
      ],
    },
    versions: [
      {
        name: 'General',
        targetCompany: '',
        targetRole: '',
        language: 'en',
        template: 'modern',
        jobAd: '',
        hiddenSections: [],
        hiddenEntries: [[0, 2]],
        hiddenBullets: [],
      },
      {
        name: 'Northwind Freight – Operations Analyst',
        targetCompany: 'Northwind Freight',
        targetRole: 'Operations Analyst',
        language: 'en',
        template: 'classic',
        jobAd: EN_AD,
        hiddenSections: [2],
        hiddenEntries: [[0, 2]],
        hiddenBullets: [[0, 1, 2]],
      },
    ],
  },
  de: {
    lang: 'de',
    master: {
      profile: {
        fullName: 'Miriam Kowalski',
        headline: 'Kauffrau für Büromanagement',
        email: 'miriam.kowalski@example.de',
        phone: '+49 561 123456',
        city: 'Kassel',
        countryCode: 'DE',
        birthDate: '1992-06-03',
        nationality: 'deutsch',
        showPersonal: true,
        summary:
          'Kauffrau für Büromanagement mit acht Jahren Erfahrung in Assistenz und Sachbearbeitung. Ich halte Abläufe und Termine im Griff, damit sich andere auf ihre Arbeit konzentrieren können.',
        isExample: true,
      },
      sections: [
        {
          kind: 'experience',
          entries: [
            {
              title: 'Teamassistenz Vertrieb',
              organization: 'Fuldatal Maschinenbau GmbH',
              location: 'Kassel',
              startDate: '2020-01',
              isCurrent: true,
              bullets: [
                'Terminplanung und Kalenderführung für die Vertriebsleitung und 6 Außendienstler',
                'Vorbereitung von Besprechungen und Protokollführung bei 12 Kundenterminen pro Monat',
                'Bearbeitung von rund 80 Bestellungen pro Monat in SAP',
                'Einführung einer digitalen Ablage, die 20 Papierordner ersetzte',
              ],
            },
            {
              title: 'Sachbearbeiterin Einkauf',
              organization: 'Hessenland Bürobedarf KG',
              location: 'Kassel',
              startDate: '2016-08',
              endDate: '2019-12',
              bullets: [
                'Rechnungsprüfung für 300 Eingangsrechnungen pro Monat',
                'Pflege der Lieferantendaten für 450 Artikel in SAP MM',
              ],
            },
            {
              title: 'Aushilfe im Verkauf',
              organization: 'Bäckerei Sonnenkorn',
              location: 'Baunatal',
              startDate: '2013-09',
              endDate: '2016-07',
              bullets: ['Beratung von bis zu 150 Kundinnen und Kunden pro Schicht'],
            },
          ],
        },
        {
          kind: 'education',
          entries: [
            {
              title: 'Ausbildung zur Kauffrau für Büromanagement',
              organization: 'IHK Kassel-Marburg',
              startDate: '2013-08',
              endDate: '2016-07',
              extra: { grade: '1,9' },
            },
          ],
        },
        {
          kind: 'skills',
          entries: [
            { title: 'EDV', bullets: ['MS Office (sehr gut, besonders Excel und Outlook)', 'SAP MM und SD', 'DATEV Unternehmen online'] },
            { title: 'Arbeitsweise', bullets: ['Organisationstalent', 'Diskretion', 'Zehnfingersystem'] },
          ],
        },
        {
          kind: 'languages',
          entries: [
            { title: 'Deutsch', extra: { level: 'Muttersprache' } },
            { title: 'Englisch', extra: { level: 'B2' } },
            { title: 'Polnisch', extra: { level: 'B1' } },
          ],
        },
      ],
    },
    versions: [
      {
        name: 'Allgemein',
        targetCompany: '',
        targetRole: '',
        language: 'de',
        template: 'lebenslauf',
        jobAd: '',
        hiddenSections: [],
        hiddenEntries: [],
        hiddenBullets: [],
      },
      {
        name: 'Stadtwerke Talbach – Teamassistenz',
        targetCompany: 'Stadtwerke Talbach',
        targetRole: 'Teamassistenz',
        language: 'de',
        template: 'lebenslauf',
        jobAd: DE_AD,
        hiddenSections: [],
        hiddenEntries: [[0, 2]],
        hiddenBullets: [],
      },
    ],
  },
};
