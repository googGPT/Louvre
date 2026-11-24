"""Compare plusieurs algorithmes de recommandation de revue sur des articles réels de 2026.
Données d'entraînement : ~100 articles 2021+ les plus cités par revue (OpenAlex, works.jsonl).
Pour chaque article test, on classe les ~2 900 revues et on note le rang de la vraie revue."""
import json, math, sys, collections, importlib.util
import numpy as np, scipy.sparse as sp

# --- même découpage en termes que le site (build_data.py) ---
spec = importlib.util.spec_from_file_location("bd_terms", "/home/claude/work/val/bd_terms.py")
bd = importlib.util.module_from_spec(spec); spec.loader.exec_module(bd)
terms = bd.terms

J = json.load(open('/home/claude/louvre/site/data/journaux.json'))['J']
oa2i = {j['oaid']: j['i'] for j in J if j.get('oaid')}
TEST = {name: json.load(open(f'/home/claude/work/val/{name}.json')) for name in sys.argv[1].split(',')}
test_dois = {x['doi'] for s in TEST.values() for x in s if x.get('doi')}

# --- chargement des articles d'entraînement (sans les articles test) ---
jids, arts = [], []          # arts : (indice revue, compteur de termes)
for l in open('/home/claude/ajbuild/work/works.jsonl'):
    r = json.loads(l); i = oa2i.get(r['sid'].rsplit('/', 1)[-1])
    if i is None: continue
    for w in r['w']:
        if not w['t'] or w.get('doi') in test_dois: continue
        arts.append((i, collections.Counter(terms(w['t'] + ' ' + w['t'] + ' ' + (w['a'] or '')))))
journals = sorted({i for i, _ in arts}); jpos = {i: k for k, i in enumerate(journals)}; NJ = len(journals)
print('revues', NJ, 'articles', len(arts), flush=True)

# --- vocabulaire et IDF « revues » comme sur le site (terme présent ≥2 fois dans une revue ; df entre 4 et 50 % des revues) ---
jtf = [collections.Counter() for _ in journals]
for i, c in arts: jtf[jpos[i]].update(c)
df = collections.Counter()
for c in jtf: df.update(t for t, n in c.items() if n >= 2)
idf = {t: math.log((NJ + 1) / (n + 1)) + 1 for t, n in df.items() if 4 <= n <= 0.5 * NJ}
V = {t: k for k, t in enumerate(sorted(idf))}; NV = len(V)
idfv = np.array([idf[t] for t in sorted(idf)])
print('vocabulaire', NV, flush=True)

def rows_to_csr(rows):
    ind, dat, ptr = [], [], [0]
    for d in rows:
        for k, x in d.items(): ind.append(k); dat.append(x)
        ptr.append(len(ind))
    return sp.csr_matrix((np.array(dat, float), np.array(ind), np.array(ptr)), shape=(len(rows), NV))
def l2(M):
    n = np.sqrt(np.asarray(M.multiply(M).sum(1)).ravel()); n[n == 0] = 1
    return sp.diags(1 / n) @ M
def tfidf_vec(c):
    return {V[t]: (1 + math.log(n)) * idf[t] for t, n in c.items() if t in V}

# --- matrices de base ---
A = l2(rows_to_csr([tfidf_vec(c) for _, c in arts]))                  # articles TF-IDF normalisés
art_j = np.array([jpos[i] for i, _ in arts])
G = sp.csr_matrix((np.ones(len(arts)), (art_j, np.arange(len(arts)))), shape=(NJ, len(arts)))
nart = np.asarray(G.sum(1)).ravel()
TF = rows_to_csr([{V[t]: n for t, n in c.items() if t in V} for c in jtf])     # fréquences brutes par revue

def prune(M, k):                       # ne garder que les k plus gros poids par ligne (taille du site)
    M = M.tocsr(); rows = []
    for r in range(M.shape[0]):
        s, e = M.indptr[r], M.indptr[r+1]; idx = M.indices[s:e]; v = M.data[s:e]
        o = np.argsort(-v)[:k]; rows.append(dict(zip(idx[o], v[o])))
    return rows_to_csr(rows)

PROF = {}
_T = TF.copy(); _T.data = np.where(_T.data >= 2, (1 + np.log(_T.data)) * idfv[_T.indices], 0); _T.eliminate_zeros()
PROF['tfidf_somme'] = l2(prune(_T, 150))
PROF['rocchio150'] = l2(prune(G @ A, 150))
PROF['rocchio_complet'] = l2(G @ A)
for k in (300, 500, 1000): PROF[f'rocchio{k}'] = l2(prune(G @ A, k))
MASK2 = (TF >= 2).astype(float)
PROF['rocchio_tf2'] = l2(sp.csr_matrix((G @ A).multiply(MASK2)))

