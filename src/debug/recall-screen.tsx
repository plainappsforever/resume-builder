// Dev-only (P6 device check): resumebuilder-dev://debug/recall runs the keyword engine on the reviewer's 4 job ads INSIDE
// the phone's Hermes and shows, per ad, which of the fixed must-have phrases (src/engine/__fixtures__/job-ads-review/
// expected.json, listed before the engine existed) are among the top 25 — the same number the Jest test pins (60 of 61,
// not blind any more: the dictionary was extended with those ads' tools, L27 rule 4).
import { useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';

import expected from '../engine/__fixtures__/job-ads-review/expected.json';
import { extractKeywords, SHOWN_KEYWORDS } from '../engine/keywords/extract';

import { REVIEW_ADS } from './review-ads.generated';

function runAll() {
  const t0 = Date.now();
  const lines: string[] = [];
  let hits = 0;
  let total = 0;
  for (const [name, must] of Object.entries(expected) as [string, string[]][]) {
    const top = extractKeywords(REVIEW_ADS[name]).keywords.slice(0, SHOWN_KEYWORDS).map((k) => k.term);
    const found = must.filter((m) => top.includes(m));
    hits += found.length;
    total += must.length;
    lines.push(`${name}: ${found.length}/${must.length}${found.length < must.length ? ` — missing: ${must.filter((m) => !top.includes(m)).join(', ')}` : ''}`);
    lines.push(`  top ${SHOWN_KEYWORDS}: ${top.join(' | ')}`);
  }
  lines.push(`${Platform.OS}: ${Date.now() - t0} ms for 4 ads`);
  return { lines, verdict: `RECALL ${hits}/${total}` };
}

export default function Runner() {
  const [{ lines, verdict }] = useState(runAll);
  return (
    <ScrollView testID="recall-screen" contentContainerStyle={{ padding: 16, gap: 6 }}>
      <Text testID="recall-verdict" style={{ fontSize: 20, fontWeight: '700' }}>
        {verdict}
      </Text>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: 11 }}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
}
