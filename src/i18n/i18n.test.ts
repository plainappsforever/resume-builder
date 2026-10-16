import { bannedIn, BANNED_PHRASES } from '@/engine/wording';

import { de } from './de';
import { en } from './en';
import { dictionaries, languageFromLocale, setUiLanguage, t, translate } from './index';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('EN/DE parity (A14)', () => {
  it('both languages have exactly the same keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });
  it('no empty strings, and the same {placeholders} in both', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect([key, en[key].trim().length > 0, de[key].trim().length > 0]).toEqual([key, true, true]);
      expect([key, placeholders(de[key])]).toEqual([key, placeholders(en[key])]);
    }
  });
});

describe('banned phrases (D16)', () => {
  it.each(Object.entries(dictionaries))('%s strings contain none', (_lang, dict) => {
    for (const [key, text] of Object.entries(dict)) expect([key, bannedIn(text)]).toEqual([key, []]);
  });
  it.each([
    'Your ATS score: 87',
    'ATS-approved templates',
    'ATS-proof PDF',
    '100 % ATS compatible',
    '100% ATS',
    'Guaranteed to get past filters',
    'We guarantee interviews',
    'Beat the ATS',
    'beats any ATS',
    'ATS-optimized resume',
    'Dein ATS-Score',
    'ATS-geprüfte Vorlagen',
    'ATS-optimiert garantiert',
    'garantiert lesbar',
    'Mit Garantie',
    'So überlistest du das ATS',
    'ATS sicher',
  ])('catches "%s"', (text) => {
    expect(bannedIn(text).length).toBeGreaterThan(0);
  });
  it.each([
    'ATS-friendly rules (source: Greenhouse help center)',
    'Read back with pdf.js: 412 of 412 words, in the right order',
    'Found 14 · Variants 3 · Missing 8 of 25',
    'Gefunden 14 · Varianten 3 · Fehlend 8 von 25',
    'Stats',
    'Mats Svensson',
  ])('lets "%s" through', (text) => {
    expect(bannedIn(text)).toEqual([]);
  });
  it('the list is not empty', () => {
    expect(BANNED_PHRASES.length).toBeGreaterThan(5);
  });
});

describe('translate', () => {
  it('interpolates and leaves unknown placeholders visible', () => {
    expect(translate('de', 'date.error.year', { maxYear: 2032 })).toBe('Gib ein Jahr zwischen 1950 und 2032 ein.');
    expect(translate('en', 'settings.version', { version: '1.0.0' })).toBe('Version 1.0.0 ({variant})');
  });
  it('t uses the UI language', () => {
    setUiLanguage('de');
    expect(t('nav.settings')).toBe('Einstellungen');
    setUiLanguage('en');
    expect(t('nav.settings')).toBe('Settings');
  });
  it('maps device locales', () => {
    expect(languageFromLocale('de-DE')).toBe('de');
    expect(languageFromLocale('de_AT')).toBe('de');
    expect(languageFromLocale('en-US')).toBe('en');
    expect(languageFromLocale('fr-FR')).toBe('en');
    expect(languageFromLocale(null)).toBe('en');
  });
  it('every date validation error has a message in both languages', () => {
    for (const key of ['date.error.format', 'date.error.year', 'date.error.month', 'date.error.endBeforeStart'] as const) {
      expect(en[key]).toBeTruthy();
      expect(de[key]).toBeTruthy();
    }
  });
});
