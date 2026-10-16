// Action verbs for bullet points (SPEC F11, D41), original lists. Help screen shows them by category; check C10 uses
// every form to decide whether a bullet starts with an action word. PURE.
import type { Lang } from '../types';

export const VERB_CATEGORIES = [
  'lead',
  'achieve',
  'create',
  'improve',
  'analyse',
  'communicate',
  'organise',
  'support',
  'sell',
  'teach',
] as const;
export type VerbCategory = (typeof VERB_CATEGORIES)[number];

/** [past tense, base form] — bullets about past jobs use the past, the current job often the base form. */
export type EnVerb = readonly [past: string, base: string];
/** [infinitive, participle, preterite (first word), noun or null] — German CVs often start with the noun ("Leitung …"). */
export type DeVerb = readonly [infinitive: string, participle: string, preterite: string, noun: string | null];

export const ACTION_VERBS_EN: Record<VerbCategory, readonly EnVerb[]> = {
  lead: [
    ['Led', 'Lead'], ['Managed', 'Manage'], ['Directed', 'Direct'], ['Supervised', 'Supervise'], ['Coordinated', 'Coordinate'],
    ['Headed', 'Head'], ['Oversaw', 'Oversee'], ['Delegated', 'Delegate'], ['Guided', 'Guide'], ['Mentored', 'Mentor'],
    ['Coached', 'Coach'], ['Hired', 'Hire'], ['Recruited', 'Recruit'], ['Chaired', 'Chair'], ['Mobilized', 'Mobilize'],
  ],
  achieve: [
    ['Achieved', 'Achieve'], ['Increased', 'Increase'], ['Reduced', 'Reduce'], ['Improved', 'Improve'], ['Cut', 'Cut'],
    ['Saved', 'Save'], ['Exceeded', 'Exceed'], ['Doubled', 'Double'], ['Grew', 'Grow'], ['Raised', 'Raise'],
    ['Delivered', 'Deliver'], ['Accelerated', 'Accelerate'], ['Boosted', 'Boost'], ['Shortened', 'Shorten'], ['Won', 'Win'],
  ],
  create: [
    ['Built', 'Build'], ['Created', 'Create'], ['Designed', 'Design'], ['Developed', 'Develop'], ['Launched', 'Launch'],
    ['Founded', 'Found'], ['Established', 'Establish'], ['Introduced', 'Introduce'], ['Wrote', 'Write'], ['Produced', 'Produce'],
    ['Engineered', 'Engineer'], ['Programmed', 'Program'], ['Prototyped', 'Prototype'], ['Authored', 'Author'], ['Initiated', 'Initiate'],
    ['Commissioned', 'Commission'],
  ],
  improve: [
    ['Streamlined', 'Streamline'], ['Optimized', 'Optimize'], ['Automated', 'Automate'], ['Restructured', 'Restructure'],
    ['Modernized', 'Modernize'], ['Simplified', 'Simplify'], ['Standardized', 'Standardize'], ['Redesigned', 'Redesign'],
    ['Upgraded', 'Upgrade'], ['Migrated', 'Migrate'], ['Consolidated', 'Consolidate'], ['Transformed', 'Transform'],
    ['Revamped', 'Revamp'], ['Refined', 'Refine'], ['Resolved', 'Resolve'],
  ],
  analyse: [
    ['Analyzed', 'Analyze'], ['Assessed', 'Assess'], ['Audited', 'Audit'], ['Calculated', 'Calculate'], ['Evaluated', 'Evaluate'],
    ['Forecast', 'Forecast'], ['Identified', 'Identify'], ['Investigated', 'Investigate'], ['Measured', 'Measure'],
    ['Modeled', 'Model'], ['Researched', 'Research'], ['Reviewed', 'Review'], ['Tested', 'Test'], ['Tracked', 'Track'],
    ['Verified', 'Verify'], ['Reconciled', 'Reconcile'],
  ],
  communicate: [
    ['Presented', 'Present'], ['Negotiated', 'Negotiate'], ['Persuaded', 'Persuade'], ['Advised', 'Advise'],
    ['Consulted', 'Consult'], ['Explained', 'Explain'], ['Documented', 'Document'], ['Reported', 'Report'],
    ['Published', 'Publish'], ['Edited', 'Edit'], ['Translated', 'Translate'], ['Mediated', 'Mediate'],
    ['Represented', 'Represent'], ['Promoted', 'Promote'], ['Briefed', 'Brief'],
  ],
  organise: [
    ['Organized', 'Organize'], ['Planned', 'Plan'], ['Scheduled', 'Schedule'], ['Prioritized', 'Prioritize'],
    ['Arranged', 'Arrange'], ['Administered', 'Administer'], ['Maintained', 'Maintain'], ['Processed', 'Process'],
    ['Recorded', 'Record'], ['Monitored', 'Monitor'], ['Prepared', 'Prepare'], ['Implemented', 'Implement'],
    ['Executed', 'Execute'], ['Allocated', 'Allocate'], ['Inventoried', 'Inventory'],
    ['Ran', 'Run'], ['Restocked', 'Restock'], ['Opened', 'Open'],
  ],
  support: [
    ['Supported', 'Support'], ['Assisted', 'Assist'], ['Cared', 'Care'], ['Treated', 'Treat'], ['Served', 'Serve'],
    ['Helped', 'Help'], ['Answered', 'Answer'], ['Handled', 'Handle'], ['Fixed', 'Fix'], ['Repaired', 'Repair'],
    ['Installed', 'Install'], ['Operated', 'Operate'], ['Inspected', 'Inspect'], ['Cleaned', 'Clean'], ['Ensured', 'Ensure'],
    ['Picked', 'Pick'], ['Packed', 'Pack'], ['Loaded', 'Load'],
  ],
  sell: [
    ['Sold', 'Sell'], ['Acquired', 'Acquire'], ['Secured', 'Secure'], ['Expanded', 'Expand'], ['Generated', 'Generate'],
    ['Converted', 'Convert'], ['Retained', 'Retain'], ['Upsold', 'Upsell'], ['Closed', 'Close'], ['Pitched', 'Pitch'],
    ['Prospected', 'Prospect'], ['Marketed', 'Market'], ['Partnered', 'Partner'], ['Sourced', 'Source'], ['Purchased', 'Purchase'],
  ],
  teach: [
    ['Trained', 'Train'], ['Taught', 'Teach'], ['Educated', 'Educate'], ['Instructed', 'Instruct'], ['Tutored', 'Tutor'],
    ['Onboarded', 'Onboard'], ['Facilitated', 'Facilitate'], ['Demonstrated', 'Demonstrate'], ['Encouraged', 'Encourage'],
    ['Motivated', 'Motivate'], ['Inspired', 'Inspire'], ['Counseled', 'Counsel'], ['Graded', 'Grade'], ['Enabled', 'Enable'],
    ['Empowered', 'Empower'],
  ],
};

