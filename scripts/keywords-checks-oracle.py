#!/usr/bin/env python3
"""Oracle for the keyword engine (SPEC 5.3-5.4) and the checks (SPEC 5.5), v1 P2.

Written from the SPEC text and decisions D37-D40 alone, BEFORE src/engine/keywords/* and checks.ts existed,
by the same agent that then wrote the engine (L27: not independent; the P3.5 reviewer writes its own).
It shares no code with the TypeScript engine: only the data files (stop words, skills, protected terms, acronym
pairs, job-ad fixtures) are read by both. Character classes come from Python's unicodedata, not from JS regex.

Writes (deterministic, fixed seed):
  src/engine/__fixtures__/oracle/keywords.json   tokenizer, extraction and matching vectors
  src/engine/__fixtures__/oracle/checks.json     check findings for generated documents
Run: python3 scripts/keywords-checks-oracle.py
"""
import json
import random
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KW = ROOT / 'src' / 'engine' / 'keywords'
FIX = ROOT / 'src' / 'engine' / '__fixtures__'
SEED = 20261001

# ---------------------------------------------------------------------------------------------------------------
# Data (shared with the engine as data only)
STOP_JSON = json.loads((KW / 'stopwords.json').read_text())
SKILLS_JSON = json.loads((KW / 'skills.json').read_text())


def is_letter(c):
    return unicodedata.category(c).startswith('L')


def is_ln(c):
    cat = unicodedata.category(c)
    return cat.startswith('L') or cat.startswith('N')


MIDDLE = set("+#./&'-")
END = set('+#')
QUOTES1 = "‘’‚‛′"
QUOTES2 = "“”„‟″"
DASHES = "‐‑‒–—―−"
BULLETS = set("•◦▪▫‣⁃●○■□►▶➢➤✓✔·*")
BOUNDARY = set(',()[]{}|"')
SENTENCE = set('.!?;:')


def normalize(text):
    t = unicodedata.normalize('NFKC', text)
    out = []
    for c in t:
        if c in QUOTES1:
            out.append("'")
        elif c in QUOTES2:
            out.append('"')
        elif c in DASHES:
            out.append('-')
        elif c == '­':
            continue
        else:
            out.append(c)
    return ''.join(out)


STOP = set()
for key in ('functionEn', 'functionDe', 'boilerplateEn', 'boilerplateDe', 'legalForms'):
    for w in STOP_JSON[key]:
        STOP.add(normalize(w).lower())
LEGAL = set(normalize(w).lower() for w in STOP_JSON['legalForms'])  # v1.1 D94
PROTECTED = set(normalize(p).lower() for p in SKILLS_JSON['protected'])
DOT_PROTECTED = sorted([p for p in PROTECTED if p.startswith('.')], key=len, reverse=True)


def scan(s):
    """Raw tokens of one segment: the SPEC regex, with '.'-protected terms first (D37)."""
    toks = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == '.' and (i == 0 or not is_ln(s[i - 1])):
            hit = None
            for p in DOT_PROTECTED:
                cand = s[i:i + len(p)]
                after = s[i + len(p)] if i + len(p) < n else ''
                if cand.lower() == p and not (after and (is_ln(after) or after in END)):
                    hit = cand
                    break
            if hit:
                toks.append(hit)
                i += len(hit)
                continue
        if is_ln(c):
            j = i + 1
            last_end = i
            while j < n and (is_ln(s[j]) or s[j] in MIDDLE):
                if is_ln(s[j]) or s[j] in END:
                    last_end = j
                j += 1
            toks.append(s[i:last_end + 1])
            i = last_end + 1
            continue
        i += 1
    return toks


def post(tok):
    """'/' split and the hyphen-suffix rule (D37)."""
    while tok and tok[-1] in '.,':
        tok = tok[:-1]
    if not tok:
        return []
    low = tok.lower()
    if low in PROTECTED:
        return [tok]
    if '/' in tok:
        out = []
        for part in tok.split('/'):
            if part.startswith('-'):  # D56: elided compound tail ("/-mann", "/-in")
                continue
            for t in scan(part):
                out.extend(post(t))
        return out
    if '-' in tok:
        parts = tok.split('-')
        if len(parts) >= 2 and parts[-1].lower() in STOP and len(parts[-1]) >= 3:  # D56: tail of >= 3 characters
            tok = '-'.join(parts[:-1])
    return [tok]


def mk(tok):
    low = tok.lower().replace('i\u0307', 'i')  # D58: Turkish dotted capital I
    letters = sum(1 for c in tok if is_letter(c))
    caps = letters > 0 and tok == tok.upper() and tok != low
    return {'text': tok, 'low': low, 'caps': caps, 'letters': letters}


def split_segments(line):
    segs = []
    cur = []
    n = len(line)
    for i, c in enumerate(line):
        if c in BULLETS or c in BOUNDARY:
            segs.append(''.join(cur))
            cur = []
        elif c in SENTENCE and (i + 1 == n or line[i + 1].isspace()):
            segs.append(''.join(cur))
            cur = []
        else:
            cur.append(c)
    segs.append(''.join(cur))
    return segs


def lines_of(text):
    return normalize(text).replace('\r\n', '\n').replace('\r', '\n').split('\n')


def segments_of_line(line):
    out = []
    for seg in split_segments(line):
        toks = []
        for raw in scan(seg):
            toks.extend(mk(t) for t in post(raw))
        if toks:
            out.append(toks)
    return out


def phrase_tokens(text):
    """A keyword/skill phrase -> lower-case tokens (all segments joined)."""
    out = []
    for line in lines_of(text):
        for seg in segments_of_line(line):
            out.extend(t['low'] for t in seg)
    return out


SKILLS = set()
for key, val in SKILLS_JSON.items():
    if key in ('protected', 'acronyms', '_comment'):
        continue
    for w in val:
        toks = phrase_tokens(w)
        if toks:
            SKILLS.add(' '.join(toks))
