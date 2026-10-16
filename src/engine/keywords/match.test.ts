import { resolveVersion } from '../resolve';
import type { Bullet, Entry, Master, Section, SectionKind, Version, VersionState } from '../types';
import { countOccurrences, isRepeated, matchKeywords, stems, summarizeMatches, versionHaystack } from './match';
import { normalizeTerm } from './tokenize';

const T = 1_000;
let nextId = 1;

function build(sections: { kind: SectionKind; title?: string; entries: { title: string; org?: string; extra?: Record<string, string>; bullets: string[] }[] }[]) {
  const master: Master = {
    profile: {
      fullName: 'Test Person', headline: 'Senior C# Developer', email: 'a@b.co', phone: '', city: '', region: '', countryCode: '',
      birthDate: null, nationality: null, showPersonal: false, photoFile: null, summary: 'Built .NET services and C++ tools.',
      isExample: false, updatedAt: T,
    },
    links: [],
    sections: [],
    entries: [],
    bullets: [],
  };
  sections.forEach((s, si) => {
    const section: Section = { id: nextId++, kind: s.kind, customTitle: s.title ?? null, position: si };
    master.sections.push(section);
    s.entries.forEach((e, ei) => {
      const entry: Entry = {
        id: nextId++, sectionId: section.id, position: ei, title: e.title, organization: e.org ?? '', location: '', startDate: '2020',
        endDate: null, isCurrent: true, url: '', description: '', extra: e.extra ?? {}, createdAt: T, updatedAt: T,
      };
      master.entries.push(entry);
      e.bullets.forEach((text, bi) => {
        const bullet: Bullet = { id: nextId++, entryId: entry.id, position: bi, text, createdAt: T, updatedAt: T };
        master.bullets.push(bullet);
      });
    });
  });
  return master;
}

const version: Version = {
  id: 1, name: 'V', targetCompany: '', targetRole: '', jobAd: '', language: 'de', template: 'modern', styleJson: '{}',
  headlineOverride: null, summaryOverride: null, sourceVersionId: null, archived: false, isExample: false, createdAt: T,
  updatedAt: T, lastExportedAt: null,
};
const state = (patch: Partial<VersionState> = {}): VersionState => ({ version, sections: [], entries: [], bullets: [], ...patch });

const master = build([
  {
    kind: 'experience',
    entries: [
      { title: 'Projektleiterin', org: 'Nordlicht AG', bullets: ['Leitung im Projekt-Management für 5 Kunden', 'Analysen der Kundendaten mit SQL'] },
      { title: 'Teamassistenz', bullets: ['Terminplanung für 3 Manager', 'Pflege von Key Performance Indicators im Reporting'] },
      { title: 'Hidden job', bullets: ['Kubernetes and Terraform rollout'] },
    ],
  },
  { kind: 'volunteer', entries: [{ title: 'Kassenwart', bullets: ['Buchhaltung mit DATEV'] }] },
  { kind: 'skills', title: 'Werkzeugkasten', entries: [{ title: 'Software', bullets: ['Excel', 'Jira', 'Confluence'] }] },
]);
const hiddenJob = master.entries[2];
const volunteerSection = master.sections[1];
const secondBullet = master.bullets.find((b) => b.text.startsWith('Analysen'))!;
const resolved = resolveVersion(
  master,
  state({
    entries: [{ entryId: hiddenJob.id, included: false, position: null, overrides: {}, seenMasterAt: null }],
    sections: [{ sectionId: volunteerSection.id, included: false, position: null, titleOverride: null, pageBreakBefore: false }],
    bullets: [{ bulletId: secondBullet.id, included: false, position: null, textOverride: null }],
  })
);
const match = (term: string, tf = 1) => matchKeywords([{ term: normalizeTerm(term), tf }], resolved)[0];

describe('A5: found / variant / missing', () => {
  it('found: the exact phrase, case and punctuation ignored', () => {
    expect(match('Terminplanung')).toMatchObject({ status: 'found', count: 1, exactCount: 1 });
    expect(match('Jira')).toMatchObject({ status: 'found' });
  });
  it('C++, C#, .NET match only themselves', () => {
    expect(match('C#').status).toBe('found');
    expect(match('C++').status).toBe('found');
    expect(match('.NET').status).toBe('found');
    expect(match('F#').status).toBe('missing');
    expect(countOccurrences('c', ['C# and C++']).count).toBe(0);
  });
  it('variant: German compounds written with a hyphen or apart', () => {
    expect(match('Projektmanagement')).toMatchObject({ status: 'variant', variantKind: 'compact', exactCount: 0, count: 1 });
    expect(countOccurrences('projekt management', ['Projektmanagement'])).toMatchObject({ count: 1, variantKind: 'compact' });
  });
  it('variant: word endings (EN plural, DE -en/-e/-er/-s)', () => {
    expect(match('Kunde')).toMatchObject({ status: 'variant', variantKind: 'stem' }); // text: "Kunden"
    expect(match('Key Performance Indicator')).toMatchObject({ status: 'variant', variantKind: 'stem' }); // "…Indicators"
    expect(countOccurrences('analysis', ['Analyses']).count).toBe(0); // irregular plural: outside SPEC's light stemming
  });
  it('variant: an acronym and its long form from the skills list', () => {
    expect(match('KPI')).toMatchObject({ status: 'variant', variantKind: 'acronym' });
    expect(countOccurrences('crm', ['Customer Relationship Management'])).toMatchObject({ count: 1, variantKind: 'acronym' });
  });
  it('missing, with hidden entries, hidden sections and hidden bullets that contain it', () => {
    const k8s = match('Kubernetes');
    expect(k8s.status).toBe('missing');
    expect(k8s.hidden).toEqual([{ kind: 'entry', sectionId: master.sections[0].id, entryId: hiddenJob.id, entryTitle: 'Hidden job', sectionHidden: false }]);
    expect(match('DATEV').hidden).toEqual([
      { kind: 'entry', sectionId: volunteerSection.id, entryId: master.entries[3].id, entryTitle: 'Kassenwart', sectionHidden: true },
    ]);
    expect(match('SQL').hidden).toEqual([{ kind: 'bullet', entryId: master.entries[0].id, bulletId: secondBullet.id, text: 'Analysen der Kundendaten mit SQL' }]);
    expect(match('Terminplanung').hidden).toEqual([]);
  });
  it('locations name the headline, summary and entries (section titles are not searched)', () => {
    expect(match('C#').locations).toEqual([{ kind: 'headline' }]);
    expect(match('.NET').locations).toEqual([{ kind: 'summary' }]);
    expect(match('Excel').locations).toEqual([
      { kind: 'entry', sectionId: master.sections[2].id, sectionKind: 'skills', sectionTitle: 'Werkzeugkasten', entryId: master.entries[4].id, entryTitle: 'Software' },
    ]);
    expect(match('Werkzeugkasten').status).toBe('missing');
    expect(versionHaystack(resolved).some((p) => p.text.includes('Kubernetes'))).toBe(false);
  });
});

