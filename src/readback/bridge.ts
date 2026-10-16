// P5 glue between the app and the WebView harness (harness-page.ts, D15/D51): request ids, the "ready" handshake,
// timeouts, and the read-back of one PDF → SPEC §5.7 result. No React here (the WebView host is
// src/components/pdf-harness.tsx), so the protocol and the timeout rule are tested in Jest.
// SPEC §10: the reader fails or does not answer within 10 s → "Could not read back" — never a pass.
import type { ExpectedLine } from '@/render/expected-lines';
import type { StoredReadback } from '@/data/history';

import { compareReadback, readInputFromPdfjs } from './compare';
import { decodeHarnessMessage, encodeRequest, type HarnessRequest } from './harness-page';
import type { RawExtraction } from './pdfjs-extract';

/** SPEC §10: a read-back request that has no answer after this long is "Could not read back". */
export const READBACK_TIMEOUT_MS = 10_000;
/** Loading pdf.js (1.8 MB of script) into a fresh WebView; measured in P5 (D71). */
export const LOAD_TIMEOUT_MS = 20_000;

export class HarnessError extends Error {}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  kind: string;
  acked: boolean;
  resend: ReturnType<typeof setTimeout> | null;
};

/** A request without an "ack" from the page after this long is sent again (WKWebView sometimes drops one, D71). */
export const ACK_RESEND_MS = 1500;

export class HarnessClient {
  private pending = new Map<string, Pending>();
  private seq = 0;
  private readyResolve!: (reader: string) => void;
  private readyReject!: (e: Error) => void;
  private readyTimer: ReturnType<typeof setTimeout> | null;
  private disposed = false;
  /** Resolves with the reader name ("pdf.js 6.3.289") once the page loaded pdf.js. */
  readonly ready: Promise<string>;
  readonly createdAt: number;
  /** Milliseconds from creation to "ready" (null until then). */
  loadMs: number | null = null;
  /** Diagnostics: acks received and requests sent again for lack of one. */
  acks = 0;
  resends = 0;
  reader: string | null = null;

  private static count = 0;
  /** Distinct per client (the WebView host re-mounts its page with a new client after a stall). */
  readonly serial = ++HarnessClient.count;
  private onStuck: (() => void) | null = null;
  private stuck = false;

  constructor(
    private send: (json: string) => void,
    private readonly timeoutMs = READBACK_TIMEOUT_MS,
    loadTimeoutMs = LOAD_TIMEOUT_MS,
    private readonly now: () => number = Date.now
  ) {
    this.createdAt = now();
    this.ready = new Promise<string>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.ready.catch(() => undefined); // observed by every request; never an unhandled rejection
    this.readyTimer = setTimeout(() => {
      this.readyReject(new HarnessError(`pdf.js did not load within ${loadTimeoutMs / 1000} s`));
      this.markStuck();
    }, loadTimeoutMs);
  }

  /** Called once when a request or the load times out: the page is stuck and should be replaced. */
  whenStuck(fn: () => void) {
    this.onStuck = fn;
  }

  /** True after a timeout: this page no longer counts as a working reader. */
  get isStuck(): boolean {
    return this.stuck;
  }

  private markStuck() {
    if (this.stuck || this.disposed) return;
    this.stuck = true;
    this.onStuck?.();
  }

  /** Where requests go (the WebView's postMessage, set when it mounts). */
  connect(send: (json: string) => void) {
    this.send = send;
  }

  /** Feed every `onMessage` string of the WebView here. */
  onMessage(data: string) {
    const m = decodeHarnessMessage(data);
    if (!m) return;
    if (m.type === 'ready') {
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
      this.loadMs = this.now() - this.createdAt;
      this.reader = m.reader;
      this.readyResolve(m.reader);
      return;
    }
    if (m.type === 'error' && m.id === null) {
      // The page could not load pdf.js or its warm-up stalled: it is replaced (D71).
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
      this.readyReject(new HarnessError(m.message));
      this.markStuck();
      return;
    }
    if (m.id === null) return;
    const p = this.pending.get(m.id);
    if (!p) return; // late answer after a timeout: ignored
    if (m.type === 'ack') {
      p.acked = true;
      this.acks++;
      if (p.resend) clearTimeout(p.resend);
      return;
    }
    this.pending.delete(m.id);
    clearTimeout(p.timer);
    if (p.resend) clearTimeout(p.resend);
    if (m.type === 'error') p.reject(new HarnessError(m.message));
    else if (m.type === 'extracted' && p.kind === 'extract') p.resolve({ raw: m.result, ms: m.ms });
    else if (m.type === 'shown' && p.kind === 'show') p.resolve(m.pages);
    else p.reject(new HarnessError(`unexpected answer ${m.type}`));
  }

