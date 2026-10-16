// Version → Export (SPEC §6, F6, F7, A9): Share PDF (two taps from the resume), Print, plain text, the read-back of
// the last PDF in plain words (what was read, in what order — L26), and the history with "Share again" of the
// identical file. The read-back runs in a tiny hidden harness page on this screen.
import { useSQLiteContext } from '@/db/provider';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { PdfHarness } from '@/components/pdf-harness';
import { ThemedText } from '@/components/themed-text';
import { HeldShare, HistoryCard, ReadbackCard } from '@/components/export-parts';
import { Heading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { parseReadback, readbackPassed, type StoredReadback } from '@/data/history';
import { listExports } from '@/db/exports';
import { loadRenderModel } from '@/db/load';
import { exportBlocked } from '@/engine/checks';
import { useLoad } from '@/hooks/use-load';
import { t } from '@/i18n';
import { copyPlainText, exportPlainText, exportResumePdf, printFile, shareFile, type PdfExport } from '@/lib/export';
import type { HarnessClient } from '@/readback/bridge';

export function VersionExport({ versionId, reload, onDesign }: { versionId: number; reload: () => void; onDesign: () => void }) {
  const db = useSQLiteContext();
  const harness = useRef<HarnessClient | null>(null);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [last, setLast] = useState<PdfExport | null>(null);
  const [showText, setShowText] = useState(false);
  const [reshared, setReshared] = useState<string | null>(null);
  const [held, setHeld] = useState<PdfExport | null>(null);
  const { data, reload: reloadHistory } = useLoad(async (db) => {
    const [model, rows] = await Promise.all([loadRenderModel(db, versionId), listExports(db, { versionId })]);
    return { blocked: exportBlocked(model), rows };
  }, versionId);

  if (!data) return <View testID="tab-body-export" />;
  const refresh = () => {
    reloadHistory();
    reload();
  };

  async function makePdf(): Promise<PdfExport | null> {
    setWorking(true);
    setNote(null);
    try {
      const result = await exportResumePdf(db, versionId, () => harness.current);
      setLast(result);
      refresh();
      return result;
    } catch (e) {
      setNote(t('export.failed', { reason: e instanceof Error ? e.message : String(e) }));
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function share() {
    setHeld(null);
    const r = await makePdf();
    if (!r) return;
    // D92: a read-back that did not pass is shown first; the user decides ("Share anyway").
    if (readbackPassed(r.readback)) await shareFile(r.uri, 'pdf', r.fileName).catch(() => undefined);
    else setHeld(r);
  }

  async function print() {
    const r = await makePdf();
    if (r) await printFile(r.uri).catch((e: unknown) => setNote(t('export.failed', { reason: e instanceof Error ? e.message : String(e) })));
  }

  // The newest PDF's read-back: this session's export, else the newest PDF row of the history.
  const newestPdf = data.rows.find((r) => r.kind === 'resume_pdf');
  const stored: StoredReadback | null = last ? last.readback : newestPdf ? parseReadback(newestPdf.readbackJson) : null;

  return (
    <View style={styles.box} testID="tab-body-export">
      <PdfHarness ref={harness} />
      {data.blocked ? (
        <ThemedText testID="export-blocked" type="smallBold">
          {t('check.exportBlocked')}
        </ThemedText>
      ) : (
        <>
          <Button testID="export-share" label={t('export.share')} disabled={working} onPress={share} />
          <Button testID="export-print" variant="secondary" label={t('export.print')} disabled={working} onPress={print} />
          <Button
            testID="export-copy-text"
            variant="secondary"
            label={t('export.copyText')}
            disabled={working}
            onPress={async () => {
              await copyPlainText(db, versionId);
              setNote(t('export.copied'));
              refresh();
            }}
          />
          <Button
            testID="export-share-text"
            variant="secondary"
            label={t('export.shareText')}
            disabled={working}
            onPress={async () => {
              const r = await exportPlainText(db, versionId, true);
              refresh();
              if (r.uri) await shareFile(r.uri, 'txt', r.fileName).catch(() => undefined);
            }}
          />
        </>
      )}
      {working ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <ThemedText type="small">{t('export.working')}</ThemedText>
        </View>
      ) : null}
      {note ? (
        <ThemedText testID="export-note" type="small">
          {note}
        </ThemedText>
      ) : null}

      {held ? (
        <HeldShare
          held={held}
          testPrefix="export"
          onShare={() => {
            setHeld(null);
            void shareFile(held.uri, 'pdf', held.fileName).catch(() => undefined);
          }}
          onDesign={() => {
            setHeld(null);
            onDesign();
          }}
        />
      ) : null}
      {stored ? <ReadbackCard result={stored} showText={showText} onToggle={() => setShowText(!showText)} last={last} /> : null}

      <Heading>{t('export.history')}</Heading>
      {__DEV__ && reshared ? (
        <ThemedText type="small" themeColor="textSecondary" testID="reshare-debug">
          {reshared}
        </ThemedText>
      ) : null}
      {data.rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('export.history.empty')}
        </ThemedText>
      ) : (
        data.rows.map((row, i) => (
          <HistoryCard key={row.id} row={row} index={i} onNote={setNote} onDevLine={setReshared} reader={() => harness.current} onChanged={refresh} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
