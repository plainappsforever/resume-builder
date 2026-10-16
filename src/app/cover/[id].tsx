// Cover letter editor (SPEC §6, F10, A15): Write (recipient, subject, salutation, text, closing, the look of a resume,
// examples) · Preview (the real PDF) · Export (the same verified PDF path as a resume: print → pdf.js read-back → history).
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CoverPreview } from '@/components/cover-preview';
import { HeldShare, HistoryCard, ReadbackCard } from '@/components/export-parts';
import { PdfHarness } from '@/components/pdf-harness';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, Chips, Heading, LinkButton, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { deleteCover, getCover, updateCover, type CoverPatch } from '@/db/covers';
import { listExports } from '@/db/exports';
import { getProfile } from '@/db/profile';
import { listVersions } from '@/db/versions';
import { parseReadback, readbackPassed, type StoredReadback } from '@/data/history';
import type { Lang } from '@/engine/types';
import { useLoad } from '@/hooks/use-load';
import { t } from '@/i18n';
import { coverExampleFields, coverExamples, coverPlainText } from '@/lib/cover-input';
import { coverDocument, exportCoverPdf, printFile, removeExportFiles, shareFile, type PdfExport } from '@/lib/export';
import type { HarnessClient } from '@/readback/bridge';

const TABS = ['write', 'preview', 'export'] as const;
type Tab = (typeof TABS)[number];

const PLACEHOLDER = /\[[^\]]*\]|\{(?:role|company|contact|name)\}/;

export default function CoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const coverId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('write');
  const [edits, setEdits] = useState(0); // bumped on every save: the preview is made again when it is opened
  const { data, reload } = useLoad(async (db) => {
    const cover = await getCover(db, coverId);
    if (!cover) return null;
    const [profile, versions, rows] = await Promise.all([getProfile(db), listVersions(db), listExports(db, { coverLetterId: coverId })]);
    return { cover, profile, versions, rows };
  }, coverId);

  if (data === undefined) return <Screen testID="cover-screen">{null}</Screen>;
  if (data === null) {
    return (
      <Screen testID="cover-screen">
        <ThemedText themeColor="textSecondary">{t('cover.gone')}</ThemedText>
      </Screen>
    );
  }
  const { cover, profile, versions, rows } = data;
  const save = async (patch: CoverPatch) => {
    await updateCover(db, coverId, patch);
    setEdits((n) => n + 1);
    reload();
  };
  const field = (key: 'recipientCompany' | 'contactPerson' | 'address' | 'subject' | 'salutation' | 'body' | 'closing' | 'signatureName') => (v: string) => save({ [key]: v });

  const linked = versions.find((v) => v.id === cover.versionId) ?? null;
  const designOptions = [{ value: 'none', label: t('cover.design.none') }, ...versions.map((v) => ({ value: String(v.id), label: v.name }))];

  function applyExample(index: number) {
    const example = coverExamples(cover.language)[index];
    const fields = coverExampleFields(
      example,
      { role: linked?.targetRole ?? '', company: cover.recipientCompany, contact: cover.contactPerson, name: cover.signatureName || profile.fullName },
      cover.language
    );
    void save({ ...fields, isExample: true });
  }
  function chooseExample(index: number) {
    if (cover.body.trim() === '') return applyExample(index);
    Alert.alert(t('cover.example.title'), t('cover.example.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cover.example.confirm'), onPress: () => applyExample(index) },
    ]);
  }
  function confirmDelete() {
    Alert.alert(t('cover.delete.title'), t('cover.delete.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          removeExportFiles(await deleteCover(db, coverId)); // only inside <document>/exports/ (D59)
          router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: cover.recipientCompany || t('cover.title') }} />
      <Screen testID="cover-screen">
        <Segmented testID="cover-tabs" value={tab} onChange={setTab} options={TABS.map((v) => ({ value: v, label: t(`cover.tab.${v}`) }))} />
        {tab === 'write' ? (
          <View style={styles.box} testID="cover-body-write">
            <Card>
              <AutoTextField testID="cover-company" label={t('cover.company')} value={cover.recipientCompany} onSave={field('recipientCompany')} />
              <AutoTextField testID="cover-contact" label={t('cover.contact')} value={cover.contactPerson} onSave={field('contactPerson')} />
              <AutoTextField testID="cover-address" label={t('cover.address')} value={cover.address} multiline onSave={field('address')} />
              <AutoTextField
                testID="cover-date"
                label={t('cover.date')}
                value={cover.letterDate ?? ''}
                hint={t('cover.date.hint')}
                autoCapitalize="none"
                onSave={(v) => save({ letterDate: v.trim() === '' ? null : v.trim() })}
              />
            </Card>
            <Card>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('version.language')}
              </ThemedText>
              <Segmented
                testID="cover-language"
                value={cover.language}
                onChange={(language: Lang) => save({ language })}
                options={[
                  { value: 'en', label: t('lang.en') },
                  { value: 'de', label: t('lang.de') },
                ]}
              />
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('cover.design')}
              </ThemedText>
              <Chips testID="cover-design" options={designOptions} value={cover.versionId === null ? 'none' : String(cover.versionId)} onChange={(v) => save({ versionId: v === 'none' ? null : Number(v) })} />
              <ThemedText type="small" themeColor="textSecondary">
                {t('cover.design.hint')}
              </ThemedText>
            </Card>
            <Card>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('cover.example')}
              </ThemedText>
              {coverExamples(cover.language).map((ex, i) => (
                <Button key={ex.id} testID={`cover-example-${ex.id}`} variant="secondary" label={ex.title} onPress={() => chooseExample(i)} />
              ))}
              <ThemedText type="small" themeColor="textSecondary">
                {t('cover.example.hint')}
              </ThemedText>
            </Card>
            <Card>
              <AutoTextField testID="cover-subject" label={t('cover.subject')} value={cover.subject} onSave={field('subject')} />
              <AutoTextField testID="cover-salutation" label={t('cover.salutation')} value={cover.salutation} onSave={field('salutation')} />
              <AutoTextField testID="cover-body" label={t('cover.body')} value={cover.body} multiline onSave={field('body')} style={styles.body} />
              <AutoTextField testID="cover-closing" label={t('cover.closing')} value={cover.closing} onSave={field('closing')} />
              <AutoTextField testID="cover-signature" label={t('cover.signature')} value={cover.signatureName} hint={t('cover.signature.hint')} onSave={field('signatureName')} />
              {PLACEHOLDER.test([cover.subject, cover.salutation, cover.body, cover.closing].join('\n')) ? (
                <ThemedText type="smallBold" testID="cover-placeholders">
                  {t('cover.placeholders')}
                </ThemedText>
              ) : null}
            </Card>
            <LinkButton testID="cover-delete" danger label={t('cover.delete')} onPress={confirmDelete} />
          </View>
        ) : tab === 'preview' ? (
          cover.body.trim() === '' && cover.subject.trim() === '' ? (
            <ThemedText themeColor="textSecondary" testID="cover-preview-empty">
              {t('cover.preview.empty')}
            </ThemedText>
          ) : (
            <CoverPreview coverId={coverId} version={edits} />
          )
        ) : (
          <CoverExport coverId={coverId} blocked={profile.fullName.trim() === ''} rows={rows} reload={reload} />
        )}
      </Screen>
    </>
  );
}

