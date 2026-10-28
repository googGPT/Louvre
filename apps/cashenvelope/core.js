/* CashEnvelope — logique pure : budget mensuel réparti en enveloppes, dépenses, report d'un mois
   sur l'autre et alertes. Montants en centimes entiers, mois « AAAA-MM », jours « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const APP = 'cashenvelope', VERSION = 1;
  const MAX_ENVELOPES = 30, MAX_EXPENSES = 5000, MAX_NAME = 40, MAX_NOTE = 80;
  const MAX_CENTS = 99999999; // 999 999,99 dans la devise choisie
  const ID = /^[a-z0-9-]{6,64}$/i;

  // Erreurs = clés de traduction (paramètres JSON après « | »), traduites par l'interface.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');

  // « 1 250,50 » ou « 1250.5 » -> 125050 centimes ; refuse plus de 2 décimales et les signes.
  function parseCents(value, opts = {}) {
    const key = opts.key || 'err.amount';
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents > MAX_CENTS) fail('err.amountBig');
    if (!opts.zero && cents <= 0) fail('err.amountPositive');
    return cents;
  }

  // --- Jours et mois civils (aucun fuseau horaire en jeu)
  function validMonth(m) {
    if (typeof m !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return false;
    const y = Number(m.slice(0, 4)); return y >= 2000 && y <= 2100;
  }
  function validDay(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !validMonth(d.slice(0, 7))) return false;
    const [y, mo, da] = d.split('-').map(Number);
    const x = new Date(Date.UTC(y, mo - 1, da));
    return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === da;
  }
  const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  const fromIndex = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  function addMonths(m, n) { if (!validMonth(m)) fail('err.month'); return fromIndex(monthIndex(m) + n); }
  function monthOf(day) { if (!validDay(day)) fail('err.day'); return day.slice(0, 7); }
  function daysInMonth(m) { const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }

  function cleanText(v, max, required, keys) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(keys.req);
    const s = v.trim().replace(/\s+/g, ' ');
    if (required && !s) fail(keys.req);
    if (s.length > max) fail(keys.long, { max });
    return s;
  }
  const cleanName = (v) => cleanText(v, MAX_NAME, true, { req: 'err.nameRequired', long: 'err.nameLong' });
  const cleanNote = (v) => cleanText(v, MAX_NOTE, false, { req: 'err.note', long: 'err.noteLong' });
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }

  // --- Réglages : revenu mensuel à répartir (0 = non saisi) et seuil d'alerte en %.
  function makeSettings(input) {
    if (!isObj(input)) fail('err.settings');
    const incomeCents = input.income === '' || input.income === undefined ? 0 : parseCents(input.income, { zero: true, key: 'err.income' });
    const pct = String(input.alertPct === undefined ? '' : input.alertPct).trim();
    if (!/^\d{1,3}$/.test(pct) || Number(pct) < 1 || Number(pct) > 100) fail('err.alertPct');
    return { incomeCents, alertPct: Number(pct) };
  }

  // Enveloppe : budget mensuel, report éventuel, mois de départ.
  function makeEnvelope(input, id) {
    if (!isObj(input)) fail('err.envelope');
    if (!validMonth(input.fromMonth)) fail('err.month');
    return { id: checkId(id), name: cleanName(input.name), budgetCents: parseCents(input.budget, { zero: true, key: 'err.budget' }), rollover: input.rollover === true, fromMonth: input.fromMonth };
  }

  // Dépense rattachée à une enveloppe existante, datée dans un mois couvert par l'enveloppe.
  function makeExpense(input, id, envelopes) {
    if (!isObj(input)) fail('err.expense');
    const env = (envelopes || []).find((e) => e.id === input.envelopeId);
    if (!env) fail('err.envelopeUnknown');
    if (!validDay(input.day)) fail('err.day');
    if (monthIndex(input.day.slice(0, 7)) < monthIndex(env.fromMonth)) fail('err.beforeEnvelope', { name: env.name });
    return { id: checkId(id), envelopeId: env.id, day: input.day, amountCents: parseCents(input.amount), note: cleanNote(input.note) };
  }

  function emptyState() { return { settings: { incomeCents: 0, alertPct: 80 }, envelopes: [], expenses: [] }; }

  // Dépenses cumulées par enveloppe et par mois : Map(idEnveloppe -> Map(indexMois -> centimes)).
  function spentIndex(expenses) {
    const idx = new Map();
    for (const x of expenses) {
      if (!idx.has(x.envelopeId)) idx.set(x.envelopeId, new Map());
      const m = idx.get(x.envelopeId), k = monthIndex(x.day.slice(0, 7));
      m.set(k, (m.get(k) || 0) + x.amountCents);
    }
    return idx;
  }

  // Situation d'un mois. Pour une enveloppe « avec report », le solde du mois précédent (positif
  // ou négatif) s'ajoute au budget ; sans report, chaque mois repart du budget.
  function monthSummary(state, month) {
    if (!validMonth(month)) fail('err.month');
    const target = monthIndex(month), alertPct = state.settings.alertPct;
    const spent = spentIndex(state.expenses);
    const rows = [];
    for (const env of state.envelopes) {
      const start = monthIndex(env.fromMonth);
      if (target < start) continue; // l'enveloppe n'existe pas encore ce mois-là
      const per = spent.get(env.id) || new Map();
      let carry = 0;
      if (env.rollover) {
        // Le solde reporté est le cumul des budgets moins toutes les dépenses passées.
        // Pas de fenêtre glissante de 600 mois : elle perdait des montants historiques.
        carry = (target - start) * env.budgetCents;
        for (const [i, cents] of per) if (i >= start && i < target) carry -= cents;
      }
      const available = env.budgetCents + carry, used = per.get(target) || 0, balance = available - used;
      let status = 'ok';
      if (balance < 0) status = 'over';
      else if (used > 0 && (available <= 0 || used * 100 >= alertPct * available)) status = 'warn';
      rows.push({
        id: env.id, name: env.name, rollover: env.rollover, budgetCents: env.budgetCents, carryCents: carry,
        availableCents: available, spentCents: used, balanceCents: balance, status,
        usedPct: available > 0 ? Math.round(1000 * used / available) / 10 : (used > 0 ? 100 : 0),
      });
    }
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const allocated = sum('budgetCents'), income = state.settings.incomeCents;
    return {
      month, rows, incomeCents: income, allocatedCents: allocated,
      unallocatedCents: income - allocated, overAllocated: income > 0 && allocated > income,
      availableCents: sum('availableCents'), spentCents: sum('spentCents'), balanceCents: sum('balanceCents'),
      alerts: rows.filter((r) => r.status !== 'ok').map((r) => ({ id: r.id, name: r.name, status: r.status, balanceCents: r.balanceCents, usedPct: r.usedPct })),
    };
  }

  // Dépenses d'un mois, de la plus récente à la plus ancienne.
  function monthExpenses(state, month) {
    if (!validMonth(month)) fail('err.month');
    return state.expenses.filter((x) => x.day.slice(0, 7) === month).sort((a, b) => (b.day < a.day ? -1 : b.day > a.day ? 1 : 0));
  }

  // --- CSV (séparateur « ; », montants décimaux avec point, en-têtes fournis traduits par l'interface)
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s; // neutralise les formules de tableur
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  const toCsv = (rows) => '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  function summaryCsv(summary, head, statusLabel = (s) => s) {
    if (!Array.isArray(head) || head.length !== 6) fail('err.csv');
    return toCsv([head, ...summary.rows.map((r) => [r.name, dec(r.budgetCents), dec(r.carryCents), dec(r.spentCents), dec(r.balanceCents), statusLabel(r.status)])]);
  }
  function expensesCsv(state, month, head) {
    if (!Array.isArray(head) || head.length !== 4) fail('err.csv');
    const names = new Map(state.envelopes.map((e) => [e.id, e.name]));
    return toCsv([head, ...monthExpenses(state, month).map((x) => [x.day, names.get(x.envelopeId) || '', x.note, dec(x.amountCents)])]);
  }

  // --- Sauvegarde : validée champ par champ avant toute écriture.
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'settings', 'envelopes', 'expenses'])) fail('err.backup');
    const st = data.settings;
    if (!keysAre(st, ['incomeCents', 'alertPct']) || !Number.isSafeInteger(st.incomeCents) || st.incomeCents < 0 || st.incomeCents > MAX_CENTS) fail('err.backup');
    if (!Number.isInteger(st.alertPct)) fail('err.backup');
    const settings = makeSettings({ income: (st.incomeCents / 100).toFixed(2), alertPct: String(st.alertPct) });
    if (!Array.isArray(data.envelopes) || !Array.isArray(data.expenses)) fail('err.backup');
    if (data.envelopes.length > MAX_ENVELOPES) fail('err.tooManyEnvelopes', { max: MAX_ENVELOPES });
    if (data.expenses.length > MAX_EXPENSES) fail('err.tooManyExpenses', { max: MAX_EXPENSES });
    const envelopes = data.envelopes.map((e) => {
      if (!keysAre(e, ['id', 'name', 'budgetCents', 'rollover', 'fromMonth'])) fail('err.backup');
      if (!Number.isSafeInteger(e.budgetCents) || e.budgetCents < 0 || e.budgetCents > MAX_CENTS || typeof e.rollover !== 'boolean') fail('err.backup');
      return makeEnvelope({ name: e.name, budget: (e.budgetCents / 100).toFixed(2), rollover: e.rollover, fromMonth: e.fromMonth }, e.id);
    });
    if (new Set(envelopes.map((e) => e.id)).size !== envelopes.length) fail('err.backup');
    const expenses = data.expenses.map((x) => {
      if (!keysAre(x, ['id', 'envelopeId', 'day', 'amountCents', 'note'])) fail('err.backup');
      if (!Number.isSafeInteger(x.amountCents) || x.amountCents <= 0 || x.amountCents > MAX_CENTS) fail('err.backup');
      return makeExpense({ envelopeId: x.envelopeId, day: x.day, amount: (x.amountCents / 100).toFixed(2), note: x.note }, x.id, envelopes);
    });
    if (new Set(expenses.map((x) => x.id)).size !== expenses.length) fail('err.backup');
    return { settings, envelopes, expenses };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, ...state });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.EnvelopeCore = Object.freeze({
    APP, VERSION, MAX_ENVELOPES, MAX_EXPENSES, MAX_NAME, MAX_NOTE, MAX_CENTS,
    parseCents, validMonth, validDay, addMonths, monthOf, daysInMonth, makeSettings, makeEnvelope, makeExpense,
    emptyState, monthSummary, monthExpenses, summaryCsv, expensesCsv, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EnvelopeCore;
})(typeof window === 'undefined' ? globalThis : window);
