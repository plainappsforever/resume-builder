// The pdf.js extraction routine, as SOURCE TEXT, so exactly the same code runs in the app's WebView harness
// (harness-page.ts, P5) and in the Node referee (scripts/pdfjs-extract.mjs). Hermes keeps no function source, so it
// cannot be `fn.toString()`. This file has no imports: Node loads it directly (type stripping) for the referee.
//
// Output (`RawExtraction`): per page the text items in the order pdf.js returns them (content-stream order — the
// order a parser reads; never re-sorted), with position and size, plus font facts and an image count.

export type RawItem = {
  /** Text. */
  s: string;
  /** Baseline origin x/y in PDF points (y grows upwards), width, font height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** pdf.js "end of line" flag. */
  e: boolean;
};

export type RawFont = { name: string; embedded: boolean; type3: boolean };

export type RawPage = { width: number; height: number; items: RawItem[]; images: number };

export type RawExtraction = { reader: string; numPages: number; pages: RawPage[]; fonts: RawFont[] };

/**
 * `async (pdfjsLib, data: Uint8Array) => RawExtraction`. Uses only the public pdf.js API (getDocument, getPage,
 * getTextContent, getOperatorList, commonObjs). No eval, no font loading, no network.
 */
export const PDFJS_EXTRACT_SOURCE = `async function extractPdf(pdfjsLib, data) {
  const r = (v) => Math.round(v * 100) / 100;
  const trace = pdfjsLib.__trace || (() => {});
  const task = pdfjsLib.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
    stopAtErrors: false, verbosity: 0 });
  const doc = await task.promise;
  const fonts = {};
  const pages = [];
  const imageOps = new Set([pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintInlineImageXObject,
    pdfjsLib.OPS.paintImageMaskXObject, pdfjsLib.OPS.paintImageXObjectRepeat].filter((v) => v !== undefined));
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      trace('page ' + n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      trace('text ' + n);
      const items = [];
      const fontNames = new Set();
      for (const it of content.items) {
        if (typeof it.str !== 'string') continue;
        items.push({ s: it.str, x: r(it.transform[4]), y: r(it.transform[5]), w: r(it.width), h: r(it.height), e: !!it.hasEOL });
        if (it.fontName) fontNames.add(it.fontName);
      }
      const ops = await page.getOperatorList();
      trace('ops ' + n);
      let images = 0;
      for (const fn of ops.fnArray) if (imageOps.has(fn)) images++;
      for (const id of fontNames) {
        if (fonts[id]) continue;
        let name = (content.styles[id] && content.styles[id].fontFamily) || id;
        let embedded = false;
        let type3 = false;
        try {
          const f = page.commonObjs.get(id);
          if (f) { name = f.name || name; embedded = !f.missingFile; type3 = !!f.isType3Font; }
        } catch (e) { /* font object not resolved: reported as not embedded */ }
        fonts[id] = { name: String(name), embedded, type3 };
      }
      pages.push({ width: r(view.width), height: r(view.height), items, images });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { reader: 'pdf.js ' + pdfjsLib.version, numPages: pages.length, pages, fonts: Object.values(fonts) };
}`;
