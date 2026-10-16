import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { openDatabase } from '@/db/migrations';
import { DatabaseProvider } from '@/db/provider';
import { getThemePreference } from '@/db/settings';
import { getUiLanguage, subscribeUiLanguage, t } from '@/i18n';
import { initUiLanguage } from '@/lib/locale';
import { applyThemePreference } from '@/lib/theme-preference';

async function initDatabase(db: SQLiteDatabase) {
  await openDatabase(db);
  await initUiLanguage(db); // before any screen renders: every t() call after this is in the UI language
  applyThemePreference(await getThemePreference(db));
}

export default function RootLayout() {
  return (
    <DatabaseProvider onInit={initDatabase}>
      <Navigator />
    </DatabaseProvider>
  );
}

function Navigator() {
  const scheme = useColorScheme();
  const language = useSyncExternalStore(subscribeUiLanguage, getUiLanguage);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack key={language} screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile/section/[id]" options={{ title: '' }} />
        <Stack.Screen name="profile/entry/[id]" options={{ title: '' }} />
        <Stack.Screen name="version/new" options={{ title: t('version.new.title'), presentation: 'modal' }} />
        <Stack.Screen name="version/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="version/[id]/entry/[entryId]" options={{ title: t('override.title') }} />
        <Stack.Screen name="cover/[id]" options={{ title: t('cover.title') }} />
        <Stack.Screen name="help/index" options={{ title: t('help.title') }} />
        <Stack.Screen name="help/[topic]" options={{ title: '' }} />
        <Stack.Screen name="data" options={{ title: t('settings.data') }} />
        <Stack.Screen name="history" options={{ title: t('history.title') }} />
        <Stack.Screen name="about" options={{ title: t('settings.about') }} />
        <Stack.Screen name="debug/[action]" options={{ title: 'Debug' }} />
        <Stack.Screen name="debug/probe" options={{ title: 'Probe' }} />
        <Stack.Screen name="debug/hermes" options={{ title: 'Hermes' }} />
        <Stack.Screen name="debug/recall" options={{ title: 'Recall' }} />
      </Stack>
    </ThemeProvider>
  );
}
