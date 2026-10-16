"""Independent reference model of the master/version operations (SPEC 5.1, D31, D32), replaying the engine's op log."""
import json, sys, copy
from collections import Counter
sys.path.insert(0, sys.argv[0].rsplit('/', 1)[0])
from resolve_oracle import oracle
F = ['title', 'organization', 'location', 'description']

def reorder(lst, item, k):
    rest = [x for x in lst if x != item]; k = max(0, min(len(rest), int(k))); rest.insert(k, item); return rest

class M:
    def __init__(s):
        s.prof = dict(headline='H', summary='S'); s.secs = []  # ordered ids
        s.ents = {}; s.eorder = {}; s.buls = {}; s.border = {}; s.vers = {}; s.seq = Counter(); s.kind = {}
    def vorder(s, v, items, rows):
        pos = [x for x in items if x in rows and rows[x]['pos'] is not None]
        unpos = [x for x in items if not (x in rows and rows[x]['pos'] is not None)]
        pos.sort(key=lambda x: (rows[x]['pos'], items.index(x)))
        return pos + unpos
    def touch(s, eid, now): s.ents[eid]['updated'] = now
    def del_entry(s, eid):
        for b in s.border.pop(eid): s.del_bullet_rows(b); s.buls.pop(b)
        s.ents.pop(eid)
        for v in s.vers.values(): v['ve'].pop(eid, None)
    def del_bullet_rows(s, b):
        for v in s.vers.values(): v['vb'].pop(b, None)
    def row(s, v, kind, i):
        d = s.vers[v][kind]
        if i not in d: d[i] = dict(inc=True, pos=None, title=None, ov={}, seen=None, text=None)
        return d[i]
    def case(s, vid):
        v = s.vers[vid]
        secs = [dict(id=x, kind='custom', customTitle=None, position=i) for i, x in enumerate(s.secs)]
        ents = []; buls = []
        for sid in s.secs:
            for i, e in enumerate(s.eorder[sid]):
                E = s.ents[e]; ents.append(dict(id=e, sectionId=sid, position=i, createdAt=E['created'], updatedAt=E['updated'], **{f: E[f] for f in F}))
                for j, b in enumerate(s.border[e]): buls.append(dict(id=b, entryId=e, position=j, text=s.buls[b]['text']))
        st = dict(version=dict(createdAt=v['created'], lastExportedAt=v['lastExp'], headlineOverride=v['ho'], summaryOverride=v['so']),
                  sections=[dict(sectionId=k, included=r['inc'], position=r['pos'], titleOverride=r['title'], pageBreakBefore=False) for k, r in v['vs'].items()],
                  entries=[dict(entryId=k, included=r['inc'], position=r['pos'], overrides=r['ov'], seenMasterAt=r['seen']) for k, r in v['ve'].items()],
                  bullets=[dict(bulletId=k, included=r['inc'], position=r['pos'], textOverride=r['text']) for k, r in v['vb'].items()])
        return dict(master=dict(profile=s.prof, sections=secs, entries=ents, bullets=buls), state=st)

