/* DebtStrategy — logique pure : remboursement de plusieurs dettes avec un budget mensuel fixe,
   selon deux ordres (avalanche : taux le plus élevé d'abord ; boule de neige : plus petit solde d'abord).
   Montants en centimes entiers, taux en points de base (19,99 % = 1999), mois « AAAA-MM ».
   Hypothèses du calcul : taux constants, intérêts mensuels = solde × taux annuel / 12, arrondis au centime,
   paiements en fin de mois, aucun frais ni pénalité. */
(function (root) {
  'use strict';

  const APP = 'debtstrategy', VERSION = 1;
  const MAX_DEBTS = 20, MAX_NAME = 40, MAX_MONTHS = 600; // 50 ans au plus
  const MAX_CENTS = 999999999; // 9 999 999,99
  const STRATEGIES = Object.freeze(['avalanche', 'snowball']);
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');

  // « 1 250,50 » -> 125050 centimes ; refuse signes et plus de 2 décimales.
  function parseCents(value, key = 'err.amount', zero = false) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents > MAX_CENTS) fail('err.amountBig');
    if (!zero && cents <= 0) fail(key);
    return cents;
  }
  // Taux annuel en % (0 à 100, 2 décimales au plus) -> points de base.
  function parseRate(value) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s|%/g, '').replace(',', '.');
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) fail('err.rate');
    const [a, b = ''] = s.split('.');
    const bp = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (bp > 10000) fail('err.rate');
    return bp;
  }
  function validMonth(m) {
    if (typeof m !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return false;
    const y = Number(m.slice(0, 4)); return y >= 2000 && y <= 2100;
  }
  const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  const fromIndex = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  function addMonths(m, n) { if (!validMonth(m)) fail('err.month'); return fromIndex(monthIndex(m) + n); }

  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    const s = v.trim().replace(/\s+/g, ' ');
    if (s.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return s;
  }

  // Dette saisie : solde restant dû, taux annuel, paiement minimum mensuel.
  function makeDebt(input, id) {
    if (!isObj(input)) fail('err.debt');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    return { id, name: cleanName(input.name), balanceCents: parseCents(input.balance, 'err.balance'), rateBp: parseRate(input.rate), minCents: parseCents(input.min, 'err.min') };
  }
  // Plan : budget mensuel total consacré aux dettes (0 = pas encore saisi) et premier mois de paiement.
  function makePlan(input) {
    if (!isObj(input)) fail('err.plan');
    if (!validMonth(input.startMonth)) fail('err.month');
    return { budgetCents: input.budget === '' || input.budget === undefined ? 0 : parseCents(input.budget, 'err.budget', true), startMonth: input.startMonth };
  }

  // Intérêts d'un mois, arrondis au centime : solde × taux / 12 (taux en points de base).
  const monthlyInterest = (balance, rateBp) => Math.round(balance * rateBp / 120000);

  // Ordre de priorité, fixé au départ (comme on dresse la liste sur papier).
  function order(debts, strategy) {
    if (!STRATEGIES.includes(strategy)) fail('err.strategy');
    const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : 1);
    return [...debts].sort(strategy === 'avalanche'
      ? (a, b) => (b.rateBp - a.rateBp) || (a.balanceCents - b.balanceCents) || byName(a, b)
      : (a, b) => (a.balanceCents - b.balanceCents) || (b.rateBp - a.rateBp) || byName(a, b));
  }

  // Simulation mois par mois. Chaque mois : intérêts ajoutés, minimums payés, puis tout le reste
  // du budget va à la première dette de la liste encore due (et ainsi de suite).
  function simulate(debts, budgetCents, strategy, startMonth) {
    if (!Array.isArray(debts) || !debts.length) fail('err.noDebts');
    if (!Number.isSafeInteger(budgetCents) || budgetCents <= 0) fail('err.budget');
    if (!validMonth(startMonth)) fail('err.month');
    const list = order(debts, strategy);
    const minTotal = list.reduce((s, d) => s + d.minCents, 0);
    if (budgetCents < minTotal) return { ok: false, strategy, reason: 'minimums', needCents: minTotal };
    const firstInterest = list.reduce((s, d) => s + monthlyInterest(d.balanceCents, d.rateBp), 0);
    if (budgetCents <= firstInterest) return { ok: false, strategy, reason: 'interest', needCents: firstInterest + 1 };
    const bal = new Map(list.map((d) => [d.id, d.balanceCents]));
    const payoffs = [], schedule = [];
    let totalInterest = 0, totalPaid = 0;
    for (let n = 1; n <= MAX_MONTHS; n++) {
      const month = addMonths(startMonth, n - 1), rows = new Map();
      const active = list.filter((d) => bal.get(d.id) > 0);
      for (const d of active) {
        const i = monthlyInterest(bal.get(d.id), d.rateBp);
        bal.set(d.id, bal.get(d.id) + i);
        rows.set(d.id, { id: d.id, interestCents: i, paymentCents: 0, balanceCents: 0 });
      }
      let left = budgetCents;
      const pay = (d, amount) => { bal.set(d.id, bal.get(d.id) - amount); rows.get(d.id).paymentCents += amount; left -= amount; };
      for (const d of active) pay(d, Math.min(d.minCents, bal.get(d.id))); // minimums
      for (const d of active) if (left > 0 && bal.get(d.id) > 0) pay(d, Math.min(left, bal.get(d.id))); // surplus, dans l'ordre
      const paidOff = [];
      for (const d of active) {
        const r = rows.get(d.id); r.balanceCents = bal.get(d.id);
        if (r.balanceCents === 0) { paidOff.push(d.id); payoffs.push({ id: d.id, name: d.name, n, month }); }
      }
      const rs = [...rows.values()];
      const interest = rs.reduce((s, r) => s + r.interestCents, 0), paid = rs.reduce((s, r) => s + r.paymentCents, 0);
      totalInterest += interest; totalPaid += paid;
      const remaining = [...bal.values()].reduce((s, v) => s + v, 0);
      schedule.push({ n, month, rows: rs, interestCents: interest, paymentCents: paid, balanceCents: remaining, paidOff });
      if (remaining === 0) {
        return { ok: true, strategy, months: n, endMonth: month, totalInterestCents: totalInterest, totalPaidCents: totalPaid, order: list.map((d) => d.id), payoffs, schedule };
      }
    }
    return { ok: false, strategy, reason: 'tooLong', needCents: 0 };
  }

  // Les deux stratégies avec le même budget ; « gain » = ce que l'avalanche économise par rapport à la boule de neige.
  function compare(debts, budgetCents, startMonth) {
    const avalanche = simulate(debts, budgetCents, 'avalanche', startMonth);
    const snowball = simulate(debts, budgetCents, 'snowball', startMonth);
    const both = avalanche.ok && snowball.ok;
    return {
      avalanche, snowball,
      interestGapCents: both ? snowball.totalInterestCents - avalanche.totalInterestCents : null,
      monthsGap: both ? snowball.months - avalanche.months : null,
    };
  }

  // --- CSV : une ligne par dette et par mois (en-têtes traduits fournis par l'interface)
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  function scheduleCsv(result, debts, head) {
    if (!result || !result.ok) fail('err.csv');
    if (!Array.isArray(head) || head.length !== 5) fail('err.csv');
    const names = new Map(debts.map((d) => [d.id, d.name]));
    const rows = [head];
    for (const m of result.schedule) for (const r of m.rows) rows.push([m.month, names.get(r.id) || '', dec(r.interestCents), dec(r.paymentCents), dec(r.balanceCents)]);
    return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function emptyState(startMonth) { return { budgetCents: 0, startMonth, strategy: 'avalanche', debts: [] }; }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'budgetCents', 'startMonth', 'strategy', 'debts'])) fail('err.backup');
    if (!Number.isSafeInteger(data.budgetCents) || data.budgetCents < 0 || data.budgetCents > MAX_CENTS) fail('err.backup');
    if (!STRATEGIES.includes(data.strategy) || !Array.isArray(data.debts)) fail('err.backup');
    if (data.debts.length > MAX_DEBTS) fail('err.tooMany', { max: MAX_DEBTS });
    const plan = makePlan({ budget: (data.budgetCents / 100).toFixed(2), startMonth: data.startMonth });
    const debts = data.debts.map((d) => {
      if (!keysAre(d, ['id', 'name', 'balanceCents', 'rateBp', 'minCents'])) fail('err.backup');
      for (const k of ['balanceCents', 'rateBp', 'minCents']) if (!Number.isSafeInteger(d[k]) || d[k] < 0) fail('err.backup');
      if (d.balanceCents > MAX_CENTS || d.minCents > MAX_CENTS) fail('err.backup');
      return makeDebt({ name: d.name, balance: dec(d.balanceCents), rate: dec(d.rateBp), min: dec(d.minCents) }, d.id);
    });
    if (new Set(debts.map((d) => d.id)).size !== debts.length) fail('err.backup');
    return { budgetCents: plan.budgetCents, startMonth: plan.startMonth, strategy: data.strategy, debts };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, ...state });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.DebtCore = Object.freeze({
    APP, VERSION, MAX_DEBTS, MAX_MONTHS, STRATEGIES, parseCents, parseRate, validMonth, addMonths,
    makeDebt, makePlan, monthlyInterest, order, simulate, compare, scheduleCsv, emptyState, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DebtCore;
})(typeof window === 'undefined' ? globalThis : window);
