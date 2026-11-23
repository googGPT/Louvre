"""Compte les articles par année pour chaque revue directement dans OpenAlex (plus fiable que le résumé de la fiche)."""
import json, time, urllib.request
import os as _os
BASE = _os.environ.get("AJ_BASE", _os.path.dirname(_os.path.abspath(__file__)))
from concurrent.futures import ThreadPoolExecutor

d = json.load(open(BASE + '/work/enriched.json'))
sids = sorted({j['oa'] for j in d['J'] if j.get('oa')})

def get(url):
    for k in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 + 4 * k)
    return None

def years(sid):
    s = sid.rsplit('/', 1)[-1]
    r = get(f"https://api.openalex.org/works?filter=primary_location.source.id:{s},from_publication_date:2018-01-01&group_by=publication_year")
    if not r: return sid, None
    return sid, {int(g['key']): g['count'] for g in r.get('group_by', []) if str(g.get('key', '')).isdigit()}

import os
out = json.load(open(BASE + '/work/years.json')) if os.path.exists(BASE + '/work/years.json') else {}
sids = [s for s in sids if s not in out]
print('nouvelles', len(sids))
with ThreadPoolExecutor(4) as ex:
    for k, (sid, v) in enumerate(ex.map(years, sids)):
        if v is not None: out[sid] = v
        if k % 500 == 0: print(k, flush=True)
json.dump(out, open(BASE + '/work/years.json', 'w'))
print('revues', len(out))
