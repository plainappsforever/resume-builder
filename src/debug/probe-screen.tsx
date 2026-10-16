// Dev-only: resumebuilder-dev://debug/probe runs the write-queue probe (src/db/probe.ts) on the real expo-sqlite, on a
// scratch database (probe.db), so the app's data is untouched.
import { useEffect, useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';

import { openScratchDatabase } from '@/db/connection';
import { runWriteProbe } from '@/db/probe';

export default function Runner() {
  const [lines, setLines] = useState<string[]>([]);
  const [verdict, setVerdict] = useState('PROBE RUNNING');
  useEffect(() => {
    const out: string[] = [];
    const log = (l: string) => {
      out.push(l);
      setLines([...out]);
    };
    (async () => {
      const db = await openScratchDatabase('probe.db');
      try {
        setVerdict((await runWriteProbe(db, Platform.OS, log)) ? 'PROBE PASS' : 'PROBE FAIL');
      } finally {
        await db.closeAsync();
      }
    })().catch((e: unknown) => {
      log(`error: ${e instanceof Error ? e.message : String(e)}`);
      setVerdict('PROBE FAIL');
    });
  }, []);
  return (
    <ScrollView testID="probe-screen" contentContainerStyle={{ padding: 16, gap: 6 }}>
      <Text testID="probe-verdict" style={{ fontSize: 20, fontWeight: '700' }}>
        {verdict}
      </Text>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: 12 }}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
}
