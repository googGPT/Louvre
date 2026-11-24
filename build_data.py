"""Construit les fichiers du site : journaux.json (fiches) et corpus.json (profils textuels + articles de référence)."""
import json, math, re, collections, datetime
import os as _os
BASE = _os.environ.get("AJ_BASE", _os.path.dirname(_os.path.abspath(__file__)))

# ---------- Racinisation simple : la même règle est recodée à l'identique en JavaScript ----------
STOP = set("""a about above after again against all also am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into
is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some
such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where
which while who whom why will with would you your yours yourself yourselves using use used based study paper article research results result
find findings show shows suggest suggests provide provides evidence effect effects analysis data model approach also however may new two one first
within among across whether thus therefore furthermore moreover via toward towards per paper's examine examines investigate investigates literature
implications findings purpose design methodology originality value practical theoretical contribution contributions extant prior current recent
www http https doi org et al""".split())

def stem(w):
    for suf, rep in (('ational', 'ate'), ('ization', 'ize'), ('isation', 'ize'), ('fulness', 'ful'), ('ousness', 'ous'), ('iveness', 'ive'),
                     ('ities', 'ity'), ('ments', 'ment'), ('ings', ''), ('ing', ''), ('ies', 'y'), ('sses', 'ss'), ('ed', ''), ('es', 'e'), ('s', '')):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            w = w[: len(w) - len(suf)] + rep
            break
    if w.endswith('ss') is False and w.endswith('e') and len(w) > 4:
        w = w[:-1]
    return w

def terms(text):
    toks = [t for t in re.findall(r'[a-z][a-z\-]+', (text or '').lower().replace('-', ' ')) if len(t) > 2 and t not in STOP]
    st = [stem(t) for t in toks]
    return st + [st[i] + '_' + st[i + 1] for i in range(len(st) - 1)]

# ---------- Chargement ----------
E = json.load(open(BASE + '/work/enriched.json'))
J, SRC = E['J'], E['src']
SJR = json.load(open(BASE + '/work/sjr.json'))
W = {}
for l in open(BASE + '/work/works.jsonl'):
    r = json.loads(l); W[r['sid']] = r

# ---------- Profils textuels par journal (TF-IDF) ----------
doc_tf, df = {}, collections.Counter()
for sid, r in W.items():
    c = collections.Counter()
    for w in r['w']:
        c.update(terms(w['t'] + ' ' + w['t'] + ' ' + w['a']))   # le titre compte double
    c = collections.Counter({t: n for t, n in c.items() if n >= 2})
    doc_tf[sid] = c; df.update(c.keys())
N = len(doc_tf)
idf = {t: math.log((N + 1) / (n + 1)) + 1 for t, n in df.items() if n >= 4 and n <= 0.5 * N}
# Profil = centroïde de Rocchio (Rocchio, 1971) : moyenne des vecteurs TF-IDF normalisés de chaque article.
# Un terme employé par beaucoup d'articles du journal (son vocabulaire central) pèse plus qu'un terme rare
# venu d'un seul article, ce qui n'était pas le cas avec la somme brute des fréquences.
def art_vec(w):
    c = collections.Counter(terms(w['t'] + ' ' + w['t'] + ' ' + w['a']))   # le titre compte double
    v = {t: (1 + math.log(n)) * idf[t] for t, n in c.items() if t in idf}
    nrm = math.sqrt(sum(x * x for x in v.values())) or 1
    return {t: x / nrm for t, x in v.items()}
profiles = {}
for sid, r in W.items():
    arts = [w for w in r['w'] if w['t']]
    if not arts: profiles[sid] = []; continue
    cen = collections.Counter()
    for w in arts:
        cen.update(art_vec(w))
    top = sorted(cen.items(), key=lambda x: -x[1])[:150]
    nrm = math.sqrt(sum(x * x for _, x in top)) or 1
    profiles[sid] = [(t, round(x / nrm, 3)) for t, x in top]

