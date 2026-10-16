"""Own test documents for C1-C15 with verdicts derived from SPEC 5.5 + D40 (thresholds), not from engine output."""
import json, copy
RANK = {'attention': 3, 'warning': 2, 'info': 1}
def style(font=None, photo=False):
    return dict(font=font, accent=None, sizeStep=0, marginStep=0, spacingStep=0, headingCase=None, photo=photo, paper='a4', dateStyle='MM/YYYY')
def entry(i, title='Warehouse Lead', org='Acme GmbH', start='2019-03', end=None, cur=True, bullets=('Reduced picking errors by 30% in 2023',), desc='', loc='Hamburg', url='', extra=None):
    return dict(id=i, title=title, organization=org, location=loc, description=desc, startDate=start, endDate=end, isCurrent=cur, url=url,
                extra=extra or {}, bullets=[dict(id=i * 100 + k, text=t) for k, t in enumerate(bullets)])
def base():
    return dict(versionId=1, name='V', language='en', template='modern', style=style('inter'),
                person=dict(fullName='Anna Schmidt', headline='Warehouse Lead', email='anna@example.de', phone='+49 40 1234567', city='Hamburg',
                            region='', countryCode='DE', birthDate=None, nationality=None, photoFile=None,
                            links=[dict(label='linkedin', customLabel=None, url='linkedin.com/in/anna-schmidt')]),
                summary='Warehouse lead with 8 years in logistics.',
                sections=[dict(id=1, kind='experience', title=None, pageBreakBefore=False, entries=[entry(1), entry(2, title='Picker', start='2016-01', end='2019-02', cur=False, bullets=('Picked 1,200 items per shift with 99.8% accuracy',))]),
                          dict(id=2, kind='education', title=None, pageBreakBefore=False, entries=[entry(3, title='Kaufmann für Logistik', org='BS Hamburg', start='2013', end='2016', cur=False, bullets=())])],
                droppedSections=[])
GOOD_CTX = dict(today=dict(year=2026, month=10), lastExport=dict(bytes=90_000, pages=1), readback=dict(pass_=True))
def ctx(**kw):
    c = copy.deepcopy(GOOD_CTX); c.update(kw); return c
CLEAN = {'C1': 'ok', 'C2': 'ok', 'C3': 'ok', 'C4': 'ok', 'C5': 'ok', 'C6': 'ok', 'C7': 'ok', 'C8': 'ok', 'C9': 'ok', 'C10': 'ok', 'C11': 'ok', 'C12': 'ok', 'C13': 'ok', 'C14': 'ok', 'C15': 'ok'}
cases = []
def case(name, mut, exp, c=None, nfind=None):
    m = base(); mut(m); e = dict(CLEAN); e.update(exp); cases.append(dict(name=name, model=m, ctx=c or GOOD_CTX, expect=e, nfind=nfind or {}))
def P(**kw): return lambda m: m['person'].update(kw)
def B(*texts, sec=0, ent=0): 
    def f(m): m['sections'][sec]['entries'][ent]['bullets'] = [dict(id=900 + k, text=t) for k, t in enumerate(texts)]
    return f
def E(sec=0, ent=0, **kw): return lambda m: m['sections'][sec]['entries'][ent].update(kw)
def S(sec=0, **kw): return lambda m: m['sections'][sec].update(kw)
def seq(*fs):
    def f(m):
        for g in fs: g(m)
    return f
