"""Independent oracle for SPEC 5.1 (+ D31/D32 refinements), written from the spec text only."""
import json, random, sys

FIELDS = ['title', 'organization', 'location', 'description']
KINDS = ['experience','education','projects','skills','custom']

def gen_case(rng):
    nsec = rng.randint(0, 4)
    secs, ents, buls = [], [], []
    sid = eid = bid = 0
    pos_pool = lambda n: rng.sample(range(0, n * 3 + 3), n) if rng.random() < .7 else [rng.randint(0, 3) for _ in range(n)]
    sp = pos_pool(nsec)
    for i in range(nsec):
        sid += rng.randint(1, 3)
        secs.append(dict(id=sid, kind=rng.choice(KINDS), customTitle=rng.choice([None, None, '', 'Custom T']), position=sp[i]))
        ne = rng.randint(0, 4); ep = pos_pool(ne)
        for j in range(ne):
            eid += rng.randint(1, 3)
            created = rng.randint(1000, 2000); updated = created + rng.choice([0, 0, rng.randint(1, 1500)])
            ents.append(dict(id=eid, sectionId=sid, position=ep[j], title=f'T{eid}', organization=rng.choice(['', f'O{eid}']),
                             location=rng.choice(['', f'L{eid}']), startDate=None, endDate=None, isCurrent=False, url='',
                             description=rng.choice(['', f'D{eid}']), extra={}, createdAt=created, updatedAt=updated))
            nb = rng.randint(0, 4); bp = pos_pool(nb)
            for k in range(nb):
                bid += rng.randint(1, 3)
                bc = rng.randint(1000, 2000)
                buls.append(dict(id=bid, entryId=eid, position=bp[k], text=f'B{bid}', createdAt=bc, updatedAt=bc))
    vcreated = rng.randint(900, 2100)
    lastexp = rng.choice([None, rng.randint(vcreated, 2600)])
    def vpos():
        return rng.choice([None, None, rng.randint(0, 5)])
    vs = [dict(sectionId=s['id'], included=rng.random() > .25, position=vpos(), titleOverride=rng.choice([None, '', 'Over', ' ']),
               pageBreakBefore=rng.random() < .2) for s in secs if rng.random() < .5]
    ve = []
    for e in ents:
        if rng.random() < .5:
            ov = {}
            for f in FIELDS:
                if rng.random() < .25: ov[f] = rng.choice(['', 'X' + f])
            ve.append(dict(entryId=e['id'], included=rng.random() > .3, position=vpos(), overrides=ov,
                           seenMasterAt=rng.choice([None, rng.randint(900, 3000)])))
    vb = [dict(bulletId=b['id'], included=rng.random() > .3, position=vpos(), textOverride=rng.choice([None, '', 'OB', '  ']))
          for b in buls if rng.random() < .5]
    profile = dict(fullName='N', headline='H', email='e@x.de', phone='', city='', region='', countryCode='', birthDate=None,
                   nationality=None, showPersonal=False, photoFile=None, summary='S', isExample=False, updatedAt=1)
    version = dict(id=1, name='V', targetCompany='', targetRole='', jobAd='', language='en', template='plain', styleJson='{}',
                   headlineOverride=rng.choice([None, '', 'HO']), summaryOverride=rng.choice([None, '', 'SO']), sourceVersionId=None,
                   archived=False, isExample=False, createdAt=vcreated, updatedAt=vcreated, lastExportedAt=lastexp)
    return dict(master=dict(profile=profile, links=[], sections=secs, entries=ents, bullets=buls),
                state=dict(version=version, sections=vs, entries=ve, bullets=vb))

def order(items, vrow):
    """Rule 1: version-positioned first by version position (ties: master order), then unpositioned in master order."""
    master = sorted(items, key=lambda x: (x['position'], x['id']))
    rank = {x['id']: i for i, x in enumerate(master)}
    pos = [x for x in master if vrow(x) and vrow(x)['position'] is not None]
    unpos = [x for x in master if not (vrow(x) and vrow(x)['position'] is not None)]
    pos.sort(key=lambda x: (vrow(x)['position'], rank[x['id']]))
    return pos + unpos