describe('stems (D39)', () => {
  it('EN and DE one-suffix reductions, sets meet', () => {
    expect([...stems('companies')]).toEqual(expect.arrayContaining(['company']));
    expect([...stems('classes')]).toContain('class');
    expect([...stems('projekten')]).toEqual(expect.arrayContaining(['projekt', 'projekte']));
    expect([...stems('manager\'s')]).toContain('manager');
    expect([...stems('dat')]).toEqual(['dat']);
  });
  it('matches across forms, never across different words', () => {
    expect(countOccurrences('company', ['Three companies']).count).toBe(1);
    expect(countOccurrences('manage', ['Manages a team']).count).toBe(1);
    expect(countOccurrences('pflegefachkraft', ['Pflegefachkräfte']).count).toBe(0); // umlaut change: not light stemming
    expect(countOccurrences('data', ['date']).count).toBe(0);
  });
  it('D54: short words never meet acronyms by stemming (review finding 4); longer plurals still do', () => {
    const status = (term: string, text: string) => {
      const o = countOccurrences(term, [text]);
      return o.exactCount > 0 ? 'found' : o.count > 0 ? 'variant' : 'missing';
    };
    expect(status('it', 'Improved its onboarding')).toBe('missing');
    expect(status('hr', 'Kept HRs records')).toBe('missing');
    expect(status('go', 'The release goes live')).toBe('missing');
    expect(status('cs', 'CSS and HTML')).toBe('missing');
    expect(status('qa', 'QAs signed off')).toBe('missing');
    expect(status('rest apis', 'Built a REST API')).toBe('variant');
    expect(status('kpi', 'Owned three KPIs')).toBe('variant');
    expect([...stems('its')]).toEqual(['its']);
    // D55 (review finding 3): a hyphen compound exposes its parts as found; protected terms stay whole.
    expect(status('java', '5 Jahre Java-Entwicklung')).toBe('found');
    expect(status('sql', 'SQL-Datenbanken')).toBe('found');
    expect(status('c++', 'C++-Entwicklung')).toBe('found');
    expect(status('it', 'IT-Support im 2nd Level')).toBe('found');
    expect(status('datenbank', 'SQL-Datenbanken')).toBe('variant');
    expect(status('sql', 'T-SQL')).toBe('missing');
    // D58 (review finding 12): umlauts spelled out, "." dropped in the compact form; Turkish dotted İ.
    expect(status('teamfähigkeit', 'Teamfaehigkeit')).toBe('variant');
    expect(status('node.js', 'NodeJS')).toBe('variant');
    expect(status('istanbul', 'İstanbul')).toBe('found');
    expect([...stems('goes')]).toEqual(['goes', 'goe']);
  });
});

describe('repetition note and summary (SPEC §5.4, D16)', () => {
  it('count > max(4, 2 × tf) is flagged', () => {
    expect(isRepeated(4, 1)).toBe(false);
    expect(isRepeated(5, 1)).toBe(true);
    expect(isRepeated(6, 3)).toBe(false);
    expect(isRepeated(7, 3)).toBe(true);
    const stuffed = resolveVersion(build([{ kind: 'experience', entries: [{ title: 'SQL', bullets: ['SQL SQL SQL', 'SQL'] }] }]), state());
    expect(matchKeywords([{ term: 'sql', tf: 2 }], stuffed)[0]).toMatchObject({ count: 5, repeated: true });
    expect(matchKeywords([{ term: 'sql', tf: 3 }], stuffed)[0]).toMatchObject({ count: 5, repeated: false });
  });
  it('summary counts found / variants / missing of those shown, no percentage', () => {
    const all = matchKeywords(['terminplanung', 'projektmanagement', 'kubernetes', 'jira'].map((term) => ({ term, tf: 1 })), resolved);
    expect(summarizeMatches(all)).toEqual({ found: 2, variants: 1, missing: 1, shown: 4 });
  });
});
