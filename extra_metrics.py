"""Indicateurs supplémentaires OpenAlex : pays des auteurs (articles 2021+), part française, rétractations."""
import json, time, urllib.request
import os as _os
BASE = _os.environ.get("AJ_BASE", _os.path.dirname(_os.path.abspath(__file__)))
from concurrent.futures import ThreadPoolExecutor

d = json.load(open(BASE + '/work/enriched.json'))
sids = sorted({j['oa'] for j in d['J'] if j.get('oa')})
import os
OLD = json.load(open(BASE + '/work/extra.json')) if os.path.exists(BASE + '/work/extra.json') else {'countries': {}, 'retr': {}}
sids_new = [s for s in sids if s not in OLD['countries']]
print('nouvelles sources', len(sids_new))

def get(url):
    for k in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 + 4 * k)
    return None

def countries(sid):
    s = sid.rsplit('/', 1)[-1]
    r = get(f"https://api.openalex.org/works?filter=primary_location.source.id:{s},from_publication_date:2021-01-01,type:article&group_by=authorships.countries")
    if not r: return sid, None
    tot = r.get('meta', {}).get('count') or 0
    g = [(x['key'].rsplit('/', 1)[-1], x['count']) for x in r.get('group_by', []) if x.get('key')]
    return sid, {'n': tot, 'c': g[:8], 'fr': next((n for k, n in g if k == 'FR'), 0)}

out = dict(OLD['countries'])
with ThreadPoolExecutor(4) as ex:
    for k, (sid, v) in enumerate(ex.map(countries, sids_new)):
        if v: out[sid] = v
        if k % 500 == 0: print(k, flush=True)

retr = {}
for k in range(0, len(sids), 50):
    chunk = '|'.join(s.rsplit('/', 1)[-1] for s in sids[k:k + 50])
    r = get(f"https://api.openalex.org/works?filter=is_retracted:true,primary_location.source.id:{chunk}&group_by=primary_location.source.id&per-page=200")
    for x in (r or {}).get('group_by', []):
        retr[x['key']] = x['count']
print('pays', len(out), 'rétractations', len(retr))
json.dump({'countries': out, 'retr': retr}, open(BASE + '/work/extra.json', 'w'))
