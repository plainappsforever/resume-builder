import { de } from '@/i18n/de';
import { en } from '@/i18n/en';

import { CLEAN_CONTEXT, cleanModel, FIRING, NOT_FIRING, TODAY } from './__fixtures__/check-cases';
import {
  CHECK_IDS,
  checkCounts,
  exportBlocked,
  firstWord,
  hasSpacedLetters,
  isValidEmail,
  isValidUrl,
  runChecks,
  SOURCE_URLS,
  uncoveredChars,
  type CheckContext,
} from './checks';
import { bannedIn } from './wording';

const ctx = (): CheckContext => JSON.parse(JSON.stringify(CLEAN_CONTEXT));
const codesOf = (model = cleanModel(), c = ctx()) => runChecks(model, c).flatMap((r) => r.findings.map((f) => `${r.id}:${f.code}`));

describe('A6: checks C1–C14 fire exactly on their fixtures', () => {
  it('the clean document triggers nothing; every check is ✓', () => {
    expect(codesOf()).toEqual([]);
    expect(runChecks(cleanModel(), ctx()).map((r) => r.status)).toEqual(CHECK_IDS.map(() => 'ok'));
  });

  it('every check id C1–C15 except C2/C3 has at least one firing fixture', () => {
    const ids = new Set(FIRING.map((c) => c.id));
    expect(CHECK_IDS.filter((id) => !ids.has(id))).toEqual(['C2', 'C3']);
  });

  it.each(FIRING.map((c) => [`${c.id} ${c.name}`, c] as const))('%s', (_n, c) => {
    const model = cleanModel();
    const context = ctx();
    c.change(model, context);
    expect(codesOf(model, context).sort()).toEqual(c.codes.map((code) => `${c.id}:${code}`).sort());
  });

  it.each(NOT_FIRING.map((c) => [c.name, c] as const))('does not fire: %s', (_n, c) => {
    const model = cleanModel();
    const context = ctx();
    c.change(model, context);
    expect(codesOf(model, context)).toEqual([]);
  });
});

describe('statuses, sources and the export rule', () => {
  it('C2 and C3 are always ✓ with the template reason', () => {
    const model = cleanModel();
    model.person.fullName = '';
    for (const r of runChecks(model, ctx()).filter((x) => x.id === 'C2' || x.id === 'C3')) {
      expect(r).toMatchObject({ status: 'ok', guaranteed: true, findings: [] });
      expect(r.noteKey).toBe(`check.${r.id}.ok`);
    }
  });

  it('C11, C12, C15 say "not checked yet" without an export; C15 "could not read back" when the reader failed', () => {
    const none = runChecks(cleanModel(), { today: TODAY });
    expect(none.filter((r) => r.status === 'notChecked').map((r) => r.id)).toEqual(['C11', 'C12', 'C15']);
    const unavailable = runChecks(cleanModel(), { ...ctx(), readback: { unavailable: true } }).find((r) => r.id === 'C15');
    expect(unavailable).toMatchObject({ status: 'notChecked', noteKey: 'check.C15.unavailable' });
    expect(runChecks(cleanModel(), ctx()).find((r) => r.id === 'C15')?.noteKey).toBe('check.C15.pass');
  });

  it('status = the most serious finding; C4 is a warning ("your choice")', () => {
    const model = cleanModel();
    model.person.photoFile = 'photos/a.jpg';
    model.person.phone = '';
    model.person.email = '';
    const byId = new Map(runChecks(model, ctx()).map((r) => [r.id, r]));
    expect(byId.get('C4')?.status).toBe('warning');
    expect(byId.get('C1')?.status).toBe('attention');
    expect(checkCounts(runChecks(model, ctx()))).toMatchObject({ attention: 1, warning: 1 });
  });

  it('every check names its source, with the Greenhouse/Workday pages where they are the source', () => {
    const results = runChecks(cleanModel(), ctx());
    for (const r of results) {
      expect(en[r.sourceKey]).toBeTruthy();
      expect(en[r.titleKey]).toBeTruthy();
    }
    const byId = new Map(results.map((r) => [r.id, r]));
    expect(byId.get('C1')?.sourceUrls).toEqual([SOURCE_URLS.greenhouse]);
    expect(byId.get('C4')?.sourceUrls).toEqual([SOURCE_URLS.greenhouse, SOURCE_URLS.workday]);
    expect(byId.get('C10')?.sourceKey).toBe('check.source.commonAdvice');
    expect(byId.get('C8')?.sourceKey).toBe('check.source.commonPractice');
    expect(byId.get('C15')?.sourceKey).toBe('check.source.readback');
  });

  it('every message key a finding can carry exists in EN and DE with the same placeholders, and none is banned', () => {
    const keys = new Set<string>();
    const params = new Map<string, string[]>();
    for (const c of FIRING) {
      const model = cleanModel();
      const context = ctx();
      c.change(model, context);
      for (const r of runChecks(model, context))
        for (const f of r.findings) {
          keys.add(f.messageKey);
          params.set(f.messageKey, Object.keys(f.params).sort());
        }
    }
    for (const key of keys) {
      const k = key as keyof typeof en;
      expect([key, Boolean(en[k]), Boolean(de[k])]).toEqual([key, true, true]);
      const placeholders = (en[k].match(/\{(\w+)\}/g) ?? []).map((p) => p.slice(1, -1)).sort();
      expect([key, placeholders]).toEqual([key, params.get(key)]);
      expect(bannedIn(en[k]).concat(bannedIn(de[k]))).toEqual([]);
    }
  });

  it('D19: only a missing name blocks export', () => {
    expect(exportBlocked(cleanModel())).toBe(false);
    const model = cleanModel();
    model.person.email = '';
    model.sections = [];
    expect(exportBlocked(model)).toBe(false);
    model.person.fullName = '  ';
    expect(exportBlocked(model)).toBe(true);
  });
});