export const ACTION_VERBS_DE: Record<VerbCategory, readonly DeVerb[]> = {
  lead: [
    ['leiten', 'geleitet', 'leitete', 'Leitung'], ['führen', 'geführt', 'führte', 'Führung'],
    ['koordinieren', 'koordiniert', 'koordinierte', 'Koordination'], ['steuern', 'gesteuert', 'steuerte', 'Steuerung'],
    ['verantworten', 'verantwortet', 'verantwortete', null], ['delegieren', 'delegiert', 'delegierte', 'Delegation'],
    ['beaufsichtigen', 'beaufsichtigt', 'beaufsichtigte', 'Beaufsichtigung'], ['rekrutieren', 'rekrutiert', 'rekrutierte', 'Rekrutierung'],
    ['aufbauen', 'aufgebaut', 'baute', 'Aufbau'], ['vertreten', 'vertreten', 'vertrat', 'Vertretung'],
  ],
  achieve: [
    ['steigern', 'gesteigert', 'steigerte', 'Steigerung'], ['senken', 'gesenkt', 'senkte', 'Senkung'],
    ['verbessern', 'verbessert', 'verbesserte', 'Verbesserung'], ['reduzieren', 'reduziert', 'reduzierte', 'Reduzierung'],
    ['erreichen', 'erreicht', 'erreichte', null], ['übertreffen', 'übertroffen', 'übertraf', null],
    ['verkürzen', 'verkürzt', 'verkürzte', 'Verkürzung'], ['erhöhen', 'erhöht', 'erhöhte', 'Erhöhung'],
    ['einsparen', 'eingespart', 'sparte', 'Einsparung'], ['gewinnen', 'gewonnen', 'gewann', 'Gewinnung'],
    ['liefern', 'geliefert', 'lieferte', 'Lieferung'],
  ],
  create: [
    ['entwickeln', 'entwickelt', 'entwickelte', 'Entwicklung'], ['gestalten', 'gestaltet', 'gestaltete', 'Gestaltung'],
    ['konzipieren', 'konzipiert', 'konzipierte', 'Konzeption'], ['erstellen', 'erstellt', 'erstellte', 'Erstellung'],
    ['einführen', 'eingeführt', 'führte', 'Einführung'], ['gründen', 'gegründet', 'gründete', 'Gründung'],
    ['programmieren', 'programmiert', 'programmierte', 'Programmierung'], ['entwerfen', 'entworfen', 'entwarf', 'Entwurf'],
    ['verfassen', 'verfasst', 'verfasste', null], ['konstruieren', 'konstruiert', 'konstruierte', 'Konstruktion'],
  ],
  improve: [
    ['optimieren', 'optimiert', 'optimierte', 'Optimierung'], ['automatisieren', 'automatisiert', 'automatisierte', 'Automatisierung'],
    ['vereinfachen', 'vereinfacht', 'vereinfachte', 'Vereinfachung'], ['standardisieren', 'standardisiert', 'standardisierte', 'Standardisierung'],
    ['modernisieren', 'modernisiert', 'modernisierte', 'Modernisierung'], ['umstellen', 'umgestellt', 'stellte', 'Umstellung'],
    ['digitalisieren', 'digitalisiert', 'digitalisierte', 'Digitalisierung'], ['überarbeiten', 'überarbeitet', 'überarbeitete', 'Überarbeitung'],
    ['migrieren', 'migriert', 'migrierte', 'Migration'], ['lösen', 'gelöst', 'löste', 'Lösung'],
  ],
  analyse: [
    ['analysieren', 'analysiert', 'analysierte', 'Analyse'], ['auswerten', 'ausgewertet', 'wertete', 'Auswertung'],
    ['prüfen', 'geprüft', 'prüfte', 'Prüfung'], ['bewerten', 'bewertet', 'bewertete', 'Bewertung'],
    ['ermitteln', 'ermittelt', 'ermittelte', 'Ermittlung'], ['berechnen', 'berechnet', 'berechnete', 'Berechnung'],
    ['recherchieren', 'recherchiert', 'recherchierte', 'Recherche'], ['testen', 'getestet', 'testete', null],
    ['überwachen', 'überwacht', 'überwachte', 'Überwachung'], ['kontrollieren', 'kontrolliert', 'kontrollierte', 'Kontrolle'],
  ],
  communicate: [
    ['präsentieren', 'präsentiert', 'präsentierte', 'Präsentation'], ['verhandeln', 'verhandelt', 'verhandelte', 'Verhandlung'],
    ['beraten', 'beraten', 'beriet', 'Beratung'], ['moderieren', 'moderiert', 'moderierte', 'Moderation'],
    ['dokumentieren', 'dokumentiert', 'dokumentierte', 'Dokumentation'], ['berichten', 'berichtet', 'berichtete', 'Berichterstattung'],
    ['übersetzen', 'übersetzt', 'übersetzte', 'Übersetzung'], ['vermitteln', 'vermittelt', 'vermittelte', 'Vermittlung'],
    ['abstimmen', 'abgestimmt', 'stimmte', 'Abstimmung'], ['korrespondieren', 'korrespondiert', 'korrespondierte', 'Korrespondenz'],
  ],
  organise: [
    ['organisieren', 'organisiert', 'organisierte', 'Organisation'], ['planen', 'geplant', 'plante', 'Planung'],
    ['durchführen', 'durchgeführt', 'führte', 'Durchführung'], ['umsetzen', 'umgesetzt', 'setzte', 'Umsetzung'],
    ['verwalten', 'verwaltet', 'verwaltete', 'Verwaltung'], ['bearbeiten', 'bearbeitet', 'bearbeitete', 'Bearbeitung'],
    ['disponieren', 'disponiert', 'disponierte', 'Disposition'], ['pflegen', 'gepflegt', 'pflegte', 'Pflege'],
    ['vorbereiten', 'vorbereitet', 'bereitete', 'Vorbereitung'], ['terminieren', 'terminiert', 'terminierte', 'Terminierung'],
    ['verräumen', 'verräumt', 'verräumte', 'Verräumung'], ['öffnen', 'geöffnet', 'öffnete', 'Öffnung'],
  ],
  support: [
    ['betreuen', 'betreut', 'betreute', 'Betreuung'], ['unterstützen', 'unterstützt', 'unterstützte', 'Unterstützung'],
    ['versorgen', 'versorgt', 'versorgte', 'Versorgung'], ['begleiten', 'begleitet', 'begleitete', 'Begleitung'],
    ['installieren', 'installiert', 'installierte', 'Installation'], ['warten', 'gewartet', 'wartete', 'Wartung'],
    ['reparieren', 'repariert', 'reparierte', 'Reparatur'], ['montieren', 'montiert', 'montierte', 'Montage'],
    ['bedienen', 'bedient', 'bediente', 'Bedienung'], ['sicherstellen', 'sichergestellt', 'stellte', 'Sicherstellung'],
    ['kommissionieren', 'kommissioniert', 'kommissionierte', 'Kommissionierung'], ['verabreichen', 'verabreicht', 'verabreichte', 'Verabreichung'],
    ['entladen', 'entladen', 'entlud', 'Entladung'],
  ],
  sell: [
    ['verkaufen', 'verkauft', 'verkaufte', 'Verkauf'], ['akquirieren', 'akquiriert', 'akquirierte', 'Akquise'],
    ['ausbauen', 'ausgebaut', 'baute', 'Ausbau'], ['erschließen', 'erschlossen', 'erschloss', 'Erschließung'],
    ['vermarkten', 'vermarktet', 'vermarktete', 'Vermarktung'], ['abschließen', 'abgeschlossen', 'schloss', 'Abschluss'],
    ['beschaffen', 'beschafft', 'beschaffte', 'Beschaffung'], ['einkaufen', 'eingekauft', 'kaufte', 'Einkauf'],
    ['binden', 'gebunden', 'band', 'Bindung'], ['repräsentieren', 'repräsentiert', 'repräsentierte', 'Repräsentation'],
    ['kassieren', 'kassiert', 'kassierte', null],
  ],
  teach: [
    ['schulen', 'geschult', 'schulte', 'Schulung'], ['unterrichten', 'unterrichtet', 'unterrichtete', 'Unterricht'],
    ['ausbilden', 'ausgebildet', 'bildete', 'Ausbildung'], ['einarbeiten', 'eingearbeitet', 'arbeitete', 'Einarbeitung'],
    ['anleiten', 'angeleitet', 'leitete', 'Anleitung'], ['fördern', 'gefördert', 'förderte', 'Förderung'],
    ['coachen', 'gecoacht', 'coachte', 'Coaching'], ['motivieren', 'motiviert', 'motivierte', 'Motivation'],
    ['trainieren', 'trainiert', 'trainierte', 'Training'], ['beurteilen', 'beurteilt', 'beurteilte', 'Beurteilung'],
  ],
};

