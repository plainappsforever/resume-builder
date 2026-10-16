// "Edit for this version only" (SPEC §6, D17): the entry's fields and bullets as this version shows them. Typing stores a
// version override (the master is untouched); a field equal to the master text has no override. "Apply to master" moves
// the override into the master (cleared here only, other versions keep theirs); "Use master text" drops it.
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Badge, Card, LinkButton, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadMaster, loadResolvedVersion } from '@/db/load';
import {
  applyBulletOverrideToMaster,
  applyEntryOverrideToMaster,
  setBulletOverride,
  setEntryOverride,
} from '@/db/version-items';
import type { ResolvedBullet } from '@/engine/resolve';
import type { EntryField } from '@/engine/types';
import { useLoad } from '@/hooks/use-load';
import { t, type TranslationKey } from '@/i18n';
import { KIND_SPECS } from '@/lib/entry-kinds';

export default function OverrideScreen() {
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();
  const versionId = Number(id);
  const eid = Number(entryId);
  const db = useSQLiteContext();
  const { data, reload } = useLoad(async (db) => ({ resolved: await loadResolvedVersion(db, versionId), master: await loadMaster(db) }), `${versionId}-${eid}`);
  if (!data) return <Screen testID="override-screen">{null}</Screen>;
  const section = data.resolved.sections.find((s) => s.entries.some((e) => e.id === eid));
  const entry = section?.entries.find((e) => e.id === eid);
  const masterEntry = data.master.entries.find((e) => e.id === eid);
  if (!section || !entry || !masterEntry) {
    return (
      <Screen testID="override-screen">
        <ThemedText themeColor="textSecondary">{t('entry.gone')}</ThemedText>
      </Screen>
    );
  }
  const spec = KIND_SPECS[section.kind];
  const fields: { field: EntryField; label: TranslationKey; multiline?: boolean }[] = [
    { field: 'title', label: spec.titleLabel },
    ...(spec.fields.includes('organization') ? [{ field: 'organization' as const, label: spec.organizationLabel }] : []),
    ...(spec.fields.includes('location') ? [{ field: 'location' as const, label: 'field.location' as const }] : []),
    ...(spec.fields.includes('description') ? [{ field: 'description' as const, label: 'field.description' as const, multiline: true }] : []),
  ];

  const saveField = async (field: EntryField, text: string) => {
    // Equal to the master text = no deviation.
    await setEntryOverride(db, versionId, eid, field, text === masterEntry[field] ? null : text);
    reload();
  };
  const saveBullet = async (b: ResolvedBullet, text: string) => {
    await setBulletOverride(db, versionId, b.id, text === b.masterText ? null : text);
    reload();
  };
  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    reload();
  };
  const anyOverride = entry.overridden;

  return (
    <Screen testID="override-screen">
      <ThemedText type="small" themeColor="textSecondary">
        {t('override.explain')}
      </ThemedText>
      <Card>
        {fields.map(({ field, label, multiline }) => {
          const overridden = entry.overriddenFields.includes(field);
          return (
            <View key={field} style={styles.field}>
              <AutoTextField
                testID={`override-${field}`}
                label={t(label)}
                value={entry[field]}
                multiline={multiline}
                onSave={(v) => saveField(field, v)}
                hint={overridden ? t('override.master', { text: masterEntry[field] || t('override.empty') }) : undefined}
              />
              {overridden ? (
                <View style={styles.actions}>
                  <Badge label={t('content.badge.edited')} />
                  <LinkButton testID={`override-apply-${field}`} label={t('content.apply')} onPress={() => run(() => applyEntryOverrideToMaster(db, versionId, eid, [field]))} />
                  <LinkButton testID={`override-reset-${field}`} label={t('content.reset')} onPress={() => run(() => setEntryOverride(db, versionId, eid, field, null))} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {entry.bullets.length > 0 ? (
        <Card>
          <ThemedText type="smallBold">{t(spec.bulletsLabel)}</ThemedText>
          {entry.bullets.map((b, i) => (
            <View key={b.id} style={styles.field}>
              <AutoTextField
                testID={`override-bullet-${b.id}`}
                label={t('bullets.item', { n: i + 1 })}
                value={b.text}
                multiline
                onSave={(v) => saveBullet(b, v)}
                hint={b.overridden ? t('override.master', { text: b.masterText || t('override.empty') }) : undefined}
              />
              {b.overridden ? (
                <View style={styles.actions}>
                  <Badge label={t('content.badge.edited')} />
                  <LinkButton testID={`bullet-apply-${b.id}`} label={t('content.apply')} onPress={() => run(() => applyBulletOverrideToMaster(db, versionId, b.id))} />
                  <LinkButton testID={`bullet-reset-${b.id}`} label={t('content.reset')} onPress={() => run(() => setBulletOverride(db, versionId, b.id, null))} />
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {anyOverride ? (
        <Button
          testID="override-apply-all"
          variant="secondary"
          label={t('override.applyAll')}
          onPress={() =>
            run(async () => {
              await applyEntryOverrideToMaster(db, versionId, eid);
              for (const b of entry.bullets) if (b.overridden) await applyBulletOverrideToMaster(db, versionId, b.id);
            })
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.three },
});