describe('check helpers', () => {
  it('URLs and e-mails (C14)', () => {
    for (const ok of ['example.com', 'https://www.example.de/x', 'http://a.b.co:80', 'github.com/user/repo', 'müller.de']) expect([ok, isValidUrl(ok)]).toEqual([ok, true]);
    for (const bad of ['example', 'mailto:a@b.co', 'https://exa mple.com', 'ftp://x.com', 'x.c', 'example.com:port', '-a.com']) expect([bad, isValidUrl(bad)]).toEqual([bad, false]);
    expect(isValidEmail('a.b+c@ex-ample.co.uk')).toBe(true);
    expect(isValidEmail('a@@b.co')).toBe(false);
    expect(isValidEmail('@b.co')).toBe(false);
  });
  it('first word, spaced letters, uncovered characters', () => {
    expect(firstWord('— Co-led 3 teams')).toBe('co-led');
    expect(firstWord("I'm here")).toBe('i');
    expect(hasSpacedLetters('S K I L L S')).toBe(true);
    expect(hasSpacedLetters('a b 3 c')).toBe(false);
    expect(uncoveredChars('Hi 🚀👍🏽 ✓ Ж', 'lato')).toEqual(['Ж', '✓', '🏽', '👍', '🚀']);
    expect(uncoveredChars('Ж Ω', 'noto-sans')).toEqual([]);
    expect(uncoveredChars('1️⃣', 'inter')).toEqual([]);
  });
});

describe('P3: C13 uses the embedded fonts, C15 the full read-back result', () => {
  it('C13 coverage is measured per family: Lato lacks ő/ș, Inter has Greek, nobody has →; the template font counts when no font is chosen', () => {
    expect(uncoveredChars('Kővári Ștefan → ok', 'lato')).toEqual(['ő', 'Ș', '→']);
    expect(uncoveredChars('Kővári Ștefan → ok', 'inter')).toEqual(['→']);
    expect(uncoveredChars('Ωmega Ромашка', 'noto-sans')).toEqual([]);
    expect(uncoveredChars('Ωmega', 'source-sans-3')).toEqual(['Ω']);
    expect(uncoveredChars('line\nbreak\ttab', 'lato')).toEqual([]);
    const model = cleanModel();
    model.style.font = null;
    model.summary = 'Ωmega';
    model.template = 'modern'; // Inter
    expect(codesOf(model)).toEqual([]);
    model.template = 'lebenslauf'; // Source Sans 3: no Greek embedded
    expect(codesOf(model)).toEqual(['C13:glyphs']);
  });

  it('C15 takes the full result and passes its counts to the finding', () => {
    const readback = { pass: false, reader: 'pdf.js 6.3.289', words: { expected: 412, found: 410 }, lines: { total: 58, inOrder: 57, moved: [], split: [] } };
    const c15 = runChecks(cleanModel(), { ...ctx(), readback }).find((r) => r.id === 'C15');
    expect(c15).toMatchObject({ status: 'attention', findings: [{ code: 'readbackFailed', params: { found: 410, expected: 412, inOrder: 57, lines: 58, reader: 'pdf.js 6.3.289' } }] });
    expect(runChecks(cleanModel(), { ...ctx(), readback: { ...readback, pass: true } }).find((r) => r.id === 'C15')?.status).toBe('ok');
  });
});
