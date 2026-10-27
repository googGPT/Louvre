/* SalaryScenario — logique pure : revenu net théorique à partir d'un brut et de retenues saisies par l'utilisateur.
   Aucun barème n'est intégré : chaque taux, chaque montant fixe et chaque base de calcul vient de l'utilisateur.
   Montants en centimes entiers ; taux en points de base (22 % = 2200).

   Calcul sur une année :
   - brut annuel = brut mensuel × nombre de versements par an (ou brut annuel saisi) + primes annuelles ;
   - retenues « sur le brut » = brut annuel × taux ;
   - retenues « sur le net intermédiaire » = (brut annuel − retenues sur le brut) × taux ;
   - retenues fixes = montant mensuel × 12 ;
   - net annuel = brut annuel − toutes les retenues ; net mensuel moyen = net annuel ÷ 12. */
(function (root) {
  'use strict';

  const APP = 'salaryscenario', VERSION = 1;
  const PERIODS = Object.freeze(['month', 'year']);
  const KINDS = Object.freeze(['rate', 'fixed']);
  const BASES = Object.freeze(['gross', 'net']);
  const MAX_SCENARIOS = 8, MAX_LINES = 10, MAX_NAME = 40, MAX_LABEL = 40;
  const MAX_CENTS = 9999999999; // 99 999 999,99
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();
  const norm = (v) => str(v).replace(/[\s  %]/g, '').replace(',', '.');

  function parseCents(value, key, { required = false, params } = {}) {
    const s = norm(value);
    if (s === '') { if (required) fail(key, params); return 0; }
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) fail(key, params);
    const [a, b = ''] = s.split('.');
    const c = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (c > MAX_CENTS) fail('err.amountBig');
    return c;
  }
  // Taux de 0 à 100 %, 2 décimales au plus -> points de base.
  function parseRate(value, n = 1) {
    const s = norm(value);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) fail('err.rate', { n });
    const [a, b = ''] = s.split('.');
    const bp = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (bp > 10000) fail('err.rate', { n });
    return bp;
  }
  function cleanText(v, max, reqKey, longKey, extra) {
    if (typeof v !== 'string' || !v.trim()) fail(reqKey, extra);
    const s = v.trim().replace(/\s+/g, ' ');
    if (s.length > max) fail(longKey, { max, ...extra });
    return s;
  }

  // Ligne de retenue : { label, kind: 'rate' | 'fixed', value (bp ou centimes par mois), base: 'gross' | 'net' }.
  function makeLine(input, index = 0) {
    const n = index + 1; // numéro de ligne affiché dans les messages
    if (!isObj(input)) fail('err.line', { n });
    const label = cleanText(input.label, MAX_LABEL, 'err.lineLabel', 'err.lineLabelLong', { n });
    if (!KINDS.includes(input.kind)) fail('err.kind', { n });
    if (input.kind === 'rate') {
      if (!BASES.includes(input.base)) fail('err.base', { n });
      return { label, kind: 'rate', value: parseRate(input.value, n), base: input.base };
    }
    const value = parseCents(input.value, 'err.fixed', { required: true, params: { n } });
    return { label, kind: 'fixed', value, base: 'gross' };
  }

  function makeScenario(input, id) {
    if (!isObj(input)) fail('err.scenario');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const name = cleanText(input.name, MAX_NAME, 'err.nameRequired', 'err.nameLong');
    if (!PERIODS.includes(input.period)) fail('err.period');
    const grossCents = parseCents(input.gross, 'err.gross', { required: true });
    if (grossCents === 0) fail('err.gross');
    let payments = 12;
    if (input.period === 'month') {
      const p = str(input.payments);
      if (!/^\d{1,2}$/.test(p) || Number(p) < 1 || Number(p) > 24) fail('err.payments');
      payments = Number(p);
    }
    const bonusCents = parseCents(input.bonus, 'err.bonus');
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    if (rawLines.length > MAX_LINES) fail('err.tooManyLines', { max: MAX_LINES });
    const lines = rawLines.map((l, i) => makeLine(l, i));
    const s = { id, name, grossCents, period: input.period, payments, bonusCents, lines };
    compute(s); // refuse un scénario incohérent (retenues supérieures au brut)
    return s;
  }

  const pct = (base, bp) => Math.round(base * bp / 10000);
  // Décomposition annuelle d'un scénario.
  function compute(s) {
    const baseGross = s.period === 'month' ? s.grossCents * s.payments : s.grossCents;
    const annualGross = baseGross + s.bonusCents;
    const onGross = s.lines.map((l) => (l.kind === 'rate' && l.base === 'gross' ? pct(annualGross, l.value) : 0));
    const intermediate = annualGross - onGross.reduce((a, b) => a + b, 0);
    if (intermediate < 0) fail('err.overGross');
    const amounts = s.lines.map((l, i) => (l.kind === 'fixed' ? l.value * 12 : l.base === 'gross' ? onGross[i] : pct(intermediate, l.value)));
    const deductions = amounts.reduce((a, b) => a + b, 0);
    const annualNet = annualGross - deductions;
    if (annualNet < 0) fail('err.negativeNet');
    return {
      id: s.id, name: s.name, baseGrossCents: baseGross, bonusCents: s.bonusCents, annualGross, intermediate,
      lines: s.lines.map((l, i) => ({ ...l, annualCents: amounts[i], monthlyCents: Math.round(amounts[i] / 12) })),
      deductions, annualNet, monthlyNet: Math.round(annualNet / 12), monthlyGross: Math.round(annualGross / 12),
      // Net d'un versement régulier (hors primes) : même proportion de retenues que sur l'année.
      perPaymentNet: s.period === 'month' && annualGross ? Math.round(s.grossCents * annualNet / annualGross) : null,
      effectiveBp: annualGross ? Math.round(deductions * 10000 / annualGross) : 0,
    };
  }

  // Comparaison : du net annuel le plus élevé au plus bas ; écart avec le premier.
  function compare(scenarios, locale = 'fr') {
    const rows = scenarios.map(compute).sort((a, b) => b.annualNet - a.annualNet || a.name.localeCompare(b.name, locale));
    return rows.map((r, i) => ({ ...r, rank: i + 1, gapToBest: rows[0].annualNet - r.annualNet }));
  }

  // --- CSV : format long (scénario, poste, montant annuel, montant mensuel moyen).
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  function breakdownCsv(rows, labels) {
    const need = ['scenario', 'item', 'annual', 'monthly', 'gross', 'deductions', 'net'];
    if (!Array.isArray(rows) || !rows.length || !isObj(labels) || need.some((k) => typeof labels[k] !== 'string')) fail('err.csv');
    const out = [[labels.scenario, labels.item, labels.annual, labels.monthly]];
    const push = (r, item, cents) => out.push([r.name, item, dec(cents), dec(Math.round(cents / 12))]);
    for (const r of rows) {
      push(r, labels.gross, r.annualGross);
      for (const l of r.lines) push(r, l.label, -l.annualCents);
      push(r, labels.deductions, -r.deductions);
      push(r, labels.net, r.annualNet);
    }
    return '﻿' + out.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : { app, version, scenarios }
  const toInput = (s) => ({
    name: s.name, gross: dec(s.grossCents), period: s.period, payments: String(s.payments), bonus: dec(s.bonusCents),
    lines: s.lines.map((l) => ({ label: l.label, kind: l.kind, value: dec(l.value), base: l.base })),
  });
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'scenarios']) || !Array.isArray(data.scenarios)) fail('err.backup');
    if (data.scenarios.length > MAX_SCENARIOS) fail('err.tooMany', { max: MAX_SCENARIOS });
    const scenarios = data.scenarios.map((s) => {
      if (!keysAre(s, ['id', 'name', 'grossCents', 'period', 'payments', 'bonusCents', 'lines']) || !Array.isArray(s.lines)) fail('err.backup');
      for (const k of ['grossCents', 'payments', 'bonusCents']) if (!Number.isSafeInteger(s[k]) || s[k] < 0) fail('err.backup');
      if (s.period === 'year' && s.payments !== 12) fail('err.backup');
      for (const l of s.lines) if (!keysAre(l, ['label', 'kind', 'value', 'base']) || !Number.isSafeInteger(l.value) || l.value < 0 || (l.kind === 'fixed' && l.base !== 'gross')) fail('err.backup');
      return makeScenario(toInput(s), s.id);
    });
    if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length) fail('err.backup');
    return { scenarios };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, scenarios: state.scenarios });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.SalaryCore = Object.freeze({
    APP, VERSION, PERIODS, KINDS, BASES, MAX_SCENARIOS, MAX_LINES, parseCents, parseRate, makeLine, makeScenario, compute, compare,
    breakdownCsv, toInput, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SalaryCore;
})(typeof window === 'undefined' ? globalThis : window);