  private async request<T>(req: Omit<HarnessRequest, 'id' | 'v'> & { type: HarnessRequest['type'] }): Promise<T> {
    if (this.disposed) throw new HarnessError('reader closed');
    await this.ready;
    if (this.disposed) throw new HarnessError('reader closed');
    const id = `r${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const json = encodeRequest({ ...req, v: 1, id } as HarnessRequest);
      const timer = setTimeout(() => {
        const p = this.pending.get(id);
        if (p?.resend) clearTimeout(p.resend);
        this.pending.delete(id);
        reject(new HarnessError(`no answer within ${this.timeoutMs / 1000} s${p && !p.acked ? ' (request never arrived)' : ''}`));
        this.markStuck();
      }, this.timeoutMs);
      const entry: Pending = { resolve: resolve as (v: unknown) => void, reject, timer, kind: req.type, acked: false, resend: null };
      const resend = () => {
        if (entry.acked || !this.pending.has(id)) return;
        this.resends++;
        this.send(json);
        entry.resend = setTimeout(resend, ACK_RESEND_MS);
      };
      entry.resend = setTimeout(resend, ACK_RESEND_MS);
      this.pending.set(id, entry);
      this.send(json);
    });
  }

  /** pdf.js text items, fonts and images of a PDF (base64). */
  extract(base64: string): Promise<{ raw: RawExtraction; ms: number }> {
    return this.request({ type: 'extract', base64 });
  }

  /** Draws every page of the PDF into the page (exact preview); resolves with the page count. */
  show(base64: string, scale?: number): Promise<number> {
    return this.request({ type: 'show', base64, ...(scale ? { scale } : {}) });
  }

  dispose() {
    this.disposed = true;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyReject(new HarnessError('reader closed'));
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      if (p.resend) clearTimeout(p.resend);
      p.reject(new HarnessError('reader closed'));
      this.pending.delete(id);
    }
  }
}

export type ReadbackRun = {
  result: StoredReadback;
  /** Wall time of the whole read-back (send → compared), and pdf.js's own time inside the page. */
  ms: number;
  pdfjsMs: number | null;
  raw: RawExtraction | null;
};

/** Reads one PDF back and compares it with what was rendered. Any failure → `{unavailable}` (not checked, never a pass). */
export async function readBackPdf(
  client: HarnessClient,
  base64: string,
  bytes: number,
  expected: readonly ExpectedLine[],
  now: () => number = Date.now
): Promise<ReadbackRun> {
  const started = now();
  try {
    const { raw, ms } = await client.extract(base64);
    const result = compareReadback(expected, readInputFromPdfjs(raw, bytes), now());
    return { result, ms: now() - started, pdfjsMs: ms, raw };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { result: { unavailable: true, reason }, ms: now() - started, pdfjsMs: null, raw: null };
  }
}

/** Attempts on fresh pages when a page stalls (each stalled page is replaced, D71). */
export const READBACK_ATTEMPTS = 3;

/**
 * The read-back as the app runs it: on the current reader page, and again on a fresh page when that page stalled
 * (WKWebView sometimes stops answering, D71), at most READBACK_ATTEMPTS times. `current` returns the host's client
 * at the time of the call.
 */
export async function readBackWithRetry(
  current: () => HarnessClient | null,
  base64: string,
  bytes: number,
  expected: readonly ExpectedLine[],
  now: () => number = Date.now
): Promise<ReadbackRun & { attempts: number }> {
  let client = current();
  if (!client) return { result: { unavailable: true, reason: 'reader not available' }, ms: 0, pdfjsMs: null, raw: null, attempts: 0 };
  let total = 0;
  for (let attempt = 1; ; attempt++) {
    const run = await readBackPdf(client, base64, bytes, expected, now);
    total += run.ms;
    if (!('unavailable' in run.result) || !client.isStuck || attempt >= READBACK_ATTEMPTS) return { ...run, ms: total, attempts: attempt };
    // Wait for the host to mount a fresh page (it does so when a page is stuck), then try again.
    const stuck: HarnessClient = client;
    const started = now();
    let next: HarnessClient | null = current();
    while ((!next || next === stuck) && now() - started < 2000) {
      await new Promise((r) => setTimeout(r, 50));
      next = current();
    }
    if (!next || next === stuck) return { ...run, ms: total, attempts: attempt };
    client = next;
  }
}
