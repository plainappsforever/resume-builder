// Settings → Backup and data (SPEC F12, §9, §10, A10; D22, D50, D59, D62): back up (share sheet), restore (system file
// picker → full validation → summary → confirm → ONE transaction, safety copy first), all resumes as plain text, the export
// history, and "Delete all data" in two steps. Development builds add a fingerprint label and a "restore the last backup of
// this phone" button so Maestro can run the whole round trip without the system picker.
import { Stack, useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Card, Heading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Backup, BackupError, BackupSummary } from '@/data/backup';
import { readDataCounts, readDataFingerprint } from '@/db/backup';
import { getSetting } from '@/db/settings';
import { useLoad } from '@/hooks/use-load';
import { getUiLanguage, t } from '@/i18n';
import { isDevVariant } from '@/lib/app-variant';
import { applyRestore, deleteAllData, lastDevBackup, pickBackupText, recordBackupTime, reviewBackup, safetyCopy, shareDataFile, writeAllResumesText, writeBackupFile } from '@/lib/data-files';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function dayText(ms: number): string {
  return new Date(ms).toLocaleDateString(getUiLanguage() === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium' });
}

function reason(error: BackupError): string {
  return t(`data.restore.error.${error.code}`);
}

function countsText(s: BackupSummary): string {
  return t('data.restore.counts', { name: s.fullName.trim() || t('data.restore.noName'), sections: s.sections, entries: s.entries, versions: s.versions, covers: s.coverLetters });
}

export default function DataScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { data, reload } = useLoad(async (db) => ({
    lastBackup: await getSetting(db, 'last_backup_at'),
    hash: isDevVariant ? await readDataFingerprint(db) : '',
    safety: safetyCopy(),
  }));
  const [backupMessage, setBackupMessage] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [textMessage, setTextMessage] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);

  async function guarded(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  const backUp = () =>
    guarded(async () => {
      setBackupMessage('');
      try {
        const { file, name } = await writeBackupFile(db);
        await recordBackupTime(db);
        setBackupMessage(t('data.backup.done', { name }));
        await reload();
        await shareDataFile(file, 'json').catch(() => undefined); // cancelling the share sheet keeps the file made
      } catch (e) {
        setBackupMessage(t('data.backup.failed', { error: errorText(e) }));
      }
    });

  function review(text: string) {
    const result = reviewBackup(text);
    if (!result.ok) {
      setPending(null);
      setRestoreMessage(t('data.restore.invalid', { reason: reason(result.error) }));
      return;
    }
    setRestoreMessage('');
    setPending({ backup: result.backup, summary: result.summary });
  }

  const pick = () =>
    guarded(async () => {
      setRestoreMessage('');
      const picked = await pickBackupText();
      if (picked.canceled) return;
      if ('error' in picked) return setRestoreMessage(t('data.restore.invalid', { reason: t('data.restore.error.notReadable') }));
      review(picked.text);
    });

  const pickFile = (get: () => { text(): Promise<string> } | null) =>
    guarded(async () => {
      const file = get();
      if (!file) return;
      try {
        review(await file.text());
      } catch {
        setRestoreMessage(t('data.restore.invalid', { reason: t('data.restore.error.notReadable') }));
      }
    });

  const confirmRestore = () =>
    guarded(async () => {
      if (!pending) return;
      try {
        await applyRestore(db, pending.backup);
        setRestoreMessage(t('data.restore.done', { counts: countsText(pending.summary) }));
        setPending(null);
        setDeleteMessage('');
        await reload();
      } catch (e) {
        setRestoreMessage(t('data.restore.failed', { error: errorText(e) }));
      }
    });

  const shareText = () =>
    guarded(async () => {
      setTextMessage('');
      try {
        const out = await writeAllResumesText(db);
        if (!out) return setTextMessage(t('data.text.none'));
        setTextMessage(t('data.text.done', { name: out.name }));
        await shareDataFile(out.file, 'txt').catch(() => undefined);
      } catch (e) {
        setTextMessage(t('data.text.failed', { error: errorText(e) }));
      }
    });

  async function eraseAll() {
    await guarded(async () => {
      try {
        await deleteAllData(db);
        setPending(null);
        setBackupMessage('');
        setRestoreMessage('');
        setDeleteMessage(t('data.delete.done'));
        await reload();
      } catch (e) {
        setDeleteMessage(t('data.delete.failed', { error: errorText(e) }));
      }
    });
  }

  async function askDelete() {
    const counts = await readDataCounts(db);
    Alert.alert(t('data.delete.step1Title'), t('data.delete.step1Body', { versions: counts.versions, covers: counts.coverLetters }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('data.delete.step1Next'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('data.delete.step2Title'), t('data.delete.step2Body'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('data.delete.confirm'), style: 'destructive', onPress: () => void eraseAll() },
          ]),
      },
    ]);
  }

  const last = data?.lastBackup ? dayText(Number(data.lastBackup)) : null;
  return (
    <Screen testID="data-screen">
      <Stack.Screen options={{ title: t('settings.data') }} />
      {isDevVariant ? (
        <ThemedText type="small" themeColor="textSecondary" testID="data-hash">{`DATA hash=${data?.hash ?? ''}`}</ThemedText>
      ) : null}

      <Heading>{t('data.backup.title')}</Heading>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('data.backup.hint')}
        </ThemedText>
        <ThemedText type="smallBold" testID="last-backup">
          {last ? t('data.backup.last', { date: last }) : t('data.backup.never')}
        </ThemedText>
        <Button testID="backup-now" label={t('data.backup.action')} onPress={backUp} disabled={busy} />
        <ThemedText type="small" testID="backup-message">
          {backupMessage}
        </ThemedText>
      </Card>

      <Heading>{t('data.restore.title')}</Heading>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('data.restore.hint')}
        </ThemedText>
        <Button testID="restore-pick" variant="secondary" label={t('data.restore.action')} onPress={pick} disabled={busy} />
        {isDevVariant ? <Button testID="restore-dev-last" variant="secondary" label="Dev: use the last backup made on this phone" onPress={() => pickFile(lastDevBackup)} disabled={busy} /> : null}
        {data?.safety ? (
          <>
            <Button testID="restore-safety" variant="secondary" label={t('data.safety.action')} onPress={() => pickFile(() => safetyCopy()?.file ?? null)} disabled={busy} />
            <ThemedText type="small" themeColor="textSecondary" testID="safety-hint">
              {t('data.safety.hint', { date: data.safety.modified ? dayText(data.safety.modified) : '' })}
            </ThemedText>
          </>
        ) : null}
        <ThemedText type="small" testID="restore-message">
          {restoreMessage}
        </ThemedText>
      </Card>
      {pending ? (
        <Card>
          <View style={styles.box} testID="restore-summary">
            <ThemedText type="smallBold">{t('data.restore.summaryTitle')}</ThemedText>
            <ThemedText testID="restore-counts">{countsText(pending.summary)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('data.restore.date', { date: pending.summary.exportedAt.slice(0, 10) })}
            </ThemedText>
            <ThemedText type="smallBold">{t('data.restore.replaces')}</ThemedText>
            <Button testID="restore-confirm" label={t('data.restore.confirm')} onPress={confirmRestore} disabled={busy} />
            <Button testID="restore-cancel" variant="secondary" label={t('data.restore.cancel')} onPress={() => setPending(null)} disabled={busy} />
          </View>
        </Card>
      ) : null}

      <Heading>{t('data.text.title')}</Heading>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('data.text.hint')}
        </ThemedText>
        <Button testID="text-share-all" variant="secondary" label={t('data.text.action')} onPress={shareText} disabled={busy} />
        <ThemedText type="small" testID="text-message">
          {textMessage}
        </ThemedText>
      </Card>

      <Heading>{t('data.history.title')}</Heading>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('data.history.hint')}
        </ThemedText>
        <Button testID="history-open" variant="secondary" label={t('data.history.open')} onPress={() => router.push('/history' as Href)} />
      </Card>

      <Heading>{t('data.delete.title')}</Heading>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('data.delete.hint')}
        </ThemedText>
        <Button testID="delete-all" variant="secondary" label={t('data.delete.action')} onPress={() => void askDelete()} disabled={busy} />
        <ThemedText type="small" testID="delete-message">
          {deleteMessage}
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
});
