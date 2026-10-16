// Test masters (original, invented people and companies). Used by the db, resolve and (from P3) render tests.
import type { MasterDraft } from '../types';

export const MASTER_EN: MasterDraft = {
  profile: {
    fullName: 'Jordan Avery Lee',
    headline: 'Warehouse Team Lead',
    email: 'jordan.lee@example.com',
    phone: '+1 555 0100',
    city: 'Columbus',
    region: 'OH',
    countryCode: 'US',
    summary: 'Team lead with eight years in fulfilment centres; cut picking errors and trained new staff.',
  },
  links: [{ label: 'linkedin', url: 'https://www.linkedin.com/in/jordan-lee-example' }],
  sections: [
    {
      kind: 'experience',
      entries: [
        {
          title: 'Warehouse Team Lead',
          organization: 'Northfield Logistics',
          location: 'Columbus, OH',
          startDate: '2021-03',
          isCurrent: true,
          bullets: [
            'Led a team of 14 pickers and packers across two shifts',
            'Reduced picking errors by 32% with a barcode double-check',
            'Trained 25 new hires on forklift safety and the WMS',
          ],
        },
        {
          title: 'Warehouse Associate',
          organization: 'Brightway Distribution',
          location: 'Dayton, OH',
          startDate: '2017-06',
          endDate: '2021-02',
          bullets: ['Picked and packed up to 180 orders per shift', 'Kept inventory counts accurate during peak season'],
        },
      ],
    },
    {
      kind: 'education',
      entries: [{ title: 'High School Diploma', organization: 'Eastmoor High School', startDate: '2013', endDate: '2017' }],
    },
    {
      kind: 'skills',
      entries: [
        { title: 'Equipment', bullets: ['Forklift (certified)', 'Pallet jack', 'RF scanners'] },
        { title: 'Software', bullets: ['SAP EWM', 'Microsoft Excel'] },
      ],
    },
    {
      kind: 'certifications',
      entries: [{ title: 'OSHA 10-Hour General Industry', organization: 'OSHA', startDate: '2022-05' }],
    },
  ],
};

export const MASTER_DE: MasterDraft = {
  profile: {
    fullName: 'Lena Müller-Özdemir',
    headline: 'Pflegefachkraft',
    email: 'lena.mueller@example.de',
    phone: '+49 30 1234567',
    city: 'Berlin',
    countryCode: 'DE',
    birthDate: '1994-04-12',
    nationality: 'deutsch',
    showPersonal: true,
    summary: 'Examinierte Pflegefachkraft mit sechs Jahren Erfahrung auf der Intensivstation.',
  },
  sections: [
    {
      kind: 'experience',
      entries: [
        {
          title: 'Pflegefachkraft Intensivstation',
          organization: 'Klinikum Am Südpark',
          location: 'Berlin',
          startDate: '2019-10',
          isCurrent: true,
          bullets: ['Betreuung von bis zu drei beatmeten Patienten pro Schicht', 'Praxisanleitung für Auszubildende'],
        },
      ],
    },
    {
      kind: 'education',
      entries: [
        {
          title: 'Ausbildung zur Gesundheits- und Krankenpflegerin',
          organization: 'Pflegeschule Nord',
          startDate: '2016-09',
          endDate: '2019-08',
          extra: { grade: '1,7' },
        },
      ],
    },
    {
      kind: 'languages',
      entries: [
        { title: 'Deutsch', extra: { level: 'native' } },
        { title: 'Türkisch', extra: { level: 'C1' } },
        { title: 'Englisch', extra: { level: 'B2' } },
      ],
    },
  ],
};
