// Settings basics (SPEC §6): appearance, document defaults, language info, example data, about; dev-only debug links.
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Card, Heading, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { isExampleActive } from '@/db/example';
import { getDocumentDefaults, getThemePreference, setDocumentDefaults, setThemePreference, type ThemePreference } from '@/db/settings';
import { DATE_STYLES, defaultDateStyle, type DateStyle } from '@/engine/dates';
import type { Paper } from '@/engine/style';
import type { Lang } from '@/engine/types';
import { useLoad } from '@/hooks/use-load';
import { getUiLanguage, t } from '@/i18n';
import { isDevVariant } from '@/lib/app-variant';
import { removeExampleAndFiles } from '@/lib/export';
import { applyThemePreference } from '@/lib/theme-preference';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { data, reload } = useLoad(async (db) => ({
    theme: await getThemePreference(db),
    defaults: await getDocumentDefaults(db),
    example: await isExampleActive(db),
  }));
  if (!data) return <Screen testID="settings-screen">{null}</Screen>;
  const { theme, defaults, example } = data;
  const language = getUiLanguage();

  const dateOptions: { value: DateStyle | 'auto'; label: string }[] = [
    { value: 'auto', label: t('settings.dateStyle.auto') },
    ...DATE_STYLES.map((s) => ({ value: s, label: s })),
  ];

  return (
    <Screen testID="settings-screen">
      <Heading>{t('settings.appearance')}</Heading>
      <Segmented
        testID="theme"
        value={theme}
        onChange={async (value: ThemePreference) => {
          applyThemePreference(value);
          await setThemePreference(db, value);
          reload();
        }}
        options={[
          { value: 'system', label: t('settings.theme.system') },
          { value: 'light', label: t('settings.theme.light') },
          { value: 'dark', label: t('settings.theme.dark') },
        ]}
      />

      <Heading>{t('settings.defaults')}</Heading>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.defaults.hint')}
        </ThemedText>
        <ThemedText type="smallBold">{t('settings.paper')}</ThemedText>
        <Segmented
          testID="default-paper"
          value={defaults.paper}
          onChange={async (paper: Paper) => {
            await setDocumentDefaults(db, { paper });
            reload();
          }}
          options={[
            { value: 'a4', label: 'A4' },
            { value: 'letter', label: 'Letter' },
          ]}
        />
        <ThemedText type="smallBold">{t('settings.dateStyle')}</ThemedText>
        <Segmented
          testID="default-date-style"
          value={defaults.dateStyle ?? 'auto'}
          onChange={async (value) => {
            await setDocumentDefaults(db, { dateStyle: value === 'auto' ? null : value });
            reload();
          }}
          options={dateOptions}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.dateStyle.example', { en: defaultDateStyle('en'), de: defaultDateStyle('de') })}
        </ThemedText>
        <ThemedText type="smallBold">{t('settings.docLanguage')}</ThemedText>
        <Segmented
          testID="default-language"
          value={defaults.language}
          onChange={async (lang: Lang) => {
            await setDocumentDefaults(db, { language: lang });
            reload();
          }}
          options={[
            { value: 'en', label: t('lang.en') },
            { value: 'de', label: t('lang.de') },
          ]}
        />
      </Card>

      <Heading>{t('settings.language')}</Heading>
      <ThemedText type="small" themeColor="textSecondary" testID="ui-language">
        {t('settings.language.info', { language: t(`lang.${language}`) })}
      </ThemedText>

      {example ? (
        <>
          <Heading>{t('settings.example')}</Heading>
          <Button
            testID="settings-remove-example"
            variant="secondary"
            label={t('example.remove.button')}
            onPress={() =>
              Alert.alert(t('example.remove.title'), t('example.remove.message'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('example.remove.confirm'),
                  style: 'destructive',
                  onPress: async () => {
                    await removeExampleAndFiles(db);
                    reload();
                  },
                },
              ])
            }
          />
        </>
      ) : null}

      <Heading>{t('settings.data')}</Heading>
      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.data.hint')}
      </ThemedText>
      <Button testID="settings-data" variant="secondary" label={t('settings.data')} onPress={() => router.push('/data' as Href)} />

      <Heading>{t('settings.help')}</Heading>
      <Button testID="settings-help" variant="secondary" label={t('settings.help')} onPress={() => router.push('/help' as Href)} />

      <Heading>{t('settings.about')}</Heading>
      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.privacy')}
      </ThemedText>
      <Button testID="settings-about" variant="secondary" label={t('settings.aboutOpen')} onPress={() => router.push('/about' as Href)} />
      <ThemedText type="small" themeColor="textSecondary" testID="app-version">
        {t('settings.version', { version: String(Constants.expoConfig?.version), variant: String(Constants.expoConfig?.extra?.appVariant) })}
      </ThemedText>

      {isDevVariant ? (
        <>
          <Heading>Debug (development build only)</Heading>
          <View style={styles.debug}>
            <Button testID="debug-reset" variant="secondary" label="Reset all data" onPress={() => router.push('/debug/reset')} />
            <Button testID="debug-seed-en" variant="secondary" label="Seed example (EN)" onPress={() => router.push('/debug/seed?fixture=example-en')} />
            <Button testID="debug-seed-de" variant="secondary" label="Seed example (DE)" onPress={() => router.push('/debug/seed?fixture=example-de')} />
            <Button testID="debug-probe" variant="secondary" label="expo-sqlite probe" onPress={() => router.push('/debug/probe')} />
            <Button testID="debug-hermes" variant="secondary" label="Hermes engine probe" onPress={() => router.push('/debug/hermes')} />
            <Button testID="debug-recall" variant="secondary" label="Keyword recall on the review ads" onPress={() => router.push('/debug/recall' as Href)} />
            <Button testID="debug-pdf-gate" variant="secondary" label="PDF gate (72 documents)" onPress={() => router.push('/debug/pdf-gate')} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  debug: { gap: Spacing.two },
});
