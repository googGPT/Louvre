# Construit sjr.json (SJR, quartile, h-index de la dernière année) à partir du dépôt SCImagoJournalRankIndicators.
import csv, json, os, sys, collections, math
SRC = sys.argv[1] if len(sys.argv) > 1 else 'SCImagoJournalRankIndicators/all.csv'   # chemin du fichier all.csv
OUT = sys.argv[2] if len(sys.argv) > 2 else 'sjr.json'                               # fichier produit
rows = []                                                                            # lignes utiles
for r in csv.DictReader(open(SRC, encoding='utf-8')):                                # lecture ligne par ligne
    sj = float(r['SJR']) if r['SJR'] not in ('', None) else None                     # SJR absent possible
    rows.append((int(r['Sourceid']), int(r['year']), r['field'], sj, r['h-index'], r['Issn']))
last = {}                                                                            # dernière année par revue
for sid, y, *_ in rows: last[sid] = max(last.get(sid, 0), y)
MAXY = max(last.values())                                                          # dernière année publiée par SCImago
grp = collections.defaultdict(list)                                                  # SJR par domaine et année
for sid, y, f, s, h, iss in rows:
    if s is not None: grp[(f, y)].append(s)
for k in grp: grp[k].sort(reverse=True)                                              # tri décroissant pour les quartiles
def quart(f, y, s):                                                                  # quartile dans le domaine-année
    L = grp[(f, y)]; rank = sum(1 for v in L if v >= s) / len(L)                     # rang relatif, ex aequo au rang le plus bas
    return 'Q%d' % min(4, max(1, math.ceil(rank * 4)))
best = {}                                                                            # meilleur quartile, tous domaines
for sid, y, f, s, h, iss in rows:
    if y != MAXY: continue                                                           # seulement les revues encore indexées
    q = quart(f, y, s) if s is not None else None; b = best.get(sid)
    rec = {'sjr': s, 'q': q, 'h': int(h) if h else None, 'y': y, 'sid': sid, 'nf': 1, 'iss': iss}
    if b is None: best[sid] = rec
    else:
        b['nf'] += 1
        if q and (b['q'] is None or q < b['q']): b['q'] = q
out = {}                                                  # index par ISSN
for sid, r in best.items():
    for raw in str(r.pop('iss')).replace(' ', '').split(','):
        raw = raw.strip().upper()
        if len(raw) == 8: out.setdefault(raw[:4] + '-' + raw[4:], r)
json.dump(out, open(OUT, 'w'))                                                       # écriture
print('ISSN', len(out))
