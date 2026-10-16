// Entry editor (SPEC §6): fields per section kind, month/year fields, "current" toggle, bullets. Autosave: every valid
// change is written at once; an invalid date shows its message and is not written.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BulletEditor } from '@/components/bullet-editor';
import { fromMonthYear, MonthYearField, toMonthYear, type MonthYear } from '@/components/month-year-field';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, IncludeSwitch, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getEntry, updateEntry, type EntryInput } from '@/db/entries';
import { listSections } from '@/db/sections';
import { validateDateRange, type DateError } from '@/engine/dates';
import { useLoad } from '@/hooks/use-load';
import { useMasterEdit } from '@/hooks/use-master-edit';
import { t } from '@/i18n';
import { CEFR_LEVELS, KIND_SPECS } from '@/lib/entry-kinds';

const NO_MONTH_YEAR: MonthYear = { month: '', year: '' };

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const { data } = useLoad(async (db) => {
    const entry = await getEntry(db, entryId);
    const sections = await listSections(db);
    return { entry, section: sections.find((s) => s.id === entry?.sectionId) ?? null };
  }, entryId);
  if (!data) return <Screen testID="entry-screen">{null}</Screen>;
  if (!data.entry || !data.section) {
    return (
      <Screen testID="entry-screen">
        <ThemedText themeColor="textSecondary">{t('entry.gone')}</ThemedText>
      </Screen>
    );
  }
  return <Editor key={entryId} entry={data.entry} kind={data.section.kind} />;
}

function Editor({ entry, kind }: { entry: NonNullable<Awaited<ReturnType<typeof getEntry>>>; kind: keyof typeof KIND_SPECS }) {
  const edit = useMasterEdit();
  const spec = KIND_SPECS[kind];
  const [start, setStart] = useState<MonthYear>(toMonthYear(entry.startDate));
  const [end, setEnd] = useState<MonthYear>(toMonthYear(entry.endDate));
  const [current, setCurrent] = useState(entry.isCurrent);
  const [title, setTitle] = useState(entry.title);
  const [level, setLevel] = useState(entry.extra.level ?? '');
  const extraRef = useRef(entry.extra);
  const lastDates = useRef(JSON.stringify([entry.startDate, entry.endDate, entry.isCurrent]));

  const save = (patch: EntryInput) => edit((db) => updateEntry(db, entry.id, patch));
  const saveExtra = (key: string, value: string) => {
    const extra = { ...extraRef.current };
    if (value.trim() === '') delete extra[key];
    else extra[key] = value;
    extraRef.current = extra; // the editor owns the latest copy: the next extra write starts from it
    return save({ extra });
  };

  // Validate the typed dates; write only when the whole range is valid (autosave never stores half a date).
  const s = fromMonthYear(start);
  const e = fromMonthYear(spec.singleDate ? NO_MONTH_YEAR : end);
  const range = validateDateRange({ startDate: s.value, endDate: current ? null : e.value, isCurrent: current }, new Date().getFullYear());
  const errors = { start: range.start, end: range.end, startFormat: s.invalid, endFormat: e.invalid };
  const invalid = s.invalid || e.invalid || !!range.start || !!range.end;

  useEffect(() => {
    if (invalid) return;
    const next = { startDate: s.value, endDate: current ? null : e.value, isCurrent: current };
    const key = JSON.stringify([next.startDate, next.endDate, next.isCurrent]);
    if (key === lastDates.current) return; // nothing typed yet: opening an entry must not count as an edit
    lastDates.current = key;
    void save(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, current, invalid]);

  const dateMessage = (code?: DateError, format?: boolean) =>
    format ? t('date.error.format') : code ? t(code, { maxYear: new Date().getFullYear() + 6 }) : null;

  return (
    <>
      <Stack.Screen options={{ title: title || t('entry.untitled') }} />
      <Screen testID="entry-screen">
        <Card>
          <AutoTextField
            testID="entry-title"
            label={t(spec.titleLabel)}
            value={entry.title}
            onSave={(v) => {
              setTitle(v);
              return save({ title: v });
            }}
          />
          {spec.fields.includes('organization') ? (
            <AutoTextField testID="entry-organization" label={t(spec.organizationLabel)} value={entry.organization} onSave={(v) => save({ organization: v })} />
          ) : null}
          {spec.fields.includes('location') ? (
            <AutoTextField testID="entry-location" label={t('field.location')} value={entry.location} onSave={(v) => save({ location: v })} />
          ) : null}
          {spec.fields.includes('url') ? (
            <AutoTextField testID="entry-url" label={t('field.url')} value={entry.url} onSave={(v) => save({ url: v })} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
          ) : null}
          {spec.fields.includes('level') ? (
            <View style={styles.level}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('field.level')}
              </ThemedText>
              <Segmented
                testID="entry-level"
                value={(CEFR_LEVELS as readonly string[]).includes(level) ? level : ''}
                onChange={(v) => {
                  setLevel(v);
                  void saveExtra('level', v);
                }}
                options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))}
              />
              <AutoTextField testID="entry-level-text" label={t('field.levelText')} value={level}
                onSave={(v) => {
                  setLevel(v);
                  return saveExtra('level', v);
                }} hint={t('field.levelText.hint')} />
            </View>
          ) : null}
        </Card>

        {spec.fields.includes('dates') ? (
          <Card>
            <MonthYearField
              testID="entry-start"
              label={spec.singleDate ? t('field.date') : t('field.start')}
              value={start}
              onChange={setStart}
              error={dateMessage(errors.start, errors.startFormat)}
            />
            {!spec.singleDate ? (
              <>
                <View style={styles.switchRow}>
                  <ThemedText style={styles.flex}>{t('field.current')}</ThemedText>
                  <IncludeSwitch testID="entry-current" label={t('field.current')} value={current} onChange={setCurrent} />
                </View>
                <MonthYearField testID="entry-end" label={t('field.end')} value={end} onChange={setEnd} disabled={current} error={dateMessage(errors.end, errors.endFormat)} />
              </>
            ) : null}
          </Card>
        ) : null}

        {spec.fields.includes('grade') ? (
          <Card>
            <AutoTextField testID="entry-grade" label={t('field.grade')} value={entry.extra.grade ?? ''} onSave={(v) => saveExtra('grade', v)} />
          </Card>
        ) : null}
        {spec.fields.includes('credentialId') ? (
          <Card>
            <AutoTextField testID="entry-credential" label={t('field.credentialId')} value={entry.extra.credentialId ?? ''} onSave={(v) => saveExtra('credentialId', v)} />
          </Card>
        ) : null}
        {spec.fields.includes('description') ? (
          <Card>
            <AutoTextField testID="entry-description" label={t('field.description')} value={entry.description} multiline onSave={(v) => save({ description: v })} />
          </Card>
        ) : null}

        <BulletEditor entryId={entry.id} title={spec.bulletsLabel} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  level: { gap: Spacing.two },
});
