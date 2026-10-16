import { FIXTURES, modelFor } from '@/render/__fixtures__/models';

import { exportFilePath, historyItem, isSafeExportPath, parseReadback, parseSnapshot, readbackJson, readbackPassed, resolveExportFile, snapshotJson, type HistoryRecord } from './history';

const model = modelFor(FIXTURES['sample-de'].draft, 'de', { template: 'lebenslauf' });
const record = (patch: Partial<HistoryRecord>): HistoryRecord => ({
  id: 1, kind: 'resume_pdf', fileName: 'a.pdf', filePath: 'exports/v1/1/a.pdf', pageCount: 1, bytes: 1000,
  snapshotJson: snapshotJson({ v: 1, kind: 'resume_pdf', model }), readbackJson: null, createdAt: 5, ...patch,
});

it('snapshots round-trip; foreign or broken JSON is rejected', () => {
  expect(parseSnapshot(snapshotJson({ v: 1, kind: 'resume_pdf', model }))).toEqual({ v: 1, kind: 'resume_pdf', model });
  for (const bad of ['', '{', '{"v":2,"kind":"resume_pdf","model":{"sections":[]}}', '{"v":1,"kind":"cover_pdf"}', '[]']) expect(parseSnapshot(bad)).toBeNull();
});

it('read-back JSON: result, unavailable, nothing', () => {
  expect(parseReadback(readbackJson({ unavailable: true, reason: 'timeout' }))).toEqual({ unavailable: true, reason: 'timeout' });
  expect(parseReadback(null)).toBeNull();
  expect(parseReadback('{"pass":true}')).toBeNull();
});

it('history rows: read-back state and how a re-share works', () => {
  const pass = readbackJson({ pass: true, reader: 'pdf.js 6.3.289', words: { expected: 1, found: 1 }, lines: { total: 1, inOrder: 1, moved: [], split: [] } } as never);
  expect(historyItem(record({ readbackJson: pass }))).toMatchObject({ readback: 'pass', reshare: 'file' });
  expect(historyItem(record({ readbackJson: pass.replace('"pass":true', '"pass":false') }))).toMatchObject({ readback: 'fail' });
  const type3 = JSON.stringify({ ...JSON.parse(pass), fontsEmbedded: false });
  expect(historyItem(record({ readbackJson: type3 }))).toMatchObject({ readback: 'passType3' }); // D93
  // D96: a re-made file's own read-back carries remadeAt
  expect(historyItem(record({ readbackJson: JSON.stringify({ ...JSON.parse(pass), remadeAt: 5 }) }))).toMatchObject({ readback: 'pass', remadeAt: 5 });
  expect(historyItem(record({ readbackJson: '{"unavailable":true,"remadeAt":6}' }))).toMatchObject({ readback: 'unavailable', remadeAt: 6 });
  expect(historyItem(record({ readbackJson: pass })).remadeAt).toBeNull();
  expect(historyItem(record({ readbackJson: '{"unavailable":true}' }))).toMatchObject({ readback: 'unavailable' });
  expect(historyItem(record({ filePath: null }))).toMatchObject({ readback: 'notChecked', reshare: 'rerender' });
  expect(historyItem(record({ filePath: null, snapshotJson: '{}' }))).toMatchObject({ reshare: 'none' });
});

it('export paths: one folder per export, the file keeps its name', () => {
  expect(exportFilePath({ versionId: 3 }, 1759312800000, 'Lena-Mueller-Oezdemir-Lebenslauf.pdf')).toBe('exports/v3/1759312800000/Lena-Mueller-Oezdemir-Lebenslauf.pdf');
  expect(exportFilePath({ coverLetterId: 2 }, 7, 'x.pdf')).toBe('exports/c2/7/x.pdf');
});

it('D59: only paths inside the app\'s own export folder are safe to open or delete', () => {
  expect(isSafeExportPath(exportFilePath({ versionId: 3 }, 17, 'Lena-Lebenslauf.pdf'), { versionId: 3, coverLetterId: null })).toBe(true);
  expect(isSafeExportPath('exports/c2/7/x.pdf', { versionId: null, coverLetterId: 2 })).toBe(true);
  expect(isSafeExportPath('exports/c2/7/x.pdf', { versionId: 2, coverLetterId: null })).toBe(false);
  for (const bad of ['../../Library/LocalDatabase/app.db', '/etc/hosts', 'exports/v1/1/../../app.db', 'exports/v1/1/..', 'exports/v1/..',
    'exports/v0/1/a.pdf', 'exports/v1/x/a.pdf', 'exports\\v1\\1\\a.pdf', 'exports/v1/1/a\u0000.pdf', 'file:///etc/hosts', 'photos/me.jpg', 'exports/v1/1/'])
    expect([bad, isSafeExportPath(bad)]).toEqual([bad, false]);
  expect(resolveExportFile('file:///doc/', 'exports/v1/1/a.pdf')).toBe('file:///doc/exports/v1/1/a.pdf');
  expect(resolveExportFile('file:///doc', 'exports/v1/1/a.pdf')).toBe('file:///doc/exports/v1/1/a.pdf');
  expect(resolveExportFile('file:///doc/', '../app.db')).toBeNull();
  expect(resolveExportFile('file:///doc/', null)).toBeNull();
});

it('D92: only a passed read-back opens the share sheet at once', () => {
  const pass = { pass: true, reader: 'pdf.js', words: { expected: 1, found: 1 }, lines: { total: 1, inOrder: 1, moved: [], split: [] } } as never;
  expect(readbackPassed(pass)).toBe(true);
  expect(readbackPassed({ ...(pass as object), pass: false } as never)).toBe(false);
  expect(readbackPassed({ unavailable: true, reason: 'timeout' })).toBe(false);
  expect(readbackPassed(null)).toBe(false);
});