# ---------- Index complet pour « Trouver mon journal » (Rocchio + BM25) ----------
# Pour chaque revue, tous les termes employés au moins deux fois dans ses ~100 articles (titre compté double) :
# poids de Rocchio (centroïde complet) et fréquence brute pour BM25 (Robertson et Zaragoza, 2009).
# Ce choix est celui qui a fait le moins d'erreurs sur 500 articles tests de 2026 (voir validation/).
full = {}
jdf = collections.Counter()                      # nombre de revues où le terme apparaît au moins une fois (idf BM25)
dlen = {}
for sid, r in W.items():
    arts = [w for w in r['w'] if w['t']]
    tf_all = collections.Counter()
    cen = collections.Counter()
    for w in arts:
        c = collections.Counter(terms(w['t'] + ' ' + w['t'] + ' ' + w['a']))
        tf_all.update({t: n for t, n in c.items() if t in idf})
        cen.update(art_vec(w))
    jdf.update(tf_all.keys()); dlen[sid] = sum(tf_all.values())
    full[sid] = [(t, cen[t], n) for t, n in tf_all.items() if n >= 2 and cen.get(t)]
PV = {t for p in profiles.values() for t, _ in p} | {t for f in full.values() for t, _, _ in f}
# ---------- Articles de référence (12 par journal) avec leurs termes clés ----------
articles = {}
for sid, r in W.items():
    keep = []
    for w in r['w'][:14]:
        if not w['t']: continue
        c = collections.Counter(terms(w['t'] + ' ' + w['t'] + ' ' + w['a']))
        v = {t: (1 + math.log(n)) * idf[t] for t, n in c.items() if t in PV or ('_' not in t and t in idf)}
        top = sorted(v.items(), key=lambda x: -x[1])[:10]
        nrm = math.sqrt(sum(x * x for _, x in top)) or 1
        keep.append({'t': w['t'][:220], 'doi': (w['doi'] or '').replace('https://doi.org/', ''), 'y': w['y'], 'c': w['c'],
                     'v': [(t, round(x / nrm, 2)) for t, x in top]})
        if len(keep) >= 12: break
    articles[sid] = keep

# ---------- Vocabulaire compact (indices) ----------
vocab = sorted({t for f in full.values() for t, _, _ in f} | {t for a in articles.values() for x in a for t, _ in x['v']})
vid = {t: i for i, t in enumerate(vocab)}
vid_pre = vid
sid2i_pre = {j.get('oa'): k for k, j in enumerate(J) if j.get('oa')}

# ---------- Frais de soumission et indicateurs supplémentaires ----------
FEES = json.load(open(BASE + '/sources/fees.json'))
from merge import norm_title as _nt
fee_by_title = {_nt(t): (f, d_, u, 'compilation') for t, f, d_, u in FEES['rows']}
for t, (f, d_, u) in FEES['official'].items(): fee_by_title[_nt(t)] = (f, d_, u, 'officiel')
EX = json.load(open(BASE + '/work/extra.json'))
YR = {k: {int(y): n for y, n in v.items()} for k, v in json.load(open(BASE + '/work/years.json')).items()}
CN = {'US':'États-Unis','CN':'Chine','GB':'Royaume-Uni','FR':'France','DE':'Allemagne','AU':'Australie','CA':'Canada','IT':'Italie','ES':'Espagne','NL':'Pays-Bas','IN':'Inde','KR':'Corée du Sud','JP':'Japon','BR':'Brésil','CH':'Suisse','SE':'Suède','TW':'Taïwan','HK':'Hong Kong','SG':'Singapour','BE':'Belgique','PK':'Pakistan','MY':'Malaisie','TN':'Tunisie','NO':'Norvège','DK':'Danemark','FI':'Finlande','PT':'Portugal','IR':'Iran','TR':'Turquie','SA':'Arabie saoudite','AE':'Émirats arabes unis','ZA':'Afrique du Sud','NZ':'Nouvelle-Zélande','AT':'Autriche','IE':'Irlande','PL':'Pologne','GR':'Grèce','VN':'Viêt Nam','ID':'Indonésie','RU':'Russie','MX':'Mexique','CL':'Chili','CO':'Colombie','NG':'Nigeria','EG':'Égypte','MA':'Maroc','IL':'Israël'}

