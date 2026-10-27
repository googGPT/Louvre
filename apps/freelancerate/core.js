/* FreelanceRate — logique pure : tarif journalier et horaire cible d'un indépendant à partir du revenu
   net visé, des charges, de taux de prélèvement et du temps facturable, tous saisis par l'utilisateur.
   Aucun barème n'est intégré. Montants en centimes entiers ; taux en points de base (22,5 % = 2250).
   Modèle : net = (1 − t) × (CA × (1 − p) − charges), où p = prélèvements sur le chiffre d'affaires
   et t = prélèvements sur le bénéfice restant. Chiffre d'affaires hors TVA. */
(function (root) {
  'use strict';

  const APP = 'freelancerate', VERSION = 1;
  const MAX_CHARGES = 40, MAX_NAME = 40, MAX_CENTS = 999999999; // 9 999 999,99
  const MAX_RATE = 9000; // un prélèvement saisi ne peut dépasser 90 %
  const PERIODS = Object.freeze({ month: 12, year: 1 }); // nombre d'occurrences par an
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();

  // Décimal positif « 1 250,5 » avec au plus `dec` décimales -> entier en 1/10^dec.
  function parseFixed(value, dec, key, maxInt) {
    const s = str(value).replace(/\s|%/g, '').replace(',', '.');
    const re = new RegExp(`^\\d{1,${maxInt}}(\\.\\d{1,${dec}})?$`);
    if (!re.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    return Number(a) * 10 ** dec + Number((b + '0'.repeat(dec)).slice(0, dec));
  }
  function parseCents(value, key) {
    const c = parseFixed(value, 2, key, 8);
    if (c > MAX_CENTS) fail('err.amountBig');
    return c;
  }
  function parseRate(value, key) { // « 22,5 » -> 2250 ; vide = 0
    if (str(value) === '') return 0;
    const bp = parseFixed(value, 2, key, 3);
    if (bp > MAX_RATE) fail(key);
    return bp;
  }
  function parseInt0(value, key, min, max) {
    const s = str(value);
    if (!/^\d{1,3}$/.test(s) || Number(s) < min || Number(s) > max) fail(key, { min, max });
    return Number(s);
  }

  // Profil : revenu net visé, prélèvements, temps de travail.
  function makeProfile(input) {
    if (!isObj(input)) fail('err.profile');
    const targetNetCents = parseCents(input.targetNet, 'err.targetNet');
    if (targetNetCents <= 0) fail('err.targetNet');
    const hoursX100 = parseFixed(input.hours, 2, 'err.hours', 2);
    if (hoursX100 < 100 || hoursX100 > 2400) fail('err.hours');
    const p = {
      targetNetCents,
      contribBp: parseRate(input.contrib, 'err.contrib'),
      taxBp: parseRate(input.tax, 'err.tax'),
      daysPerWeek: parseInt0(input.daysPerWeek, 'err.daysPerWeek', 1, 7),
      weeksOff: parseInt0(input.weeksOff, 'err.weeksOff', 0, 51),
      daysOff: parseInt0(input.daysOff, 'err.daysOff', 0, 300),
      billablePct: parseInt0(input.billablePct, 'err.billablePct', 1, 100),
      hoursX100,
    };
    if (workingDays(p) <= 0) fail('err.noDays');
    return p;
  }

  function makeCharge(input, id) {
    if (!isObj(input)) fail('err.charge');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (typeof input.name !== 'string' || !input.name.trim()) fail('err.nameRequired');
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    if (!Object.prototype.hasOwnProperty.call(PERIODS, input.period)) fail('err.period');
    const amountCents = parseCents(input.amount, 'err.chargeAmount');
    if (amountCents <= 0) fail('err.chargeAmount');
    return { id, name, amountCents, period: input.period };
  }
  const annualCharges = (charges) => charges.reduce((s, c) => s + c.amountCents * PERIODS[c.period], 0);

  // Jours travaillés par an, puis jours facturés (en centièmes de jour : 70 % de 213 jours = 14910).
  function workingDays(p) { return (52 - p.weeksOff) * p.daysPerWeek - p.daysOff; }
  function billableDaysX100(p) { return workingDays(p) * p.billablePct; }

  // Division entière arrondie vers le haut, en BigInt (exacte même pour de grands montants).
  const ceilDiv = (a, b) => (a + b - 1n) / b;

  // Ce que laisse un chiffre d'affaires donné : prélèvements, charges, bénéfice, net.
  function breakdown(turnoverCents, chargesCents, p) {
    const contribCents = Math.round(turnoverCents * p.contribBp / 10000);
    const profitCents = turnoverCents - contribCents - chargesCents;
    const taxCents = profitCents > 0 ? Math.round(profitCents * p.taxBp / 10000) : 0;
    return { turnoverCents, contribCents, chargesCents, profitCents, taxCents, netCents: profitCents - taxCents };
  }

  // Tarif cible : chiffre d'affaires donné par la formule exacte, arrondi au centime supérieur (donc net ≥ net visé).
  function compute(p, charges) {
    const ch = annualCharges(charges);
    const net = BigInt(p.targetNetCents), c = BigInt(ch), t = BigInt(p.taxBp), q = BigInt(p.contribBp);
    // CA = (net / (1 − t) + charges) / (1 − p)  =  (net·10⁴ + charges·(10⁴ − t)) · 10⁴ / ((10⁴ − t)(10⁴ − p))
    let turnover = Number(ceilDiv((net * 10000n + c * (10000n - t)) * 10000n, (10000n - t) * (10000n - q)));
    while (breakdown(turnover, ch, p).netCents < p.targetNetCents) turnover += 1; // arrondis des prélèvements
    const days100 = billableDaysX100(p);
    const dayRateCents = Number(ceilDiv(BigInt(turnover) * 100n, BigInt(days100)));
    const hourRateCents = Number(ceilDiv(BigInt(dayRateCents) * 100n, BigInt(p.hoursX100)));
    return {
      ...breakdown(turnover, ch, p),
      monthlyTurnoverCents: Math.ceil(turnover / 12),
      workingDays: workingDays(p), billableDays: days100 / 100,
      billableHours: Math.round(days100 * p.hoursX100 / 100) / 100,
      dayRateCents, hourRateCents,
    };
  }

  // Tester un tarif journalier : ce qu'il rapporte sur l'année avec les mêmes hypothèses.
  function checkDayRate(p, charges, dayRateCents) {
    if (!Number.isSafeInteger(dayRateCents) || dayRateCents <= 0) fail('err.testRate');
    const turnover = Math.round(dayRateCents * billableDaysX100(p) / 100);
    const b = breakdown(turnover, annualCharges(charges), p);
    return { ...b, gapCents: b.netCents - p.targetNetCents };
  }

  // --- CSV du calcul (libellés traduits fournis par l'interface)
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  function resultCsv(result, charges, labels) {
    const keys = ['head', 'turnover', 'contrib', 'charges', 'profit', 'tax', 'net', 'dayRate', 'hourRate', 'billableDays'];
    if (!isObj(labels) || !keys.every((k) => k === 'head' ? Array.isArray(labels.head) && labels.head.length === 2 : typeof labels[k] === 'string')) fail('err.csv');
    const rows = [labels.head,
      [labels.turnover, dec(result.turnoverCents)], [labels.contrib, dec(-result.contribCents)], [labels.charges, dec(-result.chargesCents)],
      [labels.profit, dec(result.profitCents)], [labels.tax, dec(-result.taxCents)], [labels.net, dec(result.netCents)],
      [labels.dayRate, dec(result.dayRateCents)], [labels.hourRate, dec(result.hourRateCents)], [labels.billableDays, String(result.billableDays)],
      ...charges.map((c) => [c.name, dec(-c.amountCents * PERIODS[c.period])])];
    return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function emptyState() { return { profile: null, charges: [] }; }
  const PROFILE_KEYS = ['targetNetCents', 'contribBp', 'taxBp', 'daysPerWeek', 'weeksOff', 'daysOff', 'billablePct', 'hoursX100'];
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'profile', 'charges']) || !Array.isArray(data.charges)) fail('err.backup');
    let profile = null;
    if (data.profile !== null) {
      const p = data.profile;
      if (!keysAre(p, PROFILE_KEYS) || !PROFILE_KEYS.every((k) => Number.isSafeInteger(p[k]) && p[k] >= 0)) fail('err.backup');
      if (p.targetNetCents > MAX_CENTS) fail('err.backup');
      profile = makeProfile({ targetNet: dec(p.targetNetCents), contrib: dec(p.contribBp), tax: dec(p.taxBp), daysPerWeek: String(p.daysPerWeek), weeksOff: String(p.weeksOff), daysOff: String(p.daysOff), billablePct: String(p.billablePct), hours: dec(p.hoursX100) });
    }
    if (data.charges.length > MAX_CHARGES) fail('err.tooMany', { max: MAX_CHARGES });
    const charges = data.charges.map((c) => {
      if (!keysAre(c, ['id', 'name', 'amountCents', 'period']) || !Number.isSafeInteger(c.amountCents) || c.amountCents <= 0 || c.amountCents > MAX_CENTS) fail('err.backup');
      return makeCharge({ name: c.name, amount: dec(c.amountCents), period: c.period }, c.id);
    });
    if (new Set(charges.map((c) => c.id)).size !== charges.length) fail('err.backup');
    return { profile, charges };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, ...state });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.FreelanceCore = Object.freeze({
    APP, VERSION, MAX_CHARGES, PERIODS, parseCents, parseRate, makeProfile, makeCharge, annualCharges, workingDays,
    breakdown, compute, checkDayRate, resultCsv, emptyState, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FreelanceCore;
})(typeof window === 'undefined' ? globalThis : window);
