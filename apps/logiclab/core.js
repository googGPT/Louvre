/* LogicLab — logique pure : analyse d'expressions propositionnelles (symboles et mots-clés), table de vérité,
   tautologie / contradiction / satisfiable, équivalence de deux expressions, formes normales canoniques
   et simplifiées (Quine-McCluskey). Jusqu'à 10 variables (1 024 lignes). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ vars: 10, expr: 300, varName: 12, name: 60, saved: 100, columns: 24 });
  const NOTATIONS = Object.freeze(['symbols', 'ascii', 'words']);
  const ORDERS = Object.freeze(['falseFirst', 'trueFirst']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }

  // Priorités : ¬ > ∧ > ⊕ > ∨ > → > ↔ ; → est associative à droite, les autres à gauche.
  const PREC = Object.freeze({ iff: 1, imp: 2, or: 3, xor: 4, and: 5 });
  const SYMBOLS = [ // du plus long au plus court
    ['<->', 'iff'], ['<=>', 'iff'], ['->', 'imp'], ['=>', 'imp'], ['&&', 'and'], ['||', 'or'],
    ['↔', 'iff'], ['⇔', 'iff'], ['≡', 'iff'], ['→', 'imp'], ['⇒', 'imp'], ['∧', 'and'], ['&', 'and'], ['·', 'and'], ['*', 'and'],
    ['∨', 'or'], ['|', 'or'], ['+', 'or'], ['⊕', 'xor'], ['⊻', 'xor'], ['^', 'xor'], ['¬', 'not'], ['!', 'not'], ['~', 'not'],
    ['(', '('], [')', ')'], ['[', '['], [']', ']'], ['⊤', 'true'], ['⊥', 'false'], ['1', 'true'], ['0', 'false'],
  ];
  // Mots-clés anglais et français, sans tenir compte de la casse.
  const WORDS = Object.freeze({
    not: 'not', non: 'not', and: 'and', et: 'and', or: 'or', ou: 'or', xor: 'xor',
    implies: 'imp', implique: 'imp', iff: 'iff', ssi: 'iff', equiv: 'iff',
    true: 'true', vrai: 'true', false: 'false', faux: 'false',
  });
  const IDENT = /[\p{L}_][\p{L}\p{N}_]*/uy;

  function tokenize(text, max = LIMITS.expr) {
    if (typeof text !== 'string') fail('err.empty');
    if (text.length > max) fail('err.tooLong', { max });
    const toks = []; let i = 0;
    outer: while (i < text.length) {
      const c = text[i];
      if (/\s/.test(c)) { i++; continue; }
      for (const [sym, type] of SYMBOLS) if (text.startsWith(sym, i)) {
        // « 10 » ou « 2 » ne sont pas des constantes : un chiffre doit être isolé.
        if ((sym === '1' || sym === '0') && /[\p{L}\p{N}_]/u.test(text[i + 1] || '')) break;
        toks.push({ type, pos: i, text: sym }); i += sym.length; continue outer;
      }
      IDENT.lastIndex = i;
      const m = IDENT.exec(text);
      if (m) {
        const w = m[0], kw = WORDS[w.toLowerCase()];
        if (kw) toks.push({ type: kw, pos: i, text: w });
        else {
          if (w.length > LIMITS.varName) fail('err.varLong', { max: LIMITS.varName, pos: i + 1 });
          toks.push({ type: 'var', pos: i, text: w });
        }
        i += w.length; continue;
      }
      fail('err.char', { ch: String.fromCodePoint(text.codePointAt(i)), pos: i + 1 });
    }
    return toks;
  }

  // Analyse par priorité (précédence) : renvoie un arbre { op, a, b } / { op: 'var', name } / { op: 'const', v }.
  // max : longueur autorisée (les tests relisent aussi les formes canoniques, plus longues que la saisie).
  function parse(text, max = LIMITS.expr) {
    const toks = tokenize(text, max);
    if (!toks.length) fail('err.empty');
    let k = 0;
    const peek = () => toks[k];
    const endPos = text.replace(/\s+$/, '').length + 1;
    function primary() {
      const tok = toks[k];
      if (!tok) fail('err.expectedOperand', { pos: endPos });
      if (tok.type === 'not') { k++; return { op: 'not', a: primary() }; }
      if (tok.type === 'var') { k++; return { op: 'var', name: tok.text }; }
      if (tok.type === 'true' || tok.type === 'false') { k++; return { op: 'const', v: tok.type === 'true' ? 1 : 0 }; }
      if (tok.type === '(' || tok.type === '[') {
        k++;
        const inner = binary(1);
        const close = tok.type === '(' ? ')' : ']';
        const nxt = toks[k];
        if (!nxt) fail('err.missingClose', { pos: tok.pos + 1, ch: close });
        if (nxt.type !== close) {
          if (nxt.type === ')' || nxt.type === ']') fail('err.wrongClose', { pos: nxt.pos + 1, ch: close });
          fail('err.missingOperator', { pos: nxt.pos + 1 });
        }
        k++; return inner;
      }
      if (tok.type === ')' || tok.type === ']') fail('err.unmatchedClose', { pos: tok.pos + 1 });
      fail('err.expectedOperand', { pos: tok.pos + 1 });
    }
    function binary(minPrec) {
      let left = primary();
      for (;;) {
        const tok = peek();
        if (!tok || !PREC[tok.type] || PREC[tok.type] < minPrec) return left;
        const op = tok.type, p = PREC[op];
        k++;
        const right = binary(op === 'imp' ? p : p + 1); // → associative à droite
        left = { op, a: left, b: right };
      }
    }
    const ast = binary(1);
    if (k < toks.length) {
      const tok = toks[k];
      if (tok.type === ')' || tok.type === ']') fail('err.unmatchedClose', { pos: tok.pos + 1 });
      fail('err.missingOperator', { pos: tok.pos + 1 });
    }
    const vars = variables(ast);
    if (vars.length > LIMITS.vars) fail('err.tooManyVars', { max: LIMITS.vars, n: vars.length });
    return ast;
  }

  // Ordre naturel : p, q, r… et x2 avant x10.
  const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'case' }) || (a < b ? -1 : a > b ? 1 : 0);
  function variables(ast, set = new Set()) {
    if (ast.op === 'var') set.add(ast.name);
    else if (ast.a) { variables(ast.a, set); if (ast.b) variables(ast.b, set); }
    return [...set].sort(natural);
  }
  function unionVars(...asts) {
    const set = new Set(); for (const a of asts) if (a) for (const v of variables(a)) set.add(v);
    const vars = [...set].sort(natural);
    if (vars.length > LIMITS.vars) fail('err.tooManyVars', { max: LIMITS.vars, n: vars.length });
    return vars;
  }

  // Ligne r (0 … 2^n − 1) : la première variable est le bit de poids fort ; ligne 0 = tout faux.
  function bit(r, k, n) { return (r >> (n - 1 - k)) & 1; }
  function evalVec(ast, vars) {
    const n = vars.length, R = 1 << n;
    const idx = new Map(vars.map((v, k) => [v, k]));
    function ev(node) {
      const out = new Uint8Array(R);
      switch (node.op) {
        case 'const': out.fill(node.v); return out;
        case 'var': { const k = idx.get(node.name); if (k === undefined) fail('err.unknownVar'); for (let r = 0; r < R; r++) out[r] = bit(r, k, n); return out; }
        case 'not': { const a = ev(node.a); for (let r = 0; r < R; r++) out[r] = 1 - a[r]; return out; }
        default: {
          const a = ev(node.a), b = ev(node.b);
          for (let r = 0; r < R; r++) {
            const x = a[r], y = b[r];
            out[r] = node.op === 'and' ? x & y : node.op === 'or' ? x | y : node.op === 'xor' ? x ^ y : node.op === 'imp' ? ((1 - x) | y) : (x === y ? 1 : 0);
          }
          return out;
        }
      }
    }
    return ev(ast);
  }
  function evaluate(ast, assignment) { // { p: 1, q: 0 } -> 0 ou 1
    const vars = variables(ast);
    let r = 0; for (const v of vars) r = (r << 1) | (assignment[v] ? 1 : 0);
    return evalVec(ast, vars)[r];
  }

  function classify(vec) {
    let models = 0; for (const x of vec) models += x;
    return { models, rows: vec.length, kind: models === vec.length ? 'tautology' : models === 0 ? 'contradiction' : 'contingent', satisfiable: models > 0 };
  }

  // --- Écriture d'une expression avec le minimum de parenthèses
  const OPS = Object.freeze({
    symbols: { not: '¬', and: ' ∧ ', or: ' ∨ ', xor: ' ⊕ ', imp: ' → ', iff: ' ↔ ', true: '⊤', false: '⊥' },
    ascii: { not: '!', and: ' & ', or: ' | ', xor: ' ^ ', imp: ' -> ', iff: ' <-> ', true: '1', false: '0' },
    words: { not: 'NOT ', and: ' AND ', or: ' OR ', xor: ' XOR ', imp: ' IMPLIES ', iff: ' IFF ', true: 'TRUE', false: 'FALSE' },
  });
  function toText(ast, notation = 'symbols') {
    const O = OPS[notation]; if (!O) fail('err.notation');
    function w(node, parentPrec, side, parentOp) {
      if (node.op === 'var') return node.name;
      if (node.op === 'const') return node.v ? O.true : O.false;
      if (node.op === 'not') return O.not + w(node.a, 6, 'u', 'not');
      const p = PREC[node.op];
      const s = w(node.a, p, 'l', node.op) + O[node.op] + w(node.b, p, 'r', node.op);
      let paren = p < parentPrec;
      if (p === parentPrec) { // même opérateur : parenthèses seulement du côté non associatif
        if (parentOp === 'imp') paren = side === 'l';
        else if (parentOp === 'iff') paren = side === 'r';
      }
      if (parentOp === 'not') paren = true;
      return paren ? `(${s})` : s;
    }
    return w(ast, 0, '', '');
  }

  // Colonnes intermédiaires : sous-formules distinctes (ordre de calcul), sans les variables.
  function subformulas(ast, notation = 'symbols') {
    const seen = new Map();
    (function walk(node) {
      if (node.a) walk(node.a);
      if (node.b) walk(node.b);
      if (node.op !== 'var' && node.op !== 'const') { const key = toText(node, notation); if (!seen.has(key)) seen.set(key, node); }
    })(ast);
    return [...seen.entries()].map(([text, node]) => ({ text, node }));
  }

  // --- Formes normales
  const lit = (name, positive, notation) => (positive ? name : OPS[notation].not + name);
  function canonicalDNF(vec, vars, notation = 'symbols') {
    const O = OPS[notation], n = vars.length, terms = [];
    for (let r = 0; r < vec.length; r++) if (vec[r]) terms.push(vars.map((v, k) => lit(v, bit(r, k, n), notation)).join(O.and));
    if (!terms.length) return O.false;
    if (n === 0) return O.true;
    return terms.map((tm) => (terms.length > 1 && n > 1 ? `(${tm})` : tm)).join(O.or);
  }
  function canonicalCNF(vec, vars, notation = 'symbols') {
    const O = OPS[notation], n = vars.length, clauses = [];
    for (let r = 0; r < vec.length; r++) if (!vec[r]) clauses.push(vars.map((v, k) => lit(v, !bit(r, k, n), notation)).join(O.or));
    if (!clauses.length) return O.true;
    if (n === 0) return O.false;
    return clauses.map((c) => (clauses.length > 1 && n > 1 ? `(${c})` : c)).join(O.and);
  }

  // Quine-McCluskey : implicants premiers des lignes « cibles », puis couverture (essentiels, puis choix glouton déterministe).
  // Un implicant = { value, mask } : mask indique les bits fixés (1) ; les autres sont indifférents.
  function primeImplicants(targets, n) {
    const full = (1 << n) - 1;
    let level = new Map(targets.map((m) => [`${full}:${m}`, { mask: full, value: m }]));
    const primes = [];
    while (level.size) {
      const next = new Map(), used = new Set(), items = [...level.values()];
      const byMask = new Map();
      for (const it of items) { if (!byMask.has(it.mask)) byMask.set(it.mask, []); byMask.get(it.mask).push(it); }
      for (const group of byMask.values()) {
        const set = new Map(group.map((g) => [g.value, g]));
        for (const g of group) for (let k = 0; k < n; k++) {
          const b = 1 << k;
          if (!(g.mask & b) || (g.value & b)) continue; // on combine la version à 0 avec celle à 1
          const other = set.get(g.value | b);
          if (!other) continue;
          used.add(`${g.mask}:${g.value}`); used.add(`${other.mask}:${other.value}`);
          const m = g.mask & ~b, v = g.value & m;
          next.set(`${m}:${v}`, { mask: m, value: v });
        }
      }
      for (const it of items) if (!used.has(`${it.mask}:${it.value}`)) primes.push(it);
      level = next;
    }
    return primes;
  }
  const covers = (imp, m) => (m & imp.mask) === imp.value;
  const literals = (imp, n) => { if (!imp) return Infinity; let c = 0; for (let k = 0; k < n; k++) if (imp.mask & (1 << k)) c++; return c; };
  // Couverture : implicants essentiels, puis recherche exacte (séparation et évaluation) du plus petit nombre de termes,
  // à égalité du moins de littéraux. Si la recherche dépasse son budget, on garde la meilleure solution trouvée
  // (au départ, une solution gloutonne) et on le signale : correcte, mais pas garantie minimale.
  function cover(primes, targets, n) {
    const chosen = [];
    for (const m of targets) {
      const who = primes.filter((p) => covers(p, m));
      if (who.length === 1 && !chosen.includes(who[0])) chosen.push(who[0]);
    }
    const left = targets.filter((m) => !chosen.some((p) => covers(p, m)));
    if (!left.length) return { chosen, greedy: false };
    const pool = primes.filter((p) => !chosen.includes(p) && left.some((m) => covers(p, m)));
    const cost = (set) => [set.length, set.reduce((s, p) => s + literals(p, n), 0)];
    const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    // Solution gloutonne de départ (borne supérieure).
    let best = [];
    { const rest = new Set(left);
      while (rest.size) {
        let pick = null, gain = -1;
        for (const p of pool) { let g = 0; for (const m of rest) if (covers(p, m)) g++; if (g > gain || (g === gain && literals(p, n) < literals(pick, n))) { pick = p; gain = g; } }
        best.push(pick); for (const m of [...rest]) if (covers(pick, m)) rest.delete(m);
      } }
    let bestCost = cost(best), budget = 30000, complete = true;
    const by = new Map(left.map((m) => [m, pool.filter((p) => covers(p, m))])); // implicants couvrant chaque ligne
    (function search(rest, picked) {
      if (--budget < 0) { complete = false; return; }
      if (!rest.length) { const c = cost(picked); if (better(c, bestCost)) { best = picked.slice(); bestCost = c; } return; }
      if (picked.length + 1 > bestCost[0]) return; // il faudra au moins un terme de plus
      // Ligne la plus difficile à couvrir : on essaie chacun de ses implicants.
      let options = null;
      for (const m of rest) { const o = by.get(m); if (!options || o.length < options.length) options = o; }
      for (const p of options) {
        picked.push(p);
        search(rest.filter((m) => !covers(p, m)), picked);
        picked.pop();
        if (!complete) return;
      }
    })(left, []);
    return { chosen: [...chosen, ...best], greedy: !complete };
  }
  // Ordre d'affichage stable : moins de littéraux d'abord, puis ordre des variables.
  function sortImps(imps, n) {
    // a = littéral positif, b = négatif, c = variable absente : p avant ¬p avant q.
    const rank = (p) => { let s = ''; for (let k = n - 1; k >= 0; k--) s += p.mask & (1 << k) ? (p.value & (1 << k) ? 'a' : 'b') : 'c'; return s; };
    return imps.slice().sort((a, b) => literals(a, n) - literals(b, n) || (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
  }
  function simplify(vec, vars, notation = 'symbols') {
    const O = OPS[notation], n = vars.length;
    const ones = [], zeros = [];
    for (let r = 0; r < vec.length; r++) (vec[r] ? ones : zeros).push(r);
    const termOf = (imp, positiveWhen) => {
      const parts = [];
      for (let k = 0; k < n; k++) {
        const b = 1 << (n - 1 - k);
        if (imp.mask & b) parts.push(lit(vars[k], positiveWhen((imp.value & b) !== 0), notation));
      }
      return parts;
    };
    let dnf, cnf, dnfGreedy = false, cnfGreedy = false, dnfTerms = 0, cnfClauses = 0;
    if (!ones.length) dnf = O.false;
    else if (!zeros.length) dnf = O.true;
    else {
      const { chosen, greedy } = cover(primeImplicants(ones, n), ones, n); dnfGreedy = greedy;
      const terms = sortImps(chosen, n).map((imp) => termOf(imp, (x) => x));
      dnfTerms = terms.length;
      dnf = terms.map((p) => (p.length > 1 && terms.length > 1 ? `(${p.join(O.and)})` : p.join(O.and))).join(O.or);
    }
    if (!zeros.length) cnf = O.true;
    else if (!ones.length) cnf = O.false;
    else {
      const { chosen, greedy } = cover(primeImplicants(zeros, n), zeros, n); cnfGreedy = greedy;
      const clauses = sortImps(chosen, n).map((imp) => termOf(imp, (x) => !x)); // une ligne fausse donne une clause niée
      cnfClauses = clauses.length;
      cnf = clauses.map((p) => (p.length > 1 && clauses.length > 1 ? `(${p.join(O.or)})` : p.join(O.or))).join(O.and);
    }
    return { dnf, cnf, dnfGreedy, cnfGreedy, dnfTerms, cnfClauses };
  }

  // --- Analyse complète d'une expression (et comparaison facultative avec une seconde)
  function assignment(r, vars) { const o = {}; vars.forEach((v, k) => { o[v] = bit(r, k, vars.length); }); return o; }
  function analyze(textA, textB = '', notation = 'symbols', max = LIMITS.expr) {
    if (!NOTATIONS.includes(notation)) fail('err.notation');
    const a = parse(textA, max);
    const b = String(textB).trim() ? parse(textB, max) : null;
    const vars = unionVars(a, b);
    const vecA = evalVec(a, vars);
    const res = {
      vars, a, vecA, classA: classify(vecA), textA: toText(a, notation),
      subs: subformulas(a, notation).slice(0, LIMITS.columns).map((s) => ({ text: s.text, vec: evalVec(s.node, vars) })),
      forms: null, b: null,
    };
    const own = variables(a); // formes normales sur les seules variables de A
    const vecOwn = own.length === vars.length ? vecA : evalVec(a, own);
    const simp = simplify(vecOwn, own, notation);
    res.forms = { vars: own, canonDnf: canonicalDNF(vecOwn, own, notation), canonCnf: canonicalCNF(vecOwn, own, notation), dnf: simp.dnf, cnf: simp.cnf, dnfGreedy: simp.dnfGreedy, cnfGreedy: simp.cnfGreedy, dnfTerms: simp.dnfTerms, cnfClauses: simp.cnfClauses };
    if (b) {
      const vecB = evalVec(b, vars);
      const diff = []; let aImpB = true, bImpA = true;
      for (let r = 0; r < vecA.length; r++) {
        if (vecA[r] !== vecB[r]) { if (diff.length < 8) diff.push({ row: r, values: assignment(r, vars), a: vecA[r], b: vecB[r] }); }
        if (vecA[r] && !vecB[r]) aImpB = false;
        if (vecB[r] && !vecA[r]) bImpA = false;
      }
      let differ = 0; for (let r = 0; r < vecA.length; r++) if (vecA[r] !== vecB[r]) differ++;
      res.b = { ast: b, vec: vecB, textB: toText(b, notation), classB: classify(vecB), equivalent: differ === 0, differ, diff, aImpB, bImpA };
    }
    return res;
  }

  // --- Export CSV de la table (en-têtes fournis par l'interface)
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function truthCSV(res, headers, order = 'falseFirst') {
    const rows = [headers];
    const R = res.vecA.length, n = res.vars.length;
    for (let i = 0; i < R; i++) {
      const r = order === 'trueFirst' ? R - 1 - i : i;
      const line = res.vars.map((_, k) => bit(r, k, n));
      line.push(res.vecA[r]); if (res.b) line.push(res.b.vec[r]);
      rows.push(line);
    }
    return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // --- Préférences, brouillon, expressions enregistrées et sauvegarde
  const ID = /^[a-z0-9-]{6,64}$/i;
  function cleanText(v, max, key) {
    if (typeof v !== 'string') fail('err.backup');
    if (v.length > max) fail(key, { max });
    return v;
  }
  function makeSaved(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) fail('err.nameRequired');
    if (name.length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    const a = cleanText(input.a, LIMITS.expr, 'err.tooLong').trim(), b = cleanText(input.b || '', LIMITS.expr, 'err.tooLong').trim();
    parse(a); if (b) parse(b); // une expression enregistrée est toujours valide
    unionVars(parse(a), b ? parse(b) : null);
    return { id, name, a, b };
  }
  function makePrefs(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).sort().join(',') !== 'notation,order') fail('err.backup');
    if (!NOTATIONS.includes(p.notation) || !ORDERS.includes(p.order)) fail('err.backup');
    return { notation: p.notation, order: p.order };
  }
  function makeDraft(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).sort().join(',') !== 'a,b') fail('err.backup');
    return { a: cleanText(d.a, LIMITS.expr, 'err.tooLong'), b: cleanText(d.b, LIMITS.expr, 'err.tooLong') }; // un brouillon peut être invalide
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'logiclab' || data.version !== VERSION) fail('err.notBackup');
    if (Object.keys(data).sort().join(',') !== 'app,draft,prefs,saved,version' || !Array.isArray(data.saved)) fail('err.backup');
    if (data.saved.length > LIMITS.saved) fail('err.tooManySaved', { max: LIMITS.saved });
    const saved = data.saved.map((s) => {
      if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).sort().join(',') !== 'a,b,id,name') fail('err.backup');
      return makeSaved(s, s.id);
    });
    if (new Set(saved.map((s) => s.id)).size !== saved.length) fail('err.backup');
    return { prefs: makePrefs(data.prefs), draft: makeDraft(data.draft), saved };
  }
  function backup(state) {
    const s = validateBackup({ app: 'logiclab', version: VERSION, prefs: state.prefs, draft: state.draft, saved: state.saved });
    return JSON.stringify({ app: 'logiclab', version: VERSION, ...s }, null, 2);
  }

  root.LogicCore = Object.freeze({ VERSION, LIMITS, NOTATIONS, ORDERS, PREC, tokenize, parse, variables, unionVars, evalVec, evaluate, classify, toText, subformulas, canonicalDNF, canonicalCNF, primeImplicants, simplify, analyze, bit, truthCSV, csvCell, makeSaved, makePrefs, makeDraft, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LogicCore;
})(typeof window === 'undefined' ? globalThis : window);
