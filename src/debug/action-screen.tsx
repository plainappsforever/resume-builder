// Dev-only links (V1_PLAN rule 15): resumebuilder-dev://debug/reset · debug/seed?fixture=example-en|example-de|long-en|broken-link|empty ·
// debug/photo · debug/lang?lang=de|en|device · debug/ad?name=<review ad>&version=<id> (P6). Compiled out of release builds (the route requires this file under __DEV__).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from '@/db/provider';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { loadExample } from '@/db/example';
import { addLink } from '@/db/profile';
import { seedMaster } from '@/db/seed';
import { createVersion, updateVersion } from '@/db/versions';
import { STRESS_EN } from '@/render/__fixtures__/models';
import { setSetting } from '@/db/settings';
import { wipeAllData } from '@/db/wipe';
import { DEBUG_LANGUAGE_KEY, initUiLanguage } from '@/lib/locale';
import { seedFixturePhoto } from '@/lib/photo';

import { REVIEW_ADS } from './review-ads.generated';

export default function Runner() {
  const { action: route, fixture, lang, name, version } = useLocalSearchParams<{ action: string; fixture?: string; lang?: string; name?: string; version?: string }>();
  // v1.1: `debug/seedwait`, `debug/resetwait` = seed / reset that stay on "done" until the flow taps Continue (a path, because
  // Android's `am start` cuts a link at "&").
  const waitForFlow = route.endsWith('wait');
  const action = waitForFlow ? route.slice(0, -'wait'.length) : route;
  const db = useSQLiteContext();
  const router = useRouter();
  const [status, setStatus] = useState('running');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (action === 'reset') {
          await wipeAllData(db); // also forgets a forced UI language (settings table)
          await initUiLanguage(db); // the root layout re-mounts the screens if the language changed
        } else if (action === 'seed') {
          await wipeAllData(db);
          if (fixture === 'example-en' || fixture === 'example-de') await loadExample(db, fixture === 'example-de' ? 'de' : 'en');
          else if (fixture === 'long-en') {
            // P5: a profile that cannot fit one page (render fixture STRESS_EN) with one Modern resume (fit-one-page flow).
            await seedMaster(db, STRESS_EN);
            await createVersion(db, { name: 'Long', language: 'en', template: 'modern' });
          } else if (fixture === 'broken-link') {
            // v1.1 (D92): the EN example plus a link longer than a whole line — it must break, so the read-back fails
            // ("Your link was not read as one piece") and Share PDF shows the result before any share sheet.
            await loadExample(db, 'en');
            await addLink(db, { label: 'website', url: `https://example.org/${'portfolio-and-case-studies-'.repeat(5)}2026` });
          } else if (fixture !== 'empty') throw new Error(`unknown fixture ${fixture}`);
        } else if (action === 'photo') {
          await seedFixturePhoto(db);
        } else if (action === 'ad') {
          const ad = REVIEW_ADS[name ?? ''];
          if (!ad) throw new Error(`unknown review ad ${name}`);
          await updateVersion(db, Number(version ?? 1), { jobAd: ad });
        } else if (action === 'lang') {
          await setSetting(db, DEBUG_LANGUAGE_KEY, lang === 'de' || lang === 'en' ? lang : 'device');
          await initUiLanguage(db);
        } else {
          throw new Error(`unknown action ${action}`);
        }
        if (live) {
          setStatus('done');
          // v1.1: subflows/seed.yaml and reset.yaml wait for "done" + Continue: under load a late link otherwise let a flow act
          // on the previous flow's data and then be sent Home mid-step.
          if (!waitForFlow) router.replace('/');
        }
      } catch (e) {
        if (live) setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text testID="debug-status">{`debug ${action}: ${status}`}</Text>
      {waitForFlow && status === 'done' ? (
        <Pressable testID="debug-continue" onPress={() => router.replace('/')} style={{ padding: 24 }}>
          <Text>Continue</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
