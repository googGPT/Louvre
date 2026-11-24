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