case('clean document', lambda m: None, {})
case('no name', P(fullName='  '), {'C1': 'attention'})
case('no email', P(email=''), {'C1': 'attention'})
case('no phone', P(phone=''), {'C1': 'info'})
case('no name, no phone', P(fullName='', phone=''), {'C1': 'attention'}, nfind={'C1': 2})
case('photo shown', P(photoFile='photo.jpg'), {'C4': 'warning'})
case('custom heading odd', S(0, title='Stuff I did'), {'C5': 'info'})
case('custom heading standard EN', S(0, title='Professional Experience'), {})
case('custom heading standard DE', S(0, title='Berufserfahrung'), {})
case('Sr. in title', E(0, 0, title='Sr. Warehouse Lead'), {'C6': 'info'})
case('VP in headline', P(headline='VP Operations'), {'C6': 'info'})
case('B.Eng. passes', E(1, 0, title='B.Eng. Logistics'), {})
case('VPN not VP', E(0, 0, title='VPN Administrator'), {})
case('Mgr. in education title is out of scope', E(1, 0, title='Mgr. Course'), {})
case('spaced letters in summary', lambda m: m.update(summary='S a l e s lead with 8 years'), {'C7': 'attention'})
case('two single letters only', lambda m: m.update(summary='Plan A or B worked'), {})
case('experience without start', E(0, 1, startDate=None, endDate='2019-02', isCurrent=False), {'C8': 'attention'})
case('end before start', E(0, 1, startDate='2019-02', endDate='2016-01', isCurrent=False), {'C8': 'attention'})
case('future start', E(0, 0, startDate='2027-01'), {'C8': 'info'})
case('future start next month', E(0, 0, startDate='2026-11'), {'C8': 'info'})
case('start this month ok', E(0, 0, startDate='2026-10'), {})
case('mixed precision in section', E(0, 1, startDate='2016', endDate='2019', isCurrent=False), {'C8': 'info'})
case('dropped section', lambda m: m['droppedSections'].append(dict(id=7, kind='skills', title=None)), {'C9': 'attention'})
case('empty entry', E(0, 1, title='', organization='', location='', description='', bullets=[], startDate=None, endDate=None, isCurrent=False), {'C9': 'attention', 'C8': 'attention'})
case('blank bullet', B('Reduced picking errors by 30% in 2023', '   '), {'C9': 'attention'})
case('bullet too long', B('Reduced ' + 'x' * 290 + ' 30% errors'), {'C10': 'info'})
case('bullet 300 exactly ok', B('Reduced 30% ' + 'y' * 288), {})
case('bullet starts with I', B('I reduced picking errors by 30%'), {'C10': 'info'})
case('bullet starts with ich', B('Ich habe 30 Mitarbeitende geführt'), {'C10': 'info'})
case('bullet no number', B('Reduced picking errors across the site'), {'C10': 'info'})
case('bullet no verb', B('Responsible for 12 people'), {'C10': 'info'})
case('duplicate bullet', B('Reduced picking errors by 30% in 2023', 'reduced picking errors by 30% in 2023.'), {'C10': 'info'})
case('weak bullet in education ignored', B('responsible for nothing', sec=1, ent=0), {})
case('big file', None or (lambda m: None), {'C11': 'attention'}, c=ctx(lastExport=dict(bytes=2_600_000, pages=1)))
case('2.5 MB exactly ok', lambda m: None, {}, c=ctx(lastExport=dict(bytes=2_500_000, pages=1)))
case('3 pages', lambda m: None, {'C12': 'info'}, c=ctx(lastExport=dict(bytes=90_000, pages=3)))
case('2 pages ok', lambda m: None, {}, c=ctx(lastExport=dict(bytes=90_000, pages=2)))
case('no export', lambda m: None, {'C11': 'notChecked', 'C12': 'notChecked', 'C15': 'notChecked'}, c=dict(today=dict(year=2026, month=10)))
case('emoji', lambda m: m.update(summary='Team player 🚀 with 8 years'), {'C13': 'attention'})
case('arrow', B('Reduced errors 12% → 3%'), {'C13': 'attention'})
case('greek with inter ok', lambda m: m.update(summary='Statistik: α-Fehler unter 5%'), {})
case('greek with lato', seq(lambda m: m.update(summary='Statistik: α-Fehler unter 5%'), lambda m: m.update(style=style('lato'))), {'C13': 'attention'})
case('hungarian ő with lato', seq(P(fullName='Anna Kővári'), lambda m: m.update(style=style('lato'))), {'C13': 'attention'})
case('hungarian ő with inter', P(fullName='Anna Kővári'), {})
case('CJK', lambda m: m.update(summary='中文 speaker with 8 years'), {'C13': 'attention'})
case('german umlauts ok', P(fullName='Jürgen Müßig-Öztürk'), {})
case('euro and en dash ok', lambda m: m.update(summary='Budget 2 Mio. € – 8 years'), {})
case('bad email', P(email='anna@example'), {'C14': 'attention'})
case('bad email space', P(email='anna schmidt@example.de'), {'C14': 'attention'})
case('ftp link', lambda m: m['person']['links'].append(dict(label='website', customLabel=None, url='ftp://anna.de')), {'C14': 'attention'})
case('localhost link', lambda m: m['person']['links'].append(dict(label='website', customLabel=None, url='http://localhost:3000')), {'C14': 'attention'})
case('url with port/path ok', lambda m: m['person']['links'].append(dict(label='website', customLabel=None, url='https://anna-schmidt.de:8080/cv?x=1')), {})
case('entry url bad', E(0, 0, url='anna dot de'), {'C14': 'attention'})
case('javascript url', lambda m: m['person']['links'].append(dict(label='other', customLabel='x', url='javascript:alert(1)')), {'C14': 'attention'})
case('readback failed', lambda m: None, {'C15': 'attention'}, c=ctx(readback=dict(pass_=False)))
case('readback unavailable', lambda m: None, {'C15': 'notChecked'}, c=ctx(readback=dict(unavailable=True)))
case('profile summary emoji ZWJ family', lambda m: m.update(summary='Parent 👨‍👩‍👧 of 3'), {'C13': 'attention'})
case('DE CV Lebenslauf heading', S(0, title='Beruflicher Werdegang'), {})
if __name__ == '__main__':
    for c in cases:
        r = c['ctx'].get('readback')
        if r and 'pass_' in r: r['pass'] = r.pop('pass_')
    json.dump(cases, open(__file__.rsplit('/', 1)[0] + '/checks_cases.json', 'w'))
    print(len(cases), 'cases')
