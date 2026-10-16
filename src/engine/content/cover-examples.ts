// Cover-letter examples (SPEC F10/F11, D41): original text, EN + DE. Placeholders in braces are filled from the
// cover letter's fields when inserted ({role}, {company}, {contact}, {name}); everything else is meant to be rewritten.
import type { Lang } from '../types';

export const COVER_PLACEHOLDERS = ['role', 'company', 'contact', 'name'] as const;
export type CoverPlaceholder = (typeof COVER_PLACEHOLDERS)[number];

export type CoverExample = {
  id: 'experienced' | 'careerChange' | 'firstJob';
  title: string;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
};

export const COVER_EXAMPLES: Record<Lang, readonly CoverExample[]> = {
  en: [
    {
      id: 'experienced',
      title: 'Experienced in the field',
      subject: 'Application: {role}',
      salutation: 'Dear {contact},',
      body: [
        'I would like to apply for the {role} position at {company}. For the past five years I have done this kind of work every day, and the requirements in your ad read like a description of my current week.',
        'In my present role I [one concrete result with a number, e.g. "cut the time to process returns from three days to one"]. I also [second result that matches a requirement in the ad]. I enjoy work where small improvements add up, and I like to leave a process clearer than I found it.',
        'What draws me to {company} is [one specific reason: a product, a value, a project you read about]. I would be glad to show in a conversation how my experience can help your team from the first week.',
      ].join('\n\n'),
      closing: 'Kind regards,\n{name}',
    },
    {
      id: 'careerChange',
      title: 'Changing careers',
      subject: 'Application: {role}',
      salutation: 'Dear {contact},',
      body: [
        'I am applying for the {role} position at {company}. My background is in [previous field], and over the past [time] I have prepared deliberately for this change: [course, certificate or project].',
        'Much of what your ad asks for is what I already do, under a different name. In [previous job] I [result that uses a skill from the ad, with a number]. I also [second transferable result]. These are the parts of my work I enjoy most, and they are the core of the role you describe.',
        'I know I am new to the field, so I have tested the move in practice: [small project, volunteering or side work]. I would welcome the chance to explain in person why I am confident this is the right step, for me and for {company}.',
      ].join('\n\n'),
      closing: 'Kind regards,\n{name}',
    },
    {
      id: 'firstJob',
      title: 'First job or apprenticeship',
      subject: 'Application: {role}',
      salutation: 'Dear {contact},',
      body: [
        'I recently completed [school, degree or training] and am applying for the {role} position at {company}.',
        'During [internship, project or part-time job] I [what you did, with a number if you can, e.g. "helped about 40 customers a day"]. I learned that I work best when [honest observation about how you work], and I want to build on that in a team like yours.',
        'I am reliable, I learn quickly, and I am happy to start with the basics. I would be glad to introduce myself in an interview.',
      ].join('\n\n'),
      closing: 'Kind regards,\n{name}',
    },
  ],
  de: [
    {
      id: 'experienced',
      title: 'Berufserfahren',
      subject: 'Bewerbung als {role}',
      salutation: 'Sehr geehrte/r {contact},',
      body: [
        'hiermit bewerbe ich mich als {role} bei {company}. Seit fünf Jahren arbeite ich täglich in diesem Bereich, und die Anforderungen in Ihrer Anzeige lesen sich wie eine Beschreibung meiner jetzigen Arbeitswoche.',
        'In meiner aktuellen Position habe ich [ein konkretes Ergebnis mit Zahl, z. B. „die Bearbeitungszeit für Retouren von drei Tagen auf einen verkürzt“]. Außerdem habe ich [zweites Ergebnis, das zu einer Anforderung der Anzeige passt]. Mir liegt Arbeit, bei der sich kleine Verbesserungen summieren, und ich hinterlasse Abläufe gern klarer, als ich sie vorgefunden habe.',
        'An {company} reizt mich besonders [ein konkreter Grund: ein Produkt, ein Wert, ein Projekt, über das Sie gelesen haben]. Gern zeige ich Ihnen in einem Gespräch, wie meine Erfahrung Ihr Team von der ersten Woche an unterstützen kann.',
      ].join('\n\n'),
      closing: 'Mit freundlichen Grüßen\n{name}',
    },
    {
      id: 'careerChange',
      title: 'Quereinstieg',
      subject: 'Bewerbung als {role}',
      salutation: 'Sehr geehrte/r {contact},',
      body: [
        'hiermit bewerbe ich mich als {role} bei {company}. Ich komme aus [bisheriger Bereich] und habe mich in den letzten [Zeitraum] gezielt auf diesen Wechsel vorbereitet: [Kurs, Zertifikat oder Projekt].',
        'Vieles von dem, was Ihre Anzeige verlangt, mache ich bereits – nur unter anderem Namen. Als [bisherige Stelle] habe ich [Ergebnis mit einer Fähigkeit aus der Anzeige, mit Zahl]. Außerdem habe ich [zweites übertragbares Ergebnis]. Genau diese Teile meiner Arbeit machen mir am meisten Freude, und sie sind der Kern der beschriebenen Stelle.',
        'Mir ist bewusst, dass ich neu in diesem Feld bin. Deshalb habe ich den Wechsel bereits praktisch erprobt: [kleines Projekt, Ehrenamt oder Nebentätigkeit]. Gern erläutere ich Ihnen persönlich, warum ich überzeugt bin, dass dieser Schritt für mich und für {company} der richtige ist.',
      ].join('\n\n'),
      closing: 'Mit freundlichen Grüßen\n{name}',
    },
    {
      id: 'firstJob',
      title: 'Berufseinstieg oder Ausbildung',
      subject: 'Bewerbung um einen Platz als {role}',
      salutation: 'Sehr geehrte/r {contact},',
      body: [
        'ich habe vor Kurzem [Schulabschluss, Studium oder Ausbildung] abgeschlossen und bewerbe mich als {role} bei {company}.',
        'Während [Praktikum, Projekt oder Nebenjob] habe ich [was Sie getan haben, möglichst mit Zahl, z. B. „täglich etwa 40 Kundinnen und Kunden beraten“]. Dabei habe ich gemerkt, dass ich am besten arbeite, wenn [ehrliche Beobachtung über Ihre Arbeitsweise], und darauf möchte ich in einem Team wie Ihrem aufbauen.',
        'Ich bin zuverlässig, lerne schnell und fange gern mit den Grundlagen an. Über die Einladung zu einem Vorstellungsgespräch freue ich mich.',
      ].join('\n\n'),
      closing: 'Mit freundlichen Grüßen\n{name}',
    },
  ],
};

/** Fills the placeholders; unknown or empty values leave the placeholder visible so the user sees what is missing. */
export function fillCoverPlaceholders(text: string, values: Partial<Record<CoverPlaceholder, string>>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key as CoverPlaceholder];
    return value && value.trim() ? value.trim() : match;
  });
}