# ---------- Fiches journaux ----------
def model(s):
    if not s: return None
    apc = s.get('apc_usd')
    if s.get('is_in_doaj') or s.get('is_oa'):
        if apc: return 'Accès ouvert (APC)'
        if s.get('is_in_doaj'): return 'Diamant (OA sans frais)'
        return 'Accès ouvert (frais inconnus)'
    return 'Abonnement / hybride'

out = []
for k, j in enumerate(J):
    s = SRC.get(j.get('oa')) or {}
    sj = next((SJR[i] for i in j['issn'] if i in SJR), None)
    st = s.get('summary_stats') or {}
    cby = s.get('counts_by_year') or []
    title = j.get('title') or s.get('display_name')
    if j.get('tcase') and s.get('display_name'):
        import difflib as _dl
        if _dl.SequenceMatcher(None, _nt(title), _nt(s['display_name'])).ratio() >= 0.85: title = s['display_name']
    if '1286-4692' in j['issn']: title = 'M@n@gement'
    rec = {
        'i': k, 't': title, 'nt': j.get('note'), 'fo': j.get('former') if j.get('former') and _nt(j.get('former')) != _nt(title) else None, 'noa': None if j.get('oa') else True, 'is': j['issn'][:3],
        'pub': s.get('host_organization_name') or j.get('publisher'), 'cc': s.get('country_code'), 'url': s.get('homepage_url'),
        'fn': j.get('fnege'), 'fnd': j.get('fnege_dom'), 'fnv': j.get('fnege_var'), 'fn22': j.get('fnege2022'), 'fn19': j.get('fnege2019'),
        'fr': j.get('francophone') or None,
        'ajg': j.get('ajg'), 'ajg21': j.get('ajg2021'), 'ajg18': j.get('ajg2018'), 'ajgf': j.get('ajg_field'),
        'abdc': j.get('abdc'), 'abdc22': j.get('abdc2022'), 'for': j.get('abdc_for'),
        'ft': j.get('ft50') or None, 'ftx': j.get('ft50_removed_2026') or None,
        'sc': bool(sj) or None, 'sjr': sj['sjr'] if sj and isinstance(sj.get('sjr'), (int, float)) and sj['sjr'] == sj['sjr'] else None, 'q': sj['q'] if sj and isinstance(sj.get('q'), str) and sj['q'].startswith('Q') else None, 'sjry': sj and sj['y'],
        'oa': model(s) if s else None, 'doaj': s.get('is_in_doaj') or None, 'apc': s.get('apc_usd'),
        'cit2': st.get('2yr_mean_citedness'), 'h': st.get('h_index'), 'nw': s.get('works_count'),
        'wy': None,
        'y0': s.get('first_publication_year') or j.get('since'),
        'oly': None,
        'top': [(t['n'], t['sf']) for t in (s.get('topics') or [])[:6]],
        'soc': [x['organization'] for x in (s.get('societies') or [])][:2],
        'oaid': (j.get('oa') or '').rsplit('/', 1)[-1] or None,
        'kw': [t.replace('_', ' ') for t, _ in profiles.get(j.get('oa'), [])[:12]],
    }
    fe = fee_by_title.get(_nt(rec['t'] or ''))
    if fe: rec.update(fee=fe[0], feed=fe[1], feeu=fe[2], fees=fe[3])
    cx = EX['countries'].get(j.get('oa'))
    if cx and cx['n']:
        rec['n21'] = cx['n']
        if cx['n'] >= 20:   # pas de pourcentage sur trop peu d'articles
            rec['frp'] = round(100 * cx['fr'] / cx['n'], 1)
            rec['ctry'] = [(CN.get(k, k), round(100 * n / cx['n'])) for k, n in cx['c'][:5]]
    rt = EX['retr'].get(j.get('oa'))
    if rt: rec['ret'] = rt
    if (s.get('works_count') or 0) >= 20 and s.get('oa_works_count') is not None: rec['oap'] = round(100 * s['oa_works_count'] / s['works_count'])
    yrs = YR.get(j.get('oa'))
    if yrs is not None:
        LY = __import__('datetime').date.today().year - 1                                   # dernière année complète
        rec['wy'] = yrs.get(LY, 0)
        if yrs.get(LY - 3, 0) >= 20 and yrs.get(LY): rec['gr'] = round(100 * (yrs[LY] / yrs[LY - 3] - 1))
        last = max([y for y, n in yrs.items() if n > 0], default=None)
        if last is None or last < LY - 1: rec['oly'] = last or 0   # plus d'articles indexés récemment
    rec = {a: b for a, b in rec.items() if b is not None}
    if isinstance(rec.get('t'), str): rec['t'] = ' '.join(rec['t'].replace('\xa0', ' ').split())   # espaces insécables
    out.append({a: b for a, b in rec.items() if b not in (None, [], '')})

