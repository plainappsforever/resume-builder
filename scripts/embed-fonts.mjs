// Build-time (D26): embeds the six document font families (SIL OFL 1.1, @fontsource 5.3.0) as base64 woff2
// @font-face CSS, one family per document, and derives each family's REAL character coverage from the embedded
// fonts' own character maps (cmap ∩ the face's unicode-range, for every style) for check C13 (D40).
//   writes src/render/fonts.generated.ts         FONT_CSS[fontId] (only the selected family goes into a document)
//          src/engine/font-coverage.generated.ts FONT_COVERAGE[fontId] = [[from, to], …] code point ranges
//          src/render/name-metrics.generated.ts  NAME_ADVANCE[fontId]: bold advance widths (1/1000 em) of U+0020–U+024F,
//                                                so a long name can be set smaller to stay on one line (v1.1, D90)
//          assets/fonts/OFL.txt                  the six licences
// Run: node scripts/embed-fonts.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsource = join(root, 'node_modules', '@fontsource');

// fontId → package, CSS family name, subsets embedded. Greek + Cyrillic only for Inter and Noto Sans (D26, D40).
// Characters outside the embedded subsets (C13) fall back to a phone font. Named WGL4 fonts first: on iOS the generic
// sans-serif fallback for "→" was Hiragino Sans, whose glyphs pdf.js cannot map to text (a hole in the read-back, P5
// D73); Arial / Times New Roman carry the WGL4 arrows and symbols with a proper text mapping.
const SANS_FALLBACK = 'Arial, sans-serif';
const SERIF_FALLBACK = "'Times New Roman', serif";
const FAMILIES = [
  { id: 'inter', pkg: 'inter', name: 'Inter', subsets: ['latin', 'latin-ext', 'greek', 'cyrillic'], fallback: SANS_FALLBACK },
  { id: 'lato', pkg: 'lato', name: 'Lato', subsets: ['latin', 'latin-ext'], fallback: SANS_FALLBACK },
  { id: 'source-sans-3', pkg: 'source-sans-3', name: 'Source Sans 3', subsets: ['latin', 'latin-ext'], fallback: SANS_FALLBACK },
  { id: 'merriweather', pkg: 'merriweather', name: 'Merriweather', subsets: ['latin', 'latin-ext'], fallback: SERIF_FALLBACK },
  { id: 'eb-garamond', pkg: 'eb-garamond', name: 'EB Garamond', subsets: ['latin', 'latin-ext'], fallback: SERIF_FALLBACK },
  { id: 'noto-sans', pkg: 'noto-sans', name: 'Noto Sans', subsets: ['latin', 'latin-ext', 'greek', 'cyrillic'], fallback: SANS_FALLBACK },
];
// Regular, italic, bold (D26). The templates never ask for bold italic.
const STYLES = [
  { weight: 400, style: 'normal' },
  { weight: 400, style: 'italic' },
  { weight: 700, style: 'normal' },
];

// ---- unicode-range ------------------------------------------------------------------------------------------------
function parseUnicodeRange(text) {
  return text.split(',').map((part) => {
    const p = part.trim().replace(/^U\+/i, '');
    if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)];
    const [a, b] = p.split('-');
    return [parseInt(a, 16), parseInt(b ?? a, 16)];
  });
}

// ---- WOFF2 → cmap (W3C WOFF2 §5; OpenType cmap formats 4 and 12) ----------------------------------------------
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat',
  'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function woff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  let pos = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buf[pos++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('bad UIntBase128');
  };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    let tag = KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 0x3f) {
      tag = buf.toString('latin1', pos, pos + 4);
      pos += 4;
    }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    dir.push({ tag, length });
  }
  const data = brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize));
  const tables = {};
  let offset = 0;
  for (const t of dir) {
    tables[t.tag] = data.subarray(offset, offset + t.length);
    offset += t.length;
  }
  return tables;
}

/** Code points with a non-zero glyph in the font's Unicode cmap. */
function cmapCodePoints(cmap) {
  return new Set(cmapGlyphs(cmap).keys());
}

/** Code point → glyph index (non-zero glyphs only) from the font's Unicode cmap. */
function cmapGlyphs(cmap) {
  const n = cmap.readUInt16BE(2);
  const subtables = [];
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const offset = cmap.readUInt32BE(8 + i * 8);
    subtables.push({ platform, encoding, offset, format: cmap.readUInt16BE(offset) });
  }
  const pick =
    subtables.find((s) => s.format === 12 && (s.platform === 3 || s.platform === 0)) ??
    subtables.find((s) => s.format === 4 && (s.platform === 3 || s.platform === 0));
  if (!pick) throw new Error('no Unicode cmap subtable');
  const out = new Map();
  const o = pick.offset;
  if (pick.format === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const start = cmap.readUInt32BE(o + 16 + g * 12);
      const end = cmap.readUInt32BE(o + 20 + g * 12);
      const glyph = cmap.readUInt32BE(o + 24 + g * 12);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.set(c, glyph + (c - start));
    }
  } else {
    const segX2 = cmap.readUInt16BE(o + 6);
    const seg = segX2 / 2;
    const ends = o + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let i = 0; i < seg; i++) {
      const end = cmap.readUInt16BE(ends + i * 2);
      const start = cmap.readUInt16BE(starts + i * 2);
      const delta = cmap.readInt16BE(deltas + i * 2);
      const rangeOffset = cmap.readUInt16BE(ranges + i * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph;
        if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
        else {
          const at = ranges + i * 2 + rangeOffset + (c - start) * 2;
          glyph = cmap.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) out.set(c, glyph);
      }
    }
  }
  return out;
}

