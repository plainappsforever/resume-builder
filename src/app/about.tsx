// Settings → About and privacy (SPEC §11, A13): states only what the code does — no account, no analytics, no network
// code, the phone backup per platform (D76), release builds without the Android INTERNET permission (plugins/with-no-internet.js)
// — the placeholder address of the online privacy policy, and the licences of what the app contains.
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Card, Heading, LinkButton, Screen } from '@/components/ui';
import { LICENCES, type Licence } from '@/data/licences.generated';
import { t } from '@/i18n';

/** The online privacy policy (owner-chosen address, RELEASE_KIT D6; the page itself is published by the taulon-site job). */
export const PRIVACY_URL = 'https://taulon.org/apps/resume-builder/privacy';

export default function AboutScreen() {
  return (
    <Screen testID="about-screen">
      <Stack.Screen options={{ title: t('settings.about') }} />
      <View style={{ gap: 4 }}>
        <ThemedText type="subtitle">{t('app.name')}</ThemedText>
        <ThemedText themeColor="textSecondary" testID="about-version">
          {t('about.version', { version: String(Constants.expoConfig?.version ?? '') })}
        </ThemedText>
      </View>
      <Heading>{t('about.privacy.title')}</Heading>
      <Card>
        <View style={{ gap: 12 }} testID="about-privacy">
          <ThemedText>{t('about.privacy.local')}</ThemedText>
          <ThemedText testID="about-privacy-network">{t('about.privacy.noNetwork')}</ThemedText>
          <ThemedText testID="about-privacy-backup">{t(Platform.OS === 'ios' ? 'about.privacy.backup.ios' : 'about.privacy.backup.android')}</ThemedText>
          <ThemedText>{t('about.privacy.sharing')}</ThemedText>
          <ThemedText>{t('about.privacy.permissions')}</ThemedText>
          <ThemedText>{t('about.privacy.delete')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('about.privacy.url')}
          </ThemedText>
          <ThemedText type="smallBold" selectable testID="about-privacy-url">
            {PRIVACY_URL}
          </ThemedText>
          <Button testID="about-privacy-open" variant="secondary" label={t('about.privacy.open')} onPress={() => void Linking.openURL(PRIVACY_URL)} />
        </View>
      </Card>
      <Heading>{t('about.licences.title')}</Heading>
      <ThemedText type="small" themeColor="textSecondary">
        {t('about.licences.hint')}
      </ThemedText>
      <Card>
        <View testID="about-licences" style={{ gap: 8 }}>
          {LICENCES.filter((l) => l.direct).map((l) => (
            <LicenceRow key={`${l.source}:${l.name}`} l={l} />
          ))}
        </View>
      </Card>
      <AllLicences />
    </Screen>
  );
}

function LicenceRow({ l }: { l: Licence }) {
  return (
    <View testID={`licence-${l.name}`}>
      <ThemedText type="smallBold">{l.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{`${l.version} · ${l.license}`}</ThemedText>
    </View>
  );
}

/** v1.1 (RELEASE_KIT §1c item 13): every component in the app — JavaScript packages, iOS and Android libraries — on request. */
function AllLicences() {
  const [open, setOpen] = useState(false);
  const rest = LICENCES.filter((l) => !l.direct);
  return (
    <>
      <LinkButton testID="about-licences-all" label={open ? t('about.licences.less') : t('about.licences.all', { count: LICENCES.length })} onPress={() => setOpen(!open)} />
      {open
        ? (['npm', 'pod', 'maven'] as const).map((source) => (
            <Card key={source}>
              <ThemedText type="smallBold">{t(`about.licences.source.${source}`)}</ThemedText>
              <View style={{ gap: 6 }}>
                {rest
                  .filter((l) => l.source === source)
                  .map((l) => (
                    <LicenceRow key={`${l.source}:${l.name}`} l={l} />
                  ))}
              </View>
            </Card>
          ))
        : null}
    </>
  );
}
