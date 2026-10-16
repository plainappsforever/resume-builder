// Help (SPEC §6, F11): short pages, all offline. Topics: action verbs, bullet point examples, the checks, keyword matching,
// the evidence behind the checks, and what "ATS" means (information only).
import { Stack, useRouter, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { t, type TranslationKey } from '@/i18n';

export const HELP_TOPICS = [
  { id: 'verbs', title: 'help.verbs.title', hint: 'help.verbs.hint' },
  { id: 'examples', title: 'help.examples.title', hint: 'help.examples.hint' },
  { id: 'checks', title: 'help.checks.title', hint: 'help.checks.hint' },
  { id: 'matching', title: 'help.matching.title', hint: 'help.matching.hint' },
  { id: 'evidence', title: 'help.evidence.title', hint: 'help.evidence.hint' },
  { id: 'ats', title: 'help.ats.title', hint: 'help.ats.hint' },
] as const satisfies readonly { id: string; title: TranslationKey; hint: TranslationKey }[];

export default function HelpIndex() {
  const router = useRouter();
  return (
    <Screen testID="help-screen">
      <Stack.Screen options={{ title: t('help.title') }} />
      <ThemedText themeColor="textSecondary">{t('help.intro')}</ThemedText>
      {HELP_TOPICS.map((topic) => (
        <Pressable key={topic.id} testID={`help-${topic.id}`} accessibilityRole="button" onPress={() => router.push(`/help/${topic.id}` as Href)}>
          <Card>
            <ThemedText type="smallBold">{t(topic.title)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t(topic.hint)}
            </ThemedText>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
