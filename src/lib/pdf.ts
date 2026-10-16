// PDF glue (V1_PLAN "Rendering and PDF", P5): the renderer's HTML → expo-print → a file at its final place.
// Page size = the paper in points; the print engines need a per-platform zoom so that 1 CSS pt prints as 1 PDF pt
// (D70, measured on the devices; invoice-maker D67 found the same shrink on both engines).
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import { Platform } from 'react-native';

import type { RawExtraction } from '@/readback/pdfjs-extract';
import type { RenderResult } from '@/render';
import type { PageSetup } from '@/render/model';
import type { FontId } from '@/engine/style';

/**
 * A PDF takes 0.03–0.5 s on the simulator/emulator; now and then Android's print job never settles (2 of 66 in the
 * P5 gate, invoice-maker D72). After this long the job counts as stuck and is started once more (D70).
 */
export const PDF_TIMEOUT_MS = 20_000;

/** Where the page margin comes from: CSS `@page` (Chromium honours it) or expo-print's iOS `margins` (printable rect). */
export type MarginMode = 'css' | 'engine';

/**
 * Per print engine (D70, measured with the debug PDF gate on the simulator and the emulator):
 * - Android (Chromium): CSS `@page` size + margin and CSS units print exactly (10 pt text → 9.99 pt, margin 51.0 pt).
 * - iOS (WebKit via UIPrintPageRenderer): `@page` margins are ignored, and flow content is laid out 1.25× wider than
 *   the printable width and shrunk to fit, so 1 CSS px printed as 0.8 pt (10 pt → 10.67 pt); `zoom` does not help
 *   because the width follows it. Fix: margins from the engine (printable rect) and a body exactly as wide as the
 *   content box in mm, which WebKit then shrinks to the printable width: 1 CSS px → 0.75 pt, i.e. CSS units exact.
 * - Android fonts (D72): Chromium writes web fonts as Type 3 glyph procedures that Apple PDFKit reads as broken words
 *   (14/66 files); the phone's own families (Roboto / Noto Serif) read cleanly with both readers.
 * `zoom` stays available for experiments (1 = none).
 */
export type PrintTuning = {
  margins: MarginMode;
  bodyWidth: boolean;
  zoom: number;
  /** 'system' = the phone's own font families instead of the embedded web fonts (Android, D72). */
  fonts: 'web' | 'system';
  /** Points added to the A4 page height handed to the engine (Android prints 842 pt as 840.96, D70). */
  a4HeightPad: number;
  /** With system fonts: the sans family stack and the minimum line height of sans documents (D72). */
  systemSans: string;
  systemSansLineHeight: number;
};

const SERIF_FONTS: readonly FontId[] = ['merriweather', 'eb-garamond'];
/** The phone's own families (Android: Source Sans Pro or Roboto / Noto Serif) when the web fonts are not usable (D72). */
export function systemFontStack(font: FontId, sans = 'sans-serif'): string {
  return SERIF_FONTS.includes(font) ? 'serif' : sans;
}
/**
 * Android's sans family for documents (D72): AOSP's static Source Sans Pro is embedded as a real TrueType font (and is
 * the older cut of our Source Sans 3); phones without it fall back to Roboto, which Chromium writes as Type 3.
 */
export const ANDROID_SANS = 'source-sans-pro, sans-serif';
/**
 * Minimum line height of sans documents with the phone's fonts: D47's rule (glyph extent + 0.04 em) for Source Sans
 * (1.424 + 0.04). At Inter's 1.25 Apple PDFKit read the short line "Note: 1,9" before the line above it (D72).
 */
export const SYSTEM_SANS_MIN_LINE_HEIGHT = 1.464;
/**
 * v1.1 (D93, REVIEW_V1 #5): Android uses 1.5 — the measured value at which a phone WITHOUT Source Sans Pro (Roboto,
 * written as Type 3) read 33/33 German documents with both readers (1.464: 31/33, the same short line twice; D72).
 */
export const ANDROID_SANS_MIN_LINE_HEIGHT = 1.5;

export const PRINT_TUNING: Record<'ios' | 'android', PrintTuning> = {
  ios: { margins: 'engine', bodyWidth: true, zoom: 1, fonts: 'web', a4HeightPad: 0, systemSans: 'sans-serif', systemSansLineHeight: SYSTEM_SANS_MIN_LINE_HEIGHT },
  android: { margins: 'css', bodyWidth: false, zoom: 1, fonts: 'system', a4HeightPad: 1, systemSans: ANDROID_SANS, systemSansLineHeight: ANDROID_SANS_MIN_LINE_HEIGHT },
};

