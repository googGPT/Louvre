"""Variante K (Rocchio + BM25) en lecture en flux, pour tester plus d'articles d'entraînement sans saturer la mémoire."""
import json, math, sys, os, collections, itertools, importlib.util
import numpy as np, scipy.sparse as sp
spec = importlib.util.spec_from_file_location("bd", "/home/claude/work/val/bd_terms.py"); bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)
terms = bd.terms
J = json.load(open('/home/claude/louvre/site/data/journaux.json'))['J']; oa2i = {j['oaid']: j['i'] for j in J if j.get('oaid')}
TEST = {n: json.load(open(f'/home/claude/work/val/{n}.json')) for n in sys.argv[1].split(',')}
tdois = {x['doi'] for s in TEST.values() for x in s if x.get('doi')}
files = ['/home/claude/ajbuild/work/works.jsonl'] + (['/home/claude/work/recent/recent.jsonl'] if os.environ.get('EXTRA') else [])
MAXREC = int(os.environ.get('MAXREC', '100'))
def articles():
    seen = set()
    for f in files:
        rec = 'recent' in f
        for l in open(f):
            r = json.loads(l); i = oa2i.get(r['sid'].rsplit('/', 1)[-1])
            if i is None: continue
            for w in (r['w'][:MAXREC] if rec else r['w']):
                if not w['t'] or w.get('doi') in tdois or (w.get('doi') and w['doi'] in seen): continue
                seen.add(w.get('doi')); yield i, collections.Counter(terms(w['t'] + ' ' + w['t'] + ' ' + (w['a'] or '')))
jtf = collections.defaultdict(collections.Counter)
for i, c in articles(): jtf[i].update(c)
journals = sorted(jtf); jpos = {i: k for k, i in enumerate(journals)}; NJ = len(journals)
df = collections.Counter()
for c in jtf.values(): df.update(t for t, n in c.items() if n >= 2)
idf = {t: math.log((NJ + 1) / (n + 1)) + 1 for t, n in df.items() if 4 <= n <= 0.5 * NJ}
V = {t: k for k, t in enumerate(sorted(idf))}; NV = len(V)
cen = collections.defaultdict(collections.Counter); n_art = 0
for i, c in articles():
    v = {t: (1 + math.log(n)) * idf[t] for t, n in c.items() if t in idf}; nr = math.sqrt(sum(x*x for x in v.values())) or 1
    cen[i].update({t: x / nr for t, x in v.items()}); n_art += 1
print('revues', NJ, 'articles', n_art, 'vocab', NV, flush=True)
def csr(rows):
    ind, dat, ptr = [], [], [0]
    for d in rows:
        for k, x in d.items(): ind.append(k); dat.append(x)
        ptr.append(len(ind))
    return sp.csr_matrix((np.array(dat, float), np.array(ind), np.array(ptr)), shape=(len(rows), NV))
def l2(M):
    n = np.sqrt(np.asarray(M.multiply(M).sum(1)).ravel()); n[n == 0] = 1; return sp.diags(1/n) @ M
R = l2(csr([{V[t]: x for t, x in cen[i].items() if t in V and jtf[i][t] >= 2} for i in journals])); del cen
TFall = csr([{V[t]: n for t, n in jtf[i].items() if t in V} for i in journals])
dl = np.asarray(TFall.sum(1)).ravel(); avg = dl.mean(); dfj = np.asarray((TFall > 0).sum(0)).ravel(); bidf = np.log(1 + (NJ - dfj + 0.5)/(dfj + 0.5))
T = TFall.tocoo(); keep = T.data >= 2; r_, c_, d_ = T.row[keep], T.col[keep], T.data[keep]
W = sp.csr_matrix((d_*2.2/(d_ + 1.2*(0.25 + 0.75*dl[r_]/avg))*bidf[c_], (r_, c_)), shape=TFall.shape)
print('nnz', R.nnz, flush=True)
def qv(x): return collections.Counter(terms(' '.join([x['t'], x['t'], x['a'], x.get('k',''), x.get('k','')])))
for sn, S in TEST.items():
    S = [x for x in S if x['i'] in jpos]; tr = np.array([jpos[x['i']] for x in S])
    Q = l2(csr([{V[t]: (1+math.log(n))*idf[t] for t, n in qv(x).items() if t in V} for x in S])); Qb = csr([{V[t]: 1.0 for t in qv(x) if t in V} for x in S])
    a = (Q @ R.T).toarray(); b = (Qb @ W.T).toarray()
    sc = 0.5*a/(a.max(1, keepdims=True)+1e-12) + 0.5*b/(b.max(1, keepdims=True)+1e-12)
    tv = sc[np.arange(len(S)), tr]; r = 1 + (sc > tv[:, None]).sum(1) + 0.5*((sc == tv[:, None]).sum(1) - 1)
    print(sn, 'err_top10', round(100*(r > 10).mean(), 1), 'err_top25', round(100*(r > 25).mean(), 1), 'top1', round(100*(r == 1).mean(), 1), 'median', np.median(r), 'MRR', round(float((1/r).mean()), 3), flush=True)
