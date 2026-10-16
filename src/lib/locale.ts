// UI language = device language (German or English fallback, D25). The development variant can override it with the
// dev link `debug/lang` (so the German flow needs no change of the simulator's language).
import { getLocales } from 'expo-localization';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/settings';
import { languageFromLocale, setUiLanguage } from '@/i18n';

import { isDevVariant } from './app-variant';

export const DEBUG_LANGUAGE_KEY = 'debug_ui_language';

export async function initUiLanguage(db: SQLiteDatabase) {
  if (isDevVariant) {
    const forced = await getSetting(db, DEBUG_LANGUAGE_KEY);
    if (forced === 'de' || forced === 'en') {
      setUiLanguage(forced);
      return;
    }
  }
  setUiLanguage(languageFromLocale(getLocales()[0]?.languageTag));
}
