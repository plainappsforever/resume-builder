// Home / library (SPEC §6): the profile card, the versions list, "+ New version"; first launch: "Start your profile" and
// "Look at an example" (D21: no dialog, no onboarding).
import { useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Card, Heading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { createCover, listCovers } from '@/db/covers';
import { ExampleRefusedError, hasProfileData, isExampleActive, loadExample } from '@/db/example';
import { loadMaster, loadResolvedVersion } from '@/db/load';
import { getDocumentDefaults } from '@/db/settings';
import { listVersions } from '@/db/versions';
import { formatDate } from '@/engine/dates';
import { useLoad } from '@/hooks/use-load';
import { useTheme } from '@/hooks/use-theme';
import { getUiLanguage, t, type TranslationKey } from '@/i18n';
import { removeExampleAndFiles } from '@/lib/export';
import { nextProfileHint } from '@/lib/profile-hints';
import { versionBadges } from '@/lib/version-badges';

function monthOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const HINT_KEYS = {
  name: 'home.hint.name',
  headline: 'home.hint.headline',
  email: 'home.hint.email',
  phone: 'home.hint.phone',
  experience: 'home.hint.experience',
  education: 'home.hint.education',
  skills: 'home.hint.skills',
} as const satisfies Record<string, TranslationKey>;

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const { data, reload } = useLoad(async (db) => {
    const [has, master, versions, example, covers] = await Promise.all([hasProfileData(db), loadMaster(db), listVersions(db), isExampleActive(db), listCovers(db)]);
    const badges = await Promise.all(versions.map(async (v) => versionBadges(await loadResolvedVersion(db, v.id))));
    return { has, master, versions, example, badges, covers };
  });

  async function startExample() {
    try {
      await loadExample(db, getUiLanguage());
    } catch (e) {
      if (!(e instanceof ExampleRefusedError)) throw e;
    }
    reload();
  }

  function confirmRemoveExample() {
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
    ]);
  }

  if (!data) return <Screen testID="home-screen">{null}</Screen>;
  const { master, versions, badges, example, covers } = data;
  const hint = nextProfileHint(master);

  if (!data.has) {
    return (
      <Screen testID="home-screen">
        <View style={styles.empty}>
          <ThemedText type="subtitle" style={styles.center}>
            {t('home.welcome.title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {t('home.welcome.text')}
          </ThemedText>
          <Button testID="start-profile" label={t('home.start')} onPress={() => router.navigate('/profile')} />
          <Button testID="look-at-example" variant="secondary" label={t('home.example')} onPress={startExample} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="home-screen">
      {example ? (
        <Card>
          <ThemedText type="smallBold">{t('example.banner.title')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('example.banner.text')}
          </ThemedText>
          <Button testID="remove-example" variant="secondary" label={t('example.remove.button')} onPress={confirmRemoveExample} />
        </Card>
      ) : null}

      <Pressable testID="profile-card" accessibilityRole="button" onPress={() => router.navigate('/profile')}>
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('home.profile')}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.cardTitle} numberOfLines={2}>
            {master.profile.fullName || t('home.noName')}
          </ThemedText>
          {master.profile.headline ? <ThemedText themeColor="textSecondary">{master.profile.headline}</ThemedText> : null}
          {hint ? (
            <ThemedText type="small" style={{ color: theme.tint }} testID="profile-hint">
              {t(HINT_KEYS[hint])}
            </ThemedText>
          ) : null}
        </Card>
      </Pressable>

      <Heading>{t('home.versions')}</Heading>
      {versions.length === 0 ? (
        <ThemedText themeColor="textSecondary" testID="no-versions">
          {t('home.noVersions')}
        </ThemedText>
      ) : null}
      {versions.map((v, i) => {
        const b = badges[i];
        const target = [v.targetCompany, v.targetRole].filter(Boolean).join(' · ');
        return (
          <Pressable key={v.id} testID={`version-card-${v.id}`} accessibilityRole="button" onPress={() => router.push(`/version/${v.id}`)}>
            <Card>
              <ThemedText type="smallBold" style={styles.cardName}>
                {v.name}
              </ThemedText>
              {target ? <ThemedText type="small" themeColor="textSecondary">{target}</ThemedText> : null}
              <ThemedText type="small" themeColor="textSecondary">
                {v.lastExportedAt
                  ? t('home.lastExport', { date: formatDate(monthOf(v.lastExportedAt), 'Mon YYYY', getUiLanguage()) })
                  : t('home.notExported')}
              </ThemedText>
              <View style={styles.badges}>
                {b.newEntries + b.changedEntries > 0 ? (
                  <Badge testID={`version-new-${v.id}`} tone="new" label={t('home.newContent', { count: b.newEntries + b.changedEntries })} />
                ) : null}
                {b.edited ? <Badge label={t('home.edited')} /> : null}
              </View>
            </Card>
          </Pressable>
        );
      })}
      <Button testID="new-version" label={t('home.newVersion')} onPress={() => router.push('/version/new')} />

      <Heading>{t('home.covers')}</Heading>
      {covers.length === 0 ? (
        <ThemedText themeColor="textSecondary" testID="no-covers">
          {t('cover.none')}
        </ThemedText>
      ) : null}
      {covers.map((c) => (
        <Pressable key={c.id} testID={`cover-card-${c.id}`} accessibilityRole="button" onPress={() => router.push(`/cover/${c.id}` as Href)}>
          <Card>
            <ThemedText type="smallBold" style={styles.cardName}>
              {c.recipientCompany || t('cover.noRecipient')}
            </ThemedText>
            {c.subject ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {c.subject}
              </ThemedText>
            ) : null}
          </Card>
        </Pressable>
      ))}
      <Button
        testID="new-cover"
        variant="secondary"
        label={t('cover.new')}
        onPress={async () => {
          const id = await createCover(db, { language: (await getDocumentDefaults(db)).language });
          router.push(`/cover/${id}` as Href);
        }}
      />

      <Pressable testID="home-help" accessibilityRole="button" onPress={() => router.push('/help' as Href)}>
        <Card>
          <ThemedText type="smallBold">{t('home.help')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('home.help.hint')}
          </ThemedText>
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { gap: Spacing.three, marginTop: Spacing.five },
  center: { textAlign: 'center' },
  cardTitle: { fontSize: 24, lineHeight: 30 },
  cardName: { fontSize: 17, lineHeight: 24 },
  badges: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});