ACRONYMS = []
for a, e in SKILLS_JSON['acronyms']:
    ACRONYMS.append((' '.join(phrase_tokens(a)), ' '.join(phrase_tokens(e))))


def is_stop(t):
    if t['low'] in STOP:
        return not (t['caps'] and 2 <= t['letters'] <= 4 and t['low'] in SKILLS)
    return False


def eligible(t):
    return t['letters'] > 0 and (len(t['low']) >= 2 or t['low'] in PROTECTED) and not is_stop(t)


# ---------------------------------------------------------------------------------------------------------------
# Extraction (SPEC 5.3 steps 5-7, D38)
HEADINGS = {'requirements', 'qualifications', 'what you bring', 'must have', 'must-have', 'must haves',
            'nice to have', 'nice-to-have', 'skills', 'your profile', 'anforderungen', 'ihr profil', 'dein profil',
            'das bringst du mit', 'qualifikationen'}
# D57 (P3.5): headings that end a requirements block; benefits headings start a benefits block (weight 0.5).
BENEFITS = {'benefits', 'perks', 'what we offer', 'we offer', 'our offer', 'what you get', "what's in it for you",
            'why join us', 'why us', 'wir bieten', 'wir bieten dir', 'wir bieten ihnen', 'was wir bieten',
            'das bieten wir', 'unser angebot', 'deine vorteile', 'ihre vorteile', 'deine benefits', 'ihre benefits'}
OTHER = {'about us', 'who we are', 'the company', 'about the company', 'about the role', 'the role', 'your role',
         'your tasks', 'tasks', 'responsibilities', 'your responsibilities', 'key responsibilities', "what you'll do",
         'what you will do',
         'deine aufgaben', 'ihre aufgaben', 'aufgaben', 'dein aufgabengebiet', 'ihr aufgabengebiet', 'deine rolle',
         'ihre rolle', 'was dich erwartet', 'was sie erwartet'}
# v1.1 D94: the employer's own text (and the intro before the first heading) weighs 0.75
COMPANY = {'about us', 'who we are', 'the company', 'about the company', 'contact', 'how to apply', 'über uns',
           'wer wir sind', 'das unternehmen', 'kontakt', 'so bewirbst du dich'}
OTHER -= COMPANY
NO_HEADING = object()


def heading_zone(line):
    keys = [heading_key(line)]
    if ':' in line:
        pre = line[:line.index(':')]
        if line.index(':') > 0 and len(pre.strip()) <= 40:
            keys.append(heading_key(pre))
    for k in keys:
        if k in HEADINGS:
            return 'req'
        if k in BENEFITS:
            return 'ben'
        if k in COMPANY:
            return 'com'
        if k in OTHER:
            return None
    return NO_HEADING


MAX_AD = 50000
CONJUNCTIONS = {'and', 'or', 'und', 'oder', 'sowie', 'bzw', '&'}  # D42


def heading_key(line):
    s = line.strip()
    while s and (s[0] in '#*-' or s[0] in BULLETS):
        s = s[1:].strip()
    s = s.strip()
    while s.endswith(':'):
        s = s[:-1].rstrip()
    return s.lower()


def compound_head(low):
    """D55 (P3.5): longest leading run of hyphen parts that is a skill, when the whole token is not one."""
    if '-' not in low or low in PROTECTED or low in SKILLS:
        return None
    parts = low.split('-')
    for j in range(len(parts) - 1, 0, -1):
        head = '-'.join(parts[:j])
        if head and head in SKILLS:
            return head
    return None


ZONE_W = {'req': 6, None: 4, 'com': 3, 'ben': 2}  # x4 of the score (D57, D94)


def employer_tokens(lines, company):
    """D94: up to 3 capitalised non-stop, non-skill words right before a legal form (skipping legal forms and '&'),
    plus the target company's words."""
    names = set()

    def name_word(t):
        return unicodedata.category(t['text'][0]) == 'Lu' and t['letters'] > 0 and t['low'] not in STOP and t['low'] not in SKILLS

    for line in lines:
        toks = [t for seg in segments_of_line(line) for t in seg]
        for i, t in enumerate(toks):
            if t['low'] not in LEGAL:
                continue
            j = i - 1
            while j >= 0 and (toks[j]['low'] in LEGAL or toks[j]['low'] == '&'):
                j -= 1
            k = 0
            while k < 3 and j >= 0 and name_word(toks[j]):
                names.add(toks[j]['low'])
                k += 1
                j -= 1
    for line in lines_of(company or ''):
        for seg in segments_of_line(line):
            for t in seg:
                if t['letters'] > 0 and t['low'] not in STOP and t['low'] not in SKILLS:
                    names.add(t['low'])
    return names


