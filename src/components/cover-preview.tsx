// Cover letter → Preview: the REAL PDF of the letter (the file an export makes), drawn page by page by pdf.js in the harness
// page — the same exact preview as the resume's (D74).
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext } from '@/db/provider';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PdfHarness } from '@/components/pdf-harness';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { coverDocument } from '@/lib/export';
import { printPdf } from '@/lib/pdf';
import type { HarnessClient } from '@/readback/bridge';
import { sizeMsg } from '@/readback/summary';
import type { PageSetup } from '@/render/model';

const GAP = 8; // px between pages in the harness page

type Shown = { pages: number; bytes: number; page: PageSetup };

export function CoverPreview({ coverId, version }: { coverId: number; version: number }) {
  const db = useSQLiteContext();
  const harness = useRef<HarnessClient | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const { doc } = await coverDocument(db, coverId);
        const pdf = await printPdf(doc, new File(Paths.cache, 'preview', `c${coverId}.pdf`));
        for (let i = 0; i < 100 && !harness.current; i++) await new Promise((r) => setTimeout(r, 50));
        if (!harness.current) throw new Error('reader not available');
        await harness.current.ready;
        const pages = await harness.current.show(await new File(pdf.uri).base64());
        if (live) setShown({ pages, bytes: pdf.bytes, page: doc.page });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (live) setBusy(false);
      }
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `version` changes when the letter was edited (the parent bumps it), so the preview is made again.
  }, [db, coverId, version]);

  const pageHeight = shown && width ? (width * shown.page.heightPt) / shown.page.widthPt : 0;
  const webHeight = shown ? Math.ceil(shown.pages * (pageHeight + GAP)) : 1;
  const size = shown ? sizeMsg(shown.bytes) : null;
  return (
    <View style={styles.box} testID="cover-body-preview" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            {t('preview.making')}
          </ThemedText>
        </View>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="textSecondary" testID="cover-preview-error">
          {t('preview.failed', { reason: error })}
        </ThemedText>
      ) : null}
      {shown && size ? (
        <ThemedText type="smallBold" testID="cover-preview-info">
          {t('preview.info', { pages: shown.pages === 1 ? t('readback.pages.one') : t('readback.pages.other', { count: shown.pages }), size: t(size.key, size.params) })}
        </ThemedText>
      ) : null}
      <PdfHarness ref={harness} visible testID="cover-preview-pages" style={{ width: '100%', height: webHeight }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
