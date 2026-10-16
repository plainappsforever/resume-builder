// Version → Design (SPEC §6, §5.6): template gallery and the style options of this resume. Every choice saves at once
// (style JSON stores choices only, D36). On Android the PDF uses the phone's fonts (D72) — said here, not hidden.
import { useSQLiteContext } from '@/db/provider';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Heading, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { updateVersion } from '@/db/versions';
import { DATE_STYLES } from '@/engine/dates';
import { DEFAULT_FONT, FONT_IDS, parseStyle, PHOTO_TEMPLATES, type FontId, type VersionStyle } from '@/engine/style';
import { TEMPLATE_IDS, type TemplateId, type Version } from '@/engine/types';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';
import { FONT_NAME } from '@/render/fonts.generated';
import { TEMPLATES } from '@/render/html/index';
import { ACCENT_PRESETS, MARGIN_MM } from '@/render/model';

const STEPS = ['-2', '-1', '0', '1', '2'] as const;
type Step = (typeof STEPS)[number];

export function VersionDesign({ version, hasPhoto, reload }: { version: Version; hasPhoto: boolean; reload: () => void }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const style = parseStyle(version.styleJson, version.language);
  const spec = TEMPLATES[version.template];

  const save = async (patch: Partial<VersionStyle>) => {
    await updateVersion(db, version.id, { styleJson: JSON.stringify({ ...style, ...patch }) });
    reload();
  };
  const setTemplate = async (template: TemplateId) => {
    await updateVersion(db, version.id, { template });
    reload();
  };
  const sizeLabel = (step: number) => `${spec.baseSizePt + 0.5 * step}`;

  return (
    <View style={styles.box} testID="tab-body-design">
      <Heading>{t('design.template')}</Heading>
      <Card>
        {TEMPLATE_IDS.map((id) => {
          const selected = id === version.template;
          return (
            <Pressable
              key={id}
              testID={`template-${id}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setTemplate(id)}
              style={[styles.row, selected && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>{t(`design.template.${id}`)}</ThemedText>
            </Pressable>
          );
        })}
      </Card>

      {Platform.OS === 'android' ? (
        <ThemedText type="small" themeColor="textSecondary" testID="design-android-fonts">
          {t('design.androidFonts')}
        </ThemedText>
      ) : null}

      <Heading>{t('design.font')}</Heading>
      <Card>
        <Option testID="font-default" selected={style.font === null} label={t('design.font.default', { font: FONT_NAME[DEFAULT_FONT[version.template]] })} onPress={() => save({ font: null })} />
        {FONT_IDS.map((f: FontId) => (
          <Option key={f} testID={`font-${f}`} selected={style.font === f} label={FONT_NAME[f]} onPress={() => save({ font: f })} />
        ))}
      </Card>

      <Heading>{t('design.accent')}</Heading>
      {spec.colour ? (
        <View style={styles.swatches}>
          <Pressable testID="accent-default" onPress={() => save({ accent: null })} style={[styles.swatchDefault, { borderColor: style.accent === null ? theme.tint : theme.backgroundSelected }]}>
            <ThemedText type="small">{t('design.accent.default')}</ThemedText>
          </Pressable>
          {ACCENT_PRESETS.map((c, i) => (
            <Pressable
              key={c}
              testID={`accent-${i}`}
              accessibilityLabel={c}
              onPress={() => save({ accent: c })}
              style={[styles.swatch, { backgroundColor: c, borderColor: style.accent === c ? theme.tint : 'transparent' }]}
            />
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('design.accent.plain')}
        </ThemedText>
      )}

      <Heading>{t('design.size')}</Heading>
      <Segmented<Step> testID="design-size" value={String(style.sizeStep) as Step} onChange={(v) => save({ sizeStep: Number(v) })} options={STEPS.map((v) => ({ value: v, label: sizeLabel(Number(v)) }))} />
      <Heading>{t('design.margins')}</Heading>
      <Segmented<Step> testID="design-margins" value={String(style.marginStep) as Step} onChange={(v) => save({ marginStep: Number(v) })} options={STEPS.map((v, i) => ({ value: v, label: `${MARGIN_MM[i]}` }))} />
      <Heading>{t('design.spacing')}</Heading>
      <Segmented<Step> testID="design-spacing" value={String(style.spacingStep) as Step} onChange={(v) => save({ spacingStep: Number(v) })} options={STEPS.map((v) => ({ value: v, label: t(`design.spacing.${v}`) }))} />

      <Heading>{t('design.headingCase')}</Heading>
      <Segmented
        testID="design-heading"
        value={style.headingCase ?? 'default'}
        onChange={(v) => save({ headingCase: v === 'default' ? null : v })}
        options={[
          { value: 'default', label: t('design.headingCase.default') },
          { value: 'upper', label: t('design.headingCase.upper') },
          { value: 'normal', label: t('design.headingCase.normal') },
        ]}
      />

      <Heading>{t('design.paper')}</Heading>
      <Segmented
        testID="design-paper"
        value={style.paper}
        onChange={(paper) => save({ paper })}
        options={[
          { value: 'a4', label: t('design.paper.a4') },
          { value: 'letter', label: t('design.paper.letter') },
        ]}
      />

      <Heading>{t('design.dateStyle')}</Heading>
      <Segmented testID="design-dates" value={style.dateStyle} onChange={(dateStyle) => save({ dateStyle })} options={DATE_STYLES.map((d) => ({ value: d, label: d }))} />

      <Card>
        <View style={styles.switchRow}>
          <ThemedText type="small" style={styles.flex}>
            {t('design.photo')}
          </ThemedText>
          <Switch
            testID="design-photo"
            accessibilityLabel={t('design.photo')}
            disabled={!hasPhoto || !PHOTO_TEMPLATES.includes(version.template)}
            value={style.photo && hasPhoto && PHOTO_TEMPLATES.includes(version.template)}
            onValueChange={(photo) => save({ photo })}
          />
        </View>
        {!PHOTO_TEMPLATES.includes(version.template) ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('design.photo.template')}
          </ThemedText>
        ) : !hasPhoto ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('design.photo.noPhoto')}
          </ThemedText>
        ) : null}
      </Card>
    </View>
  );
}

function Option({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.row, selected && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type={selected ? 'smallBold' : 'small'}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  row: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, borderRadius: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  swatchDefault: { paddingHorizontal: Spacing.two, height: 36, borderRadius: 18, borderWidth: 2, justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
