// Profile tab (SPEC §6): personal details, photo, optional personal details, links, summary, sections. Autosave everywhere.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { AutoTextField, Card, Heading, IncludeSwitch, LinkButton, MoveButtons, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addLink, deleteLink, getProfile, listLinks, moveLink, updateLink, type LinkInput } from '@/db/profile';
import { addSection, listSections, moveSection } from '@/db/sections';
import { listEntries } from '@/db/entries';
import { LINK_LABELS, type LinkLabel, type ProfileLink, type SectionKind } from '@/engine/types';
import { useLoad } from '@/hooks/use-load';
import { useMasterEdit } from '@/hooks/use-master-edit';
import { useTheme } from '@/hooks/use-theme';
import { getUiLanguage, t, type TranslationKey } from '@/i18n';
import { displayBirthDate, parseBirthDate } from '@/lib/birth-date';
import { ADDABLE_KINDS } from '@/lib/entry-kinds';
import { pickAndStorePhoto, photoUri, removePhoto } from '@/lib/photo';
import { updateProfile } from '@/db/profile';

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const edit = useMasterEdit();
  const [adding, setAdding] = useState(false);
  const [birthError, setBirthError] = useState(false);
  const { data, reload } = useLoad(async (db) => {
    const [profile, links, sections, entries] = await Promise.all([getProfile(db), listLinks(db), listSections(db), listEntries(db)]);
    return { profile, links, sections, entries };
  });
  if (!data) return <Screen testID="profile-screen">{null}</Screen>;
  const { profile, links, sections, entries } = data;
  const save = (patch: Parameters<typeof updateProfile>[1]) => edit((db) => updateProfile(db, patch));

  async function createSection(kind: SectionKind) {
    setAdding(false);
    const id = await edit((db) => addSection(db, kind));
    reload();
    router.push(`/profile/section/${id}`);
  }

  return (
    <Screen testID="profile-screen">
      <Heading>{t('profile.details')}</Heading>
      <Card>
        <AutoTextField testID="profile-name" label={t('profile.name')} value={profile.fullName} onSave={(v) => save({ fullName: v })} autoComplete="name" textContentType="name" />
        <AutoTextField testID="profile-headline" label={t('profile.headline')} value={profile.headline} onSave={(v) => save({ headline: v })} hint={t('profile.headline.hint')} />
        <AutoTextField testID="profile-email" label={t('profile.email')} value={profile.email} onSave={(v) => save({ email: v.trim() })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <AutoTextField testID="profile-phone" label={t('profile.phone')} value={profile.phone} onSave={(v) => save({ phone: v })} keyboardType="phone-pad" />
        <AutoTextField testID="profile-city" label={t('profile.city')} value={profile.city} onSave={(v) => save({ city: v })} />
        <AutoTextField testID="profile-region" label={t('profile.region')} value={profile.region} onSave={(v) => save({ region: v })} />
        <AutoTextField testID="profile-country" label={t('profile.country')} value={profile.countryCode} onSave={(v) => save({ countryCode: v.trim().toUpperCase() })} autoCapitalize="characters" maxLength={3} />
      </Card>

      <Heading>{t('profile.summary')}</Heading>
      <Card>
        <AutoTextField testID="profile-summary" label={t('profile.summary')} value={profile.summary} onSave={(v) => save({ summary: v })} multiline hint={t('profile.summary.hint')} />
      </Card>

      <Heading>{t('profile.photo')}</Heading>
      <Card>
        {profile.photoFile ? (
          <Image testID="photo-preview" source={{ uri: photoUri(profile.photoFile) ?? undefined }} style={styles.photo} contentFit="cover" cachePolicy="none" />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {t('profile.photo.none')}
          </ThemedText>
        )}
        <View style={styles.row}>
          <LinkButton
            testID="photo-choose"
            label={profile.photoFile ? t('profile.photo.change') : t('profile.photo.choose')}
            onPress={async () => {
              if (await edit((db) => pickAndStorePhoto(db))) reload();
            }}
          />
          {profile.photoFile ? (
            <LinkButton
              testID="photo-remove"
              danger
              label={t('profile.photo.remove')}
              onPress={async () => {
                await edit((db) => removePhoto(db));
                reload();
              }}
            />
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('profile.photo.hint')}
        </ThemedText>
      </Card>

      <Heading>{t('profile.personal')}</Heading>
      <Card>
        <View style={styles.switchRow}>
          <ThemedText style={styles.flex}>{t('profile.personal.show')}</ThemedText>
          <IncludeSwitch
            testID="personal-switch"
            label={t('profile.personal.show')}
            value={profile.showPersonal}
            onChange={async (v) => {
              await save({ showPersonal: v });
              reload();
            }}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('profile.personal.hint')}
        </ThemedText>
        {profile.showPersonal ? (
          <>
            <AutoTextField
              testID="profile-birth"
              label={t('profile.birth')}
              value={displayBirthDate(profile.birthDate, getUiLanguage())}
              hint={t('profile.birth.hint')}
              error={birthError ? t('profile.birth.error') : null}
              onSave={async (v) => {
                const parsed = parseBirthDate(v, new Date().getFullYear());
                setBirthError(parsed.error);
                if (!parsed.error) await save({ birthDate: parsed.iso });
              }}
            />
            <AutoTextField testID="profile-nationality" label={t('profile.nationality')} value={profile.nationality ?? ''} onSave={(v) => save({ nationality: v.trim() === '' ? null : v })} />
          </>
        ) : null}
      </Card>

      <Heading>{t('profile.links')}</Heading>
      {links.map((link, i) => (
        <LinkCard key={link.id} link={link} index={i} count={links.length} reload={reload} />
      ))}
      <Button
        testID="link-add"
        variant="secondary"
        label={t('profile.links.add')}
        onPress={async () => {
          await edit((db) => addLink(db, { label: 'linkedin', url: '' }));
          reload();
        }}
      />

      <Heading>{t('profile.sections')}</Heading>
      {sections.map((s, i) => {
        const count = entries.filter((e) => e.sectionId === s.id).length;
        return (
          <Card key={s.id}>
            <Pressable testID={`section-row-${s.id}`} accessibilityRole="button" onPress={() => router.push(`/profile/section/${s.id}`)} style={styles.sectionRow}>
              <View style={styles.flex}>
                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  {s.customTitle || t(`section.kind.${s.kind}` as TranslationKey)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t(count === 1 ? 'profile.entries.one' : 'profile.entries.other', { count })}
                </ThemedText>
              </View>
              <MoveButtons
                testID={`section-move-${s.id}`}
                canUp={i > 0}
                canDown={i < sections.length - 1}
                upLabel={t('common.moveUp')}
                downLabel={t('common.moveDown')}
                onUp={async () => {
                  await edit((db) => moveSection(db, s.id, i - 1));
                  reload();
                }}
                onDown={async () => {
                  await edit((db) => moveSection(db, s.id, i + 1));
                  reload();
                }}
              />
            </Pressable>
          </Card>
        );
      })}
      {adding ? (
        <Card>
          <ThemedText type="smallBold">{t('profile.sections.pick')}</ThemedText>
          <View style={styles.chips}>
            {ADDABLE_KINDS.map((kind) => (
              <Pressable
                key={kind}
                testID={`add-kind-${kind}`}
                accessibilityRole="button"
                onPress={() => createSection(kind)}
                style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="small">{t(`section.kind.${kind}` as TranslationKey)}</ThemedText>
              </Pressable>
            ))}
          </View>
          <LinkButton testID="add-section-cancel" label={t('common.cancel')} onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button testID="add-section" variant="secondary" label={t('profile.sections.add')} onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

function LinkCard({ link, index, count, reload }: { link: ProfileLink; index: number; count: number; reload: () => void }) {
  const edit = useMasterEdit();
  const theme = useTheme();
  const write = (patch: Partial<LinkInput>) =>
    edit((db) => updateLink(db, link.id, { label: link.label, customLabel: link.customLabel, url: link.url, ...patch }));
  return (
    <Card>
      <View style={styles.chips}>
        {LINK_LABELS.map((label: LinkLabel) => {
          const selected = label === link.label;
          return (
            <Pressable
              key={label}
              testID={`link-${index}-label-${label}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={async () => {
                await write({ label });
                reload();
              }}
              style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundSelected }]}>
              <ThemedText type="small" style={selected ? { color: theme.onTint } : undefined}>
                {t(`link.label.${label}` as TranslationKey)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {link.label === 'other' ? (
        <AutoTextField testID={`link-${index}-custom`} label={t('profile.links.customLabel')} value={link.customLabel ?? ''} onSave={(v) => write({ customLabel: v })} />
      ) : null}
      <AutoTextField testID={`link-${index}-url`} label={t('profile.links.url')} value={link.url} onSave={(v) => write({ url: v })} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      <View style={styles.row}>
        <MoveButtons
          testID={`link-${index}-move`}
          canUp={index > 0}
          canDown={index < count - 1}
          upLabel={t('common.moveUp')}
          downLabel={t('common.moveDown')}
          onUp={async () => {
            await edit((db) => moveLink(db, link.id, index - 1));
            reload();
          }}
          onDown={async () => {
            await edit((db) => moveLink(db, link.id, index + 1));
            reload();
          }}
        />
        <LinkButton
          testID={`link-${index}-delete`}
          danger
          label={t('common.delete')}
          onPress={async () => {
            await edit((db) => deleteLink(db, link.id));
            reload();
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, justifyContent: 'space-between' },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  photo: { width: 96, height: 120, borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 36, justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  sectionTitle: { fontSize: 17, lineHeight: 24 },
});
