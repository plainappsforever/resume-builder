// The read-back / exact-preview page for react-native-webview (D15; wired up in P5 by bridge.ts). PURE string builder.
// pdf.js (assets/pdfjs, legacy build) is embedded as text and loaded from a blob: URL; no network (CSP), no eval in
// pdf.js. The page runs the SAME extraction source as the Node referee (pdfjs-extract.ts) and answers requests:
//   app → page   {v:1, type:'extract', id, base64}          read the PDF's text items, fonts, images
//                {v:1, type:'show', id, base64, scale?}     draw every page into canvases (exact preview)
//   page → app   {v:1, type:'ready', reader}                pdf.js loaded
//                {v:1, type:'extracted', id, ms, result}    RawExtraction
//                {v:1, type:'ack', id}                        request received (the app resends without it)
//                {v:1, type:'shown', id, pages}
//                {v:1, type:'error', id|null, message}
// The app compares `result` with compare.ts; a missing answer within 10 s = "Could not read back" (SPEC §10, P5).
import { PDFJS_EXTRACT_SOURCE, type RawExtraction } from './pdfjs-extract';

export const HARNESS_VERSION = 1;

export type HarnessRequest =
  | { v: 1; type: 'extract'; id: string; base64: string }
  | { v: 1; type: 'show'; id: string; base64: string; scale?: number };

export type HarnessMessage =
  | { v: 1; type: 'ready'; reader: string }
  | { v: 1; type: 'extracted'; id: string; ms: number; result: RawExtraction }
  | { v: 1; type: 'shown'; id: string; pages: number }
  | { v: 1; type: 'ack'; id: string }
  | { v: 1; type: 'error'; id: string | null; message: string };

export function encodeRequest(request: HarnessRequest): string {
  return JSON.stringify(request);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function isExtraction(x: unknown): x is RawExtraction {
  return (
    isObj(x) &&
    typeof x.reader === 'string' &&
    typeof x.numPages === 'number' &&
    Array.isArray(x.fonts) &&
    Array.isArray(x.pages) &&
    x.pages.every((p) => isObj(p) && typeof p.width === 'number' && typeof p.height === 'number' && typeof p.images === 'number' && Array.isArray(p.items))
  );
}

/** Parses a message from the page; anything malformed → null (ignored by the bridge). */
export function decodeHarnessMessage(data: string): HarnessMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObj(m) || m.v !== HARNESS_VERSION) return null;
  switch (m.type) {
    case 'ready':
      return typeof m.reader === 'string' ? { v: 1, type: 'ready', reader: m.reader } : null;
    case 'extracted':
      return typeof m.id === 'string' && typeof m.ms === 'number' && isExtraction(m.result)
        ? { v: 1, type: 'extracted', id: m.id, ms: m.ms, result: m.result }
        : null;
    case 'ack':
      return typeof m.id === 'string' ? { v: 1, type: 'ack', id: m.id } : null;
    case 'shown':
      return typeof m.id === 'string' && typeof m.pages === 'number' ? { v: 1, type: 'shown', id: m.id, pages: m.pages } : null;
    case 'error':
      return (typeof m.id === 'string' || m.id === null) && typeof m.message === 'string'
        ? { v: 1, type: 'error', id: m.id, message: m.message }
        : null;
    default:
      return null;
  }
}

/**
 * WKWebView (iOS 26.5) has no async iterator on ReadableStream, and pdf.js's getTextContent reads its text stream with
 * `for await` ("undefined is not a function", found on the simulator in P5, D71). Installed on the page and at the top of
 * the worker blob; a no-op where the browser has it (Android WebView).
 */
export const STREAM_POLYFILL = `if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    var reader = this.getReader();
    try { for (;;) { var r = await reader.read(); if (r.done) return; yield r.value; } } finally { reader.releaseLock(); }
  };
  if (!ReadableStream.prototype.values) ReadableStream.prototype.values = ReadableStream.prototype[Symbol.asyncIterator];
}`;