function toRanges(codePoints) {
  const sorted = [...codePoints].sort((a, b) => a - b);
  const ranges = [];
  for (const c of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && c === last[1] + 1) last[1] = c;
    else ranges.push([c, c]);
  }
  return ranges;
}

// ---- build ----------------------------------------------------------------------------------------------------------
const css = {};
const coverage = {};
const extents = {};
const advances = {}; // fontId → bold advance (1/1000 em) per code point U+0020..U+024F (0 = not in the font)
const ADV_FIRST = 0x20;
const ADV_LAST = 0x24f;
const report = [];
let version = '';
for (const fam of FAMILIES) {
  const dir = join(fontsource, fam.pkg);
  version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  const unicode = JSON.parse(readFileSync(join(dir, 'unicode.json'), 'utf8'));
  const faces = [];
  let perStyle = null; // code points covered in EVERY style
  let bytes = 0;
  let extent = 0; // largest (ascender − descender) / unitsPerEm of the family's faces (hhea), for the line height
  for (const { weight, style } of STYLES) {
    const covered = new Set();
    for (const subset of fam.subsets) {
      const file = readFileSync(join(dir, 'files', `${fam.pkg}-${subset}-${weight}-${style}.woff2`));
      bytes += file.length;
      const range = parseUnicodeRange(unicode[subset]);
      const tables = woff2Tables(file);
      for (const c of cmapCodePoints(tables.cmap)) if (range.some(([a, b]) => c >= a && c <= b)) covered.add(c);
      const upem = tables.head.readUInt16BE(18);
      if (weight === 700 && style === 'normal') {
        const adv = (advances[fam.id] ??= new Array(ADV_LAST - ADV_FIRST + 1).fill(0));
        const metrics = tables.hhea.readUInt16BE(34);
        for (const [c, glyph] of cmapGlyphs(tables.cmap)) {
          if (c < ADV_FIRST || c > ADV_LAST || !range.some(([a, b]) => c >= a && c <= b)) continue;
          const g = Math.min(glyph, metrics - 1);
          adv[c - ADV_FIRST] = Math.round((tables.hmtx.readUInt16BE(g * 4) / upem) * 1000);
        }
      }
      extent = Math.max(extent, (tables.hhea.readInt16BE(4) - tables.hhea.readInt16BE(6)) / upem);
      faces.push(
        `@font-face{font-family:'${fam.name}';font-style:${style};font-weight:${weight};font-display:block;` +
          `src:url(data:font/woff2;base64,${file.toString('base64')}) format('woff2');unicode-range:${unicode[subset]};}`
      );
    }
    perStyle = perStyle === null ? covered : new Set([...perStyle].filter((c) => covered.has(c)));
  }
  css[fam.id] = faces.join('\n');
  coverage[fam.id] = toRanges(perStyle);
  extents[fam.id] = Math.round(extent * 1000) / 1000;
  report.push(`${fam.id}: ${faces.length} faces, ${(bytes / 1024).toFixed(0)} KB woff2, ${perStyle.size} code points in ${coverage[fam.id].length} ranges, extent ${extents[fam.id]} em`);
}

const family = Object.fromEntries(FAMILIES.map((f) => [f.id, `'${f.name}', ${f.fallback}`]));
const names = Object.fromEntries(FAMILIES.map((f) => [f.id, f.name]));
const header = (what) =>
  `// GENERATED by scripts/embed-fonts.mjs from @fontsource ${version} (SIL OFL 1.1, see assets/fonts/OFL.txt): ${what}.\n` +
  '// Do not edit by hand; run `node scripts/embed-fonts.mjs`.\n';
writeFileSync(
  join(root, 'src', 'render', 'fonts.generated.ts'),
  header('@font-face CSS per family (regular, italic, bold; base64 woff2)') +
    "import type { FontId } from '@/engine/style';\n\n" +
    `export const FONT_VERSION = ${JSON.stringify(version)};\n` +
    `export const FONT_NAME: Record<FontId, string> = ${JSON.stringify(names)};\n` +
    `export const FONT_FAMILY_CSS: Record<FontId, string> = ${JSON.stringify(family)};\n` +
    '/** (hhea ascender − descender) / unitsPerEm, largest face: glyph extent of a line in em (line height floor, D47). */\n' +
    `export const FONT_EXTENT: Record<FontId, number> = ${JSON.stringify(extents)};\n` +
    `export const FONT_CSS: Record<FontId, string> = ${JSON.stringify(css)};\n`
);
writeFileSync(
  join(root, 'src', 'engine', 'font-coverage.generated.ts'),
  header("code points each family can show in EVERY embedded style (cmap ∩ unicode-range); check C13 reads it") +
    "import type { FontId } from './style';\n\n" +
    `export const FONT_COVERAGE: Record<FontId, readonly (readonly [number, number])[]> = ${JSON.stringify(coverage)};\n`
);
writeFileSync(
  join(root, 'src', 'render', 'name-metrics.generated.ts'),
  header('bold advance widths in 1/1000 em of U+0020–U+024F per family (0 = not in the font); the name fit reads it') +
    "import type { FontId } from '@/engine/style';\n\n" +
    `export const NAME_ADVANCE_FIRST = ${ADV_FIRST};\n` +
    `export const NAME_ADVANCE: Record<FontId, readonly number[]> = ${JSON.stringify(advances)};\n`
);
writeFileSync(
  join(root, 'assets', 'fonts', 'OFL.txt'),
  FAMILIES.map((f) => `==== ${f.name} (@fontsource/${f.pkg} ${version}) ====\n\n${readFileSync(join(fontsource, f.pkg, 'LICENSE'), 'utf8').trim()}\n`).join('\n')
);
console.log(report.join('\n'));
