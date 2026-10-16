"""Keyword tokeniser / counter / matcher written from SPEC 5.3-5.4 text only."""
import unicodedata, re
PROTECTED = ['c++', 'c#', '.net', 'node.js', 'ci/cd', 's/4hana', 'a/b', 'r&d', 'f#', 'asp.net', 'vue.js', 'react.js', 'next.js']
QUOTES = {'‘': "'", '’': "'", '‚': "'", '‛': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
          '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-'}
def norm(t):
    t = unicodedata.normalize('NFKC', t).replace('­', '')
    t = ''.join(QUOTES.get(c, c) for c in t)
    return t.lower()
LN = lambda c: unicodedata.category(c)[0] in 'LN'
MID = lambda c: LN(c) or c in "+#./&'-"
END = lambda c: LN(c) or c in '+#'
def tokens(text):
    t = norm(text); out = []; i = 0; n = len(t)
    while i < n:
        # protected terms first (at a token boundary)
        hit = None
        for p in sorted(PROTECTED, key=len, reverse=True):
            if t.startswith(p, i) and (i == 0 or not LN(t[i-1])) and (i + len(p) == n or not LN(t[i + len(p)])):
                hit = p; break
        if hit: out.append(hit); i += len(hit); continue
        if not LN(t[i]): i += 1; continue
        j = i + 1
        while j < n and MID(t[j]): j += 1
        k = j
        while k > i + 1 and not END(t[k-1]): k -= 1
        tok = t[i:k] if k > i + 1 else t[i]
        tok = tok.rstrip('.,')
        out.append(tok); i += len(t[i:k]) if k > i + 1 else 1
    return out

def light_stems_en(w):
    s = {w}
    if w.endswith("'s"): s.add(w[:-2])
    if w.endswith('ies'): s.add(w[:-3] + 'y')
    if w.endswith('es'): s.add(w[:-2])
    if w.endswith('s'): s.add(w[:-1])
    return s
def light_stems_de(w):
    s = {w}
    if len(w) >= 5:
        for suf in ('en', 'n', 'e', 'er', 's'):
            if w.endswith(suf): s.add(w[:-len(suf)])
    return s
def stemset(w): return light_stems_en(w) | light_stems_de(w)

def count_phrase(phrase, text):
    p = tokens(phrase); h = tokens(text); n = len(p)
    return sum(1 for i in range(len(h) - n + 1) if h[i:i+n] == p)

def status(phrase, text, acr_pairs=()):
    p = tokens(phrase); h = tokens(text); n = len(p)
    if any(h[i:i+n] == p for i in range(len(h) - n + 1)): return 'found'
    # light stemming: every token shares a stem
    for i in range(len(h) - n + 1):
        if all(stemset(a) & stemset(b) for a, b in zip(p, h[i:i+n])): return 'variant'
    # remove hyphens/spaces
    cp = ''.join(p).replace('-', '')
    for i in range(len(h)):
        for j in range(i + 1, min(len(h), i + 4) + 1):
            if ''.join(h[i:j]).replace('-', '') == cp: return 'variant'
    for a, b in acr_pairs:
        other = b if phrase.lower() == a else a if phrase.lower() == b else None
        if other and count_phrase(other, text): return 'variant'
    return 'missing'
