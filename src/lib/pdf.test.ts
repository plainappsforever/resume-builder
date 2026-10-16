// The pure parts of the PDF glue (D70, D72): print HTML per engine, the preview's look, page counting, fit overflow.
import { modelFor, FIXTURES } from '@/render/__fixtures__/models';
import { renderHtml } from '@/render';

import { countPdfPages, defaultTuning, overflowPt, previewHtml, printHtml, PRINT_TUNING, ANDROID_SANS_MIN_LINE_HEIGHT, systemFontStack } from './pdf';

const doc = (template: 'modern' | 'classic', paper: 'a4' | 'letter' = 'a4') =>
  renderHtml(modelFor(FIXTURES['sample-en'].draft, 'en', { template, style: { paper } }));

it('iOS: engine margins (no CSS page margin) and a body exactly as wide as the content box; web fonts kept', () => {
  const d = doc('modern');
  const html = printHtml(d, PRINT_TUNING.ios);
  expect(html).toContain('<style>@page{margin:0}body{width:174mm}</style></head>'); // 210 − 2 × 18 mm
  expect(html).toContain("font-family:'Inter', Arial, sans-serif");
  expect(previewHtml(d, PRINT_TUNING.ios)).toBe(d.html); // the look is the renderer's own
});

it('Android: CSS page geometry, phone fonts with the line-height floor for sans, serif keeps its line height', () => {
  const sans = doc('modern');
  const html = printHtml(sans, PRINT_TUNING.android);
  expect(html).toContain(`body{font-family:source-sans-pro, sans-serif;line-height:${ANDROID_SANS_MIN_LINE_HEIGHT}}`);
  expect(ANDROID_SANS_MIN_LINE_HEIGHT).toBe(1.5); // D93: 33/33 with Roboto (Type 3) on both readers
  expect(html).not.toContain('@page{margin:0}');
  expect(previewHtml(sans, PRINT_TUNING.android)).toContain('font-family:source-sans-pro, sans-serif');
  const serif = doc('classic');
  expect(printHtml(serif, PRINT_TUNING.android)).toContain(`body{font-family:serif;line-height:${serif.style.lineHeight}}`);
  expect(systemFontStack('eb-garamond')).toBe('serif');
});

it('defaultTuning copies (a debug override never changes the shared table)', () => {
  const t = defaultTuning('android');
  t.a4HeightPad = 9;
  expect(PRINT_TUNING.android.a4HeightPad).toBe(1);
});

it('counts page objects, not the page tree', () => {
  expect(countPdfPages('<</Type /Pages /Count 2>> <</Type /Page /Parent 1 0 R>> <</Type/Page>>')).toBe(2);
  expect(countPdfPages('nothing')).toBe(0);
});

it('overflow beyond one page from the last page’s lowest text', () => {
  const page = doc('modern').page; // A4, 18 mm margins
  const item = (y: number) => ({ s: 'x', x: 51, y, w: 10, h: 10, e: false });
  const raw = (pages: number, lowest: number) => ({
    reader: 'pdf.js',
    numPages: pages,
    fonts: [],
    pages: Array.from({ length: pages }, (_, i) => ({ width: 595, height: 842, images: 0, items: i === pages - 1 ? [item(790), item(lowest)] : [item(100)] })),
  });
  expect(overflowPt(raw(1, 100), page)).toBe(0);
  // used on page 2 = 842 − 51.02 − (700 − 2.5)
  expect(overflowPt(raw(2, 700), page)).toBeCloseTo(842 - 51.02 - 697.5, 1);
  expect(overflowPt(raw(3, 700), page)).toBeCloseTo(842 - 2 * 51.02 + (842 - 51.02 - 697.5), 1);
});
