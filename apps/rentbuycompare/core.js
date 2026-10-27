/* RentBuyCompare — logique pure : coûts nets cumulés de la location et de l'achat, à hypothèses égales.
   Toutes les hypothèses (prix, apport, taux, évolutions…) sont saisies par l'utilisateur : ce sont des
   calculs sur hypothèses, pas une prévision ni un conseil financier.
   Montants en centimes entiers ; taux en points de base (3,5 % = 350).

   Méthode (les deux ménages partent du même apport A) :
   - coût net de l'achat  = A + mensualités payées + charges et entretien − (valeur du bien − capital restant dû) ;
   - coût net de la location = loyers payés − gains de l'apport placé (valeur du placement − A).
   Les frais d'achat sont payés avec l'apport ; le prêt finance le reste (prix + frais − apport). */
(function (root) {
  'use strict';

  const APP = 'rentbuycompare', VERSION = 1;
  const MAX_CENTS = 9999999999; // 99 999 999,99
  const MAX_YEARS = 40;
  const MIN_RATE = -2000, MAX_RATE = 3000; // évolutions annuelles : de −20 % à +30 %
  const MAX_LOAN_RATE = 2000; // taux du prêt : de 0 à 20 %
  // Champs stockés (valeurs validées), dans l'ordre du formulaire.
  const FIELDS = Object.freeze({
    priceCents: 'cents', downCents: 'cents', feesCents: 'cents', loanRateBp: 'loanRate', loanYears: 'years',
    chargesCents: 'cents', maintenanceCents: 'cents', costGrowthBp: 'rate', rentCents: 'cents', rentGrowthBp: 'rate',
    appreciationBp: 'rate', investBp: 'rate', horizonYears: 'years',
  });
  // Nom du champ de formulaire (texte saisi) pour chaque valeur stockée.
  const INPUTS = Object.freeze({
    priceCents: 'price', downCents: 'down', feesCents: 'fees', loanRateBp: 'loanRate', loanYears: 'loanYears',
    chargesCents: 'charges', maintenanceCents: 'maintenance', costGrowthBp: 'costGrowth', rentCents: 'rent', rentGrowthBp: 'rentGrowth',
    appreciationBp: 'appreciation', investBp: 'invest', horizonYears: 'horizon',
  });

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();

  // Montant positif ou nul : « 250 000,50 » -> 25000050 centimes. Vide = 0 si autorisé.
  function parseCents(value, field, { required = false } = {}) {
    const s = str(value).replace(/[\s  ]/g, '').replace(',', '.');
    if (s === '') { if (required) fail('err.required', { field }); return 0; }
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) fail('err.amount', { field });
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents > MAX_CENTS) fail('err.amountBig', { field });
    return cents;
  }
  // Taux annuel en % (signe moins accepté) -> points de base, borné.
  function parseRate(value, field, min = MIN_RATE, max = MAX_RATE) {
    const s = str(value).replace(/[\s%]/g, '').replace(',', '.').replace('−', '-');
    if (s === '') return 0;
    if (!/^-?\d{1,2}(\.\d{1,2})?$/.test(s)) fail('err.rate', { field, min: min / 100, max: max / 100 });
    const neg = s.startsWith('-'), [a, b = ''] = s.replace('-', '').split('.');
    const bp = (neg ? -1 : 1) * (Number(a) * 100 + Number((b + '00').slice(0, 2)));
    if (bp < min || bp > max) fail('err.rate', { field, min: min / 100, max: max / 100 });
    return bp === 0 ? 0 : bp; // pas de « -0 »
  }
  function parseYears(value, field) {
    const s = str(value);
    if (!/^\d{1,2}$/.test(s) || Number(s) < 1 || Number(s) > MAX_YEARS) fail('err.years', { field, max: MAX_YEARS });
    return Number(s);
  }

  // Hypothèses saisies (textes du formulaire) -> valeurs validées.
  function makeParams(input) {
    if (!isObj(input)) fail('err.params');
    const p = {
      priceCents: parseCents(input.price, 'price', { required: true }),
      downCents: parseCents(input.down, 'down'),
      feesCents: parseCents(input.fees, 'fees'),
      loanRateBp: parseRate(input.loanRate, 'loanRate', 0, MAX_LOAN_RATE),
      loanYears: parseYears(input.loanYears, 'loanYears'),
      chargesCents: parseCents(input.charges, 'charges'),
      maintenanceCents: parseCents(input.maintenance, 'maintenance'),
      costGrowthBp: parseRate(input.costGrowth, 'costGrowth'),
      rentCents: parseCents(input.rent, 'rent', { required: true }),
      rentGrowthBp: parseRate(input.rentGrowth, 'rentGrowth'),
      appreciationBp: parseRate(input.appreciation, 'appreciation'),
      investBp: parseRate(input.invest, 'invest'),
      horizonYears: parseYears(input.horizon, 'horizon'),
    };
    if (p.priceCents === 0) fail('err.pricePositive');
    if (p.rentCents === 0) fail('err.rentPositive');
    if (p.downCents > p.priceCents + p.feesCents) fail('err.downTooBig');
    return p;
  }
  const loanCents = (p) => p.priceCents + p.feesCents - p.downCents; // capital emprunté

  // Arrondi au centime, symétrique pour les valeurs négatives.
  const roundSym = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
  // Mensualité constante d'un prêt amortissable (taux mensuel = taux annuel / 12).
  function monthlyPayment(principal, rateBp, months) {
    if (principal <= 0) return 0;
    if (rateBp === 0) return Math.round(principal / months);
    const r = rateBp / 120000;
    return Math.round(principal * r / (1 - Math.pow(1 + r, -months)));
  }
  // Valeur indexée d'une année sur l'autre : prev × (1 + taux), arrondie au centime.
  const grow = (prev, bp) => prev + roundSym(prev * bp / 10000);

  // Simulation mois par mois ; tableau annuel de l'année 0 (achat) à l'horizon.
  function simulate(p) {
    const months = p.loanYears * 12, r = p.loanRateBp / 120000;
    const payment = monthlyPayment(loanCents(p), p.loanRateBp, months);
    let balance = loanCents(p), paid = 0, interest = 0, loanMonths = 0;
    let invest = p.downCents, rentMonth = p.rentCents, ownerYear = p.chargesCents + p.maintenanceCents;
    let rentCum = 0, ownerCostsCum = 0, value = p.priceCents;
    const row = (year) => {
      const equity = value - balance;
      const ownerNet = p.downCents + paid + ownerCostsCum - equity;
      const renterNet = rentCum - (invest - p.downCents);
      return { year, rentCum, investCents: invest, renterNet, paidCum: paid, interestCum: interest, ownerCostsCum, valueCents: value, balanceCents: balance, equityCents: equity, ownerNet, diff: renterNet - ownerNet };
    };
    const years = [row(0)];
    for (let y = 1; y <= p.horizonYears; y++) {
      if (y > 1) { rentMonth = grow(rentMonth, p.rentGrowthBp); ownerYear = grow(ownerYear, p.costGrowthBp); }
      for (let m = 1; m <= 12; m++) {
        if (balance > 0) { // échéance du prêt
          loanMonths++;
          const i = Math.round(balance * r);
          const due = loanMonths >= months ? balance + i : Math.min(balance + i, payment);
          if (due <= i) fail('err.loanPayment');
          balance -= due - i; paid += due; interest += i;
        }
        invest += roundSym(invest * p.investBp / 120000); // placement de l'apport, capitalisé chaque mois
        rentCum += rentMonth;
      }
      ownerCostsCum += ownerYear; // charges, taxe et entretien de l'année
      value = Math.max(0, grow(value, p.appreciationBp)); // revalorisation en fin d'année
      years.push(row(y));
    }
    // Point d'équilibre : première année à partir de laquelle l'achat reste moins coûteux jusqu'à l'horizon.
    let breakEven = null;
    for (let k = years.length - 1; k >= 1 && years[k].diff >= 0; k--) breakEven = years[k].year;
    const last = years[years.length - 1];
    return { loanCents: loanCents(p), paymentCents: payment, years, breakEven, final: last, winner: last.diff > 0 ? 'buy' : last.diff < 0 ? 'rent' : 'equal' };
  }

  // --- CSV : une ligne par année ; libellés traduits fournis par l'interface.
  const COLUMNS = Object.freeze(['year', 'rentCum', 'investCents', 'renterNet', 'paidCum', 'interestCum', 'ownerCostsCum', 'valueCents', 'balanceCents', 'ownerNet', 'diff']);
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s; // pas de formule interprétée par un tableur
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  function yearlyCsv(result, labels) {
    if (!result || !Array.isArray(result.years) || !isObj(labels) || COLUMNS.some((c) => typeof labels[c] !== 'string')) fail('err.csv');
    const rows = [COLUMNS.map((c) => labels[c])];
    for (const y of result.years) rows.push(COLUMNS.map((c) => (c === 'year' ? y.year : dec(y[c]))));
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : { app, version, params } (params nul tant que rien n'est saisi).
  function toInputs(p) { // valeurs stockées -> textes de formulaire (pour revalider)
    const out = {};
    for (const [k, kind] of Object.entries(FIELDS)) out[INPUTS[k]] = kind === 'cents' || kind === 'rate' || kind === 'loanRate' ? dec(p[k]) : String(p[k]);
    return out;
  }
  function validateParams(p) {
    if (!keysAre(p, Object.keys(FIELDS))) fail('err.backup');
    for (const [k, kind] of Object.entries(FIELDS)) {
      if (!Number.isSafeInteger(p[k])) fail('err.backup');
      if (kind === 'cents' && (p[k] < 0 || p[k] > MAX_CENTS)) fail('err.backup');
    }
    return makeParams(toInputs(p));
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'params'])) fail('err.backup');
    return { params: data.params === null ? null : validateParams(data.params) };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, params: state ? state.params : null });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.RentBuyCore = Object.freeze({
    APP, VERSION, MAX_YEARS, FIELDS, INPUTS, COLUMNS, parseCents, parseRate, parseYears, makeParams, loanCents, monthlyPayment,
    simulate, yearlyCsv, toInputs, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RentBuyCore;
})(typeof window === 'undefined' ? globalThis : window);
