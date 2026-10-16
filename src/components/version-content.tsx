// The Content tab's tree (SPEC §6): sections → entries → bullets with include switches, move up/down, "edit for this
// version only", override/new/changed badges. Every change writes only version rows (version-items.ts, D17).
import { useRouter } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Card, IncludeSwitch, LinkButton, MoveButtons } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatDateRange } from '@/engine/dates';
import type { ResolvedBullet, ResolvedEntry, ResolvedSection, ResolvedVersion } from '@/engine/resolve';
import { t, type TranslationKey } from '@/i18n';
import { KIND_SPECS } from '@/lib/entry-kinds';
import {
  markEntrySeen,
  moveBulletInVersion,
  moveEntryInVersion,
  moveSectionInVersion,
  setBulletIncluded,
  setEntryIncluded,
  setSectionIncluded,
} from '@/db/version-items';

type Props = { resolved: ResolvedVersion; reload: () => void };

export function VersionTree({ resolved, reload }: Props) {
  return (
    <View style={styles.tree}>
      {resolved.sections.map((section, i) => (
        <SectionBlock key={section.id} section={section} index={i} count={resolved.sections.length} resolved={resolved} reload={reload} />
      ))}
    </View>
  );
}

function SectionBlock({ section, index, count, resolved, reload }: { section: ResolvedSection; index: number; count: number; resolved: ResolvedVersion; reload: () => void }) {
  const db = useSQLiteContext();
  const [open, setOpen] = useState(true);
  const versionId = resolved.versionId;
  const title = section.title ?? t(`section.kind.${section.kind}` as TranslationKey);
  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    reload();
  };
  return (
    <Card>
      <View style={styles.header}>
        <IncludeSwitch
          testID={`section-include-${section.id}`}
          label={t('content.include', { name: title })}
          value={section.included}
          onChange={(v) => run(() => setSectionIncluded(db, versionId, section.id, v))}
        />
        <ThemedText type="smallBold" style={[styles.title, titleMin(), !section.included && styles.dim]} numberOfLines={2}>
          {title}
        </ThemedText>
        <MoveButtons
          testID={`section-move-${section.id}`}
          canUp={index > 0}
          canDown={index < count - 1}
          upLabel={t('common.moveUp')}
          downLabel={t('common.moveDown')}
          onUp={() => run(() => moveSectionInVersion(db, versionId, section.id, index - 1))}
          onDown={() => run(() => moveSectionInVersion(db, versionId, section.id, index + 1))}
        />
      </View>
      <LinkButton
        testID={`section-toggle-${section.id}`}
        label={open ? t('content.collapse') : t('content.expand', { count: section.entries.length })}
        onPress={() => setOpen(!open)}
      />
      {open
        ? section.entries.map((e, i) => (
            <EntryBlock key={e.id} entry={e} index={i} count={section.entries.length} section={section} resolved={resolved} dim={!section.included} reload={reload} />
          ))
        : null}
    </Card>
  );
}