# --- requêtes ---
def qvec(x):
    c = collections.Counter(terms(' '.join([x['t'], x['t'], x['a'], x.get('k',''), x.get('k','')])))
    return c
def qmat(S):
    return l2(rows_to_csr([tfidf_vec(qvec(x)) for x in S]))

# --- algorithmes : chacun renvoie une matrice (requêtes × revues) de scores ---
def cosine(name): return lambda S, Q: (Q @ PROF[name].T).toarray()
def bm25(k1=1.2, b=0.75, keep=None, tf2=False):
    dl = np.asarray(TF.sum(1)).ravel(); avg = dl.mean()
    dfj = np.asarray((TF > 0).sum(0)).ravel(); bidf = np.log(1 + (NJ - dfj + 0.5) / (dfj + 0.5))
    T = TF.tocoo(); den = T.data + k1 * (1 - b + b * dl[T.row] / avg)
    W = sp.csr_matrix((T.data * (k1 + 1) / den * bidf[T.col], (T.row, T.col)), shape=TF.shape)
    if keep: W = prune(W, keep)
    if tf2: W = sp.csr_matrix(W.multiply(MASK2))
    def f(S, Q):
        Qb = rows_to_csr([{V[t]: 1.0 for t in qvec(x) if t in V} for x in S])
        return (Qb @ W.T).toarray()
    return f
def dirichlet(mu=2000):                # vraisemblance de la requête, lissage de Dirichlet (Zhai et Lafferty, 2001)
    coll = np.asarray(TF.sum(0)).ravel() + 0.5; pc = coll / coll.sum()
    dl = np.asarray(TF.sum(1)).ravel()
    T = TF.tocoo()
    LW = sp.csr_matrix((np.log(1 + T.data / (mu * pc[T.col])), (T.row, T.col)), shape=TF.shape)
    base = np.log(mu / (dl + mu))
    def f(S, Q):
        rows = [{V[t]: n for t, n in qvec(x).items() if t in V} for x in S]
        Qc = rows_to_csr(rows); ql = np.asarray(Qc.sum(1)).ravel()
        return (Qc @ LW.T).toarray() + ql[:, None] * base[None, :]
    return f
def knn(k=50):                         # k plus proches articles, vote pondéré par la similarité (Yang, 1999)
    def f(S, Q):
        Sim = (Q @ A.T).toarray(); out = np.zeros((len(S), NJ))
        for r in range(len(S)):
            top = np.argpartition(-Sim[r], k)[:k]
            np.add.at(out[r], art_j[top], Sim[r, top])
        return out
    return f
def hybrid(f1, f2, w):
    def f(S, Q):
        a, b = f1(S, Q), f2(S, Q)
        a = a / (a.max(1, keepdims=True) + 1e-12); b = b / (b.max(1, keepdims=True) + 1e-12)
        return w * a + (1 - w) * b
    return f

ALGOS = {
  'K. Rocchio(tf>=2) + BM25(tf>=2) (50/50)': hybrid(cosine('rocchio_tf2'), bm25(tf2=True), 0.5),
  'K2. Rocchio(tf>=2) + BM25(tf>=2) (60/40)': hybrid(cosine('rocchio_tf2'), bm25(tf2=True), 0.6),
  'K3. Rocchio(tf>=2) + BM25(tf>=2) (40/60)': hybrid(cosine('rocchio_tf2'), bm25(tf2=True), 0.4),
  'J3. Rocchio300 + BM25-300 (50/50)': hybrid(cosine('rocchio300'), bm25(keep=300), 0.5),
  'J5. Rocchio500 + BM25-500 (50/50)': hybrid(cosine('rocchio500'), bm25(keep=500), 0.5),
  'J5b. Rocchio500 + BM25-500 (30/70)': hybrid(cosine('rocchio500'), bm25(keep=500), 0.3),
  'J5c. Rocchio500 + BM25-500 (70/30)': hybrid(cosine('rocchio500'), bm25(keep=500), 0.7),
  'J5d. Rocchio500 + BM25 k1=2 b=0.3 -500 (50/50)': hybrid(cosine('rocchio500'), bm25(2.0, 0.3, keep=500), 0.5),
  'A. TF-IDF somme (ancien profil)': cosine('tfidf_somme'),
  'B. Rocchio, 150 termes (profil actuel)': cosine('rocchio150'),
  'C. Rocchio complet': cosine('rocchio_complet'),
  'C3. Rocchio 300 termes': cosine('rocchio300'),
  'C5. Rocchio 500 termes': cosine('rocchio500'),
  'C10. Rocchio 1000 termes': cosine('rocchio1000'),
  'D. BM25': bm25(),
  'D2. BM25 k1=2 b=0.3': bm25(2.0, 0.3),
  'D3. BM25 k1=0.8 b=0.9': bm25(0.8, 0.9),
  'E2. Vraisemblance Dirichlet mu=500': dirichlet(500),
  'J. Rocchio complet + BM25 (50/50)': hybrid(cosine('rocchio_complet'), bm25(), 0.5),
  'E. Vraisemblance Dirichlet': dirichlet(),
  'F. kNN 50 articles': knn(50),
  'G. kNN 200 articles': knn(200),
  'H. Rocchio150 + kNN50 (50/50)': hybrid(cosine('rocchio150'), knn(50), 0.5),
  'I. BM25 + kNN50 (50/50)': hybrid(bm25(), knn(50), 0.5),
}
DISC = None
def metrics(ranks, top1_same_field):
    r = np.array(ranks); n = len(r)
    return dict(n=n, err_top10=round(100 * (r > 10).mean(), 1), err_top25=round(100 * (r > 25).mean(), 1),
                top1=round(100 * (r == 1).mean(), 1), median=int(np.median(r)), MRR=round(float((1 / r).mean()), 3),
                err_domaine=round(100 * (1 - np.mean(top1_same_field)), 1))

