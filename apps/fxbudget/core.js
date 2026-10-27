/* FXBudget — logique pure : budget de voyage multidevise.
   Taux de change saisis par l'utilisateur (datés, aucune récupération en ligne) ; chaque dépense, saisie dans sa devise
   (en unités mineures de cette devise), est convertie dans la devise de référence par un calcul rationnel exact (BigInt),
   puis arrondie au centime le plus proche, la moitié vers le haut (arrondi explicite, une fois par dépense).
   Montants de référence en centimes entiers ; dates en jours civils « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const VERSION = 1;
  const CATEGORIES = Object.freeze(['lodging', 'transport', 'food', 'activities', 'shopping', 'other']);
  const DIRS = Object.freeze(['toRef', 'fromRef']); // toRef : 1 devise = x réf. ; fromRef : 1 réf. = x devise
  const MAX_RATES = 200, MAX_EXPENSES = 3000, MAX_NAME = 60, MAX_LABEL = 60, MAX_DAYS = 366, MAX_CENTS = 99999999999, MAX_RATE_DECIMALS = 8;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const pow10 = (n) => 10n ** BigInt(n);

  // --- Jours civils
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function toUTC(day) { if (!isDay(day)) fail('err.date'); const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function addDays(day, n) { return new Date(toUTC(day) + n * 86400000).toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); }

  // --- Devises : code ISO 4217 reconnu par Intl ; nombre de décimales de la devise (JPY 0, TND 3…).
  function checkCurrency(code) {
    if (typeof code !== 'string') fail('err.currency');
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) fail('err.currency');
    if (typeof Intl.supportedValuesOf === 'function' && !Intl.supportedValuesOf('currency').includes(c)) fail('err.currency');
    return c;
  }
  function decimals(code) {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; } catch (e) { return 2; }
  }

  // Montant décimal saisi -> unités mineures entières de la devise (« 12,5 » USD -> 1250 ; « 1500 » JPY -> 1500).
  function parseMinor(value, code, key = 'err.amount') {
    const d = decimals(code);
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/[\s  ]/g, '').replace(',', '.');
    const re = d === 0 ? /^\d{1,11}$/ : new RegExp(`^\\d{1,11}(\\.\\d{1,${d}})?$`);
    if (!re.test(s)) fail(key, { d });
    const [a, b = ''] = s.split('.');
    const n = Number(a) * 10 ** d + Number((b + '000').slice(0, d) || 0);
    if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_CENTS) fail(key, { d });
    return n;
  }
  // Taux saisi : décimal positif, 8 décimales au plus ; conservé tel quel (chaîne normalisée) pour un calcul exact.
  function parseRate(value) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(',', '.');
    if (!new RegExp(`^\\d{1,9}(\\.\\d{1,${MAX_RATE_DECIMALS}})?$`).test(s)) fail('err.rate', { max: MAX_RATE_DECIMALS });
    const [a, b = ''] = s.split('.');
    const frac = b.replace(/0+$/, ''), int = a.replace(/^0+(?=\d)/, '');
    if (/^0*$/.test(a + b)) fail('err.rate', { max: MAX_RATE_DECIMALS });
    return frac ? `${int}.${frac}` : int;
  }
  function rateParts(str) { const [a, b = ''] = str.split('.'); return { m: BigInt(a + b), s: b.length }; } // taux = m / 10^s

  // Division entière arrondie au plus proche, moitié vers le haut (quantités positives).
  function divRound(num, den) { const q = num / den, r = num % den; return 2n * r >= den ? q + 1n : q; }
  // Conversion exacte d'un montant (unités mineures de `cur`) en centimes de la devise de référence.
  function convert(minor, cur, refCur, rate) {
    if (cur === refCur) return { cents: minor, exact: true };
    if (!rate) fail('err.noRate', { cur });
    const { m, s } = rateParts(rate.value), d = decimals(cur);
    let num, den;
    if (rate.dir === 'toRef') { num = BigInt(minor) * m * 100n; den = pow10(d + s); }       // montant × taux
    else { num = BigInt(minor) * 100n * pow10(s); den = pow10(d) * m; }                      // montant ÷ taux
    const cents = divRound(num, den);
    if (cents > BigInt(MAX_CENTS)) fail('err.amount', { d: 2 });
    return { cents: Number(cents), exact: num % den === 0n };
  }

  // Taux applicable à une dépense : le plus récent daté au plus tard le jour de la dépense ; à défaut, le plus ancien (signalé).
  function rateFor(rates, cur, day) {
    const list = rates.filter((r) => r.currency === cur).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!list.length) return null;
    const before = list.filter((r) => r.date <= day);
    return before.length ? { rate: before[before.length - 1], later: false } : { rate: list[0], later: true };
  }

  // --- Voyage, taux, dépenses
  function text(v, max, required, keyRequired, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    return s;
  }
  function optCents(v, key) { // budget facultatif en devise de référence (2 décimales)
    if (v === null || v === undefined || String(v).trim() === '') return null;
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || v < 0 || v > MAX_CENTS) fail(key); return v; }
    try { return parseMinor(v, 'EUR', key); } catch (e) { fail(key); }
    return null;
  }
  function makeTrip(input, allowed) {
    if (!isPlain(input)) fail('err.backup');
    const name = text(input.name, MAX_NAME, true, 'err.tripName', 'err.nameLong');
    const ref = checkCurrency(input.ref);
    if (allowed && !allowed.includes(ref)) fail('err.currency');
    if (!isDay(input.start)) fail('err.start');
    if (!isDay(input.end)) fail('err.end');
    const days = dayDiff(input.end, input.start) + 1;
    if (days < 1) fail('err.endBefore');
    if (days > MAX_DAYS) fail('err.tooLong', { max: MAX_DAYS });
    const budgetCents = optCents(input.budget !== undefined ? input.budget : input.budgetCents, 'err.budget');
    if (budgetCents === null) fail('err.budget');
    const src = isPlain(input.catBudgets) ? input.catBudgets : {};
    const catBudgets = {};
    for (const c of CATEGORIES) catBudgets[c] = optCents(src[c], 'err.catBudget');
    return { name, ref, start: input.start, end: input.end, budgetCents, catBudgets };
  }
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function makeRate(input, id, trip) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    const currency = checkCurrency(input.currency);
    if (currency === trip.ref) fail('err.rateSelf');
    if (!DIRS.includes(input.dir)) fail('err.backup');
    const value = parseRate(input.value);
    if (!isDay(input.date)) fail('err.rateDate');
    return { id, currency, dir: input.dir, value, date: input.date };
  }
  function makeExpense(input, id, trip, rates) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!isDay(input.date)) fail('err.date');
    if (!CATEGORIES.includes(input.category)) fail('err.category');
    const currency = checkCurrency(input.currency);
    if (currency !== trip.ref && !rates.some((r) => r.currency === currency)) fail('err.noRate', { cur: currency });
    const minor = typeof input.minor === 'number' ? input.minor : parseMinor(input.amount, currency);
    if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_CENTS) fail('err.amount', { d: decimals(currency) });
    return { id, date: input.date, category: input.category, label: text(input.label, MAX_LABEL, false, '', 'err.labelLong'), currency, minor };
  }
  // Dépense convertie : centimes de référence, taux utilisé (et sa date), taux postérieur à la dépense ?
  function converted(e, trip, rates) {
    if (e.currency === trip.ref) return { ...e, cents: e.minor, rate: null, later: false, exact: true };
    const found = rateFor(rates, e.currency, e.date);
    if (!found) fail('err.noRate', { cur: e.currency });
    const { cents, exact } = convert(e.minor, e.currency, trip.ref, found.rate);
    return { ...e, cents, rate: found.rate, later: found.later, exact };
  }

  // --- Synthèse : total, reste, reste par catégorie, dépenses par jour, reste disponible par jour.
  function summary(data, today) {
    const { trip, rates, expenses } = data;
    const list = expenses.map((e) => converted(e, trip, rates));
    const spent = list.reduce((a, e) => a + e.cents, 0);
    const byCat = {};
    for (const c of CATEGORIES) {
      const s = list.filter((e) => e.category === c).reduce((a, e) => a + e.cents, 0), b = trip.catBudgets[c];
      byCat[c] = { spent: s, budget: b, left: b === null ? null : b - s };
    }
    const allocated = CATEGORIES.reduce((a, c) => a + (trip.catBudgets[c] || 0), 0);
    const byDay = {};
    for (const e of list) byDay[e.date] = (byDay[e.date] || 0) + e.cents;
    const tripDays = dayDiff(trip.end, trip.start) + 1;
    // Jours restants (aujourd'hui compris) ; avant le départ, tout le voyage ; après le retour, aucun.
    const daysLeft = dayDiff(today, trip.start) < 0 ? tripDays : dayDiff(trip.end, today) < 0 ? 0 : dayDiff(trip.end, today) + 1;
    const left = trip.budgetCents - spent;
    // Reste par jour arrondi au centime inférieur : la somme des jours ne dépasse jamais le reste.
    const perDayLeft = daysLeft > 0 && left > 0 ? Math.floor(left / daysLeft) : daysLeft > 0 ? 0 : null;
    const perDayPlanned = Math.floor(trip.budgetCents / tripDays);
    const days = [];
    for (let i = 0; i < tripDays; i += 1) { const d = addDays(trip.start, i); days.push({ day: d, spent: byDay[d] || 0, over: (byDay[d] || 0) > perDayPlanned }); }
    const outside = Object.keys(byDay).filter((d) => d < trip.start || d > trip.end).sort().map((d) => ({ day: d, spent: byDay[d] }));
    return { list, spent, left, byCat, allocated, overAllocated: allocated > trip.budgetCents, tripDays, daysLeft, perDayLeft, perDayPlanned, days, outside };
  }

  // --- CSV (en-têtes et libellés fournis par l'interface, traduits ; séparateur « ; », BOM UTF-8)
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function minorText(minor, d, decimal) {
    if (!d) return String(minor);
    const p = 10 ** d;
    return `${Math.floor(minor / p)}${decimal === 'comma' ? ',' : '.'}${String(minor % p).padStart(d, '0')}`;
  }
  function toCSV(data, opts) {
    const { headers, catLabel, decimal, dirText } = opts;
    if (!Array.isArray(headers) || headers.length !== 9) fail('err.headers');
    const rows = data.expenses.map((e) => converted(e, data.trip, data.rates)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const lines = [headers.map(csvCell).join(';')];
    for (const e of rows) {
      const rateTxt = e.rate ? dirText(e.rate, data.trip.ref) : '';
      lines.push([e.date, csvCell(catLabel(e.category)), csvCell(e.label), minorText(e.minor, decimals(e.currency), decimal), e.currency,
        csvCell(rateTxt), e.rate ? e.rate.date : '', minorText(e.cents, 2, decimal), data.trip.ref].join(';'));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // --- Modifications
  function setTrip(data, trip) {
    if (data.trip && trip.ref !== data.trip.ref && (data.rates.length || data.expenses.length)) fail('err.refLocked');
    return { ...data, trip };
  }
  function addRate(data, rate) {
    if (data.rates.length >= MAX_RATES) fail('err.tooManyRates', { max: MAX_RATES });
    if (data.rates.some((r) => r.currency === rate.currency && r.date === rate.date)) fail('err.rateExists');
    return { ...data, rates: [...data.rates, rate] };
  }
  function removeRate(data, id) {
    const rate = data.rates.find((r) => r.id === id);
    if (!rate) return data;
    const others = data.rates.filter((r) => r.id !== id && r.currency === rate.currency);
    if (!others.length && data.expenses.some((e) => e.currency === rate.currency)) fail('err.rateUsed', { cur: rate.currency });
    return { ...data, rates: data.rates.filter((r) => r.id !== id) };
  }
  function addExpense(data, e) {
    if (data.expenses.length >= MAX_EXPENSES) fail('err.tooManyExpenses', { max: MAX_EXPENSES });
    return { ...data, expenses: [...data.expenses, e] };
  }
  function removeExpense(data, id) { return { ...data, expenses: data.expenses.filter((e) => e.id !== id) }; }

  // --- Sauvegarde
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'fxbudget' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'trip', 'rates', 'expenses']) || !Array.isArray(data.rates) || !Array.isArray(data.expenses)) fail('err.backup');
    if (data.trip === null) { if (data.rates.length || data.expenses.length) fail('err.backup'); return { trip: null, rates: [], expenses: [] }; }
    const t = data.trip;
    if (!isPlain(t) || !sameKeys(t, ['name', 'ref', 'start', 'end', 'budgetCents', 'catBudgets']) || !isPlain(t.catBudgets) || !sameKeys(t.catBudgets, CATEGORIES)) fail('err.backup');
    if (typeof t.ref !== 'string' || t.ref !== t.ref.toUpperCase() || !Number.isSafeInteger(t.budgetCents)) fail('err.backup');
    const trip = makeTrip({ ...t, budget: t.budgetCents }, null);
    if (data.rates.length > MAX_RATES) fail('err.tooManyRates', { max: MAX_RATES });
    if (data.expenses.length > MAX_EXPENSES) fail('err.tooManyExpenses', { max: MAX_EXPENSES });
    let clean = { trip, rates: [], expenses: [] };
    for (const r of data.rates) {
      if (!isPlain(r) || !sameKeys(r, ['id', 'currency', 'dir', 'value', 'date']) || typeof r.value !== 'string') fail('err.backup');
      const rate = makeRate(r, r.id, trip);
      if (rate.value !== r.value || rate.currency !== r.currency) fail('err.backup'); // forme normalisée exigée
      clean = addRate(clean, rate);
    }
    for (const e of data.expenses) {
      if (!isPlain(e) || !sameKeys(e, ['id', 'date', 'category', 'label', 'currency', 'minor']) || !Number.isSafeInteger(e.minor) || e.currency !== String(e.currency).toUpperCase()) fail('err.backup');
      clean = addExpense(clean, makeExpense(e, e.id, trip, clean.rates));
    }
    const ids = [...clean.rates, ...clean.expenses].map((x) => x.id);
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return clean;
  }
  function backup(data) {
    const clean = validateData({ app: 'fxbudget', version: VERSION, trip: data.trip, rates: data.rates, expenses: data.expenses });
    return JSON.stringify({ app: 'fxbudget', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, CATEGORIES, DIRS, MAX_RATES, MAX_EXPENSES, MAX_DAYS,
    isDay, addDays, dayDiff, checkCurrency, decimals, parseMinor, parseRate, convert, rateFor, divRound,
    makeTrip, makeRate, makeExpense, converted, summary, minorText, toCSV, setTrip, addRate, removeRate, addExpense, removeExpense, validateData, backup,
  };
  root.FXCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FXCore;
})(typeof window === 'undefined' ? globalThis : window);
