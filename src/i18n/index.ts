// Minimal i18n: flat keys, {placeholder} interpolation, UI language set at startup (D25).
// The UI follows the device language (expo-localization arrives in P4; until then English); documents use their
// version's own language.
import type { Lang } from '@/engine/types';

import { de } from './de';
import { en, type TranslationKey } from './en';

export type { TranslationKey };
export const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, de };

let uiLanguage: Lang = 'en';

const listeners = new Set<() => void>();

export function setUiLanguage(lang: Lang) {
  if (lang === uiLanguage) return;
  uiLanguage = lang;
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore: the root layout re-mounts the navigator when the UI language changes (t() is not reactive). */
export function subscribeUiLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUiLanguage(): Lang {
  return uiLanguage;
}

/** 'de' for German device locales ('de', 'de-AT', 'de_CH' …), else English. */
export function languageFromLocale(locale: string | null | undefined): Lang {
  return locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function translate(lang: Lang, key: TranslationKey, params: Record<string, string | number> = {}): string {
  const text = dictionaries[lang][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** UI string in the current UI language. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(uiLanguage, key, params);
}
