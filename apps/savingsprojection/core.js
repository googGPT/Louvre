/* SavingsProjection — logique pure : projection d'une épargne avec versements périodiques et taux
   annuels hypothétiques saisis par l'utilisateur. Ce sont des calculs sur hypothèses, pas une prévision.
   Montants en centimes entiers ; taux en points de base (3,5 % = 350) ; capitalisation mensuelle :
   chaque mois, intérêts = solde × taux annuel / 12, arrondis au centime. */
(function (root) {
  'use strict';

  const APP = 'savingsprojection', VERSION = 1;
  const FREQUENCIES = Object.freeze({ monthly: 1, quarterly: 3, yearly: 12 }); // versement tous les N mois
  const TIMINGS = Object.freeze(['start', 'end']); // versement en début ou en fin de période
  const MAX_SCENARIOS = 5, MAX_YEARS = 60, MAX_NAME = 30;
  const MAX_CENTS = 999999999; // 9 999 999,99
  const MIN_RATE = -2000, MAX_RATE = 3000; // de -20 % à +30 % par an
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();

  // Montant positif ou nul : « 1 500,50 » -> 150050 centimes.
  function parseCents(value, key) {
    const s = str(value).replace(/\s/g, '').replace(',', '.');
    if (s === '') return 0;
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents > MAX_CENTS) fail('err.amountBig');
    return cents;
  }
  // Taux annuel hypothétique en % (signe moins accepté) -> points de base.
  function parseRate(value) {
    const s = str(value).replace(/\s|%/g, '').replace(',', '.').replace('−', '-');
    if (!/^-?\d{1,2}(\.\d{1,2})?$/.test(s)) fail('err.rate');
    const neg = s.startsWith('-'), [a, b = ''] = s.replace('-', '').split('.');
    const bp = (neg ? -1 : 1) * (Number(a) * 100 + Number((b + '00').slice(0, 2)));
    if (bp < MIN_RATE || bp > MAX_RATE) fail('err.rate');
    return bp === 0 ? 0 : bp; // pas de « -0 »
  }

  function makePlan(input) {
    if (!isObj(input)) fail('err.plan');
    const initialCents = parseCents(input.initial, 'err.initial');
    const contributionCents = parseCents(input.contribution, 'err.contribution');
    if (!initialCents && !contributionCents) fail('err.nothing');
    if (!Object.prototype.hasOwnProperty.call(FREQUENCIES, input.frequency)) fail('err.frequency');
    if (!TIMINGS.includes(input.timing)) fail('err.timing');
    const y = str(input.years);
    if (!/^\d{1,2}$/.test(y) || Number(y) < 1 || Number(y) > MAX_YEARS) fail('err.years', { max: MAX_YEARS });
    return { initialCents, contributionCents, frequency: input.frequency, timing: input.timing, years: Number(y), targetCents: parseCents(input.target, 'err.target') };
  }

  function makeScenario(input, id) {
    if (!isObj(input)) fail('err.scenario');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (typeof input.name !== 'string' || !input.name.trim()) fail('err.nameRequired');
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return { id, name, rateBp: parseRate(input.rate) };
  }

  // Intérêts d'un mois, arrondis au centime (arrondi symétrique pour les taux négatifs).
  function monthlyInterest(balance, rateBp) {
    const x = balance * rateBp / 120000;
    return x < 0 ? -Math.round(-x) : Math.round(x);
  }

  // Projection d'un scénario : tableau annuel (cumul des versements, cumul des intérêts, solde)
  // et premier mois où l'objectif éventuel est atteint.
  function project(plan, scenario) {
    const every = FREQUENCIES[plan.frequency], months = plan.years * 12;
    let balance = plan.initialCents, contributed = plan.initialCents, interest = 0, yearInterest = 0, targetMonth = null;
    const years = [];
    const reached = (m) => { if (targetMonth === null && plan.targetCents > 0 && balance >= plan.targetCents) targetMonth = m; };
    reached(0);
    for (let m = 1; m <= months; m++) {
      // Le versement tombe au premier mois de la période (début) ou au dernier (fin).
      const pays = plan.contributionCents > 0 && (plan.timing === 'start' ? (m - 1) % every === 0 : m % every === 0);
      if (pays && plan.timing === 'start') { balance += plan.contributionCents; contributed += plan.contributionCents; }
      const i = monthlyInterest(balance, scenario.rateBp);
      balance += i; interest += i; yearInterest += i;
      if (pays && plan.timing === 'end') { balance += plan.contributionCents; contributed += plan.contributionCents; }
      reached(m);
      if (m % 12 === 0) { years.push({ year: m / 12, contributedCents: contributed, interestCents: interest, yearInterestCents: yearInterest, balanceCents: balance }); yearInterest = 0; }
    }
    return { id: scenario.id, name: scenario.name, rateBp: scenario.rateBp, years, finalCents: balance, contributedCents: contributed, interestCents: interest, targetMonth };
  }

  // Tous les scénarios avec le même plan, du plus prudent au plus optimiste.
  function compare(plan, scenarios) {
    if (!Array.isArray(scenarios) || !scenarios.length) fail('err.noScenario');
    return [...scenarios].sort((a, b) => a.rateBp - b.rateBp || (a.name < b.name ? -1 : 1)).map((s) => project(plan, s));
  }

  // --- CSV : une ligne par année ; colonnes : année, versements cumulés, puis solde de chaque scénario.
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  function yearlyCsv(results, labels) {
    if (!Array.isArray(results) || !results.length || !isObj(labels) || typeof labels.year !== 'string' || typeof labels.contributed !== 'string') fail('err.csv');
    const rows = [[labels.year, labels.contributed, ...results.map((r) => labels.scenario ? labels.scenario(r) : r.name)]];
    results[0].years.forEach((y, i) => rows.push([y.year, dec(y.contributedCents), ...results.map((r) => dec(r.years[i].balanceCents))]));
    return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function emptyState() { return { plan: null, scenarios: [] }; }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'plan', 'scenarios']) || !Array.isArray(data.scenarios)) fail('err.backup');
    let plan = null;
    if (data.plan !== null) {
      const p = data.plan;
      if (!keysAre(p, ['initialCents', 'contributionCents', 'frequency', 'timing', 'years', 'targetCents'])) fail('err.backup');
      for (const k of ['initialCents', 'contributionCents', 'targetCents']) if (!Number.isSafeInteger(p[k]) || p[k] < 0 || p[k] > MAX_CENTS) fail('err.backup');
      if (!Number.isInteger(p.years)) fail('err.backup');
      plan = makePlan({ initial: dec(p.initialCents), contribution: dec(p.contributionCents), frequency: p.frequency, timing: p.timing, years: String(p.years), target: dec(p.targetCents) });
    }
    if (data.scenarios.length > MAX_SCENARIOS) fail('err.tooMany', { max: MAX_SCENARIOS });
    const scenarios = data.scenarios.map((s) => {
      if (!keysAre(s, ['id', 'name', 'rateBp']) || !Number.isInteger(s.rateBp)) fail('err.backup');
      return makeScenario({ name: s.name, rate: dec(s.rateBp) }, s.id);
    });
    if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length) fail('err.backup');
    return { plan, scenarios };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, ...state });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.SavingsCore = Object.freeze({
    APP, VERSION, FREQUENCIES, TIMINGS, MAX_SCENARIOS, MAX_YEARS, parseCents, parseRate, makePlan, makeScenario,
    monthlyInterest, project, compare, yearlyCsv, emptyState, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SavingsCore;
})(typeof window === 'undefined' ? globalThis : window);
