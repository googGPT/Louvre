"""Tire 100 revues au hasard dans l'atlas, puis 1 article de 2026 avec résumé dans chacune (OpenAlex)."""
import json, random, urllib.request, time
J = json.load(open('/home/claude/louvre/site/data/journaux.json'))['J']
C = json.load(open('/home/claude/louvre/site/data/corpus.json'))
pool = [j for j in J if j.get('oaid') and str(j['i']) in C['prof'] and (j.get('n21') or 0) >= 20]
random.seed(4242); random.shuffle(pool); used = {x["i"] for f in ("sample.json","dev.json") for x in json.load(open(f))}; pool = [j for j in pool if j["i"] not in used]
def inv(ix):
    pos = {p: w for w, ps in (ix or {}).items() for p in ps}
    return ' '.join(pos[k] for k in sorted(pos))
out = []
for j in pool:
    if len(out) >= 400: break
    url = (f"https://api.openalex.org/works?filter=primary_location.source.id:{j['oaid']},publication_year:2026,type:article,has_abstract:true"
           f"&sample=5&seed=23&select=id,title,doi,abstract_inverted_index,keywords")
    try:
        with urllib.request.urlopen(url, timeout=60) as r: res = json.load(r)['results']
    except Exception as e:
        time.sleep(2); continue
    for w in res:
        a = inv(w.get('abstract_inverted_index'))
        if w.get('title') and len(a.split()) >= 80 and not a.lower().startswith(('this article','abstract unavailable')):
            out.append({'i': j['i'], 'journal': j['t'], 't': w['title'], 'a': a[:3000], 'doi': w.get('doi'),
                        'k': '; '.join(k['display_name'] for k in (w.get('keywords') or []))})
            break
json.dump(out, open('test400.json', 'w'), ensure_ascii=False, indent=0)
print(len(out), 'articles')
