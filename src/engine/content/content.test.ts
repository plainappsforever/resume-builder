import skills from '../keywords/skills.json';
import { firstWord } from '../checks';
import { bannedIn } from '../wording';
import { ACTION_VERBS_DE, ACTION_VERBS_EN, ACTION_WORD_FORMS, VERB_CATEGORIES, verbCount } from './action-verbs';
import { COVER_EXAMPLES, COVER_PLACEHOLDERS, fillCoverPlaceholders } from './cover-examples';
import { ROLE_EXAMPLES, ROLE_IDS } from './role-examples';
import { SAMPLE_PROFILES } from './sample-profiles';

/** Every string inside a value (objects, arrays, tuples). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('action verbs (F11)', () => {
  it('EN ≥ 150, DE ≥ 100, in every category, no duplicates', () => {
    expect(verbCount('en')).toBeGreaterThanOrEqual(150);
    expect(verbCount('de')).toBeGreaterThanOrEqual(100);
    for (const c of VERB_CATEGORIES) {
      expect(ACTION_VERBS_EN[c].length).toBeGreaterThanOrEqual(10);
      expect(ACTION_VERBS_DE[c].length).toBeGreaterThanOrEqual(8);
    }
    const en = Object.values(ACTION_VERBS_EN).flat().map(([past]) => past);
    const de = Object.values(ACTION_VERBS_DE).flat().map(([inf]) => inf);
    expect(en.length).toBe(new Set(en).size);
    expect(de.length).toBe(new Set(de).size);
  });
  it('C10 accepts past, base, -s and British forms in EN, all four forms in DE', () => {
    for (const w of ['led', 'lead', 'leads', 'organized', 'organised', 'analyses', 'leitung', 'geleitet', 'leitete', 'leiten'])
      expect([w, ACTION_WORD_FORMS.has(w)]).toEqual([w, true]);
  });
});

describe('role examples (F11)', () => {
  it('12 roles × ≥ 8 bullets in EN and DE', () => {
    expect(ROLE_IDS).toHaveLength(12);
    for (const id of ROLE_IDS) {
      expect(ROLE_EXAMPLES[id].bullets.en.length).toBeGreaterThanOrEqual(8);
      expect(ROLE_EXAMPLES[id].bullets.de.length).toBe(ROLE_EXAMPLES[id].bullets.en.length);
    }
  });
  it('every example passes the weak-bullet checklist: action word first, ≤ 300 characters, not first person; most have a number', () => {
    const all = ROLE_IDS.flatMap((id) => [...ROLE_EXAMPLES[id].bullets.en, ...ROLE_EXAMPLES[id].bullets.de]);
    for (const b of all) {
      expect([b, ACTION_WORD_FORMS.has(firstWord(b))]).toEqual([b, true]);
      expect([b, [...b].length <= 300]).toEqual([b, true]);
      expect([b, ['i', 'my', 'ich', 'mein'].includes(firstWord(b))]).toEqual([b, false]);
    }
    expect(all.filter((b) => /\d/.test(b)).length / all.length).toBeGreaterThanOrEqual(0.9);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('cover-letter examples (F10/F11)', () => {
  it('3 per language with the same ids; only known placeholders; role, company and name are used', () => {
    expect(COVER_EXAMPLES.en.map((c) => c.id)).toEqual(COVER_EXAMPLES.de.map((c) => c.id));
    expect(COVER_EXAMPLES.en).toHaveLength(3);
    for (const c of [...COVER_EXAMPLES.en, ...COVER_EXAMPLES.de]) {
      const used = new Set(strings(c).flatMap((s) => (s.match(/\{(\w+)\}/g) ?? []).map((p) => p.slice(1, -1))));
      expect([...used].filter((p) => !(COVER_PLACEHOLDERS as readonly string[]).includes(p))).toEqual([]);
      for (const p of ['role', 'company', 'name']) expect([c.id, p, used.has(p)]).toEqual([c.id, p, true]);
    }
  });
  it('filling keeps a placeholder visible when the value is missing', () => {
    expect(fillCoverPlaceholders('Dear {contact}, {role} at {company}', { role: 'Analyst', company: ' ' })).toBe('Dear {contact}, Analyst at {company}');
  });
});

describe('wording (D16, D34): no banned phrase in any content string', () => {
  it.each([
    ['action verbs', [ACTION_VERBS_EN, ACTION_VERBS_DE]],
    ['role examples', ROLE_EXAMPLES],
    ['cover examples', COVER_EXAMPLES],
    ['sample profiles', SAMPLE_PROFILES],
    ['skills list', skills],
  ] as const)('%s', (_name, value) => {
    const texts = strings(value);
    expect(texts.length).toBeGreaterThan(10);
    expect(texts.filter((t) => bannedIn(t).length > 0)).toEqual([]);
  });
});