def apply(m, L):
    op, a, res, now = L['op'], L['args'], L['res'], L['now']
    err = isinstance(res, dict) and 'error' in res
    if a == ['skip']: return None
    if op == 'addSection': m.secs.append(res); m.eorder[res] = []
    elif op == 'moveSection': m.secs = reorder(m.secs, a[0], a[1])
    elif op == 'deleteSection':
        for e in list(m.eorder.pop(a[0])): m.del_entry(e)
        m.secs.remove(a[0]); [v['vs'].pop(a[0], None) for v in m.vers.values()]
    elif op == 'addEntry':
        m.ents[res] = dict(sid=a[0], created=now, updated=now, title=a[1]['title'], organization='', location='', description=''); m.eorder[a[0]].append(res); m.border[res] = []
    elif op == 'updateEntry':
        (f, val), = a[1].items(); E = m.ents[a[0]]; ch = E[f] != val
        if ch: E[f] = val; E['updated'] = now
        return ('ret', ch)
    elif op == 'moveEntry': sid = m.ents[a[0]]['sid']; m.eorder[sid] = reorder(m.eorder[sid], a[0], a[1])
    elif op == 'duplicateEntry':
        E = m.ents[a[0]]; sid = E['sid']; new = res
        m.ents[new] = dict(E, created=now, updated=now); i = m.eorder[sid].index(a[0]); m.eorder[sid].insert(i + 1, new)
        m.border[new] = []
        for b in m.border[a[0]]:
            m.seq['b'] += 1; nb = m.seq['b']; m.buls[nb] = dict(text=m.buls[b]['text'], eid=new); m.border[new].append(nb)
    elif op == 'deleteEntry':
        e = a[0]; sid = m.ents[e]['sid']
        m.undo = dict(e=e, sid=sid, pos=m.eorder[sid].index(e), ent=copy.deepcopy(m.ents[e]), bo=list(m.border[e]),
                      bt={b: copy.deepcopy(m.buls[b]) for b in m.border[e]},
                      ve={v: copy.deepcopy(x['ve'][e]) for v, x in m.vers.items() if e in x['ve']},
                      vb={(v, b): copy.deepcopy(x['vb'][b]) for v, x in m.vers.items() for b in m.border[e] if b in x['vb']})
        m.eorder[sid].remove(e); m.del_entry(e)
    elif op == 'restoreEntry':
        u = m.undo
        if u['sid'] not in m.eorder: return ('err',)
        m.ents[u['e']] = u['ent']; m.eorder[u['sid']].insert(u['pos'], u['e']); m.border[u['e']] = u['bo']
        for b, t in u['bt'].items(): m.buls[b] = t
        for v, r in u['ve'].items():
            if v in m.vers: m.vers[v]['ve'][u['e']] = r
        for (v, b), r in u['vb'].items():
            if v in m.vers: m.vers[v]['vb'][b] = r
    elif op == 'addBullet':
        e = a[0]; m.seq['b'] = max(m.seq['b'], res); m.buls[res] = dict(text=a[1], eid=e)
        o = m.border[e]; k = len(o) if a[2] is None else max(0, min(len(o), a[2])); o.insert(k, res); m.touch(e, now)
    elif op == 'updateBullet':
        B = m.buls[a[0]]; ch = B['text'] != a[1]
        if ch: B['text'] = a[1]; m.touch(B['eid'], now)
        return ('ret', ch)
    elif op == 'moveBullet':
        e = m.buls[a[0]]['eid']; n = reorder(m.border[e], a[0], a[1])
        if n != m.border[e]: m.touch(e, now)
        m.border[e] = n
    elif op == 'deleteBullet':
        e = m.buls[a[0]]['eid']; m.border[e].remove(a[0]); m.buls.pop(a[0]); m.del_bullet_rows(a[0]); m.touch(e, now)
    elif op == 'updateProfile': m.prof.update(a[0])
    elif op == 'createVersion': m.vers[res] = dict(created=now, lastExp=None, ho=None, so=None, vs={}, ve={}, vb={})
    elif op == 'duplicateVersion': m.vers[res] = dict(copy.deepcopy(m.vers[a[0]]), created=now, lastExp=None)
    elif op == 'deleteVersion': m.vers.pop(a[0])
    elif op == 'export': m.vers[a[0]]['lastExp'] = now
    elif op == 'headlineOv': m.vers[a[0]]['ho'] = a[1]
    elif op == 'summaryOv': m.vers[a[0]]['so'] = a[1]
    elif op == 'applyProfile':
        k = 'ho' if a[1] == 'headline' else 'so'; V = m.vers[a[0]]
        if V[k] is not None: m.prof[a[1]] = V[k]; V[k] = None
    elif op in ('vSecInc', 'vEntInc', 'vBulInc'):
        m.row(a[0], {'vSecInc': 'vs', 'vEntInc': 've', 'vBulInc': 'vb'}[op], a[1])['inc'] = a[2]
    elif op in ('vSecMove', 'vEntMove', 'vBulMove'):
        v, i, k = a; kind = {'vSecMove': 'vs', 'vEntMove': 've', 'vBulMove': 'vb'}[op]
        sib = m.secs if kind == 'vs' else m.eorder[m.ents[i]['sid']] if kind == 've' else m.border[m.buls[i]['eid']]
        cur = m.vorder(v, sib, m.vers[v][kind]); new = reorder(cur, i, k)
        for p, x in enumerate(new): m.row(v, kind, x)['pos'] = p
    elif op in ('vResetSec', 'vResetEnt'):
        v, i = a; kind = 'vs' if op == 'vResetSec' else 've'
        sib = m.secs if kind == 'vs' else m.eorder[m.ents[i]['sid']]
        for x in sib:
            if x in m.vers[v][kind]: m.vers[v][kind][x]['pos'] = None
    elif op == 'vSecTitle': t = a[2]; m.row(a[0], 'vs', a[1])['title'] = t.strip() if t and t.strip() else None
    elif op == 'vEntOv': m.row(a[0], 've', a[1])['ov'][a[2]] = a[3]
    elif op == 'vEntOvClear': m.row(a[0], 've', a[1])['ov'].pop(a[2], None)
    elif op == 'applyEntry':
        v, e, fs = a; r = m.vers[v]['ve'].get(e); fs = fs or F
        patch = {f: r['ov'][f] for f in fs if r and f in r['ov']}
        if patch:
            E = m.ents[e]; ch = any(E[f] != x for f, x in patch.items())
            E.update(patch)
            if ch: E['updated'] = now
            for f in patch: r['ov'].pop(f)
            r['seen'] = now
    elif op == 'seen': m.row(a[0], 've', a[1])['seen'] = now
    elif op == 'vBulOv': t = a[2]; m.row(a[0], 'vb', a[1])['text'] = t if t is not None and t.strip() else None
    elif op == 'applyBullet':
        v, b = a; r = m.vers[v]['vb'].get(b)
        if r and r['text'] is not None:
            B = m.buls[b]
            if B['text'] != r['text']: B['text'] = r['text']; m.touch(B['eid'], now)
            r['text'] = None; m.row(v, 've', B['eid'])['seen'] = now
    return None

