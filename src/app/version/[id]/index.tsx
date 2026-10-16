// Version screen (SPEC §6): Content · Design · Preview · Job · Check · Export (P4 Content, P5 Design/Preview/Export, P6 Job/Check).
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useState } from 'react';
import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Badge, Card, Chips, Heading, LinkButton, Screen, Segmented } from '@/components/ui';
import { VersionTree } from '@/components/version-content';
import { VersionDesign } from '@/components/version-design';
import { VersionCheck } from '@/components/version-check';
import { VersionExport } from '@/components/version-export';
import { VersionJob } from '@/components/version-job';
import { VersionPreview } from '@/components/version-preview';
import { Spacing } from '@/constants/theme';
import { createCover } from '@/db/covers';
import { loadResolvedVersion } from '@/db/load';
import { getProfile } from '@/db/profile';
import { applyProfileOverrideToMaster } from '@/db/version-items';
import { deleteVersion, duplicateVersion, getVersion, updateVersion } from '@/db/versions';
import type { Lang } from '@/engine/types';
import { useLoad } from '@/hooks/use-load';
import { t } from '@/i18n';
import { removeExportFiles } from '@/lib/export';

const TABS = ['content', 'design', 'preview', 'job', 'check', 'export'] as const;
type Tab = (typeof TABS)[number];

export default function VersionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const versionId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('content');
  const { fontScale } = useWindowDimensions();
  const { data, reload } = useLoad(async (db) => {
    const version = await getVersion(db, versionId);
    if (!version) return null;
    const [resolved, profile] = await Promise.all([loadResolvedVersion(db, versionId), getProfile(db)]);
    return { version, resolved, profile };
  }, versionId);

  if (data === undefined) return <Screen testID="version-screen">{null}</Screen>;
  if (data === null) {
    return (
      <Screen testID="version-screen">
        <ThemedText themeColor="textSecondary">{t('version.gone')}</ThemedText>
      </Screen>
    );
  }
  const { version, resolved, profile } = data;
  const tabOptions = TABS.map((v) => ({ value: v, label: t(`version.tab.${v}`) }));

  // Headline/summary: editing here is "for this version only" (D17). Equal to the master text = no override.
  const saveText = async (field: 'headline' | 'summary', text: string) => {
    const master = field === 'headline' ? profile.headline : profile.summary;
    await updateVersion(db, versionId, { [field === 'headline' ? 'headlineOverride' : 'summaryOverride']: text === master ? null : text });
    reload();
  };
  const resetText = async (field: 'headline' | 'summary') => {
    await updateVersion(db, versionId, { [field === 'headline' ? 'headlineOverride' : 'summaryOverride']: null });
    reload();
  };

  function confirmDelete() {
    Alert.alert(t('version.delete.title'), t('version.delete.message', { name: version!.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          removeExportFiles(await deleteVersion(db, versionId)); // only inside <document>/exports/ (D59)
          router.back();
        },
      },
    ]);
  }

  const textCard = (field: 'headline' | 'summary') => {
    const overridden = field === 'headline' ? resolved.headlineOverridden : resolved.summaryOverridden;
    const value = field === 'headline' ? resolved.headline : resolved.summary;
    return (
      <Card>
        <AutoTextField
          testID={`version-${field}`}
          label={t(field === 'headline' ? 'profile.headline' : 'profile.summary')}
          value={value}
          multiline={field === 'summary'}
          onSave={(v) => saveText(field, v)}
          hint={overridden ? t('content.overridden.hint') : t('content.sameAsMaster')}
        />
        {overridden ? (
          <View style={styles.actions}>
            <Badge testID={`${field}-edited`} label={t('content.badge.edited')} />
            <LinkButton
              testID={`${field}-apply`}
              label={t('content.apply')}
              onPress={async () => {
                await applyProfileOverrideToMaster(db, versionId, field);
                reload();
              }}
            />
            <LinkButton testID={`${field}-reset`} label={t('content.reset')} onPress={() => resetText(field)} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: version.name }} />
      <Screen testID="version-screen" scrollKey={tab}>
        {/* Six segments in one row cut their labels at large text sizes ("Co…", P6 large-text pass): from 1.15× the tabs wrap. */}
        {fontScale > 1.15 ? <Chips testID="version-tabs" value={tab} onChange={setTab} options={tabOptions} /> : <Segmented testID="version-tabs" value={tab} onChange={setTab} options={tabOptions} />}
        {tab === 'content' ? (
          <>
            <Card>
              <AutoTextField testID="version-name" label={t('version.name')} value={version.name} onSave={(v) => (v.trim() ? updateVersion(db, versionId, { name: v.trim() }).then(reload) : undefined)} />
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('version.language')}
              </ThemedText>
              <Segmented
                testID="version-language"
                value={version.language}
                onChange={async (lang: Lang) => {
                  await updateVersion(db, versionId, { language: lang });
                  reload();
                }}
                options={[
                  { value: 'en', label: t('lang.en') },
                  { value: 'de', label: t('lang.de') },
                ]}
              />
            </Card>
            {textCard('headline')}
            {textCard('summary')}
            <Heading>{t('content.heading')}</Heading>
            <ThemedText type="small" themeColor="textSecondary">
              {t('content.explain')}
            </ThemedText>
            <VersionTree resolved={resolved} reload={reload} />
            <Button
              testID="duplicate-version"
              variant="secondary"
              label={t('version.duplicate')}
              onPress={async () => {
                const copy = await duplicateVersion(db, versionId);
                router.replace(`/version/${copy}`);
              }}
            />
            <Button
              testID="version-cover-letter"
              variant="secondary"
              label={t('cover.forResume')}
              onPress={async () => {
                const id = await createCover(db, { versionId, language: version.language, recipientCompany: version.targetCompany });
                router.push(`/cover/${id}` as Href);
              }}
            />
            <LinkButton testID="delete-version" danger label={t('version.delete')} onPress={confirmDelete} />
          </>
        ) : tab === 'design' ? (
          <VersionDesign version={version} hasPhoto={Boolean(profile.photoFile)} reload={reload} />
        ) : tab === 'preview' ? (
          <VersionPreview versionId={versionId} reload={reload} />
        ) : tab === 'job' ? (
          <VersionJob versionId={versionId} reload={reload} />
        ) : tab === 'check' ? (
          <VersionCheck versionId={versionId} onTab={setTab} />
        ) : (
          <VersionExport versionId={versionId} reload={reload} onDesign={() => setTab('design')} />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.three },
});
