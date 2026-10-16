/**
 * @jest-environment node
 */
import { runEngineVectors, runLanguageProbes } from './engine-vectors';

it('the shared vector runner finds no mismatch in Node (so a mismatch on a phone is the phone’s)', () => {
  const report = runEngineVectors();
  expect(report.mismatches).toEqual([]);
  expect(report.tokenizer).toBeGreaterThan(80);
  expect(report.extraction).toBeGreaterThan(10);
  expect(report.matching).toBeGreaterThan(500);
});

it('the language probes pass in Node (required ones)', () => {
  const failed = runLanguageProbes().filter((p) => p.required && !p.ok);
  expect(failed).toEqual([]);
});
