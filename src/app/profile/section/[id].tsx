// One master section: its title, its entries (add, move up/down, duplicate, delete with undo), delete section.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, LinkButton, MoveButtons, Screen, UndoBar } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addEntry, deleteEntry, duplicateEntry, listEntries, moveEntry, restoreEntry, type DeletedEntry } from '@/db/entries';
import { deleteSection, listSections, renameSection } from '@/db/sections';
import { formatDateRange, sortNewestFirst, defaultDateStyle } from '@/engine/dates';
import { useLoad } from '@/hooks/use-load';
import { useMasterEdit } from '@/hooks/use-master-edit';
import { getUiLanguage, t, type TranslationKey } from '@/i18n';
import { KIND_SPECS } from '@/lib/entry-kinds';

export default function SectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sectionId = Number(id);
  const router = useRouter();
  const db = useSQLiteContext();
  const edit = useMasterEdit();
  const [undo, setUndo] = useState<DeletedEntry | null>(null);
  const { data, reload } = useLoad(async (db) => {
    const [sections, entries] = await Promise.all([listSections(db), listEntries(db, sectionId)]);
    return { section: sections.find((s) => s.id === sectionId) ?? null, entries };
  }, sectionId);
  if (!data) return <Screen testID="section-screen">{null}</Screen>;
  const { section, entries } = data;
  if (!section) {
    return (
      <Screen testID="section-screen">
        <ThemedText themeColor="textSecondary">{t('section.gone')}</ThemedText>
      </Screen>
    );
  }
  const spec = KIND_SPECS[section.kind];
  const standard = t(`section.kind.${section.kind}` as TranslationKey);
  const lang = getUiLanguage();

  function confirmDeleteSection() {
    Alert.alert(t('section.delete.title'), t('section.delete.message', { count: entries.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await edit((db) => deleteSection(db, sectionId));
          router.back();
        },
      },
    ]);
  }

  async function sortNewest() {
    const order = sortNewestFirst(entries);
    for (let i = 0; i < order.length; i++) await edit((db) => moveEntry(db, order[i].id, i));
    reload();
  }

  return (
    <>
      <Stack.Screen options={{ title: section.customTitle || standard }} />
      <Screen testID="section-screen">
        <Card>
          <AutoTextField
            testID="section-title"
            label={t('section.title')}
            value={section.customTitle ?? ''}
            placeholder={standard}
            hint={t('section.title.hint')}
            onSave={(v) => edit((db) => renameSection(db, sectionId, v))}
          />
        </Card>

        {entries.map((e, i) => {
          const dates = spec.fields.includes('dates') ? formatDateRange(e, defaultDateStyle(lang), lang) : '';
          const subtitle =
            spec.itemsAsBullets || section.kind === 'languages'
              ? [e.extra.level].filter(Boolean).join(' · ')
              : [e.organization, dates].filter(Boolean).join(' · ');
          return (
            <Card key={e.id}>
              <Pressable testID={`entry-row-${e.id}`} accessibilityRole="button" onPress={() => router.push(`/profile/entry/${e.id}`)}>
                <ThemedText type="smallBold" style={styles.title}>
                  {e.title || t('entry.untitled')}
                </ThemedText>
                {subtitle ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {subtitle}
                  </ThemedText>
                ) : null}
              </Pressable>
              <View style={styles.row}>
                <MoveButtons
                  testID={`entry-move-${e.id}`}
                  canUp={i > 0}
                  canDown={i < entries.length - 1}
                  upLabel={t('common.moveUp')}
                  downLabel={t('common.moveDown')}
                  onUp={async () => {
                    await edit((db) => moveEntry(db, e.id, i - 1));
                    reload();
                  }}
                  onDown={async () => {
                    await edit((db) => moveEntry(db, e.id, i + 1));
                    reload();
                  }}
                />
                <View style={styles.row}>
                  <LinkButton
                    testID={`entry-duplicate-${e.id}`}
                    label={t('common.duplicate')}
                    onPress={async () => {
                      await edit((db) => duplicateEntry(db, e.id));
                      reload();
                    }}
                  />
                  <LinkButton
                    testID={`entry-delete-${e.id}`}
                    danger
                    label={t('common.delete')}
                    onPress={async () => {
                      setUndo(await edit((db) => deleteEntry(db, e.id)));
                      reload();
                    }}
                  />
                </View>
              </View>
            </Card>
          );
        })}

        <Button
          testID="add-entry"
          label={t('entry.add')}
          onPress={async () => {
            const entryId = await edit((db) => addEntry(db, sectionId));
            reload();
            router.push(`/profile/entry/${entryId}`);
          }}
        />
        {entries.length > 1 && spec.fields.includes('dates') ? (
          <Button testID="sort-entries" variant="secondary" label={t('entry.sortNewest')} onPress={sortNewest} />
        ) : null}
        <LinkButton testID="delete-section" danger label={t('section.delete')} onPress={confirmDeleteSection} />
      </Screen>
      {undo ? (
        <UndoBar
          message={t('entry.deleted')}
          actionLabel={t('common.undo')}
          onExpire={() => setUndo(null)}
          onAction={async () => {
            const snapshot = undo;
            setUndo(null);
            try {
              await restoreEntry(db, snapshot);
            } catch {
              Alert.alert(t('entry.undo.failed'));
            }
            reload();
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { fontSize: 17, lineHeight: 24 },
});
