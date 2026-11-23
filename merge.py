"""Fusionne FNEGE 2025, ABS/AJG 2024, ABDC 2025/2022 et FT50 2026 en une table de journaux."""
import openpyxl, re, json, unicodedata
import os as _os
BASE = _os.environ.get("AJ_BASE", _os.path.dirname(_os.path.abspath(__file__)))

def norm_title(t):
    t = unicodedata.normalize('NFKD', str(t or '')).encode('ascii', 'ignore').decode().lower()
    t = t.replace('&', ' and ')
    t = re.sub(r'\(.*?\)', ' ', t)
    t = re.sub(r'[^a-z0-9 ]', ' ', t)
    t = re.sub(r'\b(the|and)\b', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def norm_issn(x):
    x = str(x or '').strip().upper().replace('\t', '')
    x = re.sub(r'[^0-9X]', '', x)
    return f'{x[:4]}-{x[4:]}' if len(x) == 8 else None

def clean(v):
    if v is None: return None
    v = str(v).strip().replace('\t', '')
    v = v.replace('="', '').replace('"', '')
    return v or None

J = []            # liste des journaux
by_issn, by_title = {}, {}

import difflib
CONFLICTS = []   # ISSN présent dans une source mais appartenant à une autre revue

SAME = [('academy of marketing science review', 'ams review'),
        ('cross cultural management', 'cross cultural strategic management')]
def similar(a, b):
    a, b = norm_title(a), norm_title(b)
    if not a or not b: return False
    if {a, b} == {'management', 'm n gement'}: return True   # M@n@gement (le @ disparaît à la normalisation)
    for x, y in SAME:
        if (a.startswith(x) and b.startswith(y)) or (a.startswith(y) and b.startswith(x)): return True
    if a.startswith(b) or b.startswith(a): return True   # sous-titre ajouté ou retiré
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.85

def find(issns, title, bad=None):
    for i in issns:
        if i in by_issn:
            idx = by_issn[i]
            if similar(J[idx]['title'], title): return idx
            CONFLICTS.append((title, i, J[idx]['title']))
            if bad is not None: bad.add(i)
    nt = norm_title(title)
    return by_title.get(nt)

SMALL = {'of','and','the','in','for','on','at','to','a','an','or','with','et','de','la','le','les','des','du','en','au','aux','sur','pour','y','e','del','di'}
def smart_case(t):
    words = str(t).lower().split(' ')
    out = []
    for k, w in enumerate(words):
        if k and w in SMALL: out.append(w); continue
        if re.fullmatch(r"[a-z]?['’].+", w): out.append(w[:2] + w[2:3].upper() + w[3:]); continue
        out.append(w[:1].upper() + w[1:])
    t = ' '.join(out)
    return re.sub(r'\b(Ieee|Acm|Mis|Ibm|Ai|Hrm|Csr|Esg|Rh|Grh|Si)\b', lambda m: m.group(0).upper(), t)

def add(issns, title, bad=()):
    j = {'title': title, 'issn': [i for i in issns if i and i not in bad and i not in by_issn], 'nt': norm_title(title)}
    J.append(j); idx = len(J) - 1
    for i in j['issn']: by_issn.setdefault(i, idx)
    by_title.setdefault(j['nt'], idx)
    return idx

def link(idx, issns, title, bad=()):
    for i in issns:
        if i and i not in bad and i not in J[idx]['issn'] and by_issn.get(i, idx) == idx:
            J[idx]['issn'].append(i); by_issn.setdefault(i, idx)
    by_title.setdefault(norm_title(title), idx)

# ---------- ABDC 2025 (base la plus large, avec ISSN) ----------
wb = openpyxl.load_workbook(sorted(__import__('glob').glob(BASE + '/ext/abdc/ABDC-JQL-*.xlsx'))[-1], read_only=True)
abdc22 = {}
for r in list(wb['2022 JQL'].iter_rows(values_only=True))[9:]:
    if not r[0]: continue
    for i in (norm_issn(r[2]), norm_issn(r[3])):
        if i: abdc22[i] = clean(r[6])
for r in list(wb['2025 JQL'].iter_rows(values_only=True))[8:]:
    if not r[1]: continue
    issns = [norm_issn(r[3]), norm_issn(r[4])]
    title = clean(r[1])
    bad = set()
    idx = find(issns, title, bad)
    if idx is None: idx = add(issns, title, bad)
    else: link(idx, issns, title, bad)
    J[idx].update(abdc=clean(r[7]), abdc_for=clean(r[6]), publisher=clean(r[2]), since=clean(r[5]))
    prev = next((abdc22[i] for i in issns if i in abdc22), None)
    if prev: J[idx]['abdc2022'] = prev

# ---------- FNEGE 2025 ----------
wb = openpyxl.load_workbook(BASE + '/sources/fnege.xlsx', read_only=True)
for r in list(wb.worksheets[0].iter_rows(values_only=True))[1:]:
    if not r[0]: continue
    issns = [norm_issn(r[2]), norm_issn(r[3])]
    bad = set()
    idx = find(issns, r[0], bad)
    if idx is None: idx = add(issns, smart_case(r[0]), bad); J[idx]['tcase'] = True
    else: link(idx, issns, r[0], bad)
    if bad: J[idx]['issn_conflict'] = sorted(bad)
    J[idx].update(fnege=clean(r[4]), fnege_dom=clean(r[1]), fnege_var=clean(r[5]),
                  francophone=(clean(r[6]) == 'F'), fnege2019=clean(r[7]), fnege2022=clean(r[8]))

# ---------- ABS / AJG 2024 (sans ISSN : appariement par titre) ----------
wb = openpyxl.load_workbook(BASE + '/sources/abs.xlsx', read_only=True)
unmatched_abs = []
for r in list(wb.worksheets[0].iter_rows(values_only=True))[1:]:
    if not r[1]: continue
    idx = find([], r[1])
    if idx is None:
        idx = add([], clean(r[1])); unmatched_abs.append(idx)
    J[idx].update(ajg=clean(r[2]), ajg2021=clean(r[3]), ajg2018=clean(r[4]), ajg_field=clean(r[0]),
                  ajg_cit_rank=r[7], ajg_snip_rank=r[8], ajg_sjr_rank=r[9], ajg_jif_rank=r[10])
    if not J[idx].get('title'): J[idx]['title'] = clean(r[1])

# ---------- FT50 (liste révisée avril 2026) ----------
FT50 = ["Academy of Management Annals","Academy of Management Journal","Academy of Management Review",
"Accounting, Organizations and Society","Accounting Review","Administrative Science Quarterly","American Economic Review",
"American Sociological Review","Contemporary Accounting Research","Econometrica","Entrepreneurship Theory and Practice",
"Harvard Business Review","Human Resource Management","Information Systems Research","Journal of the Academy of Marketing Science",
"Journal of Accounting and Economics","Journal of Accounting Research","Journal of Applied Psychology","Journal of Business Venturing",
"Journal of Consumer Psychology","Journal of Consumer Research","Journal of Finance","Journal of Financial and Quantitative Analysis",
"Journal of Financial Economics","Journal of International Business Studies","Journal of Management","Journal of Management Information Systems",
"Journal of Management Studies","Journal of Marketing","Journal of Marketing Research","Journal of Operations Management",
"Journal of Political Economy","MIS Quarterly","Management Science","Manufacturing and Service Operations Management","Marketing Science",
"MIT Sloan Management Review","Operations Research","Organization Science","Organizational Behavior and Human Decision Processes",
"Production and Operations Management","Psychological Science","Quarterly Journal of Economics","Research Policy",
"Review of Accounting Studies","Review of Economic Studies","Review of Finance","Review of Financial Studies",
"Strategic Entrepreneurship Journal","Strategic Management Journal"]
FT_ALIASES = {"MIS Quarterly": ["mis quarterly management information systems", "management information systems quarterly"],
              "Manufacturing and Service Operations Management": ["m som manufacturing service operations management", "manufacturing service operations management"]}
missing_ft = []
for t in FT50:
    idx = by_title.get(norm_title(t))
    if idx is None:
        for a in FT_ALIASES.get(t, []):
            idx = by_title.get(a)
            if idx is not None: break
    if idx is None:
        cands = [k for k in by_title if norm_title(t) in k or k in norm_title(t)]
        idx = by_title[min(cands, key=len)] if cands else None
    if idx is None: missing_ft.append(t); idx = add([], t)
    J[idx]['ft50'] = True
for t in ["Human Relations", "Journal of Business Ethics", "Organization Studies"]:
    idx = by_title.get(norm_title(t))
    if idx is not None: J[idx]['ft50_removed_2026'] = True

print('journaux:', len(J))
print('FNEGE:', sum(1 for j in J if j.get('fnege')), 'AJG:', sum(1 for j in J if j.get('ajg')),
      'ABDC:', sum(1 for j in J if j.get('abdc')), 'FT50:', sum(1 for j in J if j.get('ft50')))
print('AJG non appariés par titre:', len(unmatched_abs), [J[i]['title'] for i in unmatched_abs[:15]])
print('FT50 manquants:', missing_ft)
# ---------- Corrections manuelles (erreurs repérées dans les fichiers sources) ----------
MANUAL = {
  'ieee transaction on human machine systems': dict(title='IEEE Transactions on Human-Machine Systems', issn=['2168-2291'], fnege='3',
       note="Le fichier FNEGE 2025 donne à cette revue l'ISSN 2168-2232, qui appartient à IEEE Transactions on Systems, Man, and Cybernetics: Systems ; ISSN corrigé."),
  'ieee transactions on systems man cybernetics systems': dict(issn=['2168-2216', '2168-2232'], fnege='3',
       note="Le fichier FNEGE 2025 liste cette revue deux fois : rang 3, et rang 2 sous son ancien nom (Part A: Systems and Humans). Le rang 3 est retenu."),
  'current sociology': dict(issn=['0011-3921', '1461-7064'],
       note="Le fichier FNEGE 2025 donne l'ISSN 0268-5809, qui appartient à International Sociology ; ISSN corrigé."),
  'm n gement': dict(title='M@n@gement', tcase=False),
  'appetite': dict(note="Le fichier FNEGE 2025 donne l'ISSN 0092-0703, qui appartient au Journal of the Academy of Marketing Science ; ISSN corrigé."),
  'systems research behavioral science': dict(note="Le fichier FNEGE 2025 donne l'ISSN 0160-791X, qui appartient à Technology in Society ; ISSN corrigé."),
}
for j in J:
    nt = norm_title(j['title'])
    for key, fx in MANUAL.items():
        if nt.startswith(key):
            for k, v in fx.items(): j[k] = v
if __name__ == "__main__": json.dump({"J": J, "unmatched_abs": unmatched_abs}, open(BASE + "/work/merged.json", "w"), ensure_ascii=False)
