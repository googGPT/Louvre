"""Récupère, pour chaque journal, ~100 articles récents (2021+) les plus cités : titre, résumé, DOI, année."""
import json, time, os, urllib.request
import os as _os
BASE = _os.environ.get("AJ_BASE", _os.path.dirname(_os.path.abspath(__file__)))
from concurrent.futures import ThreadPoolExecutor

d = json.load(open(BASE + '/work/enriched.json'))
sids = sorted({j['oa'] for j in d['J'] if j.get('oa')})
OUT = BASE + '/work/works.jsonl'
done = set()
if os.path.exists(OUT):
    for l in open(OUT):
        try: done.add(json.loads(l)['sid'])
        except Exception: pass

def abstract(inv):
    if not inv: return ''
    pos = {}
    for w, ps in inv.items():
        for p in ps: pos[p] = w
    return ' '.join(pos[k] for k in sorted(pos))[:1500]

def fetch(sid):
    short = sid.rsplit('/', 1)[-1]
    url = (f"https://api.openalex.org/works?filter=primary_location.source.id:{short},from_publication_date:2021-01-01,type:article"
           f"&sort=cited_by_count:desc&per-page=100&select=title,doi,publication_year,cited_by_count,abstract_inverted_index")
    for k in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                res = json.load(r)
            w = [{'t': x.get('title') or '', 'a': abstract(x.get('abstract_inverted_index')), 'doi': x.get('doi'),
                  'y': x.get('publication_year'), 'c': x.get('cited_by_count')} for x in res.get('results', [])]
            return {'sid': sid, 'n': res.get('meta', {}).get('count'), 'w': w}
        except Exception:
            time.sleep(3 + 4 * k)
    return {'sid': sid, 'err': 1, 'w': []}

todo = [s for s in sids if s not in done]
print('à faire', len(todo), flush=True)
with open(OUT, 'a') as f, ThreadPoolExecutor(4) as ex:
    for i, r in enumerate(ex.map(fetch, todo)):
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
        if i % 200 == 0: print(i, flush=True); f.flush()
print('fini', flush=True)
