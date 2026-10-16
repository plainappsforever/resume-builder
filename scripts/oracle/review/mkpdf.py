"""Hand-made PDFs (Helvetica, raw content streams) whose stream order and visual layout we control."""
import json, sys
def pdf(path, ops, w=595, h=842):
    # ops: list of (x, y, size, text, extra) drawn in this order
    body = []
    for x, y, size, text, extra in ops:
        t = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        body.append(f'BT /F1 {size} Tf {extra} {x} {y} Td ({t}) Tj ET')
    stream = '\n'.join(body).encode('latin-1')
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'.encode(),
            b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']
    out = b'%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs):
        offs.append(len(out)); out += f'{i+1} 0 obj\n'.encode() + o + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offs)
    out += f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    open(path, 'wb').write(out)

EXP = ['Anna Schmidt', 'Data Analyst', 'anna@example.de', 'SKILLS', 'Python', 'SQL', 'Tableau', 'LANGUAGES', 'German', 'English',
       'EXPERIENCE', 'Data Analyst, Gamma AG, 2020 - 2024', 'Built dashboards used by 300 staff.', 'Automated the weekly KPI report.']
def single():
    y = 800; ops = []
    for l in EXP: ops.append((50, y, 11, l, '')); y -= 16
    return ops
def two_col_rowwise():  # left: SKILLS block, right: LANGUAGES block, drawn row by row
    ops = [(50, 800, 11, 'Anna Schmidt', ''), (50, 784, 11, 'Data Analyst', ''), (50, 768, 11, 'anna@example.de', '')]
    L = ['SKILLS', 'Python', 'SQL', 'Tableau']; R = ['LANGUAGES', 'German', 'English']
    y = 740
    for i in range(4):
        ops.append((50, y, 11, L[i], ''))
        if i < 3: ops.append((300, y, 11, R[i], ''))
        y -= 16
    y -= 10
    for l in EXP[10:]: ops.append((50, y, 11, l, '')); y -= 16
    return ops
def two_col_streamwise():  # same visual, but stream = all left then all right (document order)
    ops = [(50, 800, 11, 'Anna Schmidt', ''), (50, 784, 11, 'Data Analyst', ''), (50, 768, 11, 'anna@example.de', '')]
    L = ['SKILLS', 'Python', 'SQL', 'Tableau']; R = ['LANGUAGES', 'German', 'English']
    for i, t in enumerate(L): ops.append((50, 740 - 16 * i, 11, t, ''))
    for i, t in enumerate(R): ops.append((300, 740 - 16 * i, 11, t, ''))
    y = 670
    for l in EXP[10:]: ops.append((50, y, 11, l, '')); y -= 16
    return ops
def right_dates_after():  # title left, date right-aligned, but the dates drawn after everything
    ops = single(); ops = [o for o in ops if 'Gamma' not in o[3]]
    ops.insert(11, (50, 800 - 16 * 11, 11, 'Data Analyst, Gamma AG,', ''))
    ops.append((470, 800 - 16 * 11, 11, '2020 - 2024', ''))
    return ops
def right_dates_inline_far():  # same line, date far right in stream order (flex space-between)
    ops = single(); i = [k for k, o in enumerate(ops) if 'Gamma' in o[3]][0]; y = ops[i][1]
    ops[i:i+1] = [(50, y, 11, 'Data Analyst, Gamma AG,', ''), (470, y, 11, '2020 - 2024', '')]
    return ops
def date_first_stream():  # date drawn first but placed right
    ops = single(); i = [k for k, o in enumerate(ops) if 'Gamma' in o[3]][0]; y = ops[i][1]
    ops[i:i+1] = [(200, y, 11, '2020 - 2024', ''), (50, y, 11, 'Data Analyst, Gamma AG,', '')]
    return ops
def reversed_stream():
    return list(reversed(single()))
def letter_spaced():
    ops = single(); ops[3] = (50, ops[3][1], 11, 'SKILLS', '6 Tc'); return ops
def tiny_font_hidden_dupe():  # extra hidden copy of keywords at 1pt in white? (extras only)
    ops = single(); ops.append((50, 20, 1, 'Python SQL Tableau Python SQL Tableau', '')); return ops
def superscript():
    ops = single(); i = [k for k, o in enumerate(ops) if o[3] == 'Built dashboards used by 300 staff.'][0]; y = ops[i][1]
    ops[i:i+1] = [(50, y, 11, 'Built dashboards used by 300', ''), (205, y + 4, 7, 'staff.', '')]
    return ops
def word_per_item_jitter():  # every word its own item with tiny baseline jitter (Skia-like)
    ops = []; y = 800
    import random; r = random.Random(1)
    for l in EXP:
        x = 50
        for w in l.split(' '):
            ops.append((x, round(y + r.uniform(-1.2, 1.2), 2), 11, w, '')); x += 6.1 * len(w) + 3.1
        y -= 16
    return ops
def line_wrap_mid_word():
    ops = single(); i = [k for k, o in enumerate(ops) if o[3].startswith('Automated')][0]; y = ops[i][1]
    ops[i:i+1] = [(50, y, 11, 'Automated the weekly KPI re-', ''), (50, y - 16, 11, 'port.', '')]
    return ops
CASES = dict(single=single, two_col_rowwise=two_col_rowwise, two_col_streamwise=two_col_streamwise, right_dates_after=right_dates_after,
             right_dates_inline_far=right_dates_inline_far, date_first_stream=date_first_stream, reversed_stream=reversed_stream,
             letter_spaced=letter_spaced, tiny_hidden_dupe=tiny_font_hidden_dupe, superscript=superscript, word_jitter=word_per_item_jitter,
             wrap_mid_word=line_wrap_mid_word)
if __name__ == '__main__':
    d = sys.argv[1]
    for k, f in CASES.items(): pdf(f'{d}/{k}.pdf', f())
    json.dump(EXP, open(f'{d}/expected.json', 'w')); print(len(CASES))
