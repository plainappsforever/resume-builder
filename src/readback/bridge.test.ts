/**
 * @jest-environment node
 */
// The app side of the harness protocol (P5): ready handshake, ack + resend, 10 s timeout → "Could not read back"
// (never a pass, SPEC §10), a stalled page is reported once and replaced, the retry on a fresh page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACK_RESEND_MS, HarnessClient, readBackPdf, readBackWithRetry, READBACK_TIMEOUT_MS } from './bridge';
import type { RawExtraction } from './pdfjs-extract';

const FIX = join(__dirname, '__fixtures__');
const fixture = JSON.parse(readFileSync(join(FIX, 'pass-modern-sample-en-a4.json'), 'utf8'));
const expected = fixture.expectedLines;
const raw: RawExtraction = fixture.pdfjs;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** A client whose page answers through `page(request)`; returns the sent requests. */
function setup(page: (req: { id: string; type: string }, client: HarnessClient) => void) {
  const sent: { id: string; type: string }[] = [];
  const client = new HarnessClient((json) => {
    const req = JSON.parse(json);
    sent.push(req);
    page(req, client);
  });
  client.onMessage(JSON.stringify({ v: 1, type: 'ready', reader: 'pdf.js 6.3.289' }));
  return { client, sent };
}

const answer = (client: HarnessClient, msg: object) => client.onMessage(JSON.stringify({ v: 1, ...msg }));

it('fixture sanity: the stored extraction is a RawExtraction', () => {
  expect(raw.reader).toBe('pdf.js 6.3.289');
  expect(raw.pages.length).toBeGreaterThan(0);
});

it('reads back through the page and compares (pass)', async () => {
  const { client } = setup((req, c) => {
    answer(c, { type: 'ack', id: req.id });
    answer(c, { type: 'extracted', id: req.id, ms: 70, result: raw });
  });
  const run = await readBackPdf(client, 'AAAA', 19_000, expected);
  expect('unavailable' in run.result).toBe(false);
  expect(run.result).toMatchObject({ pass: true, reader: 'pdf.js 6.3.289' });
  expect(run.pdfjsMs).toBe(70);
});

it('no answer within 10 s → unavailable (never a pass), the page is reported stuck once', async () => {
  const stuck = jest.fn();
  const { client } = setup((req, c) => answer(c, { type: 'ack', id: req.id }));
  client.whenStuck(stuck);
  const pending = readBackPdf(client, 'AAAA', 19_000, expected);
  await jest.advanceTimersByTimeAsync(READBACK_TIMEOUT_MS + 1);
  const run = await pending;
  expect(run.result).toEqual({ unavailable: true, reason: 'no answer within 10 s' });
  expect(client.isStuck).toBe(true);
  expect(stuck).toHaveBeenCalledTimes(1);
});

it('a request without an ack is sent again; the late answer counts once', async () => {
  let deliveries = 0;
  const { client, sent } = setup((req, c) => {
    deliveries++;
    if (deliveries === 1) return; // the first postMessage is lost
    answer(c, { type: 'ack', id: req.id });
    answer(c, { type: 'extracted', id: req.id, ms: 5, result: raw });
  });
  const pending = client.extract('AAAA');
  await jest.advanceTimersByTimeAsync(ACK_RESEND_MS + 1);
  await expect(pending).resolves.toMatchObject({ ms: 5 });
  expect(sent.map((r) => r.id)).toEqual(['r1', 'r1']);
  expect(client.resends).toBe(1);
});

it('a request never acknowledged says so in the reason', async () => {
  const { client } = setup(() => undefined);
  const pending = readBackPdf(client, 'AAAA', 1, expected);
  await jest.advanceTimersByTimeAsync(READBACK_TIMEOUT_MS + 1);
  expect((await pending).result).toEqual({ unavailable: true, reason: 'no answer within 10 s (request never arrived)' });
});

it('reader errors and a page that never loads are "could not read back"', async () => {
  const { client } = setup((req, c) => answer(c, { type: 'error', id: req.id, message: 'Invalid PDF structure.' }));
  expect((await readBackPdf(client, 'AAAA', 1, expected)).result).toEqual({ unavailable: true, reason: 'Invalid PDF structure.' });

  const silent = new HarnessClient(() => undefined, READBACK_TIMEOUT_MS, 20_000);
  const pending = readBackPdf(silent, 'AAAA', 1, expected);
  await jest.advanceTimersByTimeAsync(20_001);
  expect((await pending).result).toEqual({ unavailable: true, reason: 'pdf.js did not load within 20 s' });
  expect(silent.isStuck).toBe(true);
});

it('retries once on a fresh page after a stall', async () => {
  const first = setup((req, c) => answer(c, { type: 'ack', id: req.id })).client; // hangs
  const second = setup((req, c) => answer(c, { type: 'extracted', id: req.id, ms: 9, result: raw })).client;
  let current: HarnessClient = first;
  first.whenStuck(() => (current = second));
  const pending = readBackWithRetry(() => current, 'AAAA', 19_000, expected);
  await jest.advanceTimersByTimeAsync(READBACK_TIMEOUT_MS + 100);
  const run = await pending;
  expect(run.attempts).toBe(2);
  expect(run.result).toMatchObject({ pass: true });
});

it('a disposed client rejects pending and new requests', async () => {
  const { client } = setup(() => undefined);
  const pending = client.extract('AAAA');
  client.dispose();
  await expect(pending).rejects.toThrow('reader closed');
  await expect(client.extract('AAAA')).rejects.toThrow('reader closed');
});

it('a page whose load or warm-up fails is replaced; up to 3 attempts in all', async () => {
  const dead = () => {
    const c = new HarnessClient(() => undefined);
    c.onMessage(JSON.stringify({ v: 1, type: 'error', id: null, message: 'load: warm-up read-back stalled' }));
    return c;
  };
  const pages = [dead(), dead(), setup((req, c) => answer(c, { type: 'extracted', id: req.id, ms: 9, result: raw })).client];
  expect(pages[0].isStuck).toBe(true);
  let i = 0;
  const run = await readBackWithRetry(() => pages[Math.min(i++, 2)], 'AAAA', 19_000, expected);
  expect(run.attempts).toBe(3);
  expect(run.result).toMatchObject({ pass: true });
  const allDead = [dead(), dead(), dead(), dead()];
  let j = 0;
  const failed = await readBackWithRetry(() => allDead[Math.min(j++, 3)], 'AAAA', 1, expected);
  expect(failed).toMatchObject({ attempts: 3, result: { unavailable: true } });
});
