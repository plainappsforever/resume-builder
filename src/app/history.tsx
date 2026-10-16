// Settings → Backup and data → Export history (SPEC F6, §6): every PDF and text file made on this phone, newest first,
// with "Share again" of the saved file (re-made from its saved content when the file is gone) and "Delete" (the row and
// the file in the app's own export folder only, D59/D75).
import { Stack } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { HistoryCard, tr } from '@/components/export-parts';
import { PdfHarness } from '@/components/pdf-harness';
import { ThemedText } from '@/components/themed-text';
import { LinkButton, Screen } from '@/components/ui';
import { listCovers } from '@/db/covers';
import { deleteExport, listAllExports, type ExportRecord } from '@/db/exports';
import { listVersions } from '@/db/versions';
import { useLoad } from '@/hooks/use-load';
import { t } from '@/i18n';
import { removeExportFiles } from '@/lib/export';
import type { HarnessClient } from '@/readback/bridge';
import { sizeMsg } from '@/readback/summary';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [note, setNote] = useState<string | null>(null);
  const harness = useRef<HarnessClient | null>(null);
  const { data, reload } = useLoad(async (db) => {
    const [rows, active, archived, covers] = await Promise.all([listAllExports(db), listVersions(db), listVersions(db, { archived: true }), listCovers(db)]);
    return {
      rows,
      versions: new Map([...active, ...archived].map((v) => [v.id, v.name])),
      covers: new Map(covers.map((c) => [c.id, c.recipientCompany])),
    };
  });
  if (!data) return <Screen testID="history-screen">{null}</Screen>;
  const bytes = data.rows.reduce((n, r) => n + (r.filePath !== null ? (r.bytes ?? 0) : 0), 0);

  function confirmDelete(row: ExportRecord) {
    Alert.alert(t('history.delete.title'), t('history.delete.message', { name: row.fileName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          removeExportFiles([await deleteExport(db, row.id)].filter((p): p is string => p !== null));
          setNote(t('history.deleted'));
          reload();
        },
      },
    ]);
  }

  return (
    <Screen testID="history-screen">
      <Stack.Screen options={{ title: t('history.title') }} />
      <PdfHarness ref={harness} />
      <ThemedText type="smallBold" testID="history-total">
        {t('history.total', { count: data.rows.length, size: tr(sizeMsg(bytes)) })}
      </ThemedText>
      {note ? <ThemedText type="small">{note}</ThemedText> : null}
      {data.rows.length === 0 ? (
        <ThemedText themeColor="textSecondary" testID="history-empty">
          {t('export.history.empty')}
        </ThemedText>
      ) : null}
      {data.rows.map((row, i) => {
        const owner = row.versionId !== null ? data.versions.get(row.versionId) : row.coverLetterId !== null ? data.covers.get(row.coverLetterId) : null;
        return (
          <HistoryCard key={row.id} row={row} index={i} onNote={setNote} reader={() => harness.current} onChanged={reload}>
            <ThemedText type="small" themeColor="textSecondary">
              {[t(`history.kind.${row.kind}`), owner ? t('history.of', { name: owner }) : null].filter(Boolean).join(' · ')}
            </ThemedText>
            <LinkButton testID={`history-delete-${i}`} danger label={t('history.delete')} onPress={() => confirmDelete(row)} />
          </HistoryCard>
        );
      })}
    </Screen>
  );
}