def compact(o):
    rv = o['resolved']
    return dict(h=rv['headline'], s=rv['summary'], sec=[dict(id=s['id'], t=s['title'], i=s['included'], e=[dict(id=e['id'], i=e['included'], f=[e[f] for f in F],
                n=e['newSinceExport'], c=e['masterChanged'], o=e['overridden'], b=[[b['id'], b['text'], b['included']] for b in e['bullets']]) for e in s['entries']]) for s in rv['sections']])

runs = json.load(open(sys.argv[1])); mism = Counter(); ex = {}; nops = Counter(); touched = 0; errs = Counter(); checks = 0
for ri, log in enumerate(runs):
    m = M(); m.undo = None
    for si, L in enumerate(log):
        if L['op'] in ('addEntry', 'duplicateEntry') and isinstance(L['res'], int): pass
        if L['op'] == 'deleteEntry': pass
        nops[L['op']] += 1
        if L['masterTouchedByVersionOp']: touched += 1
        engine_err = isinstance(L['res'], dict) and 'error' in L['res']
        if engine_err: errs[(L['op'], L['res']['error'][:60])] += 1
        r = apply(m, L) if not engine_err or L['op'] == 'restoreEntry' else ('err',)
        if L['op'] == 'restoreEntry' and (r == ('err',)) != engine_err: mism['restore error'] += 1
        if r and r[0] == 'ret' and r[1] != L['res']: mism['return ' + L['op']] += 1
        # deleteEntry/duplicateEntry: keep seq in sync with engine ids
        for vid, eng in L['resolved'].items():
            vid = int(vid)
            if vid not in m.vers: mism['version set'] += 1; continue
            checks += 1
            o = compact(oracle(m.case(vid)))
            if o != eng:
                mism[L['op']] += 1
                if L['op'] not in ex: ex[L['op']] = (ri, si, L['args'], o, eng)
        if mism and sum(mism.values()) > 0 and len(ex) > 3: break
print('runs', len(runs), 'ops', sum(nops.values()), 'version resolutions compared', checks, 'master touched by version op', touched)
print('engine errors', dict(errs))
print('mismatches', dict(mism))
for k, v in list(ex.items())[:3]:
    print('---', k, v[:3]); print(' oracle', json.dumps(v[3])[:900]); print(' engine', json.dumps(v[4])[:900])