export function defaultTuning(os: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android'): PrintTuning {
  return { ...PRINT_TUNING[os] };
}

type DocLike = Pick<RenderResult, 'html' | 'page' | 'font' | 'style'>;

/** What changes the LOOK on this platform (fonts, line height): applied to the PDF and to the live preview alike. */
function lookCss(doc: DocLike, tuning: PrintTuning): string {
  if (tuning.fonts !== 'system') return '';
  const serif = SERIF_FONTS.includes(doc.font);
  const lineHeight = serif ? doc.style.lineHeight : Math.max(doc.style.lineHeight, tuning.systemSansLineHeight);
  return `body{font-family:${systemFontStack(doc.font, tuning.systemSans)};line-height:${lineHeight}}.name{line-height:${lineHeight}}`;
}

const inject = (html: string, css: string) => (css ? html.replace('</head>', `<style>${css}</style></head>`) : html);

/** The live preview's HTML on this platform: the renderer's page with the platform's look (no print geometry). */
export function previewHtml(doc: DocLike, tuning: PrintTuning = defaultTuning()): string {
  return inject(doc.html, lookCss(doc, tuning));
}

/** The print HTML: the renderer's page plus the engine corrections (never used for the live preview). */
export function printHtml(doc: DocLike, tuning: PrintTuning): string {
  const contentMm = Math.round((doc.page.widthMm - 2 * doc.page.marginMm) * 100) / 100;
  return inject(
    doc.html,
    [
      tuning.zoom !== 1 ? `html{zoom:${tuning.zoom}}` : '',
      tuning.margins === 'engine' ? '@page{margin:0}' : '',
      tuning.bodyWidth ? `body{width:${contentMm}mm}` : '',
      lookCss(doc, tuning),
    ].join('')
  );
}

export class TimeoutError extends Error {}

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`${what} took longer than ${Math.round(ms / 1000)} s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Latin-1 view of the file (PDF syntax is ASCII), in chunks so a large file never hits the argument limit. */
export function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  return out;
}

/** Page objects in the file (expo-print's own count is an estimate on Android, invoice-maker D67). 0 = not found. */
export function countPdfPages(text: string): number {
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

export type PdfFile = {
  uri: string;
  /** Pages counted in the file (falls back to expo-print's number when the file has no plain page objects). */
  pages: number;
  /** What expo-print reported. */
  reportedPages: number;
  bytes: number;
  /** Time spent in printToFileAsync. */
  ms: number;
  data: Uint8Array;
};

function ensureParent(file: File) {
  const dir = file.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

/** Prints a rendered document to `dest` (overwritten); a stuck print job is retried once. */
export async function printPdf(doc: DocLike & Pick<RenderResult, 'print'>, dest: File, tuning: PrintTuning = defaultTuning()): Promise<PdfFile> {
  const { width, height, margins } = doc.print;
  const options = {
    html: printHtml(doc, tuning),
    width: Math.round(width),
    height: Math.round(height + (doc.page.paper === 'a4' ? tuning.a4HeightPad : 0)),
    ...(Platform.OS === 'ios'
      ? { margins: tuning.margins === 'engine' ? margins : { top: 0, right: 0, bottom: 0, left: 0 } }
      : { textZoom: 100 }),
  };
  let started = Date.now();
  let out: Print.FilePrintResult;
  try {
    out = await withTimeout(Print.printToFileAsync(options), PDF_TIMEOUT_MS, 'Creating the PDF');
  } catch (e) {
    if (!(e instanceof TimeoutError)) throw e;
    started = Date.now();
    out = await withTimeout(Print.printToFileAsync(options), PDF_TIMEOUT_MS, 'Creating the PDF');
  }
  const ms = Date.now() - started;
  ensureParent(dest);
  await new File(out.uri).move(dest, { overwrite: true });
  const data = await dest.bytes();
  const pages = countPdfPages(latin1(data)) || out.numberOfPages;
  return { uri: dest.uri, pages, reportedPages: out.numberOfPages, bytes: data.length, ms, data };
}

/** Content height that did not fit on page 1 (pt): full pages beyond the first + the used part of the last page. */
export function overflowPt(raw: RawExtraction, page: PageSetup): number {
  if (raw.numPages <= 1) return 0;
  const content = page.heightPt - 2 * page.marginPt;
  const last = raw.pages[raw.pages.length - 1];
  const ys = last.items.filter((i) => i.s.trim() !== '').map((i) => i.y - 0.25 * i.h);
  const used = ys.length ? page.heightPt - page.marginPt - Math.min(...ys) : 0;
  return Math.max(0, (raw.numPages - 2) * content + Math.min(content, used));
}
