/**
 * @jest-environment node
 */
// Harness page: message protocol only (V1_PLAN P3.3). The page's script runs in a Node VM with a fake pdf.js; the
// real pdf.js inside the WebView is P5's device test (D15, UNCONFIRMED until then).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { buildHarnessHtml, decodeHarnessMessage, encodeRequest, HARNESS_SCRIPT } from './harness-page';

type Posted = Record<string, unknown>;

function fakePdfjs(fail = false) {
  const page = {
    getViewport: () => ({ width: 595.28, height: 841.89 }),
    getTextContent: async () => ({
      items: [
        { str: 'Jordan Lee', transform: [1, 0, 0, 1, 51.02, 770], width: 80, height: 20, hasEOL: true, fontName: 'f1' },
        { type: 'beginMarkedContent' },
      ],
      styles: { f1: { fontFamily: 'sans-serif' } },
    }),
    getOperatorList: async () => ({ fnArray: [1, 85, 2] }),
    commonObjs: { get: () => ({ name: 'AAAAAB+Inter-Bold', missingFile: false, isType3Font: false }) },
    cleanup: () => undefined,
  };
  return {
    version: '6.3.289',
    OPS: { paintImageXObject: 85, paintInlineImageXObject: 86, paintImageMaskXObject: 83 },
    getDocument: () => ({
      promise: fail ? Promise.reject(new Error('Invalid PDF structure.')) : Promise.resolve({ numPages: 1, getPage: async () => page }),
      destroy: async () => undefined,
    }),
  };
}

async function boot(fail = false) {
  const posted: Posted[] = [];
  const window: Record<string, unknown> = {
    __pdfjsLib: fakePdfjs(fail),
    // trace messages are diagnostics (D71) and not part of the protocol under test
    ReactNativeWebView: { postMessage: (s: string) => (JSON.parse(s).type === 'trace' ? 0 : posted.push(JSON.parse(s))) },
    addEventListener: () => undefined,
  };
  const document = { addEventListener: () => undefined, getElementById: () => ({ textContent: '' }) };
  runInNewContext(HARNESS_SCRIPT, { window, document, atob, URL, Blob, Date, JSON, Uint8Array, Promise, Set, Math, String, Error, Object });
  await new Promise((r) => setTimeout(r, 0));
  const handle = (window.__harness as { handle: (raw: string) => Promise<void> }).handle;
  return { posted, handle };
}

it('posts "ready" with the pdf.js version, then answers an extract request with the RawExtraction', async () => {
  const { posted, handle } = await boot();
  expect(posted[0]).toEqual({ v: 1, type: 'ready', reader: 'pdf.js 6.3.289', worker: 'main thread' }); // fake pdf.js: no PDFWorker
  await handle(encodeRequest({ v: 1, type: 'extract', id: 'r1', base64: Buffer.from('%PDF-1.4').toString('base64') }));
  expect(posted[1]).toEqual({ v: 1, type: 'ack', id: 'r1' }); // receipt first (the app resends without it, D71)
  const msg = decodeHarnessMessage(JSON.stringify(posted[2]));
  expect(msg).toMatchObject({ type: 'extracted', id: 'r1' });
  // A resent request with the same id is not answered twice.
  await handle(encodeRequest({ v: 1, type: 'extract', id: 'r1', base64: Buffer.from('%PDF-1.4').toString('base64') }));
  expect(posted).toHaveLength(3);
  expect(msg?.type === 'extracted' && msg.result).toEqual({
    reader: 'pdf.js 6.3.289',
    numPages: 1,
    pages: [{ width: 595.28, height: 841.89, images: 1, items: [{ s: 'Jordan Lee', x: 51.02, y: 770, w: 80, h: 20, e: true }] }],
    fonts: [{ name: 'AAAAAB+Inter-Bold', embedded: true, type3: false }],
  });
});

it('reports reader errors with the request id; ignores malformed and foreign messages', async () => {
  const { posted, handle } = await boot(true);
  await handle('not json');
  await handle(JSON.stringify({ v: 2, type: 'extract', id: 'x', base64: '' }));
  await handle(JSON.stringify({ v: 1, type: 'extract', base64: '' }));
  expect(posted).toHaveLength(1); // only "ready"
  await handle(encodeRequest({ v: 1, type: 'extract', id: 'r2', base64: 'AAAA' }));
  await handle(JSON.stringify({ v: 1, type: 'teleport', id: 'r3', base64: '' }));
  await handle(JSON.stringify({ v: 1, type: 'extract', id: 'r4' }));
  expect(posted.slice(1).filter((m) => m.type !== 'ack')).toEqual([
    { v: 1, type: 'error', id: 'r2', message: 'Invalid PDF structure.' },
    { v: 1, type: 'error', id: 'r3', message: 'unknown request teleport' },
    { v: 1, type: 'error', id: 'r4', message: 'no PDF data' },
  ]);
});

it('decodeHarnessMessage accepts only well-formed messages', () => {
  expect(decodeHarnessMessage('{"v":1,"type":"ready","reader":"pdf.js 6.3.289"}')).toEqual({ v: 1, type: 'ready', reader: 'pdf.js 6.3.289' });
  expect(decodeHarnessMessage('{"v":1,"type":"shown","id":"a","pages":2}')).toEqual({ v: 1, type: 'shown', id: 'a', pages: 2 });
  expect(decodeHarnessMessage('{"v":1,"type":"ack","id":"a"}')).toEqual({ v: 1, type: 'ack', id: 'a' });
  expect(decodeHarnessMessage('{"v":1,"type":"error","id":null,"message":"load: x"}')).toEqual({ v: 1, type: 'error', id: null, message: 'load: x' });
  for (const bad of ['', 'null', '[]', '{"v":1,"type":"ready"}', '{"v":1,"type":"extracted","id":"a","ms":1,"result":{}}', '{"type":"ready","reader":"x"}'])
    expect(decodeHarnessMessage(bad)).toBeNull();
});

it('the page embeds pdf.js as inert text, has no network access and one executable script', () => {
  const root = join(__dirname, '..', '..', 'assets', 'pdfjs');
  const html = buildHarnessHtml(readFileSync(join(root, 'pdf.min.mjs'), 'utf8'), 'self.x = "</script>";');
  expect(html).toContain("default-src 'none'");
  expect(html).not.toMatch(/(src|href)\s*=\s*["']?(https?:|\/\/)/i);
  expect(html.match(/<script(?![^>]*type="text\/plain")[^>]*>/g)).toEqual(['<script id="harness">']);
  expect(html).toContain('self.x = "<\\/script>";');
  expect(html.length).toBeGreaterThan(500_000);
});

// HARNESS_HTML_OUT=<path>: writes the real harness page (pdf.js from assets/pdfjs) for scripts/webkit-harness.swift,
// which runs it in macOS WebKit — a device-free stand-in for WKWebView (P5).
(process.env.HARNESS_HTML_OUT ? it : it.skip)('writes the real harness page', () => {
  const { writeFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
  const dir = join(__dirname, '..', '..', 'assets', 'pdfjs');
  writeFileSync(
    process.env.HARNESS_HTML_OUT!,
    buildHarnessHtml(readFileSync(join(dir, 'pdf.min.mjs'), 'utf8'), readFileSync(join(dir, 'pdf.worker.min.mjs'), 'utf8'))
  );
});