# disciplines (même rattachement que le site, recodé)
D_AJG = {"FINANCE":["FIN"],"ACCOUNT":["ACC"],"ECON":["ECO"],"BUS HIST & ECON HIST":["ECO"],"STRAT":["STR"],"ETHICS-CSR-MAN":["STR","RSE"],"REGIONAL STUDIES, PLANNING AND ENVIRONMENT":["RSE"],"ORG STUD":["ORG"],"HRM&EMP":["ORG"],"PSYCH (WOP-OB)":["ORG"],"MKT":["MKT"],"INFO MAN":["SI"],"INNOV":["SI"],"OPS&TECH":["OPS"],"OR&MANSCI":["OPS"],"ENT-SBM":["ENT"],"IB&AREA":["ENT"],"PUB SEC":["PUB"],"MDEV&EDU":["PUB"],"SECTOR":["SEC"],"PSYCH (GENERAL)":["SOC"],"SOC SCI":["SOC"]}
D_FN = {"FIN":["FIN"],"ACC":["ACC"],"GEN MAN":["STR"],"STRAT":["STR"],"MIS":["SI"],"INNOV":["SI"],"MKG":["MKT"],"HRM":["ORG"],"ORG STUD":["ORG"],"PUB MAN":["PUB"],"HLTH":["PUB"],"EDUC":["PUB"],"BUS SOC":["RSE"],"LOG":["OPS"],"INT":["ENT"],"SECTOR":["SEC"],"BUS HIST":["ECO"]}
D_FOR = {"3501":["ACC"],"3502":["FIN"],"3503":["STR"],"3504":["SEC"],"3505":["ORG"],"3506":["MKT"],"3507":["STR"],"3508":["SEC"],"3509":["OPS"],"3599":["STR"],"3801":["ECO"],"3802":["ECO"],"3803":["ECO"],"3899":["ECO"],"4609":["SI"],"4801":["SEC"],"4905":["AUT"]}
def disc(j):
    d = set(D_AJG.get(j.get('ajgf'), []) + D_FN.get(j.get('fnd'), []) + D_FOR.get(j.get('for'), []))
    if not d and j.get('top'): d.add('OA:' + j['top'][0][1])
    return d or {'AUT'}
JD = {j['i']: disc(j) for j in J}

if __name__ == '__main__':
    only = sys.argv[2].split('|') if len(sys.argv) > 2 else None
    res = {}
    for sname, S in TEST.items():
        S = [x for x in S if x['i'] in jpos]
        Q = qmat(S); truth = np.array([jpos[x['i']] for x in S])
        for name, f in ALGOS.items():
            if only and not any(o in name for o in only): continue
            sc = f(S, Q)
            tv = sc[np.arange(len(S)), truth]
            ranks = 1 + (sc > tv[:, None]).sum(1) + 0.5 * ((sc == tv[:, None]).sum(1) - 1)
            same = [bool(JD[journals[int(np.argmax(sc[r]))]] & JD[S[r]['i']]) for r in range(len(S))]
            res.setdefault(name, {})[sname] = metrics(ranks, same)
            print(sname, name, res[name][sname], flush=True)
    json.dump(res, open('/home/claude/work/val/compare_out.json', 'w'), ensure_ascii=False, indent=1)
