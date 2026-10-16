// Version → Preview (SPEC §6, F5, §5.8): the REAL PDF of this resume (expo-print, the same file an export makes),
// drawn page by page by pdf.js in the harness page — so page breaks, page count and fonts are exactly the PDF's.
// "Fit to one page" runs the pure plan (src/engine/fit.ts) with expo-print as renderer and saves only on "Keep".
import { File, Paths } from 'expo-file-system';
import { useSQLiteContext } from '@/db/provider';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { PdfHarness } from '@/components/pdf-harness';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadRenderModel } from '@/db/load';
import { updateVersion } from '@/db/versions';
import { linesTooLong, runFit, type FitResult, type FitStepKind } from '@/engine/fit';
import type { RenderModel } from '@/engine/resolve';
import type { VersionStyle } from '@/engine/style';
import { t } from '@/i18n';
import { renderModel } from '@/lib/export';
import { overflowPt, printPdf } from '@/lib/pdf';
import type { HarnessClient } from '@/readback/bridge';
import { sizeMsg } from '@/readback/summary';
import { TEMPLATES } from '@/render/html/index';
import { docStyle, type PageSetup } from '@/render/model';

type Shown = { pages: number; bytes: number; page: PageSetup; printMs: number };
type Fit = { running: true } | { running: false; result: FitResult; model: RenderModel };

const GAP = 8; // px between pages in the harness page (#pages canvas margin)

export function VersionPreview({ versionId, reload }: { versionId: number; reload: () => void }) {
  const db = useSQLiteContext();
  const harness = useRef<HarnessClient | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState<Fit | null>(null);

  async function client(): Promise<HarnessClient> {
    for (let i = 0; i < 100 && !harness.current; i++) await new Promise((r) => setTimeout(r, 50));
    if (!harness.current) throw new Error('reader not available');
    await harness.current.ready;
    return harness.current;
  }

  /** Prints the model (or the model with another style) and draws its pages. */
  async function show(style?: VersionStyle) {
    setBusy(true);
    setError(null);
    try {
      const base = await loadRenderModel(db, versionId);
      const model = style ? { ...base, style } : base;
      const doc = await renderModel(model);
      const pdf = await printPdf(doc, new File(Paths.cache, 'preview', `v${versionId}.pdf`));
      const pages = await (await client()).show(await new File(pdf.uri).base64());
      setShown({ pages, bytes: pdf.bytes, page: doc.page, printMs: pdf.ms });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => show(), 0); // first render shows "Making the PDF…" (busy starts true)
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  async function fitToOnePage() {
    if (!shown) return;
    setFit({ running: true });
    try {
      const model = await loadRenderModel(db, versionId);
      const base = TEMPLATES[model.template].baseSizePt;
      const reader = await client();
      const result = await runFit(model.style, base, shown.pages, async (style) => {
        const doc = await renderModel({ ...model, style });
        const pdf = await printPdf(doc, new File(Paths.cache, 'preview', `v${versionId}-fit.pdf`));
        const { raw } = await reader.extract(await new File(pdf.uri).base64());
        return { pages: raw.numPages, overflowPt: overflowPt(raw, doc.page) };
      });
      setFit({ running: false, result, model });
      if (result.renders > 0) await show(result.style);
    } catch (e) {
      setFit(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function keep() {
    if (!fit || fit.running) return;
    await updateVersion(db, versionId, { styleJson: JSON.stringify(fit.result.style) });
    setFit(null);
    reload();
    await show();
  }

  async function cancel() {
    setFit(null);
    await show();
  }

  const pageHeight = shown && width ? (width * shown.page.heightPt) / shown.page.widthPt : 0;
  const webHeight = shown ? Math.ceil(shown.pages * (pageHeight + GAP)) : 1;
  const sizeText = shown ? t(sizeMsg(shown.bytes).key, sizeMsg(shown.bytes).params) : '';

  return (
    <View style={styles.box} testID="tab-body-preview" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            {t('preview.making')}
          </ThemedText>
        </View>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="textSecondary" testID="preview-error">
          {t('preview.failed', { reason: error })}
        </ThemedText>
      ) : null}
      {shown ? (
        <ThemedText type="smallBold" testID="preview-info">
          {t('preview.info', { pages: shown.pages === 1 ? t('readback.pages.one') : t('readback.pages.other', { count: shown.pages }), size: sizeText })}
        </ThemedText>
      ) : null}
      {__DEV__ && shown ? <ThemedText testID="preview-debug" type="small" themeColor="textSecondary">{`PREVIEW pages=${shown.pages} bytes=${shown.bytes} printMs=${shown.printMs}`}</ThemedText> : null}

      {fit && !fit.running ? <FitCard fit={fit} onKeep={keep} onCancel={cancel} /> : null}
      {fit?.running ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <ThemedText type="small">{t('preview.fit.running')}</ThemedText>
        </View>
      ) : null}
      {shown && shown.pages > 1 && !fit ? <Button testID="fit-one-page" variant="secondary" label={t('preview.fit')} onPress={fitToOnePage} /> : null}

      <PdfHarness ref={harness} visible testID="preview-pages" style={{ width: '100%', height: webHeight }} />
    </View>
  );
}

function FitCard({ fit, onKeep, onCancel }: { fit: Extract<Fit, { running: false }>; onKeep: () => void; onCancel: () => void }) {
  const { result, model } = fit;
  const style = docStyle(model.template, result.style, TEMPLATES[model.template]);
  const label = (k: FitStepKind) => (k === 'size' ? t('preview.fit.change.size', { size: style.sizePt }) : t(`preview.fit.change.${k}`));
  const changes = [...new Set(result.tried)].map(label).join(', ');
  return (
    <Card>
      <ThemedText testID="fit-result" type="small">
        {result.fitted
          ? t('preview.fit.fitted', { changes })
          : t('preview.fit.notFitted', { pages: result.pages, lines: linesTooLong(result.overflowPt, style.sizePt, style.lineHeight), changes })}
      </ThemedText>
      {result.renders > 0 ? (
        <View style={styles.actions}>
          <Button testID="fit-keep" label={t('preview.fit.keep')} onPress={onKeep} />
          <Button testID="fit-cancel" variant="secondary" label={t('preview.fit.cancel')} onPress={onCancel} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
});
