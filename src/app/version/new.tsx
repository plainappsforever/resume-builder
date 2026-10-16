// New version sheet (SPEC §6): blank from the master · for a job ad (paste first) · duplicate an existing version.
import { useRouter } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, Heading, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { adoptExample } from '@/db/example';
import { getDocumentDefaults } from '@/db/settings';
import { createVersion, duplicateVersion, listVersions, nextCopyName, updateVersion } from '@/db/versions';
import type { Lang } from '@/engine/types';
import { useLoad } from '@/hooks/use-load';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

type Mode = 'blank' | 'ad' | 'duplicate';

export default function NewVersionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const { data } = useLoad(async (db) => ({ versions: await listVersions(db), defaults: await getDocumentDefaults(db) }));
  const [mode, setMode] = useState<Mode>('blank');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [ad, setAd] = useState('');
  const [language, setLanguage] = useState<Lang | null>(null);
  const [base, setBase] = useState<number | null>(null); // null = the master profile
  const [source, setSource] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Screen testID="new-version-screen">{null}</Screen>;
  const { versions, defaults } = data;
  const lang = language ?? defaults.language;
  const duplicateSource = source ?? versions[0]?.id ?? null;

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const taken = versions.map((v) => v.name);
      const wanted = name.trim() || (mode === 'ad' ? role.trim() || company.trim() : '') || t('version.defaultName');
      const unique = taken.includes(wanted) ? nextCopyName(wanted, taken) : wanted;
      let id: number;
      if (mode === 'duplicate' && duplicateSource !== null) {
        id = await duplicateVersion(db, duplicateSource);
        if (name.trim()) await updateVersion(db, id, { name: unique });
      } else if (mode === 'ad' && base !== null) {
        id = await duplicateVersion(db, base);
        await updateVersion(db, id, { name: unique, targetCompany: company.trim(), targetRole: role.trim(), jobAd: ad, language: lang });
      } else {
        const style: Record<string, string> = { paper: defaults.paper };
        if (defaults.dateStyle) style.dateStyle = defaults.dateStyle;
        id = await createVersion(db, {
          name: unique,
          targetCompany: mode === 'ad' ? company.trim() : '',
          targetRole: mode === 'ad' ? role.trim() : '',
          jobAd: mode === 'ad' ? ad : '',
          language: lang,
          styleJson: JSON.stringify(style),
        });
      }
      await adoptExample(db);
      router.replace(`/version/${id}`);
    } finally {
      setBusy(false);
    }
  }

  const chip = (testID: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={testID}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundSelected }]}>
      <ThemedText type="small" style={selected ? { color: theme.onTint } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <Screen testID="new-version-screen">
      <Segmented
        testID="new-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'blank', label: t('version.new.blank') },
          { value: 'ad', label: t('version.new.ad') },
          { value: 'duplicate', label: t('version.new.duplicate') },
        ]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t(mode === 'blank' ? 'version.new.blank.hint' : mode === 'ad' ? 'version.new.ad.hint' : 'version.new.duplicate.hint')}
      </ThemedText>

      {mode === 'duplicate' ? (
        versions.length === 0 ? (
          <ThemedText themeColor="textSecondary">{t('version.new.noVersions')}</ThemedText>
        ) : (
          <View style={styles.chips}>{versions.map((v) => chip(`dup-${v.id}`, v.name, v.id === duplicateSource, () => setSource(v.id)))}</View>
        )
      ) : null}

      {mode === 'ad' ? (
        <Card>
          <AutoTextField testID="new-ad" label={t('version.new.adText')} value={ad} onSave={() => undefined} onDraft={setAd} multiline placeholder={t('version.new.adPlaceholder')} />
          <AutoTextField testID="new-company" label={t('version.company')} value={company} onSave={() => undefined} onDraft={setCompany} />
          <AutoTextField testID="new-role" label={t('version.role')} value={role} onSave={() => undefined} onDraft={setRole} />
        </Card>
      ) : null}

      {mode === 'ad' && versions.length > 0 ? (
        <>
          <Heading>{t('version.new.base')}</Heading>
          <View style={styles.chips}>
            {chip('base-master', t('version.new.baseMaster'), base === null, () => setBase(null))}
            {versions.map((v) => chip(`base-${v.id}`, v.name, base === v.id, () => setBase(v.id)))}
          </View>
        </>
      ) : null}

      {mode !== 'duplicate' ? (
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('version.language')}
          </ThemedText>
          <Segmented
            testID="new-language"
            value={lang}
            onChange={setLanguage}
            options={[
              { value: 'en', label: t('lang.en') },
              { value: 'de', label: t('lang.de') },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('version.language.hint')}
          </ThemedText>
        </Card>
      ) : null}

      <Card>
        <AutoTextField testID="new-name" label={t('version.name')} value={name} onSave={() => undefined} onDraft={setName} placeholder={t('version.defaultName')} />
      </Card>
      <Button testID="create-version" label={t('version.new.create')} disabled={busy || (mode === 'duplicate' && duplicateSource === null)} onPress={create} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 36, justifyContent: 'center' },
});