def oracle(case):
    m, st = case['master'], case['state']; v = st['version']
    VS = {r['sectionId']: r for r in st['sections']}; VE = {r['entryId']: r for r in st['entries']}; VB = {r['bulletId']: r for r in st['bullets']}
    base = v['lastExportedAt'] if v['lastExportedAt'] is not None else v['createdAt']
    out_secs = []
    for s in order(m['sections'], lambda x: VS.get(x['id'])):
        r = VS.get(s['id'])
        to = r['titleOverride'] if r else None
        title = to if (to is not None and to.strip() != '') else s['customTitle']
        if title is not None and title.strip() == '': title = None
        ents = []
        for e in order([e for e in m['entries'] if e['sectionId'] == s['id']], lambda x: VE.get(x['id'])):
            er = VE.get(e['id']); ov = er['overrides'] if er else {}
            bl = []
            for b in order([b for b in m['bullets'] if b['entryId'] == e['id']], lambda x: VB.get(x['id'])):
                br = VB.get(b['id'])
                t = br['textOverride'] if br else None
                bover = t is not None and t.strip() != ''  # whitespace = blank (engine interpretation, accepted); SPEC: "override if non-empty"
                bl.append(dict(id=b['id'], text=t if bover else b['text'], included=br['included'] if br else True, overridden=bover))
            new = e['createdAt'] > base
            seen = er['seenMasterAt'] if er and er['seenMasterAt'] is not None else None
            ref = max([x for x in [v['createdAt'], v['lastExportedAt'], seen] if x is not None])
            ents.append(dict(id=e['id'], included=er['included'] if er else True,
                             **{f: (ov[f] if f in ov else e[f]) for f in FIELDS},
                             overridden=bool(ov) or any(b['overridden'] for b in bl),
                             newSinceExport=new, masterChanged=(not new) and e['updatedAt'] > ref, bullets=bl))
        out_secs.append(dict(id=s['id'], title=title, included=r['included'] if r else True,
                             pageBreakBefore=bool(r and r['pageBreakBefore']), entries=ents))
    resolved = dict(headline=v['headlineOverride'] if v['headlineOverride'] is not None else m['profile']['headline'],
                    summary=v['summaryOverride'] if v['summaryOverride'] is not None else m['profile']['summary'], sections=out_secs)
    render, dropped = [], []
    for s in out_secs:
        if not s['included']: continue
        es = [dict(id=e['id'], **{f: e[f] for f in FIELDS}, bullets=[dict(id=b['id'], text=b['text']) for b in e['bullets'] if b['included']])
              for e in s['entries'] if e['included']]
        if not es: dropped.append(s['id']); continue
        render.append(dict(id=s['id'], title=s['title'], pageBreakBefore=s['pageBreakBefore'], entries=es))
    return dict(resolved=resolved, render=dict(summary=resolved['summary'], headline=resolved['headline'], sections=render, dropped=dropped))

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'gen':
        rng = random.Random(int(sys.argv[3]))
        json.dump([gen_case(rng) for _ in range(int(sys.argv[2]))], open(sys.argv[4], 'w'))
    else:
        cases = json.load(open(sys.argv[2])); eng = json.load(open(sys.argv[3]))
        from collections import Counter
        mism = Counter(); examples = {}
        def cmp(path, a, b, cls):
            if a != b:
                mism[cls] += 1
                examples.setdefault(cls, (path, a, b))
        for i, (c, e) in enumerate(zip(cases, eng)):
            o = oracle(c)
            os_, es_ = o['resolved']['sections'], e['resolved']['sections']
            cmp((i, 'secorder'), [s['id'] for s in os_], [s['id'] for s in es_], 'section order')
            cmp((i, 'head'), (o['resolved']['headline'], o['resolved']['summary']), (e['resolved']['headline'], e['resolved']['summary']), 'headline/summary')
            for s1, s2 in zip(os_, es_):
                if s1['id'] != s2['id']: break
                cmp((i, s1['id']), s1['title'], s2['title'], 'section title')
                cmp((i, s1['id']), s1['included'], s2['included'], 'section included')
                cmp((i, s1['id']), [x['id'] for x in s1['entries']], [x['id'] for x in s2['entries']], 'entry order')
                for e1, e2 in zip(s1['entries'], s2['entries']):
                    if e1['id'] != e2['id']: break
                    for f in FIELDS: cmp((i, e1['id'], f), e1[f], e2[f], 'entry field')
                    for f in ['included', 'overridden', 'newSinceExport', 'masterChanged']: cmp((i, e1['id'], f), e1[f], e2[f], 'flag ' + f)
                    cmp((i, e1['id'], 'border'), [b['id'] for b in e1['bullets']], [b['id'] for b in e2['bullets']], 'bullet order')
                    for b1, b2 in zip(e1['bullets'], e2['bullets']):
                        if b1['id'] != b2['id']: break
                        for f in ['text', 'included', 'overridden']: cmp((i, b1['id'], f), b1[f], b2[f], 'bullet ' + f)
            r1, r2 = o['render'], e['render']
            cmp((i, 'render'), r1['sections'], [dict(id=s['id'], title=s['title'], pageBreakBefore=s['pageBreakBefore'],
                entries=[dict(id=x['id'], **{f: x[f] for f in FIELDS}, bullets=[dict(id=b['id'], text=b['text']) for b in x['bullets']]) for x in s['entries']])
                for s in r2['sections']], 'render model')
            cmp((i, 'dropped'), r1['dropped'], [d['id'] for d in r2['droppedSections']], 'dropped sections')
        print('cases', len(cases), 'mismatches', sum(mism.values()), dict(mism))
        for k, v in examples.items(): print(k, v)
