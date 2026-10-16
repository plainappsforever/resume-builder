// Version → Job (SPEC §6, F9, §5.3–5.4): company, role, the pasted ad and its keyword list — counts only, never a score
// (D16) — with found / variant / missing, where each word is in this resume, hidden profile entries that contain a missing
// word ("include"), pin / ignore / own phrases, and "How matching works".
import { useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, Chips, Heading, LinkButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addKeyword, listKeywords, removeKeyword, replaceAutoKeywords, setKeywordState } from '@/db/keywords';
import { loadResolvedVersion } from '@/db/load';
import { includeSuggestion } from '@/db/version-items';
import { getVersion, updateVersion } from '@/db/versions';
import { extractKeywords } from '@/engine/keywords/extract';
import { autoTermsToStore } from '@/engine/keywords/list';
import type { HiddenSuggestion, KeywordStatus, MatchLocation } from '@/engine/keywords/match';
import { normalizeTerm } from '@/engine/keywords/tokenize';
import { buildJobView, filterRows, termSlug, type JobFilter, type JobRow } from '@/engine/keywords/view';
import { useLoad } from '@/hooks/use-load';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

const FILTERS: readonly JobFilter[] = ['all', 'found', 'variant', 'missing'];

export function VersionJob({ versionId, reload }: { versionId: number; reload: () => void }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [filter, setFilter] = useState<JobFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [addNote, setAddNote] = useState<string | null>(null);
  const { data, reload: reloadJob } = useLoad(async (db) => {
    const [version, resolved, stored] = await Promise.all([getVersion(db, versionId), loadResolvedVersion(db, versionId), listKeywords(db, versionId)]);
    return { version, resolved, stored };
  }, versionId);
  if (!data || !data.version) return <View testID="tab-body-job" />;
  const { version, resolved, stored } = data;
  const view = buildJobView(version.jobAd, stored, resolved, version.targetCompany);

  const refresh = () => {
    reloadJob();
    reload();
  };
  const saveAd = async (ad: string) => {
    await updateVersion(db, versionId, { jobAd: ad });
    // D38: the top 25 automatic terms are stored, the user's choices stay (pinned, ignored, own phrases).
    await replaceAutoKeywords(db, versionId, autoTermsToStore(extractKeywords(ad, { company: version.targetCompany })));
    refresh();
  };
  const choose = async (term: string, state: 'normal' | 'pinned' | 'ignored') => {
    await setKeywordState(db, versionId, term, state);
    reloadJob();
  };
  const include = async (s: HiddenSuggestion) => {
    await includeSuggestion(db, versionId, s);
    refresh();
  };
  const addPhrase = async () => {
    const term = normalizeTerm(phrase);
    if (!term) return;
    const added = await addKeyword(db, versionId, term);
    setAddNote(added ? null : t('job.add.exists'));
    if (added) setPhrase('');
    reloadJob();
  };

  const rows = filterRows(showAll ? [...view.shown, ...view.more] : view.shown, filter);
  const filterOptions = FILTERS.map((f) => ({ value: f, label: f === 'all' ? t('job.filter.all') : f === 'variant' ? t('job.filter.variant') : t(`keywords.status.${f}`) }));

  return (
    <View style={styles.box} testID="tab-body-job">
      <Card>
        <AutoTextField testID="job-company" label={t('version.company')} value={version.targetCompany} onSave={(v) => updateVersion(db, versionId, { targetCompany: v.trim() }).then(refresh)} />
        <AutoTextField testID="job-role" label={t('version.role')} value={version.targetRole} onSave={(v) => updateVersion(db, versionId, { targetRole: v.trim() }).then(refresh)} />
        <AutoTextField
          testID="job-ad"
          label={t('job.ad')}
          value={version.jobAd}
          multiline
          autoCapitalize="sentences"
          placeholder={t('version.new.adPlaceholder')}
          onSave={saveAd}
          hint={t('job.adHint')}
        />
      </Card>

      <LinkButton testID="job-how" label={t('job.how')} onPress={() => router.push('/help/matching' as Href)} />

      {view.empty ? (
        <ThemedText testID="job-empty" themeColor="textSecondary">
          {t('keywords.emptyAd')}
        </ThemedText>
      ) : (
        <>
          {view.truncated ? <ThemedText type="small">{t('keywords.truncated')}</ThemedText> : null}
          {view.languageNote ? (
            <ThemedText type="small" themeColor="textSecondary" testID="job-language-note">
              {t('keywords.languageNote', { adLanguage: t(`job.langAd.${view.languageNote.adLanguage}`), versionLanguage: t(`job.langAd.${view.languageNote.versionLanguage}`) })}
            </ThemedText>
          ) : null}
          {view.shown.length === 0 ? (
            <ThemedText themeColor="textSecondary">{t('job.noKeywords')}</ThemedText>
          ) : (
            <>
              <ThemedText type="smallBold" testID="job-summary">
                {t('keywords.summary', { found: view.summary.found, variants: view.summary.variants, missing: view.summary.missing, shown: view.summary.shown })}
              </ThemedText>
              <Chips testID="job-filter" options={filterOptions} value={filter} onChange={setFilter} />
            </>
          )}
          {rows.length === 0 && view.shown.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" testID="job-none-match">
              {t('job.noneMatch')}
            </ThemedText>
          ) : null}
          {rows.map((row) => (
            <KeywordCard key={row.item.term} row={row} onChoose={choose} onInclude={include} onRemove={async () => (await removeKeyword(db, versionId, row.item.term), reloadJob())} />
          ))}
          {view.more.length > 0 ? (
            <Button testID="job-show-all" variant="secondary" label={showAll ? t('job.showLess') : t('keywords.showAll', { count: view.more.length })} onPress={() => setShowAll(!showAll)} />
          ) : null}
        </>
      )}

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('keywords.add')}
        </ThemedText>
        <AddField value={phrase} onChange={(v) => (setPhrase(v), setAddNote(null))} />
        <Button testID="job-add-button" variant="secondary" label={t('job.add.button')} disabled={!normalizeTerm(phrase)} onPress={addPhrase} />
        {addNote ? (
          <ThemedText type="small" testID="job-add-note">
            {addNote}
          </ThemedText>
        ) : null}
      </Card>

      {view.ignored.length > 0 ? (
        <>
          <Heading>{t('keywords.ignoredTitle')}</Heading>
          {view.ignored.map((row) => (
            <View key={row.item.term} style={styles.ignoredRow} testID={`kw-ignored-${termSlug(row.item.term)}`}>
              <ThemedText style={styles.grow}>{row.item.term}</ThemedText>
              <LinkButton testID={`kw-restore-${termSlug(row.item.term)}`} label={t('keywords.restore')} onPress={() => choose(row.item.term, 'normal')} />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function AddField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <TextInput
      testID="job-add-input"
      accessibilityLabel={t('keywords.add')}
      value={value}
      onChangeText={onChange}
      placeholder={t('job.add.placeholder')}
      placeholderTextColor={theme.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
    />
  );
}

function StatusTag({ status, id }: { status: KeywordStatus; id: string }) {
  const theme = useTheme();
  const bg = status === 'found' ? theme.tint : status === 'variant' ? theme.backgroundSelected : theme.danger;
  const color = status === 'variant' ? theme.text : theme.onTint;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text testID={id} style={[styles.tagText, { color }]}>
        {t(`keywords.status.${status}`)}
      </Text>
    </View>
  );
}

function placesOf(locations: readonly MatchLocation[]): string {
  const names = locations.map((l) => (l.kind === 'headline' ? t('job.where.headline') : l.kind === 'summary' ? t('job.where.summary') : l.entryTitle || t('entry.untitled')));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} …` : names.join(', ');
}

function KeywordCard({
  row,
  onChoose,
  onInclude,
  onRemove,
}: {
  row: JobRow;
  onChoose: (term: string, state: 'normal' | 'pinned' | 'ignored') => void;
  onInclude: (s: HiddenSuggestion) => void;
  onRemove: () => void;
}) {
  const { item, match } = row;
  const slug = termSlug(item.term);
  const pinned = item.state === 'pinned';
  const flags = [item.extracted?.inRequirements ? t('keywords.inRequirements') : null, item.extracted?.inDictionary ? t('keywords.inDictionary') : null].filter(Boolean);
  const hiddenText = match.hidden.length === 1 ? t('keywords.hiddenOne') : t('keywords.hiddenMany', { count: match.hidden.length });
  return (
    <Card>
      <View style={styles.head} testID={`kw-${slug}`}>
        <ThemedText type="smallBold" style={styles.grow} testID={`kw-term-${slug}`}>
          {item.term}
        </ThemedText>
        {pinned ? <ThemedText type="small" themeColor="textSecondary">{t('job.pinned')}</ThemedText> : item.source === 'added' ? <ThemedText type="small" themeColor="textSecondary">{t('job.own')}</ThemedText> : null}
        <StatusTag status={match.status} id={`kw-status-${slug}`} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {[t('keywords.inAd', { count: item.tf }), t('keywords.inVersion', { count: match.count })].join(' · ')}
      </ThemedText>
      {match.status === 'variant' && match.variantKind ? <ThemedText type="small">{t(`keywords.variant.${match.variantKind}`)}</ThemedText> : null}
      {match.repeated ? <ThemedText type="small">{t('keywords.repeated', { count: match.count })}</ThemedText> : null}
      {match.locations.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('job.where', { places: placesOf(match.locations) })}
        </ThemedText>
      ) : null}
      {flags.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {flags.join(' · ')}
        </ThemedText>
      ) : null}
      {item.extracted?.snippet ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('job.snippet', { text: item.extracted.snippet })}
        </ThemedText>
      ) : null}
      {match.hidden.length > 0 ? (
        <View style={styles.hidden} testID={`kw-hidden-${slug}`}>
          <ThemedText type="smallBold">{hiddenText}</ThemedText>
          {match.hidden.map((s, i) => (
            <LinkButton
              key={s.kind === 'entry' ? `e${s.entryId}` : `b${s.bulletId}`}
              testID={`kw-include-${slug}-${i}`}
              label={
                s.kind === 'bullet'
                  ? t('job.includeBullet', { text: s.text.length > 70 ? `${s.text.slice(0, 70)} …` : s.text })
                  : t(s.sectionHidden ? 'job.includeEntrySection' : 'job.includeEntry', { title: s.entryTitle || t('entry.untitled') })
              }
              onPress={() => onInclude(s)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <LinkButton testID={`kw-pin-${slug}`} label={pinned ? t('keywords.unpin') : t('keywords.pin')} onPress={() => onChoose(item.term, pinned ? 'normal' : 'pinned')} />
        {item.source === 'added' && !pinned ? (
          <LinkButton testID={`kw-remove-${slug}`} label={t('job.remove')} onPress={onRemove} />
        ) : (
          <LinkButton testID={`kw-ignore-${slug}`} label={t('keywords.ignore')} onPress={() => onChoose(item.term, 'ignored')} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexShrink: 1 },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 12, fontWeight: '700' },
  hidden: { gap: Spacing.one },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three },
  ignoredRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16 },
});