sid2i = {j.get('oa'): k for k, j in enumerate(J) if j.get('oa')}
# Index binaire (site/data/corpus-index.txt, en base64) : pour chaque revue, identifiants de termes (écarts codés en varint),
# puis poids de Rocchio sur 1 octet (rapporté au maximum de la revue), puis fréquence brute sur 1 octet (plafonnée à 255).
NJF = len(W)
def varint(n, out):
    while True:
        b = n & 127; n >>= 7
        if n: out.append(b | 128)
        else: out.append(b); return
binbuf = bytearray(); jx = []
for sid, lst in full.items():
    if sid not in sid2i_pre or not lst: continue
    lst = sorted((vid_pre[t], x, n) for t, x, n in lst if t in vid_pre)
    mx = max(x for _, x, _ in lst)
    off = len(binbuf); prev = 0
    for k, _, _ in lst: varint(k - prev, binbuf); prev = k
    binbuf.extend(max(1, min(255, round(x / mx * 255))) for _, x, _ in lst)
    binbuf.extend(min(255, n) for _, _, n in lst)
    jx.append([sid2i_pre[sid], off, len(lst), round(mx, 6), dlen[sid]])
import base64
# Écrit en base64 dans un fichier texte (.txt) : c'est un format que les deux hébergements servent tels quels.
open(BASE + '/site/data/corpus-index.txt', 'w').write(base64.b64encode(bytes(binbuf)).decode('ascii'))
corpus = {
    'vocab': vocab,
    'idf': [round(idf[t], 2) for t in vocab],
    'bidf': [round(math.log(1 + (NJF - jdf[t] + 0.5) / (jdf[t] + 0.5)), 3) for t in vocab],
    'jx': jx,
    'art': {sid2i[s]: [[a['t'], a['doi'], a['y'], a['c'], [[vid[t], x] for t, x in a['v']]] for a in arts] for s, arts in articles.items() if s in sid2i},
}
meta = {'built': datetime.date.today().isoformat(), 'n': len(out),
        'sources': {'FNEGE': '2025 (fichier fourni)', 'AJG/ABS': '2024 (fichier fourni)', 'ABDC': '2025 (liste officielle, version mai 2026)',
                    'FT50': 'liste révisée avril 2026', 'SJR/Scopus': f"{max((v['y'] for v in SJR.values()), default='')} (SCImago)",
                    'OpenAlex': 'métriques, accès ouvert, APC, thèmes, articles 2021+'}}
json.dump({'meta': meta, 'J': out}, open(BASE + '/site/data/journaux.json', 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
json.dump(corpus, open(BASE + '/site/data/corpus.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('journaux', len(out), '| index', len(corpus['jx']), 'revues', round(len(binbuf)/1e6,1), 'Mo', '| profils', len(profiles), '| articles', sum(len(a) for a in corpus['art'].values()), '| vocab', len(vocab))