def extract(ad, company=''):
    truncated = len(ad.encode('utf-16-le')) // 2 > MAX_AD
    if truncated:
        # cut at 50,000 UTF-16 code units (JS string length)
        units = 0
        cut = 0
        for i, c in enumerate(ad):
            units += 2 if ord(c) > 0xFFFF else 1
            if units > MAX_AD:
                cut = i
                break
        ad = ad[:cut]
    lines = lines_of(ad)
    zone = 'com'  # D94: the intro before the first heading is the employer's text, except the first line (job title)
    title_seen = False
    occ = {}
    gidx = 0
    for li, line in enumerate(lines):
        stripped = line.strip()
        hz = heading_zone(line)
        if hz is not NO_HEADING:
            zone = hz
        elif len(stripped) <= 40 and stripped.endswith(':'):
            zone = None
        line_zone = None if (not title_seen and stripped != '' and hz is NO_HEADING and zone == 'com') else zone
        if stripped != '':
            title_seen = True
        for seg in segments_of_line(line):
            for s in range(len(seg)):
                for n in (1, 2, 3):
                    if s + n > len(seg):
                        break
                    toks = seg[s:s + n]
                    phrase = ' '.join(t['low'] for t in toks)
                    if n == 1:
                        ok = eligible(toks[0])
                    elif phrase in SKILLS:
                        ok = True
                    else:
                        ok = eligible(toks[0]) and eligible(toks[-1]) and not (n == 3 and toks[1]['low'] in CONJUNCTIONS)
                    if ok:
                        occ.setdefault(phrase, []).append((gidx + s, line_zone, n))
                        if n == 1:  # D55: skill-list head of a hyphen compound
                            head = compound_head(phrase)
                            if head:
                                occ.setdefault(head, []).append((gidx + s, line_zone, 1))
            gidx += len(seg)
    cands = {}
    for phrase, lst in occ.items():
        tf = len(lst)
        inreq = any(o[1] == 'req' for o in lst)
        indict = phrase in SKILLS
        cands[phrase] = {
            'term': phrase, 'n': lst[0][2], 'tf': tf, 'inRequirements': inreq, 'inDictionary': indict,
            'first': min(o[0] for o in lst), 'score4': tf * max(ZONE_W[o[1]] for o in lst) * (3 if indict else 1),
        }

    def contains(big, small):
        b, s = big.split(' '), small.split(' ')
        return any(b[i:i + len(s)] == s for i in range(len(b) - len(s) + 1))

    occ_spans = {ph: [(o[0], o[0] + o[2]) for o in lst] for ph, lst in occ.items()}
    dict_spans = [sp for ph, sps in occ_spans.items() if ph in SKILLS for sp in sps]

    def covered_all(x):  # D43
        return all(any(a <= s0 and e0 <= b and (b - a) > (e0 - s0) for a, b in dict_spans) for s0, e0 in occ_spans[x['term']])

    employer = employer_tokens(lines, company)
    kept = []
    for x in cands.values():
        if all(t in employer for t in x['term'].split(' ')):  # D94: the employer's name is never a keyword
            continue
        if x['n'] >= 2 and x['tf'] == 1 and not x['inDictionary']:  # D57: non-skill phrases need tf >= 2
            continue
        drop = x['n'] <= 2 and not x['inDictionary'] and covered_all(x)
        if x['n'] <= 2 and not drop:
            for y in cands.values():
                if y['n'] > x['n'] and y['tf'] == x['tf'] and (x['tf'] >= 2 or y['inDictionary']) and contains(y['term'], x['term']):
                    drop = True
                    break
        if not drop:
            kept.append(x)
    kept.sort(key=lambda c: (-c['score4'], c['first'], -c['n'], c['term']))
    return {
        'truncated': truncated,
        'keywords': [{'term': c['term'], 'tf': c['tf'], 'score': c['score4'] / 4, 'inRequirements': c['inRequirements'],
                      'inDictionary': c['inDictionary']} for c in kept],
    }


# ---------------------------------------------------------------------------------------------------------------
# Matching (SPEC 5.4, D39)
MIN_STEM = 3  # D54 (P3.5): a reduction keeps >= 3 characters ("its" != it, "goes" != go, "css" != cs)


def stems(t):
    out = {t}
    n = len(t)
    cand = []
    if t.endswith("'s") and n >= 4:
        cand.append(t[:-2])
    if t.endswith('ies') and n >= 5:
        cand.append(t[:-3] + 'y')
    if t.endswith('es') and n >= 4:
        cand.append(t[:-2])
    if t.endswith('s') and n >= 3:
        cand.append(t[:-1])
    if n >= 5:
        for suf in ('en', 'n', 'e', 'er', 's'):
            if t.endswith(suf):
                cand.append(t[:-len(suf)])
    out.update(c for c in cand if len(c) >= MIN_STEM)
    return out


def piece_segments(text):
    segs = []
    for line in lines_of(text):
        for seg in segments_of_line(line):
            segs.append([t['low'] for t in seg])
    return segs


def seq_match(seg, i, kw, stem):
    if i + len(kw) > len(seg) or not kw:
        return False
    for j, k in enumerate(kw):
        a = seg[i + j]
        if stem:
            if not (stems(a) & stems(k)):
                return False
        elif a != k:
            return False
    return True


def compact(t):
    """D58 (P3.5): drop '-' and '.', spell umlauts out."""
    t = t.replace('-', '').replace('.', '')
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        t = t.replace(a, b)
    return t


def compact_match(seg, i, target):
    acc = ''
    for m in range(i, len(seg)):
        acc += compact(seg[m])
        if acc == target:
            return True
        if len(acc) >= len(target):
            return False
    return False


def part_match(tok, kw_parts, stem):
    """D55 (P3.5): keyword parts = a contiguous, shorter run of a hyphen compound's parts (Java in Java-Entwicklung)."""
    if '-' not in tok or tok in PROTECTED:
        return False
    parts = [p for p in tok.split('-') if p]
    if len(parts) < 2 or not kw_parts or len(kw_parts) >= len(parts):
        return False
    if stem:
        return len(kw_parts) == 1 and any(stems(p) & stems(kw_parts[0]) for p in parts)
    return any(parts[k:k + len(kw_parts)] == kw_parts for k in range(len(parts) - len(kw_parts) + 1))


def match(term, pieces):
    kw = phrase_tokens(term)
    kw_parts = [p for p in '-'.join(kw).split('-') if p]
    phrase = ' '.join(kw)
    target = compact(''.join(kw))
    partners = [phrase_tokens(e) for a, e in ACRONYMS if a == phrase] + [phrase_tokens(a) for a, e in ACRONYMS if e == phrase]
    count = exact = 0
    where = []
    for pi, text in enumerate(pieces):
        hit_piece = False
        for seg in piece_segments(text):
            for i in range(len(seg)):
                ex = seq_match(seg, i, kw, False) or part_match(seg[i], kw_parts, False)
                ok = ex or seq_match(seg, i, kw, True) or part_match(seg[i], kw_parts, True) or (target != '' and compact_match(seg, i, target)) or any(
                    seq_match(seg, i, p, False) or seq_match(seg, i, p, True) for p in partners)
                if ok:
                    count += 1
                    hit_piece = True
                if ex:
                    exact += 1
        if hit_piece:
            where.append(pi)
    status = 'found' if exact > 0 else ('variant' if count > 0 else 'missing')
    return {'status': status, 'count': count, 'exactCount': exact, 'hits': where}