function CoverExport({ coverId, blocked, rows, reload }: { coverId: number; blocked: boolean; rows: Awaited<ReturnType<typeof listExports>>; reload: () => void }) {
  const db = useSQLiteContext();
  const harness = useRef<HarnessClient | null>(null);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [last, setLast] = useState<PdfExport | null>(null);
  const [showText, setShowText] = useState(false);
  const [devLine, setDevLine] = useState<string | null>(null);
  const [held, setHeld] = useState<PdfExport | null>(null);

  async function make(): Promise<PdfExport | null> {
    setWorking(true);
    setNote(null);
    try {
      const result = await exportCoverPdf(db, coverId, () => harness.current);
      setLast(result);
      reload();
      return result;
    } catch (e) {
      setNote(t('export.failed', { reason: e instanceof Error ? e.message : String(e) }));
      return null;
    } finally {
      setWorking(false);
    }
  }
  const newest = rows.find((r) => r.kind === 'cover_pdf');
  const stored: StoredReadback | null = last ? last.readback : newest ? parseReadback(newest.readbackJson) : null;

  return (
    <View style={styles.box} testID="cover-body-export">
      <PdfHarness ref={harness} />
      {blocked ? (
        <ThemedText testID="cover-blocked" type="smallBold">
          {t('check.exportBlocked')}
        </ThemedText>
      ) : (
        <>
          <Button
            testID="cover-share"
            label={t('export.share')}
            disabled={working}
            onPress={async () => {
              setHeld(null);
              const r = await make();
              if (!r) return;
              // D92: a read-back that did not pass is shown first; the user decides ("Share anyway").
              if (readbackPassed(r.readback)) await shareFile(r.uri, 'pdf', r.fileName).catch(() => undefined);
              else setHeld(r);
            }}
          />
          <Button
            testID="cover-print"
            variant="secondary"
            label={t('export.print')}
            disabled={working}
            onPress={async () => {
              const r = await make();
              if (r) await printFile(r.uri).catch((e: unknown) => setNote(t('export.failed', { reason: e instanceof Error ? e.message : String(e) })));
            }}
          />
          <Button
            testID="cover-copy-text"
            variant="secondary"
            label={t('export.copyText')}
            disabled={working}
            onPress={async () => {
              const { input } = await coverDocument(db, coverId);
              await Clipboard.setStringAsync(coverPlainText(input));
              setNote(t('export.copied'));
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
        <ThemedText testID="cover-note" type="small">
          {note}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {t('cover.readback')}
      </ThemedText>
      {held ? (
        <HeldShare
          held={held}
          testPrefix="cover"
          onShare={() => {
            setHeld(null);
            void shareFile(held.uri, 'pdf', held.fileName).catch(() => undefined);
          }}
        />
      ) : null}
      {stored ? <ReadbackCard result={stored} showText={showText} onToggle={() => setShowText(!showText)} last={last} /> : null}
      <Heading>{t('export.history')}</Heading>
      {__DEV__ && devLine ? (
        <ThemedText type="small" themeColor="textSecondary" testID="reshare-debug">
          {devLine}
        </ThemedText>
      ) : null}
      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('export.history.empty')}
        </ThemedText>
      ) : (
        rows.map((row, i) => <HistoryCard key={row.id} row={row} index={i} onNote={setNote} onDevLine={setDevLine} reader={() => harness.current} onChanged={reload} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  body: { minHeight: 220 },
});
