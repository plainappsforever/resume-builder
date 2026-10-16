"""Independent font coverage from @fontsource WOFF1 files (zlib) + CSS unicode-range; compare with FONT_COVERAGE."""
import struct, zlib, re, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
FS = os.path.join(ROOT, 'node_modules', '@fontsource')
FAM = {'inter': ['latin', 'latin-ext', 'greek', 'cyrillic'], 'lato': ['latin', 'latin-ext'], 'source-sans-3': ['latin', 'latin-ext'],
       'merriweather': ['latin', 'latin-ext'], 'eb-garamond': ['latin', 'latin-ext'], 'noto-sans': ['latin', 'latin-ext', 'greek', 'cyrillic']}
STY = [('400', 'normal'), ('400', 'italic'), ('700', 'normal')]
def woff_cmap(path):
    b = open(path, 'rb').read(); assert b[:4] == b'wOFF'
    n = struct.unpack('>H', b[12:14])[0]
    for i in range(n):
        tag, off, clen, olen, _ = struct.unpack('>4sIIII', b[44 + 20 * i: 64 + 20 * i])
        if tag == b'cmap':
            d = b[off:off + clen]; return zlib.decompress(d) if clen < olen else d
def parse_cmap(d):
    n = struct.unpack('>H', d[2:4])[0]; best = None; cps = set()
    subs = [struct.unpack('>HHI', d[4 + 8 * i: 12 + 8 * i]) for i in range(n)]
    for pid, eid, off in subs:
        fmt = struct.unpack('>H', d[off:off + 2])[0]
        if fmt == 12:
            ng = struct.unpack('>I', d[off + 12: off + 16])[0]
            for k in range(ng):
                s, e, g = struct.unpack('>III', d[off + 16 + 12 * k: off + 28 + 12 * k])
                for c in range(s, e + 1):
                    if g + (c - s) != 0: cps.add(c)
        elif fmt == 4:
            segx2 = struct.unpack('>H', d[off + 6: off + 8])[0]; sc = segx2 // 2
            ends = struct.unpack(f'>{sc}H', d[off + 14: off + 14 + segx2])
            starts = struct.unpack(f'>{sc}H', d[off + 16 + segx2: off + 16 + 2 * segx2])
            deltas = struct.unpack(f'>{sc}h', d[off + 16 + 2 * segx2: off + 16 + 3 * segx2])
            ro_off = off + 16 + 3 * segx2
            ros = struct.unpack(f'>{sc}H', d[ro_off: ro_off + segx2])
            for k in range(sc):
                for c in range(starts[k], ends[k] + 1):
                    if c == 0xFFFF: continue
                    if ros[k] == 0: g = (c + deltas[k]) & 0xFFFF
                    else:
                        a = ro_off + 2 * k + ros[k] + 2 * (c - starts[k]); g = struct.unpack('>H', d[a:a + 2])[0]
                        if g: g = (g + deltas[k]) & 0xFFFF
                    if g != 0: cps.add(c)
    return cps
def urange(pkg, subset, w, st):
    css = open(f'{FS}/{pkg}/{w}{"-italic" if st == "italic" else ""}.css').read()
    blk = css.split(f'/* {pkg}-{subset}-{w}-{st} */')[1].split('}')[0]
    m = re.search(r'unicode-range:\s*([^;]+);', blk); out = set()
    for part in m.group(1).split(','):
        p = part.strip()[2:]
        a, _, b = p.partition('-'); out |= set(range(int(a, 16), int(b or a, 16) + 1))
    return out
ts = open(os.path.join(ROOT, 'src', 'engine', 'font-coverage.generated.ts')).read()
eng = json.loads(re.search(r'= (\{.*\});', ts, re.S).group(1))
for fam, subsets in FAM.items():
    per_style = []
    for w, st in STY:
        s = set()
        for sub in subsets:
            f = f'{FS}/{fam}/files/{fam}-{sub}-{w}-{st}.woff'
            s |= parse_cmap(woff_cmap(f)) & urange(fam, sub, w, st)
        per_style.append(s)
    mine = set.intersection(*per_style)
    theirs = set(c for a, b in eng[fam] for c in range(a, b + 1))
    print(f'{fam:14} oracle {len(mine):5} engine {len(theirs):5}  only-engine {sorted(theirs - mine)[:12]}  only-oracle {sorted(mine - theirs)[:12]}')
