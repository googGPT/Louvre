/* SampleSizeCalc — logique pure : taille d'échantillon pour une proportion, marge d'erreur obtenue,
   différence entre deux proportions (puissance), scénarios enregistrés et sauvegarde.
   Toutes les hypothèses (confiance, marge, proportion attendue…) sont saisies par l'utilisateur. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const KINDS = Object.freeze(['one', 'margin', 'two']);
  const LIMITS = Object.freeze({ scenarios: 200, name: 80 });
  const EPS = 1e-9; // tolérance avant l'arrondi supérieur (384,000000001 reste 384)

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const ceil = (x) => Math.ceil(x - EPS);

  // Inverse de la loi normale centrée réduite : algorithme AS 241 de Wichura (1988), précision d'environ 1e-16.
  function normInv(p) {
    if (typeof p !== 'number' || !(p > 0 && p < 1)) fail('err.prob');
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
        / (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    }
    let r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    let x;
    if (r <= 5) {
      r -= 1.6;
      x = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734)
        / (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      x = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772)
        / (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -x : x;
  }
  // z bilatéral pour un niveau de confiance en % (95 -> 1,959964).
  const zFor = (confidencePct) => normInv(1 - (1 - confidencePct / 100) / 2);

  // Nombre saisi (« 2,5 » ou « 2.5 ») -> Number ; vide -> null si permis.
  function parseNum(value, errKey, { allowEmpty = false } = {}) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/[\s  ]/g, '').replace(',', '.');
    if (!s) { if (allowEmpty) return null; fail(errKey); }
    if (!/^\d{1,12}(\.\d{1,6})?$/.test(s)) fail(errKey);
    return Number(s);
  }
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  // Contrôles des hypothèses (en %), communs aux trois calculs.
  function checkConfidence(c) { if (!num(c) || c < 50 || c > 99.99) fail('err.confidence'); return c; }
  function checkPct(v, key, lo, hi, { loOpen = true, hiOpen = true } = {}) {
    if (!num(v) || (loOpen ? v <= lo : v < lo) || (hiOpen ? v >= hi : v > hi)) fail(key); return v;
  }
  function checkPopulation(N) { if (N === null) return null; if (!Number.isInteger(N) || N < 2 || N > 1e10) fail('err.population'); return N; }
  function checkDeff(d) { if (!num(d) || d < 1 || d > 10) fail('err.deff'); return d; }

  // --- 1. Une proportion : n₀ = z²·p(1−p)/e², × effet de plan, correction pour population finie, taux de réponse.
  function oneProportion(i) {
    const confidence = checkConfidence(i.confidence);
    const margin = checkPct(i.margin, 'err.margin', 0, 50, { hiOpen: false });
    const p = checkPct(i.p, 'err.p', 0, 100);
    const population = checkPopulation(i.population);
    const response = checkPct(i.response, 'err.response', 0, 100, { hiOpen: false });
    const deff = checkDeff(i.deff);
    const z = zFor(confidence), P = p / 100, e = margin / 100;
    const n0 = (z * z * P * (1 - P)) / (e * e);
    const nDeff = n0 * deff;
    const nFpc = population === null ? null : nDeff / (1 + (nDeff - 1) / population);
    const n = ceil(nFpc === null ? nDeff : nFpc);
    const contacts = ceil(n / (response / 100));
    const warnings = [];
    if (margin >= Math.min(p, 100 - p)) warnings.push('warn.marginWide'); // l'intervalle sortirait de [0 ; 100 %]
    if (n * Math.min(P, 1 - P) < 10) warnings.push('warn.smallCount'); // approximation normale fragile
    if (population !== null && contacts > population) warnings.push('warn.contactsOverPopulation');
    return { kind: 'one', z, n0, nDeff, nFpc, n, contacts, warnings, inputs: { confidence, margin, p, population, response, deff } };
  }

  // --- 2. Marge d'erreur obtenue pour un nombre de réponses n : e = z·√(deff·p(1−p)/n)·√((N−n)/(N−1)).
  function marginFor(i) {
    const confidence = checkConfidence(i.confidence);
    const p = checkPct(i.p, 'err.p', 0, 100);
    const population = checkPopulation(i.population);
    const deff = checkDeff(i.deff);
    if (!Number.isInteger(i.n) || i.n < 2 || i.n > 1e10) fail('err.n');
    if (population !== null && i.n > population) fail('err.nOverPopulation');
    const z = zFor(confidence), P = p / 100;
    const se = Math.sqrt((deff * P * (1 - P)) / i.n);
    const fpc = population === null ? 1 : Math.sqrt((population - i.n) / (population - 1));
    const margin = 100 * z * se * fpc; // en points de pourcentage
    const warnings = [];
    if (i.n * Math.min(P, 1 - P) < 10) warnings.push('warn.smallCount');
    return { kind: 'margin', z, se, fpc, margin, low: Math.max(0, p - margin), high: Math.min(100, p + margin), warnings, inputs: { confidence, p, population, deff, n: i.n } };
  }

  // --- 3. Deux proportions (groupes de même taille), formule de Fleiss sans puis avec correction de continuité.
  // n = [z₁₋α/s·√(2·p̄·q̄) + z₁₋β·√(p₁q₁ + p₂q₂)]² / (p₁ − p₂)²
  function twoProportions(i) {
    const p1 = checkPct(i.p1, 'err.p1', 0, 100), p2 = checkPct(i.p2, 'err.p2', 0, 100);
    if (p1 === p2) fail('err.sameP');
    const alpha = checkPct(i.alpha, 'err.alpha', 0, 50);
    const power = checkPct(i.power, 'err.power', 50, 99.99, { loOpen: false, hiOpen: false });
    if (i.sides !== 1 && i.sides !== 2) fail('err.sides');
    if (typeof i.cc !== 'boolean') fail('err.backup');
    const response = checkPct(i.response, 'err.response', 0, 100, { hiOpen: false });
    const a = p1 / 100, b = p2 / 100, d = Math.abs(a - b), bar = (a + b) / 2;
    const zA = normInv(1 - alpha / 100 / i.sides), zB = normInv(power / 100);
    const nRaw = (zA * Math.sqrt(2 * bar * (1 - bar)) + zB * Math.sqrt(a * (1 - a) + b * (1 - b))) ** 2 / (d * d);
    const nCc = (nRaw / 4) * (1 + Math.sqrt(1 + 4 / (nRaw * d))) ** 2;
    const perGroup = ceil(i.cc ? nCc : nRaw);
    const contactsPerGroup = ceil(perGroup / (response / 100));
    const warnings = [];
    if (perGroup * Math.min(a, 1 - a, b, 1 - b) < 5) warnings.push('warn.smallCount');
    if (i.sides === 1) warnings.push('warn.oneSided');
    return { kind: 'two', zA, zB, bar, nRaw, nCc, perGroup, total: 2 * perGroup, contactsPerGroup, contactsTotal: 2 * contactsPerGroup, warnings, inputs: { p1, p2, alpha, power, sides: i.sides, cc: i.cc, response } };
  }

  const FIELDS = Object.freeze({
    one: ['confidence', 'deff', 'margin', 'p', 'population', 'response'],
    margin: ['confidence', 'deff', 'n', 'p', 'population'],
    two: ['alpha', 'cc', 'p1', 'p2', 'power', 'response', 'sides'],
  });
  const CALC = { one: oneProportion, margin: marginFor, two: twoProportions };
  function compute(kind, inputs) {
    if (!KINDS.includes(kind)) fail('err.kind');
    if (!keysAre(inputs, FIELDS[kind])) fail('err.backup');
    return CALC[kind](inputs);
  }

  // --- Scénarios enregistrés et sauvegarde
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    if (v.trim().length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    return v.trim();
  }
  function makeScenario(s) {
    if (!keysAre(s, ['id', 'inputs', 'kind', 'name'])) fail('err.backup');
    if (typeof s.id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(s.id)) fail('err.id');
    const r = compute(s.kind, s.inputs); // refuse toute hypothèse invalide
    return { id: s.id, name: cleanName(s.name), kind: s.kind, inputs: { ...r.inputs } };
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'samplesizecalc' || data.version !== VERSION || !Array.isArray(data.scenarios)) fail('err.notBackup');
    if (!keysAre(data, ['app', 'scenarios', 'version'])) fail('err.backup');
    if (data.scenarios.length > LIMITS.scenarios) fail('err.tooMany', { max: LIMITS.scenarios });
    const list = data.scenarios.map(makeScenario);
    if (new Set(list.map((s) => s.id)).size !== list.length) fail('err.backup');
    return list;
  }
  function backup(scenarios) { return JSON.stringify({ app: 'samplesizecalc', version: VERSION, scenarios: validateBackup({ app: 'samplesizecalc', version: VERSION, scenarios }) }, null, 2); }

  // CSV (RFC 4180) ; une cellule de texte commençant par =, +, -, @ est neutralisée pour les tableurs.
  function csvCell(v, sep) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(rows, sep = ',') {
    if (sep !== ',' && sep !== ';') fail('err.sep');
    return rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join('\r\n') + '\r\n';
  }

  root.SampleCore = Object.freeze({ VERSION, KINDS, FIELDS, LIMITS, normInv, zFor, parseNum, oneProportion, marginFor, twoProportions, compute, makeScenario, validateBackup, backup, toCSV });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SampleCore;
})(typeof window === 'undefined' ? globalThis : window);