# ---------------------------------------------------------------------------------------------------------------
# Checks (SPEC 5.5, D40) - the oracle's own small word lists; Jest asserts the engine lists agree on them.
ORACLE_VERBS = {'led', 'managed', 'reduced', 'trained', 'built', 'improved', 'geleitet', 'entwickelt', 'leitung', 'betreuung', 'organisierte'}
ORACLE_NON_VERBS = {'responsible', 'the', 'daily', 'teamwork', 'verantwortlich', 'tägliche', 'various'}
ORACLE_STANDARD = {'work experience', 'berufserfahrung', 'skills', 'education', 'ausbildung', 'kenntnisse', 'projects', 'languages', 'sprachen'}
ORACLE_CUSTOM = ['My Journey', 'Stuff I Like', 'Mein Weg', 'Hobbys & Mehr']
FIRST_PERSON = {'i', 'my', 'ich', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines'}
ABBR = [('Sr.', 'Senior'), ('Jr.', 'Junior'), ('Mgr.', 'Manager'), ('Asst.', 'Assistant'), ('Eng.', 'Engineer'), ('Dir.', 'Director')]
IGNORED = {0x200D, 0xFE0E, 0xFE0F, 0x20E3}


# C13 (P3, D44): coverage = the embedded fonts' measured character maps (scripts/embed-fonts.mjs writes them; shared
# data, like the word lists). A version without its own font uses its template's default font (D44).
_COVERAGE_TS = (ROOT / 'src' / 'engine' / 'font-coverage.generated.ts').read_text(encoding='utf-8')
FONT_COVERAGE = json.loads(re.search(r'= (\{.*\});', _COVERAGE_TS).group(1))
DEFAULT_FONT = {'classic': 'merriweather', 'modern': 'inter', 'compact': 'lato', 'executive': 'eb-garamond',
                'lebenslauf': 'source-sans-3', 'plain': 'noto-sans'}


def covered(cp, font, template):
    if cp in (9, 10, 13):
        return True
    ranges = FONT_COVERAGE[font or DEFAULT_FONT[template]]
    return any(a <= cp <= b for a, b in ranges)


def label_ok(lbl):
    if not lbl:
        return False
    if not (is_ln(lbl[0]) and is_ln(lbl[-1])):
        return False
    return all(is_ln(c) or c == '-' for c in lbl)


def host_ok(host):
    labels = host.split('.')
    if len(labels) < 2 or not all(label_ok(l) for l in labels):
        return False
    tld = labels[-1]
    return len(tld) >= 2 and all(is_letter(c) for c in tld)


def url_ok(u):
    u = u.strip()
    if any(c.isspace() for c in u) or not u:
        return False
    low = u.lower()
    for scheme in ('https://', 'http://'):
        if low.startswith(scheme):
            u = u[len(scheme):]
            break
    cut = len(u)
    for k, c in enumerate(u):
        if c in '/?#':
            cut = k
            break
    hostport, _rest = u[:cut], u[cut:]
    if ':' in hostport:
        host, port = hostport.split(':', 1)
        if not (1 <= len(port) <= 5 and port.isascii() and port.isdigit()):
            return False
    else:
        host = hostport
    return host_ok(host)


def email_ok(e):
    e = e.strip()
    if e.count('@') != 1 or any(c.isspace() for c in e):
        return False
    local, host = e.split('@')
    return len(local) > 0 and host_ok(host)


def blank(s):
    return s is None or s.strip() == ''


def first_word(text):
    i = 0
    while i < len(text) and not is_letter(text[i]):
        i += 1
    j = i
    while j < len(text):
        if is_letter(text[j]):
            j += 1
        elif text[j] == '-' and j + 1 < len(text) and is_letter(text[j + 1]):
            j += 1
        else:
            break
    return text[i:j].lower()


def date_tuple(d):
    return (int(d[:4]), int(d[5:7]) if len(d) == 7 else None)


def date_cmp(a, b):
    ya, ma = date_tuple(a)
    yb, mb = date_tuple(b)
    if ma is None or mb is None:
        return (ya > yb) - (ya < yb)
    return ((ya, ma) > (yb, mb)) - ((ya, ma) < (yb, mb))


def text_fields(model):
    p = model['person']
    out = []
    for f in ('fullName', 'headline', 'email', 'phone', 'city', 'region', 'nationality'):
        if p.get(f):
            out.append(('profile:' + f, p[f]))
    if model['summary']:
        out.append(('profile:summary', model['summary']))
    for i, l in enumerate(p['links']):
        out.append(('link:%d' % i, l['url']))
    for s in model['sections']:
        if s['title'] is not None:
            out.append(('section:%d' % s['id'], s['title']))
        for e in s['entries']:
            for f in ('title', 'organization', 'location', 'description', 'url'):
                if e[f]:
                    out.append(('entry:%d:%s' % (e['id'], f), e[f]))
            for k in sorted(e['extra']):
                if e['extra'][k]:
                    out.append(('entry:%d:extra.%s' % (e['id'], k), e['extra'][k]))
            for b in e['bullets']:
                if b['text']:
                    out.append(('bullet:%d' % b['id'], b['text']))
    return out


def checks(model, ctx):
    f = []
    p = model['person']
    # C1
    if blank(p['fullName']):
        f.append('C1:name:profile:fullName')
    if blank(p['email']):
        f.append('C1:email:profile:email')
    if blank(p['phone']):
        f.append('C1:phone:profile:phone')
    # C4
    if p['photoFile']:
        f.append('C4:photo:design')
    # C5
    for s in model['sections']:
        if s['title'] is not None and ' '.join(s['title'].split()).lower() not in ORACLE_STANDARD:
            f.append('C5:customTitle:section:%d' % s['id'])
    # C6
    targets = [('profile:headline', p['headline'])]
    for s in model['sections']:
        if s['kind'] in ('experience', 'volunteer'):
            targets += [('entry:%d:title' % e['id'], e['title']) for e in s['entries']]
    for tgt, text in targets:
        found = set()
        for ab, _long in ABBR:
            k = 0
            while True:
                k = text.find(ab, k)
                if k < 0:
                    break
                prev = text[k - 1] if k > 0 else ''
                if not (prev and (is_letter(prev) or prev == '.')):
                    found.add(ab)
                k += 1
        k = 0
        while True:
            k = text.find('VP', k)
            if k < 0:
                break
            prev = text[k - 1] if k > 0 else ''
            nxt = text[k + 2] if k + 2 < len(text) else ''
            if not (prev and is_ln(prev)) and not (nxt and is_ln(nxt)):
                found.add('VP')
            k += 1
        for ab in sorted(found):
            f.append('C6:abbreviation:%s:%s' % (tgt, ab))
    # C7 + C13
    font = model['style']['font']
    for tgt, text in text_fields(model):
        toks = text.split()
        run = 0
        hit = False
        for t in toks:
            if len(t) == 1 and is_letter(t):
                run += 1
                if run >= 3:
                    hit = True
            else:
                run = 0
        if hit:
            f.append('C7:spacedLetters:' + tgt)
        bad = sorted({c for c in text if ord(c) not in IGNORED and not covered(ord(c), font, model['template'])})
        if bad:
            f.append('C13:glyphs:%s:%s' % (tgt, ''.join(bad)))
    # C8
    today = ctx['today']
    for s in model['sections']:
        precisions = set()
        for e in s['entries']:
            st, en = e['startDate'], e['endDate']
            for d in (st, en):
                if d:
                    precisions.add(len(d))
            if s['kind'] == 'experience' and not st:
                f.append('C8:noStart:entry:%d' % e['id'])
            if st and en and date_cmp(en, st) < 0:
                f.append('C8:endBeforeStart:entry:%d' % e['id'])
            if st:
                y, m = date_tuple(st)
                future = y > today['year'] if m is None else (y, m) > (today['year'], today['month'])
                if future:
                    f.append('C8:futureStart:entry:%d' % e['id'])
        if len(precisions) > 1:
            f.append('C8:mixedPrecision:section:%d' % s['id'])
    # C9
    for d in model['droppedSections']:
        f.append('C9:emptySection:section:%d' % d['id'])
    for s in model['sections']:
        for e in s['entries']:
            has = (not blank(e['title']) or not blank(e['organization']) or not blank(e['description'])
                   or any(not blank(v) for v in e['extra'].values()) or any(not blank(b['text']) for b in e['bullets']))
            if not has:
                f.append('C9:emptyEntry:entry:%d' % e['id'])
            for b in e['bullets']:
                if blank(b['text']):
                    f.append('C9:emptyBullet:bullet:%d' % b['id'])
    # C10
    seen = set()
    for s in model['sections']:
        if s['kind'] not in ('experience', 'projects', 'volunteer'):
            continue
        for e in s['entries']:
            for b in e['bullets']:
                if blank(b['text']):
                    continue
                t = b['text'].strip()
                w = first_word(t)
                tag = 'bullet:%d' % b['id']
                if len(t) > 300:
                    f.append('C10:long:' + tag)
                if w in FIRST_PERSON:
                    f.append('C10:firstPerson:' + tag)
                if not any(unicodedata.category(c) == 'Nd' for c in t):
                    f.append('C10:noNumber:' + tag)
                if w not in ORACLE_VERBS:
                    f.append('C10:noVerb:' + tag)
                key = ' '.join(t.lower().split())
                while key.endswith('.'):
                    key = key[:-1].rstrip()
                if key in seen:
                    f.append('C10:duplicate:' + tag)
                seen.add(key)
    # C11, C12
    ex = ctx.get('export')
    if ex:
        if ex['bytes'] > 2_500_000:
            f.append('C11:fileSize:export')
        if ex['pages'] > 2:
            f.append('C12:pages:export')
    # C14
    if not blank(p['email']) and not email_ok(p['email']):
        f.append('C14:email:profile:email')
    for i, l in enumerate(p['links']):
        if not blank(l['url']) and not url_ok(l['url']):
            f.append('C14:url:link:%d' % i)
    for s in model['sections']:
        for e in s['entries']:
            if not blank(e['url']) and not url_ok(e['url']):
                f.append('C14:url:entry:%d:url' % e['id'])
    # C15
    rb = ctx.get('readback')
    if rb and not rb.get('unavailable') and rb.get('pass') is False:
        f.append('C15:readbackFailed:export')
    return sorted(f)


# ---------------------------------------------------------------------------------------------------------------
# Generators
rng = random.Random(SEED)

TOKENIZER_INPUTS = [
    'C++, C# and .NET developer', 'Node.js/TypeScript, CI/CD pipelines', 'SAP S/4HANA; A/B testing!',
    'R&D lead. Next sentence', 'Kenntnisse in MS-Office-Kenntnisse und KNX-Kenntnisse', 'Python/Java/Go',
    'Projekt­management und Projekt-Management', 'Müller vs Müller', '„Gute“ Deutsch–Kenntnisse',
    'e.g. Excel, Word (Outlook) | Teams', 'Requirements:\n• 3+ years\n• SQL', 'IT support and it works',
    'Version 3.5 at 10:30 o’clock', 'manager’s office; ﬁle ﬂow', 'vb.net and asp.net and .netcore',
    'tcp/ip ui/ux 24/7 i/o m&a p&l', 'Gesundheits- und Krankenpfleger/-in', 'Kauffrau/Kaufmann für Büromanagement',
    'z. B. Moodle und Tablets', '**Must have** - Docker', 'end. .net start', 'x' * 3 + '-' + 'y',
    'Flüssig: Englisch C1', 'S P A C E D letters', 'trailing punctuation...', '#hashtag @mention',
    # D56 (P3.5 review findings 10, 11)
    'Self-motivated, hands-on, EX-A documents', 'Pflegefachfrau/-mann', 'Umgang mit anderen Praxissoftware-Systemen',
]
# Extraction vectors for D55 (appended after the generated ads, so the seeded sequence is unchanged).
# v1.1 D94: employer names (legal forms, target company), company zones. Invented ads (never the blind set).
D94_ADS = [
    ('Kranich Logistik GmbH & Co. KG sucht Verstärkung in Bremen.\nIhre Aufgaben:\n- Tourenplanung mit SAP\n'
     'Ihr Profil:\n- Führerschein Klasse C\n- SAP-Kenntnisse\nÜber uns:\nKranich Logistik ist ein Familienunternehmen.', ''),
    ('Acme Robotics Ltd is growing.\nResponsibilities:\n- Build dashboards in Tableau\nRequirements:\n- SQL and Python\n'
     'Contact: jobs at Acme Robotics', 'Acme Robotics'),
    ('SAP SE is looking for a consultant in Walldorf.\nRequirements:\n- SAP S/4HANA\n- Excel', ''),
    ('Northwind Freight Inc.\nWe move parcels across Ohio.\nYour tasks:\n- Route planning\n- Dispatch\n'
     'Requirements:\n- Excel\n- Forklift license', 'Northwind'),
]

D55_ADS = ['Anforderungen:\n- Erfahrung in der Java-Entwicklung\n- ITIL-Grundkenntnisse\n- SQL-Datenbanken und C++-Entwicklung',
           'Requirements:\n- SAP-Module FI/CO\n- IT-Support and UX-Design']
VOCAB = ['project', 'projects', 'management', 'manager', 'managers', 'manager’s', 'company', 'companies', 'class',
         'classes', 'analysis', 'analyses', 'pflege', 'pfleger', 'projekt', 'projekte', 'projekten', 'entwicklung',
         'entwicklungen', 'daten', 'datenbank', 'kunde', 'kunden', 'service', 'services', 'sql', 'crm', 'kpi', 'kpis',
         'customer', 'relationship', 'key', 'performance', 'indicator', 'indicators', 'user', 'experience', 'ux',
         'warehouse', 'forklift', 'forklifts', 'müller', 'müller', 'lehrer', 'lehrerin', 'data', 'quality',
         'assurance', 'qa', 'c++', 'c#', '.net', 'node.js', 'react', 'excel', 'büro', 'management-tool',
         'projektmanagement', 'projekt-management', 'e-mail', 'email', 'marketing', 'dsgvo', 'reporting', 'reports']
SEPARATORS = [' ', ' ', ' ', ', ', '. ', '\n', ' • ', ' / ', ' - ', ' (', ') ', '; ', ': ']


def rand_text(k):
    words = []
    for _ in range(k):
        w = rng.choice(VOCAB + list(rng.sample(sorted(STOP), 3)))
        r = rng.random()
        if r < 0.15:
            w = w.upper()
        elif r < 0.3:
            w = w.capitalize()
        words.append(w)
        words.append(rng.choice(SEPARATORS))
    return ''.join(words).strip()


def rand_keyword():
    r = rng.random()
    if r < 0.15:
        a, e = rng.choice(ACRONYMS)
        return rng.choice([a, e])
    n = rng.choice([1, 1, 2, 2, 3])
    return ' '.join(rng.choice(VOCAB) for _ in range(n))


AD_LINES = ['Requirements:', 'Your profile', 'Dein Profil:', 'Nice to have:', 'What we offer:', 'Benefits:',
            'About us', 'Das bringst du mit:', '# Skills', 'Tasks:',
            # D57 (P3.5): headings without colon and inline headings
            'What we offer', 'Wir bieten', 'Deine Aufgaben', 'Benefits: remote work, learning budget', 'Skills: SQL, Excel']


def rand_ad():
    lines = []
    for _ in range(rng.randint(4, 14)):
        if rng.random() < 0.25:
            lines.append(rng.choice(AD_LINES))
        else:
            prefix = rng.choice(['', '', '• ', '- ', '* '])
            lines.append(prefix + rand_text(rng.randint(2, 12)))
    return '\n'.join(lines)


def variant_of(term):
    toks = term.split(' ')
    op = rng.choice(['exact', 'case', 'suffix', 'ies', 'join', 'split', 'acronym', 'nfd'])
    if op == 'case':
        return ' '.join(rng.choice([t.upper(), t.capitalize(), t]) for t in toks)
    if op == 'suffix':
        i = rng.randrange(len(toks))
        toks[i] = toks[i] + rng.choice(['s', 'es', 'en', 'e', 'er', "'s", 'n', '\u2019s'])
        return ' '.join(toks)
    if op == 'ies':
        return ' '.join(t[:-1] + 'ies' if t.endswith('y') else t for t in toks)
    if op == 'join':
        return rng.choice(['-', '']).join(toks)
    if op == 'split':
        t = toks[0]
        if len(t) > 4:
            m = rng.randint(2, len(t) - 2)
            toks[0] = t[:m] + rng.choice(['-', ' ']) + t[m:]
        return ' '.join(toks)
    if op == 'acronym':
        for a, e in ACRONYMS:
            if term == a:
                return e
            if term == e:
                return a.upper()
        return term
    if op == 'nfd':
        return unicodedata.normalize('NFD', term)
    return term


def tokenizer_vector(text):
    out = []
    for line in lines_of(text):
        for seg in segments_of_line(line):
            out.append([t['low'] for t in seg])
    return out


def keywords_vectors():
    tok = [{'text': t, 'segments': tokenizer_vector(t)} for t in TOKENIZER_INPUTS]
    tok += [{'text': t, 'segments': tokenizer_vector(t)} for t in (rand_text(rng.randint(3, 15)) for _ in range(60))]
    ads = []
    expected = json.loads((FIX / 'job-ads' / 'expected.json').read_text())
    for name in sorted(k for k in expected if not k.startswith('_')):
        text = (FIX / 'job-ads' / (name + '.txt')).read_text()
        ads.append({'name': name, 'file': name + '.txt', **extract(text)})
    for i in range(40):
        text = rand_ad()
        ads.append({'name': 'random-%d' % i, 'text': text, **extract(text)})
    for i, text in enumerate(D55_ADS):
        ads.append({'name': 'd55-%d' % i, 'text': text, **extract(text)})
    for i, (text, company) in enumerate(D94_ADS):
        ads.append({'name': 'd94-%d' % i, 'text': text, 'company': company, **extract(text, company)})
    long_ad = ('Python SQL Docker. ' * 3000)
    ads.append({'name': 'long', 'text': long_ad, **extract(long_ad)})
    matches = []
    for _ in range(500):
        pieces = [rand_text(rng.randint(1, 10)) for _ in range(rng.randint(1, 4))]
        term = rand_keyword()
        if rng.random() < 0.65:
            k = rng.randrange(len(pieces))
            pieces[k] = pieces[k] + rng.choice([' ', ', ', '\n', ' \u2022 ']) + variant_of(term) + rng.choice(['', '.', ' and more'])
        matches.append({'term': term, 'pieces': pieces, **match(term, pieces)})
    hand = [
        ('projektmanagement', ['Erfahrung im Projekt-Management']), ('projekt management', ['Projektmanagement']),
        ('c++', ['Modern C++ and C#']), ('c#', ['C++ only']), ('.net', ['ASP.NET and .NET 8']),
        ('kpi', ['Defined key performance indicators']), ('customer relationship management', ['CRM (HubSpot)']),
        ('companies', ['Worked for three company sites']), ('manage', ['Manages a team']),
        ('pflegefachkraft', ['Pflegefachkräfte']), ('müller', ['Müller GmbH']),
        ('python', ['Python/Java developer']), ('knx', ['KNX-Kenntnisse vorhanden']), ('e-mail', ['Email support']),
        # D54 (P3.5 review finding 4): short words never meet acronyms by stemming
        ('it', ['Improved its onboarding']), ('hr', ['HRs records']), ('go', ['The release goes live']),
        ('cs', ['CSS and HTML']), ('qa', ['QAs signed off']), ('api', ['REST APIs']), ('kpi', ['Owned three KPIs']),
        # D55 (P3.5 review finding 3): hyphen compounds expose their parts
        ('java', ['5 Jahre Java-Entwicklung']), ('sql', ['SQL-Datenbanken']), ('c++', ['C++-Entwicklung']),
        ('sap', ['SAP-Module']), ('ux', ['UX-Design']), ('lkw', ['LKW-Führerschein']), ('it', ['IT-Support im 2nd Level']),
        ('datenbank', ['SQL-Datenbanken']), ('sql', ['T-SQL']), ('front end', ['Front-End-Entwicklung']),
        # D58 (P3.5 review finding 12)
        ('teamfähigkeit', ['Teamfaehigkeit und Zuverlaessigkeit']), ('node.js', ['NodeJS and Express']),
        ('istanbul', ['Büro in İstanbul']), ('straße', ['Musterstrasse 1']), ('.net', ['ASP.NET']),
    ]
    for term, pieces in hand:
        matches.append({'term': term, 'pieces': pieces, **match(term, pieces)})
    return {'seed': SEED, 'tokenizer': tok, 'extraction': ads, 'matching': matches}


# ---- checks generator
TITLE_POOL = ['Warehouse Lead', 'Sr. Developer', 'Jr. Analyst', 'Project Mgr.', 'Asst. Manager', 'B.Eng. Mechanical',
              'Dir. of Sales', 'VP Marketing', 'VPN Engineer', 'Senior Nurse', 'S E N I O R Nurse', 'Lehrerin',
              'Data Eng. Lead', '', 'Café Owner ☕', 'Pflegefachkraft', 'Менеджер']
ORG_POOL = ['Northwind', '', 'Acme GmbH', 'Müller & Söhne', 'Beta ™ Labs', '東京 Corp']
BULLET_POOL_START = sorted(ORACLE_VERBS) + sorted(ORACLE_NON_VERBS) + ['I', 'My', 'Ich', 'Meine', 'mein']
DATES = [None, None, '2019', '2020-03', '2021-11', '2018', '2027', '2026-11', '2026-10', '2015-01', '2030-01', '2019-06', '2026', '2020', '2027-01']
URLS = ['https://example.com', 'linkedin.com/in/x', 'www.example.de/profil', 'http://a.b', 'not a url', 'ftp://x.com',
        'example', 'https://ex ample.com', 'https://müller.de', 'example.com:8080/x', 'example.com:abc', '']
EMAILS = ['a@b.co', 'jo.lee@example.com', 'bad@', 'no-at.example.com', 'x@y', 'a b@c.de', '', '  ', 'a@müller.de']
KINDS = ['experience', 'experience', 'education', 'skills', 'projects', 'volunteer', 'languages', 'custom']


def rand_bullet(bid):
    r = rng.random()
    if r < 0.08:
        text = ''
    elif r < 0.12:
        text = 'Led ' + 'very long text ' * 25
    elif r < 0.16:
        text = ('Led 3 ' + 'x' * 300)[:rng.choice([299, 300, 301])]  # boundary of the 300-character rule
    else:
        start = rng.choice(BULLET_POOL_START)
        rest = rng.choice(['a team of 5', 'the weekly report', 'Erfolg', 'daily tasks', 'C++ \U0001F680 rollout',
                           'cut costs by 12%', 'S P A C E', 'stuff.', 'Ω meter readings', 'on time'])
        text = start + ' ' + rest
    return {'id': bid, 'text': text}


def rand_model(case):
    nid = [100]

    def next_id():
        nid[0] += 1
        return nid[0]

    sections = []
    dropped = []
    for _ in range(rng.randint(0, 5)):
        sid = next_id()
        kind = rng.choice(KINDS)
        title = None
        r = rng.random()
        if r < 0.2:
            title = rng.choice(sorted(ORACLE_STANDARD)).title()
        elif r < 0.35:
            title = rng.choice(ORACLE_CUSTOM)
        if rng.random() < 0.1:
            dropped.append({'id': sid, 'kind': kind, 'title': title})
            continue
        entries = []
        for _ in range(rng.randint(1, 3)):
            eid = next_id()
            st, en = rng.choice(DATES), rng.choice(DATES)
            current = en is None and rng.random() < 0.3
            bullets = [rand_bullet(next_id()) for _ in range(rng.randint(0, 3))]
            if rng.random() < 0.1 and entries and entries[0]['bullets'] and bullets:
                bullets[0]['text'] = entries[0]['bullets'][0]['text'].upper() + '.'
            entries.append({
                'id': eid, 'title': rng.choice(TITLE_POOL), 'organization': rng.choice(ORG_POOL),
                'location': rng.choice(['', 'Berlin', 'Columbus, OH']), 'description': rng.choice(['', '', 'Short text.', 'Text with \U0001F600']),
                'startDate': st, 'endDate': en, 'isCurrent': current, 'url': rng.choice(URLS[:6] + ['', '', '']),
                'extra': rng.choice([{}, {}, {'grade': '1,7'}, {'level': ''}, {'level': 'C1'}]), 'bullets': bullets,
            })
        sections.append({'id': sid, 'kind': kind, 'title': title, 'pageBreakBefore': False, 'entries': entries})
    model = {
        'versionId': case, 'name': 'Case %d' % case, 'language': rng.choice(['en', 'de']), 'template': 'modern',
        'style': {'font': rng.choice([None, 'inter', 'lato', 'merriweather', 'noto-sans']), 'accent': None, 'sizeStep': 0,
                  'marginStep': 0, 'spacingStep': 0, 'headingCase': None, 'photo': False, 'paper': 'a4', 'dateStyle': 'MM/YYYY'},
        'person': {
            'fullName': rng.choice(['Jordan Lee', '', '  ', 'J o r d a n', 'Léa Müller', '李雷']),
            'headline': rng.choice(['', 'Sr. Engineer', 'VP of Ops', 'Team Lead', 'Pflegefachkraft']),
            'email': rng.choice(EMAILS), 'phone': rng.choice(['', '+1 555 0100']), 'city': rng.choice(['', 'Berlin']),
            'region': '', 'countryCode': '', 'birthDate': None, 'nationality': rng.choice([None, 'deutsch']),
            'photoFile': rng.choice([None, None, 'photos/me.jpg']),
            'links': [{'label': 'website', 'customLabel': None, 'url': rng.choice(URLS)} for _ in range(rng.randint(0, 2))],
        },
        'summary': rng.choice(['', 'Ich bin Pflegefachkraft.', 'Reliable lead — 10 years.', 'Smile ☺ always']),
        'sections': sections, 'droppedSections': dropped,
    }
    model['template'] = rng.choice(sorted(DEFAULT_FONT))  # P3: font None → the template's font (D44)
    ctx = {'today': {'year': 2026, 'month': 10}}
    r = rng.random()
    if r < 0.3:
        ctx['export'] = {'bytes': rng.choice([90_000, 2_500_000, 2_500_001, 4_000_000]), 'pages': rng.choice([1, 2, 3])}
    rr = rng.random()
    if rr < 0.2:
        ctx['readback'] = {'pass': True}
    elif rr < 0.4:
        ctx['readback'] = {'pass': False}
    elif rr < 0.5:
        ctx['readback'] = {'unavailable': True}
    return model, ctx


def checks_vectors():
    cases = []
    for i in range(300):
        model, ctx = rand_model(i)
        cases.append({'model': model, 'ctx': ctx, 'findings': checks(model, ctx)})
    return {
        'seed': SEED, 'verbs': sorted(ORACLE_VERBS), 'nonVerbs': sorted(ORACLE_NON_VERBS),
        'standardHeadings': sorted(ORACLE_STANDARD), 'customHeadings': ORACLE_CUSTOM, 'cases': cases,
    }


def main():
    out = FIX / 'oracle'
    out.mkdir(exist_ok=True)
    kv = keywords_vectors()
    (out / 'keywords.json').write_text(json.dumps(kv, ensure_ascii=False, separators=(',', ':')) + '\n')
    cv = checks_vectors()
    (out / 'checks.json').write_text(json.dumps(cv, ensure_ascii=False, separators=(',', ':')) + '\n')
    fired = {}
    for c in cv['cases']:
        for fnd in c['findings']:
            key = ':'.join(fnd.split(':')[:2])
            fired[key] = fired.get(key, 0) + 1
    statuses = {}
    for m in kv['matching']:
        statuses[m['status']] = statuses.get(m['status'], 0) + 1
    print('tokenizer', len(kv['tokenizer']), 'ads', len(kv['extraction']), 'matching', len(kv['matching']), statuses)
    print('checks', len(cv['cases']), 'finding kinds', len(fired))
    print(' '.join('%s=%d' % kv_ for kv_ in sorted(fired.items())))


if __name__ == '__main__':
    main()
