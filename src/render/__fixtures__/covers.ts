// Cover-letter fixtures (original text, invented people), EN + DE.
import type { Lang } from '@/engine/types';

import type { CoverInput } from '../html/cover';

export const COVER_FIXTURES: Record<Lang, CoverInput> = {
  en: {
    language: 'en',
    sender: { fullName: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '+1 555 0142', city: 'Milwaukee', region: 'WI' },
    recipientCompany: 'Northwind Freight',
    contactPerson: 'Ms. Dana Whitfield',
    address: '200 Lake Shore Drive\nChicago, IL 60601',
    letterDate: null,
    subject: 'Application: Operations Analyst',
    salutation: 'Dear Ms. Whitfield,',
    body:
      'I am applying for the Operations Analyst role. For three years I have built the dashboards our depot uses every morning to plan 40 delivery routes, and I cut late deliveries from 9% to 4%.\n\nYour ad mentions Power BI, SQL and process improvement. I use all three every week, and I enjoy explaining the numbers to dispatch teams so that they actually change how we work.\n\nI would be glad to show you one of my dashboards in an interview.',
    closing: 'Kind regards,',
    signatureName: 'Alex Morgan',
  },
  de: {
    language: 'de',
    sender: { fullName: 'Jörg-Peter Weiß', email: 'jp.weiss@example.de', phone: '+49 711 123456', city: 'Stuttgart', region: '' },
    recipientCompany: 'Stadtwerke Talbach GmbH',
    contactPerson: 'Frau Dr. Sabine Öztürk',
    address: 'Kraftwerkstraße 12\n70565 Stuttgart',
    letterDate: '2026-10-01',
    subject: 'Bewerbung als Teamleiter Instandhaltung (m/w/d)',
    salutation: 'Sehr geehrte Frau Dr. Öztürk,',
    body:
      'mit großem Interesse habe ich Ihre Stellenanzeige gelesen. Seit 2019 leite ich ein Team von sechs Elektronikern und habe die ungeplanten Stillstände um 27 % gesenkt.\n\nDie Arbeit mit Siemens S7, TIA Portal und SAP PM gehört zu meinem Alltag. Besonders reizt mich an Ihrer Stelle die Verantwortung für die Netzleittechnik.\n\nÜber eine Einladung zu einem persönlichen Gespräch freue ich mich.',
    closing: 'Mit freundlichen Grüßen',
    signatureName: 'Jörg-Peter Weiß',
  },
};