/** The page's own script (also run by the protocol test with a fake pdf.js as `window.__pdfjsLib`). */
export const HARNESS_SCRIPT = `(function () {
  ${STREAM_POLYFILL}
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var lib = null;
  var seen = {};
  var extractPdf = ${PDFJS_EXTRACT_SOURCE};
  function bytes(b64) {
    var bin = atob(b64); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function blobUrl(id, prefix) {
    return URL.createObjectURL(new Blob([(prefix || '') + document.getElementById(id).textContent], { type: 'text/javascript' }));
  }
  var shared = null;
  // Diagnostics only (P5, D71): where a read-back stops when the page stalls. The app ignores these messages.
  function trace(step) { post({ v: 1, type: 'trace', step: step, t: Date.now() }); }
  async function load() {
    if (window.__pdfjsLib) lib = window.__pdfjsLib;
    else {
      lib = await import(blobUrl('pdfjs-src'));
      var workerUrl = blobUrl('pdfjs-worker-src', ${JSON.stringify(STREAM_POLYFILL + '\n')});
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      // One pdf.js worker for every document: starting and ending a worker per read-back made WKWebView hang now and
      // then (P5, D71). PDFWorker falls back to the main thread by itself where a worker cannot start; a worker
      // passed to getDocument is not destroyed with the document.
      shared = new lib.PDFWorker({ name: 'harness' });
      await shared.promise;
      var base = lib;
      lib = Object.assign({}, base, {
        __trace: trace,
        getDocument: function (opts) {
          var task = base.getDocument(Object.assign({ worker: shared }, opts));
          trace('document requested');
          task.promise.then(function () { trace('document open'); }, function (e) { trace('document failed ' + e); });
          return task;
        },
      });
    }
    // Warm-up (D71): WKWebView sometimes hangs on the FIRST getTextContent of a fresh page. Reading a small real PDF
    // here moves that hang to load time, where the app replaces the page before a user's PDF is sent to it.
    var warm = document.getElementById('warmup');
    if (warm && warm.textContent) {
      var t0 = Date.now();
      var done = await Promise.race([
        extractPdf(lib, bytes(warm.textContent)).then(function () { return true; }),
        new Promise(function (r) { setTimeout(function () { r(false); }, 4000); }),
      ]);
      if (!done) throw new Error('warm-up read-back stalled');
      trace('warm-up ' + (Date.now() - t0) + ' ms');
    }
    post({ v: 1, type: 'ready', reader: 'pdf.js ' + lib.version, worker: shared && typeof Worker !== 'undefined' && shared.port instanceof Worker ? 'worker' : 'main thread' });
  }
  async function show(req) {
    var task = lib.getDocument({ data: bytes(req.base64), isEvalSupported: false });
    var doc = await task.promise;
    var box = document.getElementById('pages');
    box.textContent = '';
    for (var n = 1; n <= doc.numPages; n++) {
      var page = await doc.getPage(n);
      // Device pixels capped at 2× (review finding 20: 3× on an iPhone is ≈ 18 MB of canvas per A4 page).
      var view = page.getViewport({ scale: (req.scale || 1) * Math.min(2, window.devicePixelRatio || 1) });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(view.width); canvas.height = Math.floor(view.height);
      canvas.style.width = '100%';
      box.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
    }
    var pages = doc.numPages;
    await task.destroy();
    return pages;
  }
  async function handle(raw) {
    var req;
    try { req = JSON.parse(raw); } catch (e) { return; }
    if (!req || req.v !== 1 || typeof req.id !== 'string') return;
    // A resent request (no ack seen by the app) is answered once only.
    if (seen[req.id]) return;
    seen[req.id] = true;
    post({ v: 1, type: 'ack', id: req.id });
    try {
      if (!lib) throw new Error('pdf.js not loaded');
      if (typeof req.base64 !== 'string') throw new Error('no PDF data');
      if (req.type === 'extract') {
        var t0 = Date.now();
        trace('extract ' + req.id);
        var result = await extractPdf(lib, bytes(req.base64));
        trace('extracted ' + req.id);
        post({ v: 1, type: 'extracted', id: req.id, ms: Date.now() - t0, result: result });
      } else if (req.type === 'show') {
        post({ v: 1, type: 'shown', id: req.id, pages: await show(req) });
      } else throw new Error('unknown request ' + req.type);
    } catch (e) {
      post({ v: 1, type: 'error', id: req.id, message: String((e && e.message) || e) });
    }
  }
  window.addEventListener('message', function (e) { handle(e.data); });
  document.addEventListener('message', function (e) { handle(e.data); });
  window.__harness = { handle: handle };
  load().catch(function (e) { post({ v: 1, type: 'error', id: null, message: 'load: ' + String((e && e.message) || e) }); });
})();`;

/** Inside a <script> element only "</script" ends it; "<\/script" means the same in JavaScript. */
const scriptSafe = (source: string) => source.replace(/<\/(script)/gi, '<\\/$1');

/** The full page. `pdfjsSource`/`workerSource` = assets/pdfjs/pdf.min.mjs and pdf.worker.min.mjs as text (P5 glue). */
export function buildHarnessHtml(pdfjsSource: string, workerSource: string, warmupBase64 = ''): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; ` +
    `worker-src blob:; img-src data: blob:; style-src 'unsafe-inline'; connect-src blob: data:">` +
    '<style>body{margin:0;background:#888;}#pages canvas{display:block;margin:0 auto 8px;background:#fff;}</style></head><body>' +
    '<div id="pages"></div>' +
    `<script type="text/plain" id="pdfjs-src">${scriptSafe(pdfjsSource)}</script>` +
    `<script type="text/plain" id="pdfjs-worker-src">${scriptSafe(workerSource)}</script>` +
    (warmupBase64 ? `<script type="text/plain" id="warmup">${warmupBase64.replace(/[^A-Za-z0-9+/=]/g, '')}</script>` : '') +
    `<script id="harness">${scriptSafe(HARNESS_SCRIPT)}</script>` +
    '</body></html>'
  );
}
