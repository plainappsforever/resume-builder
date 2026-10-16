// Dev-only P5 gate (D14/D15): resumebuilder-dev://debug/pdf-gate renders the referee's 72 reference documents (66 + six long-name ones, v1.1) with
// expo-print ON THIS PHONE, reads every file back with pdf.js inside the app's WebView harness, and writes
// <document>/pdf-gate/<run>/{<name>.pdf, <name>.expected.json, <name>.device.json, report.json} for
// scripts/device-referee.mjs (pulled to the Mac: pdf.js in Node + Apple PDFKit + the same comparator).
// Query: ?filter=<substring>&run=<name>&zoom=<n>&margins=css|engine&width=0|1&fonts=web|system&pad=<pt>&lh=<n>&sans=<css> (zoom/margins = print tuning experiments, D70).
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';

import { PdfHarness } from '@/components/pdf-harness';
import { defaultTuning, printPdf, type MarginMode } from '@/lib/pdf';
import { FIXTURE_JPEG_BASE64 } from '@/lib/photo';
import { readBackWithRetry, type HarnessClient } from '@/readback/bridge';
import { referenceSamples } from '@/render/__fixtures__/samples';

type Row = {
  name: string;
  attempts: number;
  pages: number;
  reportedPages: number;
  bytes: number;
  printMs: number;
  readbackMs: number;
  pdfjsMs: number | null;
  pass: boolean;
  summary: string;
};

export default function PdfGate() {
  const q = useLocalSearchParams<{ filter?: string; zoom?: string; margins?: string; width?: string; fonts?: string; pad?: string; lh?: string; sans?: string; run?: string }>();
  const harness = useRef<HarnessClient | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [verdict, setVerdict] = useState('GATE RUNNING');

  useEffect(() => {
    let live = true;
    const out: string[] = [];
    const log = (l: string) => {
      out.push(l);
      if (live) setLines([...out]);
    };
    (async () => {
      const os = Platform.OS === 'ios' ? 'ios' : 'android';
      const tuning = { ...defaultTuning(os) };
      if (q.zoom) tuning.zoom = Number(q.zoom);
      if (q.margins === 'css' || q.margins === 'engine') tuning.margins = q.margins as MarginMode;
      if (q.width === '0' || q.width === '1') tuning.bodyWidth = q.width === '1';
      if (q.fonts === 'web' || q.fonts === 'system') tuning.fonts = q.fonts;
      if (q.pad) tuning.a4HeightPad = Number(q.pad);
      if (q.lh) tuning.systemSansLineHeight = Number(q.lh);
      if (q.sans) tuning.systemSans = q.sans;
      const runName = q.run || `${os}-${Date.now()}`;
      const dir = new Directory(Paths.document, 'pdf-gate', runName);
      dir.create({ intermediates: true, idempotent: true });
      const client = await waitFor(() => harness.current);
      const reader = await client.ready;
      log(`${reader} loaded in ${client.loadMs} ms; tuning ${JSON.stringify(tuning)}; run ${runName}`);
      const samples = referenceSamples({ mime: 'image/jpeg', base64: FIXTURE_JPEG_BASE64 }).filter((s) => s.name.includes(q.filter ?? ''));
      const rows: Row[] = [];
      const errors: { name: string; message: string }[] = [];
      for (const s of samples) {
        if (!live) return;
        try {
          const pdf = await printPdf(s.result, new File(dir, `${s.name}.pdf`), tuning);
          const base64 = await new File(pdf.uri).base64();
          const run = await readBackWithRetry(() => harness.current, base64, pdf.bytes, s.result.expectedLines);
          const r = run.result;
          const pass = !('unavailable' in r) && r.pass;
          const summary =
            'unavailable' in r
              ? `UNAVAILABLE ${r.reason}`
              : `${r.words.found}/${r.words.expected} words ${r.lines.inOrder}/${r.lines.total} lines gaps ${r.wideGaps.length} up ${r.upJumps.length} ` +
                `fonts ${r.fonts.join(',')} embedded ${r.fontsEmbedded}`;
          rows.push({ name: s.name, attempts: run.attempts, pages: pdf.pages, reportedPages: pdf.reportedPages, bytes: pdf.bytes, printMs: pdf.ms, readbackMs: run.ms, pdfjsMs: run.pdfjsMs, pass, summary });
          new File(dir, `${s.name}.expected.json`).write(
            JSON.stringify({ name: s.name, font: s.result.font, page: s.result.page, print: s.result.print, expectedLines: s.result.expectedLines })
          );
          new File(dir, `${s.name}.device.json`).write(JSON.stringify({ raw: run.raw, result: r, printMs: pdf.ms, readbackMs: run.ms, pdfjsMs: run.pdfjsMs, reportedPages: pdf.reportedPages, pages: pdf.pages }));
          log(`${pass ? 'ok ' : 'NO '}${run.attempts > 1 ? '(retry) ' : ''}${s.name} p${pdf.pages}(${pdf.reportedPages}) ${Math.round(pdf.bytes / 1024)}KB print ${pdf.ms}ms read ${run.ms}ms — ${summary}`);
        } catch (e) {
          // One stuck print (Android, invoice-maker D72) must not end the run: the file is listed as an error.
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ name: s.name, message });
          log(`ERR ${s.name}: ${message}`);
        }
      }
      const passed = rows.filter((r) => r.pass).length;
      new File(dir, 'report.json').write(
        JSON.stringify({ platform: os, version: Platform.Version, reader, loadMs: client.loadMs, tuning, run: runName, names: rows.map((r) => r.name), rows, errors, harness: { acks: harness.current?.acks, resends: harness.current?.resends } }, null, 1)
      );
      if (live) setVerdict(`GATE ${passed === samples.length ? 'PASS' : 'FAIL'} ${passed}/${samples.length}${errors.length ? ` (${errors.length} errors)` : ''}`);
    })().catch((e: unknown) => {
      log(`error: ${e instanceof Error ? e.message : String(e)}`);
      if (live) setVerdict('GATE ERROR');
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <PdfHarness ref={harness} />
      <ScrollView testID="pdf-gate-screen" contentContainerStyle={{ padding: 12, gap: 4 }}>
        <Text testID="gate-verdict" style={{ fontSize: 20, fontWeight: '700' }}>
          {verdict}
        </Text>
        {lines.map((l, i) => (
          <Text key={i} style={{ fontSize: 10 }}>
            {l}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

async function waitFor<T>(get: () => T | null, ms = 5000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > until) throw new Error('harness not mounted');
    await new Promise((r) => setTimeout(r, 50));
  }
}
