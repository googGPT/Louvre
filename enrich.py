"""Enrichit chaque journal avec OpenAlex : éditeur, accès ouvert, APC, citations, h-index, thèmes, site."""
import json, time, re, difflib, urllib.parse, urllib.request
import os as _os
BASE = _os.environ.get("AJ_BASE", _os.path.dirname(_os.path.abspath(__file__)))
from merge import norm_title

M = ''
d = json.load(open(BASE + '/work/merged.json'))
J = d['J']

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 + 3 * k)
    return None

KEEP = ['id', 'issn_l', 'issn', 'display_name', 'host_organization_name', 'works_count', 'cited_by_count', 'summary_stats',
        'is_oa', 'is_in_doaj', 'is_in_doaj_since_year', 'is_high_oa_rate', 'apc_usd', 'country_code', 'homepage_url',
        'first_publication_year', 'last_publication_year', 'is_core', 'societies', 'topics', 'counts_by_year', 'type', 'oa_works_count']

def slim(s):
    out = {k: s.get(k) for k in KEEP}
    out['topics'] = [{'n': t['display_name'], 'c': t['count'], 'sf': t['subfield']['display_name'], 'f': t['field']['display_name']}
                     for t in (s.get('topics') or [])[:10]]
    out['counts_by_year'] = [{'y': c['year'], 'w': c['works_count'], 'c': c['cited_by_count']} for c in (s.get('counts_by_year') or [])][:6]
    return out

# 1) journaux sans ISSN : recherche par titre
PRESET_ISSN = {'evolutionary computation': ['1063-6560', '1530-9304']}   # la recherche par titre trouvait IEEE Trans. on Evolutionary Computation
for j in J:
    p = PRESET_ISSN.get(norm_title(j['title']))
    if p and not j['issn']: j['issn'] = p
nf = 0
for j in J:
    if j['issn']: continue
    res = get(f"https://api.openalex.org/sources?search={urllib.parse.quote(j['title'])}&per-page=5&{M}")
    best, score = None, 0
    for s in (res or {}).get('results', []):
        for name in [s['display_name']] + (s.get('alternate_titles') or []):
            r = difflib.SequenceMatcher(None, norm_title(j['title']), norm_title(name)).ratio()
            if r > score: best, score = s, r
    if best and score >= 0.88 and best.get('issn'):
        j['issn'] = best['issn']; j['oa_match'] = round(score, 2)
    else:
        nf += 1
    time.sleep(0.12)
print('sans ISSN non résolus :', nf)

# 2) récupération groupée par ISSN
allissn = sorted({i for j in J for i in j['issn']})
src = {}
for k in range(0, len(allissn), 50):
    chunk = '|'.join(allissn[k:k + 50])
    res = get(f"https://api.openalex.org/sources?filter=issn:{chunk}&per-page=200&{M}")
    for s in (res or {}).get('results', []):
        src[s['id']] = slim(s)
    time.sleep(0.12)
print('sources OpenAlex :', len(src))
issn2src = {}
for sid, s in src.items():
    for i in s.get('issn') or []:
        issn2src.setdefault(i, sid)

# 2b) corrections manuelles de rattachement (revues renommées dont OpenAlex a créé une nouvelle fiche)
SID_OVERRIDE = {'latin american journal of economics': 'S2765042083', 'management prospective': 'S5407040556',
  'asia pacific sustainable development journal': 'S4210183050', 'career development transition for exceptional individuals': 'S13872956',
  'computer law security review': 'S4394735566', 'environment planning b urban analytics city science': 'S4210191690',
  'environment planning c politics space': 'S4210204712', 'iise transactions': 'S4210225672',
  'iup journal of accounting research audit practices': 'S5407010381', 'journal of management history': 'S148189957',
  'journal of statistics data science education': 'S3207474444', 'schmalenbach journal of business research': 'S4210230847',
  'journal of accounting management information systems': 'S4210194336'}
