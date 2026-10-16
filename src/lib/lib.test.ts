/**
 * @jest-environment node
 */
import { SAMPLE_PROFILES } from '@/engine/content/sample-profiles';
import { resolveVersion } from '@/engine/resolve';
import { SECTION_KINDS, type Master, type VersionState } from '@/engine/types';
import { de } from '@/i18n/de';
import { en } from '@/i18n/en';

import { displayBirthDate, parseBirthDate } from './birth-date';
import { ADDABLE_KINDS, KIND_SPECS, linesToBullets } from './entry-kinds';
import { nextProfileHint } from './profile-hints';
import { versionBadges } from './version-badges';

describe('parseBirthDate', () => {
  it.each([
    ['12.04.1994', '1994-04-12'],
    ['12/4/1994', '1994-04-12'],
    ['1994-04-12', '1994-04-12'],
    [' 1994-4-2 ', '1994-04-02'],
    ['', null],
  ])('%s → %s', (text, iso) => expect(parseBirthDate(text, 2026)).toEqual({ iso, error: false }));
  it.each(['31.02.1994', '1994-13-01', '12.04.94', 'April 1994', '01.01.1899', '01.01.2027', '1994-04-12 x'])('%s is an error', (text) =>
    expect(parseBirthDate(text, 2026)).toEqual({ iso: null, error: true })
  );
  it('shows the habit of the UI language', () => {
    expect(displayBirthDate('1994-04-12', 'de')).toBe('12.04.1994');
    expect(displayBirthDate('1994-04-12', 'en')).toBe('1994-04-12');
    expect(displayBirthDate(null, 'en')).toBe('');
  });
});

describe('linesToBullets', () => {
  it('strips glyphs, numbering and blank lines', () => {
    expect(linesToBullets('• Led a team of 5\r\n\r\n- Cut costs by 12 %\n  * Trained staff\n1. First\n2) Second\n–Dash\nPlain – text')).toEqual([
      'Led a team of 5',
      'Cut costs by 12 %',
      'Trained staff',
      'First',
      'Second',
      'Dash',
      'Plain – text',
    ]);
  });
  it('keeps a hyphen inside a word and a leading number without a separator', () => {
    expect(linesToBullets('-well-known tool\n2024 launch\nE-mail support')).toEqual(['-well-known tool', '2024 launch', 'E-mail support']);
  });
});

describe('entry kinds', () => {
  it('every section kind has a spec and every label key exists in both languages', () => {
    for (const kind of SECTION_KINDS) {
      const spec = KIND_SPECS[kind];
      for (const key of [spec.titleLabel, spec.organizationLabel, spec.bulletsLabel]) {
        expect(Object.keys(en)).toContain(key); // (toHaveProperty would read the dots as a path)
        expect(Object.keys(de)).toContain(key);
      }
    }
    expect([...ADDABLE_KINDS].sort()).toEqual([...SECTION_KINDS].sort());
  });
});

const NOW = Date.UTC(2026, 9, 1);
function sample() {
  const m = SAMPLE_PROFILES.en.master;
  const master: Master = {
    profile: { ...m.profile, updatedAt: NOW } as Master['profile'],
    links: [],
    sections: m.sections.map((s, i) => ({ id: i + 1, kind: s.kind, customTitle: s.customTitle ?? null, position: i })),
    entries: m.sections.flatMap((s, i) =>
      s.entries.map((e, j) => ({
        id: (i + 1) * 100 + j,
        sectionId: i + 1,
        position: j,
        title: e.title ?? '',
        organization: e.organization ?? '',
        location: '',
        startDate: null,
        endDate: null,
        isCurrent: false,
        url: '',
        description: '',
        extra: {},
        createdAt: NOW,
        updatedAt: NOW,
      }))
    ),
    bullets: [],
  };
  return master;
}

describe('nextProfileHint', () => {
  it('walks through what a first resume needs', () => {
    const master = sample();
    expect(nextProfileHint({ ...master, profile: { ...master.profile, fullName: '' } })).toBe('name');
    expect(nextProfileHint({ ...master, profile: { ...master.profile, headline: ' ' } })).toBe('headline');
    expect(nextProfileHint({ ...master, profile: { ...master.profile, email: '' } })).toBe('email');
    expect(nextProfileHint({ ...master, profile: { ...master.profile, phone: '' } })).toBe('phone');
    expect(nextProfileHint({ ...master, entries: [] })).toBe('experience');
    expect(nextProfileHint(master)).toBe(null);
  });
});

describe('versionBadges', () => {
  it('counts new and changed entries only where the version shows them', () => {
    const master = sample();
    const version = { id: 1, createdAt: NOW - 10, lastExportedAt: null, language: 'en', template: 'modern', styleJson: '{}', headlineOverride: null, summaryOverride: null, name: 'v' } as VersionState['version'];
    const state: VersionState = { version, sections: [], entries: [], bullets: [] };
    expect(versionBadges(resolveVersion(master, state))).toEqual({ newEntries: master.entries.length, changedEntries: 0, edited: false });
    const hidden: VersionState = { ...state, sections: [{ sectionId: 1, included: false, position: null, titleOverride: null, pageBreakBefore: false }] };
    const shown = master.entries.filter((e) => e.sectionId !== 1).length;
    expect(versionBadges(resolveVersion(master, hidden)).newEntries).toBe(shown);
    const edited: VersionState = { ...state, version: { ...version, headlineOverride: 'x' } };
    expect(versionBadges(resolveVersion(master, edited)).edited).toBe(true);
  });
});
