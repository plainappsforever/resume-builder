// Pieces shared by the resume Export tab, the cover letter Export tab and the export history (P5, moved here in P6):
// the read-back result in plain words, and one history row with "Share again" of the identical file.
import { File } from 'expo-file-system';
import { useSQLiteContext } from '@/db/provider';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/button';
import { Card, Heading, LinkButton } from '@/components/ui';
import { historyItem, type HistoryRecord, type StoredReadback } from '@/data/history';
import { MAX_FILE_BYTES } from '@/engine/checks';
import { getUiLanguage, t } from '@/i18n';
import { historyFile, shareFile, type PdfExport } from '@/lib/export';
import type { HarnessClient } from '@/readback/bridge';
import { readbackView, sizeMsg, type Msg } from '@/readback/summary';

export const tr = (m: Msg) => t(m.key, m.params);

/** "3 Oct 2026, 14:05" in the UI language. */
export function whenText(ms: number): string {
  return new Date(ms).toLocaleString(getUiLanguage() === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function pagesText(pages: number | null): string | null {
  return pages ? (pages === 1 ? t('readback.pages.one') : t('readback.pages.other', { count: pages })) : null;
}

/** One export: file name, when · pages · size · read-back verdict, "Share again" (the stored file; re-rendered when it is gone). */
export function HistoryCard({
  row,
  index,
  onNote,
  onDevLine,
  onChanged,
  reader,
  children,
}: {
  row: HistoryRecord;
  index: number;
  onNote: (text: string) => void;
  onDevLine?: (text: string) => void;
  /** The row changed (a re-made file's new read-back, D96). */
  onChanged?: () => void;
  /** The screen's read-back page: a re-made PDF is read back before it is shared (D96). */
  reader?: () => HarnessClient | null;
  children?: ReactNode;
}) {
  const db = useSQLiteContext();
  const item = historyItem(row);
  const size = item.bytes !== null && item.kind !== 'plain_text' ? tr(sizeMsg(item.bytes)) : null;
  return (
    <Card>
      <ThemedText type="smallBold">{item.fileName}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" testID={`history-row-${index}`}>
        {[whenText(item.createdAt), pagesText(item.pages), size, t(`export.history.${item.readback}`)].filter(Boolean).join(' · ')}
      </ThemedText>
      {item.remadeAt !== null ? (
        <ThemedText type="small" themeColor="textSecondary" testID={`history-remade-${index}`}>
          {t('export.history.remade', { when: whenText(item.remadeAt) })}
        </ThemedText>
      ) : null}
      {children}
      {item.reshare !== 'none' ? (
        <LinkButton
          testID={`history-reshare-${index}`}
          label={t('export.history.reshare')}
          onPress={async () => {
            const f = await historyFile(db, row.id, reader);
            if (!f) return onNote(t('export.history.missing'));
            if (f.rerendered) {
              onNote(t('export.history.rerendered'));
              onChanged?.();
            }
            if (__DEV__) onDevLine?.(`RESHARE ${item.fileName} bytes=${new File(f.uri).size} stored=${row.bytes} rerendered=${f.rerendered}`);
            await shareFile(f.uri, f.kind, item.fileName).catch(() => undefined);
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * D92 (REVIEW_V1 #4): a PDF whose read-back did not pass is NOT handed to the share sheet in the same tap. This card says
 * so above the result; "Share anyway" sends the file, "Change template" (resumes) goes to the Design tab.
 */
export function HeldShare({ held, onShare, onDesign, testPrefix }: { held: PdfExport; onShare: () => void; onDesign?: () => void; testPrefix: string }) {
  return (
    <Card>
      <ThemedText type="smallBold" testID={`${testPrefix}-held`}>
        {t('export.held')}
      </ThemedText>
      <Button testID={`${testPrefix}-share-anyway`} variant="secondary" label={t('export.shareAnyway')} onPress={onShare} />
      {onDesign ? <LinkButton testID={`${testPrefix}-change-design`} label={t('export.changeDesign')} onPress={onDesign} /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {held.fileName}
      </ThemedText>
    </Card>
  );
}

export function ReadbackCard({ result, showText, onToggle, last }: { result: StoredReadback; showText: boolean; onToggle: () => void; last: PdfExport | null }) {
  const view = readbackView('unavailable' in result ? { unavailable: true } : result, getUiLanguage());
  const r = 'unavailable' in result ? null : result;
  return (
    <Card>
      <Heading>{t('export.lastResult')}</Heading>
      <ThemedText testID="readback-headline" type="smallBold">
        {tr(view.headline)}
      </ThemedText>
      {view.details.map((d, i) => (
        <ThemedText key={`d${i}`} type="small" testID={`readback-detail-${i}`}>
          {tr(d)}
        </ThemedText>
      ))}
      {view.hints.map((h, i) => (
        <ThemedText key={`h${i}`} type="small" themeColor="textSecondary">
          {tr(h)}
        </ThemedText>
      ))}
      {r && r.bytes > MAX_FILE_BYTES ? (
        <ThemedText type="small" testID="export-size-warning">
          {t('check.C11.fileSize', { size: (r.bytes / 1_000_000).toFixed(1) })}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {tr(view.note)}
      </ThemedText>
      {last ? (
        <ThemedText type="small" themeColor="textSecondary" testID="export-timing">
          {t('export.timing', { ms: last.pdf.ms, readMs: last.readbackMs })}
        </ThemedText>
      ) : null}
      {__DEV__ && last ? (
        <ThemedText type="small" themeColor="textSecondary" testID="export-debug">{`EXPORT pages=${r?.pages ?? last.pdf.pages} bytes=${last.pdf.bytes} printMs=${last.pdf.ms} readbackMs=${last.readbackMs} totalMs=${last.totalMs} pass=${r?.pass ?? 'unavailable'}`}</ThemedText>
      ) : null}
      {r ? (
        <>
          <LinkButton testID="readback-show-text" label={showText ? t('export.hideText') : t('export.showText')} onPress={onToggle} />
          {showText ? (
            <View testID="readback-text">
              <ThemedText type="smallBold">{t('readback.whatWasRead')}</ThemedText>
              {r.text.map((page, i) => (
                <ThemedText key={i} type="small" style={styles.mono}>
                  {page}
                </ThemedText>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}


const styles = StyleSheet.create({
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12 },
});