for key, short in SID_OVERRIDE.items():
    full = 'https://openalex.org/' + short
    if full not in src:
        r = get(f"https://api.openalex.org/sources/{short}")
        if r: src[full] = slim(r)
    for i in (src.get(full) or {}).get('issn') or []: issn2src[i] = full
FORCE = {}
for j in J:
    for key, short in SID_OVERRIDE.items():
        if norm_title(j['title']).startswith(key): FORCE[id(j)] = 'https://openalex.org/' + short

# 3) rattachement et fusion des doublons (même source OpenAlex)
from merge import similar
def name_sim(title, sid):
    s_ = src.get(sid) or {}
    names = [s_.get('display_name') or ''] + (s_.get('alternate_titles') or [])
    return max(difflib.SequenceMatcher(None, norm_title(title), norm_title(n)).ratio() for n in names)
RK = ('fnege', 'ajg', 'abdc')
by_sid = {}
out = []
for j in J:
    cands = sorted({issn2src[i] for i in j['issn'] if i in issn2src}, key=lambda s_: -name_sim(j['title'], s_))
    sid = FORCE.get(id(j)) or (cands[0] if cands else None)
    if sid and sid in by_sid:
        tgt = out[by_sid[sid]]
        clash = any(tgt.get(k) and j.get(k) for k in RK)
        if similar(tgt['title'], j['title']) or not clash:
            for k, v in j.items():
                if k == 'issn': tgt['issn'] = sorted(set(tgt['issn']) | set(v))
                elif v not in (None, '', False) and not tgt.get(k): tgt[k] = v
            continue
        # deux revues différentes rattachées à la même source : la moins ressemblante perd le lien
        if name_sim(j['title'], sid) > name_sim(tgt['title'], sid):
            tgt['oa'] = None; tgt['oa_conflict'] = True; by_sid[sid] = len(out)
        else:
            sid = None; j['oa_conflict'] = True
    j['oa'] = sid
    if sid: by_sid[sid] = len(out)
    out.append(j)
# 3b) fusion des fiches qui partagent un ISSN (ex. ancien et nouveau nom d'une revue renommée)
changed = True
while changed:
    changed = False
    own = {}
    for k_, j in enumerate(out):
        for i in j['issn']:
            if i in own and own[i] != k_:
                a_, b_ = out[own[i]], j
                if any(a_.get(x) and b_.get(x) for x in RK) and not similar(a_['title'], b_['title']): continue
                keep, drop = (a_, b_) if (a_.get('oa') and not b_.get('oa')) or (a_.get('oa') in FORCE.values()) else (b_, a_)
                if b_.get('oa') in FORCE.values(): keep, drop = b_, a_
                for kk, v in drop.items():
                    if kk == 'issn': keep['issn'] = sorted(set(keep['issn']) | set(v))
                    elif v not in (None, '', False) and not keep.get(kk): keep[kk] = v
                keep.setdefault('former', drop['title'])
                out.remove(drop); changed = True; break
            own[i] = k_
        if changed: break
print('conflits de rattachement :', [j['title'] for j in out if j.get('oa_conflict')])
# 3c) correction manuelle : IISE Transactions (ex-IIE Transactions, AJG 3) mélangée avec la revue d'ergonomie (AJG 1)
for j in out:
    if j['title'] == 'IISE Transactions':
        j.update(ajg='3', ajg2021='3', ajg2018='3', ajg_field='OR&MANSCI', former='IIE Transactions')
        j['issn'] = sorted(set(i for i in j['issn'] if i not in ('2472-5838', '2472-5846')) | {'2472-5854', '2472-5862'})
if not any(j['title'].startswith('IISE Transactions on Occupational') for j in out):
    out.append({'title': 'IISE Transactions on Occupational Ergonomics and Human Factors', 'issn': ['2472-5838', '2472-5846'],
                'ajg': '1', 'ajg_field': 'PSYCH (WOP-OB)', 'oa': issn2src.get('2472-5838')})
print('après fusion :', len(out), '| avec OpenAlex :', sum(1 for j in out if j.get('oa')))
json.dump({'J': out, 'src': src}, open(BASE + '/work/enriched.json', 'w'), ensure_ascii=False)
