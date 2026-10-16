"""Independent read-back comparator: SPEC 5.7 + D48 (words = letter/digit/mark runs, longest in-order chain, wide gaps)."""
import unicodedata, re
from collections import Counter
MAP = {**{c: '-' for c in '‐‑‒–—―−'}, **{c: "'" for c in '‘’‚‛′'}, **{c: '"' for c in '“”„‟″'}}
BULLETS = set('•◦▪▫‣⁃●○■□►▶➢➤✓✔·')
def norm(t):
    t = unicodedata.normalize('NFKC', t)
    t = ''.join(MAP.get(c, c) for c in t if c not in BULLETS).casefold()
    return re.sub(r'\s+', ' ', t).strip()
def words(t):
    t = norm(t); out = []; cur = ''
    for c in t:
        if unicodedata.category(c)[0] in 'LNM': cur += c
        else:
            if cur: out.append(cur); cur = ''
    if cur: out.append(cur)
    return out

def items_to_lines(items):
    """pdf.js items in stream order -> lines; also wide gaps and up-jumps (D53). Line break on EOL flag or baseline jump > 1/2 line."""
    lines, gaps = [], []; cur = ''; prev = None; last = None
    for it in items:
        s = it['s']
        # D53 (P3.5 fix round): text more than half a (larger-font) line ABOVE the previous visible text on the page
        # = reading went back up the page (columns / side-by-side boxes) -> a layout finding like a wide gap.
        if s.strip():
            if last is not None and it['y'] - last['y'] > 0.5 * max(last['h'], it['h'], 1):
                gaps.append(('UP ' + last['s'].strip()[-20:], s.strip()[:20], round((it['y'] - last['y']) / max(last['h'], it['h'], 1), 2)))
            last = it
        if prev is not None and s != '' and abs(it['y'] - prev['y']) > 0.5 * max(prev['h'], it['h'], 1):
            lines.append(cur); cur = ''; prev = None
        if s:
            if prev is not None and cur:
                em = max(prev['h'], it['h']) or 10
                gap = it['x'] - (prev['x'] + prev['w'])
                if gap >= 1.0 * em: gaps.append((cur[-20:], s[:20], round(gap / em, 2)))
                if gap > 0.15 * em and not cur.endswith(' ') and not s.startswith(' '): cur += ' '
            cur += s; prev = it if s.strip() else (prev or it)
        if it.get('e'):
            lines.append(cur); cur = ''; prev = None
    if cur: lines.append(cur)
    return [l for l in lines if l.strip()], gaps

def find(seq, sub, start=0):
    n = len(sub)
    for i in range(start, len(seq) - n + 1):
        if seq[i:i + n] == sub: return i
    return -1

def compare(expected_lines, read_lines, gaps=()):
    WE_lines = [words(l) for l in expected_lines]
    WE = [w for l in WE_lines for w in l]
    # D63 (P3.5 fix round): last word of a line + first word of the next line that spell a long (>= 30) expected word,
    # not both expected words themselves, were one word wrapped by overflow-wrap: join them.
    expset0 = set(WE)
    WX = []
    for l in read_lines:
        ws = words(l)
        if WX and ws:
            j = WX[-1] + ws[0]
            if len(j) >= 30 and j in expset0 and not (WX[-1] in expset0 and ws[0] in expset0):
                WX[-1] = j
                ws = ws[1:]
        WX.extend(ws)
    ce, cx = Counter(WE), Counter(WX)
    found = sum(min(c, cx[w]) for w, c in ce.items())
    missing = [w for w in ce if cx[w] < ce[w]]
    # order (greedy after previous match, else full search)
    pos = []; end = 0
    for lw in WE_lines:
        if not lw: pos.append(None); continue
        i = find(WX, lw, end)
        if i < 0: i = find(WX, lw, 0)
        pos.append(i if i >= 0 else -1)
        if i >= 0 and i >= end: end = i + len(lw)
    # longest chain of non-overlapping matches in document order (LIS on start with non-overlap)
    idx = [k for k, p in enumerate(pos) if p is not None and p >= 0]
    best = {}; prevk = {}
    for a in idx:
        best[a] = 1; prevk[a] = None
        for b in idx:
            if b >= a: break
            if pos[b] + len(WE_lines[b]) <= pos[a] and best[b] + 1 > best[a]: best[a] = best[b] + 1; prevk[a] = b
    chain = set()
    if idx:
        k = max(idx, key=lambda a: (best[a], -a))
        while k is not None: chain.add(k); k = prevk[k]
    split = [k for k, p in enumerate(pos) if p == -1]
    moved = [k for k in idx if k not in chain]
    # spaced letters
    spaced = []
    expset = set(WE); i = 0
    while i < len(WX):
        j = i
        while j < len(WX) and len(WX[j]) == 1: j += 1
        if j - i >= 3:
            run = ''.join(WX[i:j])
            if any(w in run and len(w) >= 3 for w in expset if len(w) >= 3): spaced.append(run)
            i = j
        else: i += 1
    passed = found == len(WE) and not moved and not split and not spaced and not gaps
    return dict(pass_=passed, expected=len(WE), found=found, moved=moved, split=split, spaced=spaced, missing=missing,
                gaps=list(gaps), inOrder=len([p for p in pos if p is not None and p >= 0]) - len(moved))
