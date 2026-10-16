import json, sys
from cmp_oracle import compare, items_to_lines
inp = json.load(open(sys.argv[1])); eng = {e['name']: e for e in json.load(open(sys.argv[2]))}
agree = dis = 0; rows = []
for c in inp:
    E = [l['text'] for l in c['expectedLines']]
    for reader in ('pdfjs', 'pdfkit', 'lines'):
        if not c.get(reader): continue
        if reader == 'pdfjs':
            lines = []; gaps = []
            for p in c['pdfjs']['pages']:
                l, g = items_to_lines(p['items']); lines += l; gaps += g
        elif reader == 'pdfkit':
            lines = [l for p in c['pdfkit'] for l in p.split('\n') if l.strip()]; gaps = []
        else:
            lines = c['lines']; gaps = []
        o = compare(E, lines, gaps)
        e = eng[c['name']]['synthetic' if reader == 'lines' else reader]
        same = (o['pass_'] == e['pass'] and o['expected'] == e['words']['expected'] and o['found'] == e['words']['found']
                and sorted(o['moved']) == sorted(e['moved']) and sorted(o['split']) == sorted(e['split']))
        agree += same; dis += not same
        rows.append((c['name'], reader, o['pass_'], e['pass'], same))
        if not same or '-v' in sys.argv:
            print(f"{'DIFF' if not same else 'same'} {c['name']} [{reader}] oracle pass={o['pass_']} words={o['found']}/{o['expected']} moved={o['moved']} split={o['split']} spaced={o['spaced']} gaps={len(o['gaps'])} | engine pass={e['pass']} words={e['words']['found']}/{e['words']['expected']} moved={e['moved']} split={e['split']} spaced={e['spaced']} gaps={e['gaps']}")
print('comparisons', agree + dis, 'agree', agree, 'disagree', dis)
print('oracle passes', sum(r[2] for r in rows), 'engine passes', sum(r[3] for r in rows))