/** British spellings of the -ize/-yze verbs ("organised", "analysed") count too. */
function britishForms(word: string): string[] {
  const out: string[] = [];
  const m = /^(.*)(iz|yz)(e|ed|es|ing)$/.exec(word);
  if (m) out.push(m[1] + (m[2] === 'iz' ? 'is' : 'ys') + m[3]);
  return out;
}

function enForms([past, base]: EnVerb): string[] {
  const b = base.toLowerCase();
  const third = /(s|sh|ch|x|z)$/.test(b) ? b + 'es' : /[^aeiou]y$/.test(b) ? b.slice(0, -1) + 'ies' : b + 's';
  return [past.toLowerCase(), b, third].flatMap((w) => [w, ...britishForms(w)]);
}

/** Every lower-case form check C10 accepts as an action-word start (EN and DE, both always). */
export const ACTION_WORD_FORMS: ReadonlySet<string> = new Set([
  ...Object.values(ACTION_VERBS_EN).flat().flatMap(enForms),
  ...Object.values(ACTION_VERBS_DE)
    .flat()
    .flatMap(([inf, part, pret, noun]) => [inf, part, pret, ...(noun ? [noun] : [])].map((w) => w.toLowerCase())),
]);

export function verbCount(lang: Lang): number {
  return Object.values(lang === 'en' ? ACTION_VERBS_EN : ACTION_VERBS_DE).reduce((n, list) => n + list.length, 0);
}
