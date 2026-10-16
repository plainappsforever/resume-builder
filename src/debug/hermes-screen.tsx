// Dev-only: resumebuilder-dev://debug/hermes runs the keyword engine's oracle vectors and the language features it relies
// on inside the phone's JavaScript engine (Hermes) and shows the result: "HERMES PASS" when nothing differs from Node.
import { useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';

import { runEngineVectors, runLanguageProbes } from './engine-vectors';

function runAll(): { lines: string[]; verdict: string } {
  const t0 = Date.now();
  const out: string[] = [];
  const hermes = (globalThis as { HermesInternal?: { getRuntimeProperties?: () => Record<string, string> } }).HermesInternal;
  out.push(`${Platform.OS} engine ${hermes ? `Hermes ${hermes.getRuntimeProperties?.()['OSS Release Version'] ?? ''}` : 'not Hermes'}`);
  let ok = true;
  for (const p of runLanguageProbes()) {
    out.push(`${p.ok ? 'ok  ' : p.required ? 'FAIL' : 'info'} ${p.name}: ${p.detail}`);
    if (p.required && !p.ok) ok = false;
  }
  const report = runEngineVectors();
  out.push(`vectors: tokenizer ${report.tokenizer}, generated ads ${report.extraction}, matching ${report.matching}`);
  out.push(`mismatches: ${report.mismatches.length}${report.mismatches.length ? ` (${report.mismatches.slice(0, 3).join('; ')})` : ''} in ${Date.now() - t0} ms`);
  if (report.mismatches.length > 0) ok = false;
  return { lines: out, verdict: ok ? 'HERMES PASS' : 'HERMES FAIL' };
}

export default function Runner() {
  const [{ lines, verdict }] = useState(runAll);
  return (
    <ScrollView testID="hermes-screen" contentContainerStyle={{ padding: 16, gap: 6 }}>
      <Text testID="hermes-verdict" style={{ fontSize: 20, fontWeight: '700' }}>
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