function EntryBlock({
  entry,
  index,
  count,
  section,
  resolved,
  dim,
  reload,
}: {
  entry: ResolvedEntry;
  index: number;
  count: number;
  section: ResolvedSection;
  resolved: ResolvedVersion;
  dim: boolean;
  reload: () => void;
}) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const versionId = resolved.versionId;
  const spec = KIND_SPECS[section.kind];
  const dates = spec.fields.includes('dates') ? formatDateRange(entry, resolved.style.dateStyle, resolved.language) : '';
  const subtitle = [entry.organization, dates].filter(Boolean).join(' · ');
  const name = entry.title || entry.organization || t('entry.untitled');
  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    reload();
  };
  return (
    <View style={[styles.entry, (dim || !entry.included) && styles.dim]}>
      <View style={styles.header}>
        <IncludeSwitch
          testID={`entry-include-${entry.id}`}
          label={t('content.include', { name })}
          value={entry.included}
          onChange={(v) => run(() => setEntryIncluded(db, versionId, entry.id, v))}
        />
        <View style={[styles.headFlex, titleMin()]}>
          <ThemedText type="smallBold" numberOfLines={2} testID={`entry-title-${entry.id}`}>
            {name}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        <MoveButtons
          testID={`entry-move-${entry.id}`}
          canUp={index > 0}
          canDown={index < count - 1}
          upLabel={t('common.moveUp')}
          downLabel={t('common.moveDown')}
          onUp={() => run(() => moveEntryInVersion(db, versionId, entry.id, index - 1))}
          onDown={() => run(() => moveEntryInVersion(db, versionId, entry.id, index + 1))}
        />
      </View>
      <View style={styles.badges}>
        {entry.newSinceExport ? <Badge testID={`entry-new-${entry.id}`} tone="new" label={t('content.badge.new')} /> : null}
        {entry.masterChanged ? <Badge testID={`entry-changed-${entry.id}`} tone="new" label={t('content.badge.changed')} /> : null}
        {entry.overridden ? <Badge testID={`entry-edited-${entry.id}`} label={t('content.badge.edited')} /> : null}
      </View>
      <View style={styles.actions}>
        {entry.newSinceExport && index > 0 ? (
          <LinkButton testID={`entry-movetop-${entry.id}`} label={t('content.moveTop')} onPress={() => run(() => moveEntryInVersion(db, versionId, entry.id, 0))} />
        ) : null}
        {entry.masterChanged ? (
          <LinkButton testID={`entry-seen-${entry.id}`} label={t('content.seen')} onPress={() => run(() => markEntrySeen(db, versionId, entry.id))} />
        ) : null}
        <LinkButton testID={`entry-edit-${entry.id}`} label={t('content.editHere')} onPress={() => router.push(`/version/${versionId}/entry/${entry.id}`)} />
        {entry.bullets.length > 0 ? (
          <LinkButton
            testID={`entry-toggle-${entry.id}`}
            label={open ? t('content.hideBullets') : t('content.showBullets', { count: entry.bullets.length })}
            onPress={() => setOpen(!open)}
          />
        ) : null}
      </View>
      {open
        ? entry.bullets.map((b, i) => (
            <BulletRow key={b.id} bullet={b} index={i} count={entry.bullets.length} versionId={versionId} dim={dim || !entry.included} reload={reload} />
          ))
        : null}
    </View>
  );
}

function BulletRow({ bullet, index, count, versionId, dim, reload }: { bullet: ResolvedBullet; index: number; count: number; versionId: number; dim: boolean; reload: () => void }) {
  const db = useSQLiteContext();
  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    reload();
  };
  return (
    <View style={[styles.bullet, (dim || !bullet.included) && styles.dim]}>
      <IncludeSwitch
        testID={`bullet-include-${bullet.id}`}
        label={t('content.include', { name: bullet.text })}
        value={bullet.included}
        onChange={(v) => run(() => setBulletIncluded(db, versionId, bullet.id, v))}
      />
      <View style={styles.flex}>
        <ThemedText type="small" testID={`bullet-text-${bullet.id}`} style={!bullet.included && styles.struck}>
          {bullet.text || t('bullets.empty')}
        </ThemedText>
        {bullet.overridden ? <Badge testID={`bullet-edited-${bullet.id}`} label={t('content.badge.edited')} /> : null}
      </View>
      <MoveButtons
        testID={`bullet-move-${bullet.id}`}
        canUp={index > 0}
        canDown={index < count - 1}
        upLabel={t('common.moveUp')}
        downLabel={t('common.moveDown')}
        onUp={() => run(() => moveBulletInVersion(db, versionId, bullet.id, index - 1))}
        onDown={() => run(() => moveBulletInVersion(db, versionId, bullet.id, index + 1))}
      />
    </View>
  );
}

/** Narrowest title: grows with the phone's text size so a bigger font wraps the move buttons below the title instead of breaking words. */
const titleMin = () => ({ minWidth: 140 * PixelRatio.getFontScale() });

const styles = StyleSheet.create({
  tree: { gap: Spacing.three },
  // Wraps (move buttons drop below the title) when the title would get under `titleMin()` (140 pt x the font scale): large text made it break inside words (P7).
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  title: { flex: 1, fontSize: 17, lineHeight: 24 },
  headFlex: { flex: 1, gap: Spacing.one },
  flex: { flex: 1, gap: Spacing.one },
  entry: { gap: Spacing.one, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8888' },
  badges: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.three },
  dim: { opacity: 0.55 },
  struck: { textDecorationLine: 'line-through' },
});
