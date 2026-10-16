// Bullets of a master entry (SPEC §6): add, edit (autosave), move, delete with undo, "Paste lines as bullets".
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, LinkButton, MoveButtons } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addBullet, addBullets, deleteBullet, listBullets, moveBullet, updateBullet } from '@/db/bullets';
import { useLoad } from '@/hooks/use-load';
import { useMasterEdit } from '@/hooks/use-master-edit';
import { useTheme } from '@/hooks/use-theme';
import { t, type TranslationKey } from '@/i18n';
import { linesToBullets } from '@/lib/entry-kinds';

export function BulletEditor({ entryId, title, onChange }: { entryId: number; title: TranslationKey; onChange?: () => void }) {
  const edit = useMasterEdit();
  const theme = useTheme();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [undo, setUndo] = useState<{ text: string; index: number } | null>(null);
  const { data: bullets, reload } = useLoad((db) => listBullets(db, entryId), entryId);

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(id);
  }, [undo]);

  const changed = async (fn: Parameters<typeof edit>[0]) => {
    await edit(fn);
    reload();
    onChange?.();
  };

  if (!bullets) return null;
  return (
    <Card>
      <ThemedText type="smallBold">{t(title)}</ThemedText>
      {bullets.map((b, i) => (
        <View key={b.id} style={styles.bullet}>
          <AutoTextField
            testID={`bullet-text-${i}`}
            label={t('bullets.item', { n: i + 1 })}
            value={b.text}
            multiline
            onSave={(text) => edit((db) => updateBullet(db, b.id, text))}
          />
          <View style={styles.row}>
            <MoveButtons
              testID={`bullet-move-${i}`}
              canUp={i > 0}
              canDown={i < bullets.length - 1}
              upLabel={t('common.moveUp')}
              downLabel={t('common.moveDown')}
              onUp={() => changed((db) => moveBullet(db, b.id, i - 1))}
              onDown={() => changed((db) => moveBullet(db, b.id, i + 1))}
            />
            <LinkButton
              testID={`bullet-delete-${i}`}
              danger
              label={t('common.delete')}
              onPress={async () => {
                setUndo({ text: b.text, index: i });
                await changed((db) => deleteBullet(db, b.id));
              }}
            />
          </View>
        </View>
      ))}
      {undo ? (
        <View testID="bullet-undo" style={[styles.undo, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" style={styles.flex}>
            {t('bullets.deleted')}
          </ThemedText>
          <LinkButton
            testID="bullet-undo-action"
            label={t('common.undo')}
            onPress={async () => {
              const back = undo;
              setUndo(null);
              await changed((db) => addBullet(db, entryId, back.text, Date.now(), back.index));
            }}
          />
        </View>
      ) : null}
      <LinkButton testID="bullet-add" label={t('bullets.add')} onPress={() => changed((db) => addBullet(db, entryId, ''))} />
      {pasting ? (
        <View style={styles.paste}>
          <TextInput
            testID="bullet-paste-input"
            accessibilityLabel={t('bullets.paste.label')}
            placeholder={t('bullets.paste.placeholder')}
            placeholderTextColor={theme.textSecondary}
            multiline
            value={pasted}
            onChangeText={setPasted}
            style={[styles.pasteInput, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
          />
          <View style={styles.row}>
            <LinkButton
              testID="bullet-paste-add"
              label={t('bullets.paste.add', { count: linesToBullets(pasted).length })}
              disabled={linesToBullets(pasted).length === 0}
              onPress={async () => {
                const lines = linesToBullets(pasted);
                setPasted('');
                setPasting(false);
                await changed((db) => addBullets(db, entryId, lines));
              }}
            />
            <LinkButton testID="bullet-paste-cancel" label={t('common.cancel')} onPress={() => setPasting(false)} />
          </View>
        </View>
      ) : (
        <LinkButton testID="bullet-paste" label={t('bullets.paste')} onPress={() => setPasting(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bullet: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  flex: { flex: 1 },
  undo: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingLeft: Spacing.three, paddingRight: Spacing.two },
  paste: { gap: Spacing.two },
  pasteInput: { minHeight: 110, borderRadius: 12, padding: Spacing.three, fontSize: 16, textAlignVertical: 'top' },
});
