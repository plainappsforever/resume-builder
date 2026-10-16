// Version → Check (SPEC §5.5, F8, A6): C1–C15 on the document this resume prints, each with its status, its source (L26:
// what was checked and who says so) and, for every finding, a "Fix" that opens the place to change it. C11, C12 and C15
// use the newest PDF export and its read-back (the device result); without an export they say "not checked yet".
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, LinkButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { checkExportContext } from '@/data/history';
import { listExports } from '@/db/exports';
import { loadRenderModel } from '@/db/load';
import { checkCounts, runChecks, type CheckResult, type CheckStatus, type FixTarget } from '@/engine/checks';
import type { RenderModel } from '@/engine/resolve';
import { useLoad } from '@/hooks/use-load';
import { useTheme } from '@/hooks/use-theme';
import { t, type TranslationKey } from '@/i18n';
import { fixAction, type FixAction } from '@/lib/fix-target';

const SHOWN_FINDINGS = 6;

const FIELD_KEY = {
  fullName: 'profile.name',
  headline: 'profile.headline',
  email: 'profile.email',
  phone: 'profile.phone',
  city: 'profile.city',
  region: 'profile.region',
  nationality: 'profile.nationality',
  summary: 'profile.summary',
} as const satisfies Record<string, TranslationKey>;

/** "Where": the entry, section or bullet point a finding is about (a few words, so a repeated message is not anonymous). */
function whereOf(model: RenderModel, target: FixTarget): string | null {
  const entries = model.sections.flatMap((s) => s.entries);
  switch (target.kind) {
    case 'profile':
      return t('check.where.profile', { field: t(FIELD_KEY[target.field]) });
    case 'link':
      return t('check.where.link', { n: target.index + 1 });
    case 'section': {
      const s = model.sections.find((x) => x.id === target.sectionId) ?? model.droppedSections.find((x) => x.id === target.sectionId);
      return s ? t('check.where.section', { name: s.title ?? t(`section.kind.${s.kind}` as TranslationKey) }) : null;
    }
    case 'entry': {
      const e = entries.find((x) => x.id === target.entryId);
      return e ? t('check.where.entry', { name: e.title || e.organization || t('entry.untitled') }) : null;
    }
    case 'bullet': {
      const b = entries.find((x) => x.id === target.entryId)?.bullets.find((x) => x.id === target.bulletId);
      return b ? t('check.where.bullet', { text: b.text.length > 60 ? `${b.text.slice(0, 60)} …` : b.text }) : null;
    }
    default:
      return null;
  }
}

function hintKey(action: FixAction): TranslationKey {
  if (action.kind === 'tab') return `check.fix.${action.tab}` as TranslationKey;
  if (action.href === '/profile') return 'check.fix.profile';
  return action.href.startsWith('/profile/section') ? 'check.fix.section' : 'check.fix.entry';
}

export function VersionCheck({ versionId, onTab }: { versionId: number; onTab: (tab: 'content' | 'design' | 'export') => void }) {
  const router = useRouter();
  const { data } = useLoad(async (db) => {
    const [model, rows] = await Promise.all([loadRenderModel(db, versionId), listExports(db, { versionId })]);
    return { model, ctx: checkExportContext(rows, model) };
  }, versionId);
  if (!data) return <View testID="tab-body-check" />;
  const now = new Date();
  const results = runChecks(data.model, { today: { year: now.getFullYear(), month: now.getMonth() + 1 }, lastExport: data.ctx.lastExport, readback: data.ctx.readback, stale: data.ctx.stale });
  const counts = checkCounts(results);
  const fix = (action: FixAction) => {
    if (action.kind === 'tab') onTab(action.tab);
    else if (action.href === '/profile') router.navigate('/profile'); // a tab of the app: go there, do not stack another copy
    else router.push(action.href as Href);
  };

  return (
    <View style={styles.box} testID="tab-body-check">
      <ThemedText type="small" themeColor="textSecondary">
        {t('check.intro')}
      </ThemedText>
      <ThemedText type="smallBold" testID="check-summary">
        {t('check.summary', { attention: counts.attention, info: counts.info, warning: counts.warning, notChecked: counts.notChecked })}
      </ThemedText>
      <LinkButton testID="check-how" label={t('check.how')} onPress={() => router.push('/help/checks' as Href)} />
      {results.map((r) => (
        <CheckCard key={r.id} result={r} model={data.model} onFix={fix} onExport={() => onTab('export')} />
      ))}
    </View>
  );
}

function StatusTag({ status, id }: { status: CheckStatus; id: string }) {
  const theme = useTheme();
  const bg = status === 'attention' ? theme.danger : status === 'ok' ? theme.tint : theme.backgroundSelected;
  const color = status === 'attention' || status === 'ok' ? theme.onTint : theme.text;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text testID={id} style={[styles.tagText, { color }]}>
        {t(`check.status.${status}`)}
      </Text>
    </View>
  );
}

function CheckCard({ result: r, model, onFix, onExport }: { result: CheckResult; model: RenderModel; onFix: (a: FixAction) => void; onExport: () => void }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const findings = all ? r.findings : r.findings.slice(0, SHOWN_FINDINGS);
  return (
    <Card>
      <View style={styles.head} testID={`check-${r.id}`}>
        <ThemedText type="smallBold" style={styles.grow}>
          {`${r.id} · ${t(r.titleKey)}`}
        </ThemedText>
        <StatusTag status={r.status} id={`check-status-${r.id}`} />
      </View>
      {r.noteKey ? (
        <ThemedText type="small" testID={`check-note-${r.id}`}>
          {t(r.noteKey)}
        </ThemedText>
      ) : null}
      {r.status === 'notChecked' && (r.id === 'C11' || r.id === 'C12' || r.id === 'C15') ? (
        <LinkButton testID={`check-go-export-${r.id}`} label={t('check.goExport')} onPress={onExport} />
      ) : null}
      {findings.map((f, i) => {
        const action = fixAction(f.target, model.versionId);
        const where = whereOf(model, f.target);
        return (
          <View key={`${f.code}-${i}`} style={styles.finding} testID={`check-finding-${r.id}-${i}`}>
            <ThemedText type="small">{t(f.messageKey, f.params)}</ThemedText>
            {where ? (
              <ThemedText type="small" themeColor="textSecondary">
                {where}
              </ThemedText>
            ) : null}
            <View style={styles.fixRow}>
              <LinkButton testID={`check-fix-${r.id}-${i}`} label={t('check.fix')} onPress={() => onFix(action)} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
                {t(hintKey(action))}
              </ThemedText>
            </View>
          </View>
        );
      })}
      {r.findings.length > SHOWN_FINDINGS ? (
        <LinkButton testID={`check-more-${r.id}`} label={all ? t('job.showLess') : t('keywords.showAll', { count: r.findings.length })} onPress={() => setAll(!all)} />
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" testID={`check-source-${r.id}`}>
        {t('check.source.label', { source: t(r.sourceKey) })}
      </ThemedText>
      {r.sourceUrls.map((url, i) => (
        <LinkButton key={url} testID={`check-source-open-${r.id}-${i}`} label={`${t('check.sourceOpen')} (${url.replace(/^https?:\/\//, '').split('/')[0]})`} onPress={() => void Linking.openURL(url)} />
      ))}
      {r.id === 'C15' ? <LinkButton testID="check-readback-help" label={t('help.evidence.readback.title')} onPress={() => router.push('/help/evidence' as Href)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexShrink: 1 },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: '700' },
  finding: { gap: 2, paddingTop: Spacing.one },
  fixRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.two },
});
