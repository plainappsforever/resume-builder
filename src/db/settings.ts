import { DATE_STYLES, type DateStyle } from '@/engine/dates';
import type { Paper } from '@/engine/style';
import { LANGS, type Lang } from '@/engine/types';

import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function getSetting(db: Db, key: string): Promise<string | null> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row?.value ?? null;
  });
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await withWrite(db, (tx) =>
    tx.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value
    )
  );
}

export async function getThemePreference(db: Db): Promise<ThemePreference> {
  const value = await getSetting(db, THEME_KEY);
  return THEMES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

export function setThemePreference(db: Db, theme: ThemePreference): Promise<void> {
  return setSetting(db, THEME_KEY, theme);
}

// ---- Document defaults for new versions (SPEC §4 settings) ------------------------------------------------------

export type DocumentDefaults = { paper: Paper; dateStyle: DateStyle | null; language: Lang };

/** dateStyle NULL = the document language's default (dates.ts). Invalid stored values fall back. */
export async function getDocumentDefaults(db: Db): Promise<DocumentDefaults> {
  const [paper, dateStyle, language] = await Promise.all([
    getSetting(db, 'default_paper'),
    getSetting(db, 'default_date_style'),
    getSetting(db, 'default_doc_language'),
  ]);
  return {
    paper: paper === 'letter' ? 'letter' : 'a4',
    dateStyle: DATE_STYLES.includes(dateStyle as DateStyle) ? (dateStyle as DateStyle) : null,
    language: LANGS.includes(language as Lang) ? (language as Lang) : 'en',
  };
}

export async function setDocumentDefaults(db: Db, patch: Partial<DocumentDefaults>): Promise<void> {
  await withTransaction(db, async (tx) => {
    if (patch.paper) await setSetting(tx, 'default_paper', patch.paper);
    if (patch.dateStyle !== undefined) {
      if (patch.dateStyle === null) await tx.runAsync("DELETE FROM settings WHERE key = 'default_date_style'");
      else await setSetting(tx, 'default_date_style', patch.dateStyle);
    }
    if (patch.language) await setSetting(tx, 'default_doc_language', patch.language);
  });
}
