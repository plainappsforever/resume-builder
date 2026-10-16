// One help page (see help/index.tsx). Content comes from src/engine/content (verbs, examples) and src/i18n (texts); nothing
// here needs the network. The evidence page names every source and what it does not prove (L26).
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Chips, Heading, LinkButton, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CHECK_IDS, SOURCE_URLS } from '@/engine/checks';
import { ACTION_VERBS_DE, ACTION_VERBS_EN, VERB_CATEGORIES, verbCount } from '@/engine/content/action-verbs';
import { ROLE_EXAMPLES, ROLE_IDS } from '@/engine/content/role-examples';
import type { Lang } from '@/engine/types';
import { getUiLanguage, t, type TranslationKey } from '@/i18n';

const TITLES: Record<string, TranslationKey> = {
  verbs: 'help.verbs.title',
  examples: 'help.examples.title',
  checks: 'help.checks.title',
  matching: 'help.matching.title',
  evidence: 'help.evidence.title',
  ats: 'help.ats.title',
};

export default function HelpTopic() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const key = TITLES[topic];
  return (
    <Screen testID={`help-${topic}-screen`}>
      <Stack.Screen options={{ title: key ? t(key) : t('help.title') }} />
      {topic === 'verbs' ? <Verbs /> : topic === 'examples' ? <Examples /> : topic === 'checks' ? <Checks /> : topic === 'matching' ? <Paragraphs prefix="help.matching" count={6} /> : topic === 'evidence' ? <Evidence /> : topic === 'ats' ? <Paragraphs prefix="help.ats" count={5} /> : null}
    </Screen>
  );
}

function Paragraphs({ prefix, count }: { prefix: 'help.matching' | 'help.ats'; count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <ThemedText key={i} testID={`${prefix.replace('.', '-')}-p${i + 1}`}>
          {t(`${prefix}.p${i + 1}` as TranslationKey)}
        </ThemedText>
      ))}
    </>
  );
}

function LanguageChips({ value, onChange, testID }: { value: Lang; onChange: (l: Lang) => void; testID: string }) {
  return (
    <Chips
      testID={testID}
      value={value}
      onChange={onChange}
      options={[
        { value: 'en', label: t('lang.en') },
        { value: 'de', label: t('lang.de') },
      ]}
    />
  );
}

function Verbs() {
  const [lang, setLang] = useState<Lang>(getUiLanguage());
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {t('help.verbs.intro')}
      </ThemedText>
      <LanguageChips testID="verbs-language" value={lang} onChange={setLang} />
      <ThemedText type="smallBold" testID="verbs-count">
        {t('help.verbs.count', { count: verbCount(lang) })}
      </ThemedText>
      {VERB_CATEGORIES.map((cat) => {
        const words = lang === 'en' ? ACTION_VERBS_EN[cat].map(([past, base]) => (past === base ? past : `${past} / ${base}`)) : ACTION_VERBS_DE[cat].map(([inf, , , noun]) => (noun ? `${inf} · ${noun}` : inf));
        return (
          <View key={cat} style={styles.group}>
            <Heading>{t(`verbs.category.${cat}` as TranslationKey)}</Heading>
            <ThemedText type="small" testID={`verbs-${cat}`}>
              {words.join(' — ')}
            </ThemedText>
          </View>
        );
      })}
    </>
  );
}

function Examples() {
  const [lang, setLang] = useState<Lang>(getUiLanguage());
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {t('help.examples.intro')}
      </ThemedText>
      <LanguageChips testID="examples-language" value={lang} onChange={setLang} />
      {ROLE_IDS.map((id) => (
        <Card key={id}>
          <ThemedText type="smallBold" testID={`examples-role-${id}`}>
            {ROLE_EXAMPLES[id].title[lang]}
          </ThemedText>
          {ROLE_EXAMPLES[id].bullets[lang].map((text, i) => (
            <View key={text} style={styles.example}>
              <ThemedText type="small" style={styles.grow}>{`• ${text}`}</ThemedText>
              <LinkButton
                testID={`example-copy-${id}-${i}`}
                label={copied === text ? t('help.examples.copied') : t('help.examples.copy')}
                onPress={async () => {
                  await Clipboard.setStringAsync(text);
                  setCopied(text);
                }}
              />
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

function Checks() {
  return (
    <>
      <ThemedText>{t('help.checks.intro')}</ThemedText>
      {CHECK_IDS.map((id) => (
        <Card key={id}>
          <ThemedText type="smallBold" testID={`help-check-${id}`}>{`${id} · ${t(`check.${id}.title` as TranslationKey)}`}</ThemedText>
          <ThemedText type="small">{t(`help.checks.${id}` as TranslationKey)}</ThemedText>
        </Card>
      ))}
    </>
  );
}

function Evidence() {
  const sections = [
    { id: 'greenhouse', url: SOURCE_URLS.greenhouse },
    { id: 'workday', url: SOURCE_URLS.workday },
    { id: 'others', url: null },
    { id: 'readback', url: null },
    { id: 'advice', url: null },
    { id: 'unknown', url: null },
  ] as const;
  return (
    <>
      <ThemedText>{t('help.evidence.intro')}</ThemedText>
      {sections.map((s) => (
        <Card key={s.id}>
          <ThemedText type="smallBold" testID={`evidence-${s.id}`}>
            {t(`help.evidence.${s.id}.title` as TranslationKey)}
          </ThemedText>
          <ThemedText type="small">{t(`help.evidence.${s.id}.body` as TranslationKey)}</ThemedText>
          {s.url ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" selectable>
                {s.url}
              </ThemedText>
              <LinkButton testID={`evidence-open-${s.id}`} label={t('check.sourceOpen')} onPress={() => void Linking.openURL(s.url)} />
            </>
          ) : null}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.one },
  example: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flexGrow: 1, flexShrink: 1 },
});
