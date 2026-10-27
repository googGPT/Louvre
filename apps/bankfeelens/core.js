/* BankFeeLens — logique pure : coût annuel d'offres bancaires pour un profil d'usage saisi.
   Les tarifs et l'usage sont saisis par l'utilisateur : l'appli ne connaît aucune banque ni aucun tarif réel.
   Montants en centimes entiers ; taux en points de base (12,5 % = 1250) ; nombres d'opérations par mois en dixièmes
   (1,5 retrait par mois = 15) pour accepter les moyennes. */
(function (root) {
  'use strict';

  const APP = 'bankfeelens', VERSION = 1;
  const MAX_OFFERS = 12, MAX_NAME = 40;
  const MAX_FEE = 99999999; // 999 999,99 par ligne tarifaire
  const MAX_COUNT = 5000; // 500,0 opérations par mois
  const LINES = Object.freeze(['account', 'card', 'withdrawals', 'transfers', 'overdraft', 'foreign']); // détail du coût
  const PROFILE = Object.freeze({ withdrawals: 'count', transfers: 'count', foreignOps: 'count', foreignAmount: 'cents', overdraftDays: 'days', overdraftAmount: 'cents' });
  const OFFER = Object.freeze({ account: 'cents', card: 'cents', withdrawalFee: 'cents', freeWithdrawals: 'count', transferFee: 'cents', overdraftRate: 'rate', foreignFixed: 'cents', foreignPct: 'pct' });
  // Nom du champ stocké pour chaque champ saisi.
  const STORE = (k, kind) => k + ({ cents: 'Cents', count: 'Tenths', days: '', rate: 'Bp', pct: 'Bp' })[kind];
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();
  const norm = (v) => str(v).replace(/[\s  %]/g, '').replace(',', '.');

  // Montant (vide = 0) : « 2,50 » -> 250 centimes.
  function parseCents(value, field) {
    const s = norm(value);
    if (s === '') return 0;
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) fail('err.amount', { field });
    const [a, b = ''] = s.split('.');
    const c = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (c > MAX_FEE) fail('err.amountBig', { field });
    return c;
  }
  // Nombre moyen d'opérations par mois, une décimale au plus -> dixièmes.
  function parseCount(value, field) {
    const s = norm(value);
    if (s === '') return 0;
    if (!/^\d{1,3}(\.\d)?$/.test(s)) fail('err.count', { field });
    const [a, b = '0'] = s.split('.');
    const n = Number(a) * 10 + Number(b);
    if (n > MAX_COUNT) fail('err.count', { field });
    return n;
  }
  function parseDays(value, field) {
    const s = norm(value);
    if (s === '') return 0;
    if (!/^\d{1,3}$/.test(s) || Number(s) > 366) fail('err.days', { field });
    return Number(s);
  }
  // Taux en % (0 à max) -> points de base.
  function parseRate(value, field, max) {
    const s = norm(value);
    if (s === '') return 0;
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) fail('err.rate', { field, max: max / 100 });
    const [a, b = ''] = s.split('.');
    const bp = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (bp > max) fail('err.rate', { field, max: max / 100 });
    return bp;
  }
  const PARSERS = { cents: parseCents, count: parseCount, days: parseDays, rate: (v, f) => parseRate(v, f, 3000), pct: (v, f) => parseRate(v, f, 1000) };

  function makeProfile(input) {
    if (!isObj(input)) fail('err.profile');
    const p = {};
    for (const [k, kind] of Object.entries(PROFILE)) p[STORE(k, kind)] = PARSERS[kind](input[k], k);
    if (p.overdraftDays > 0 && p.overdraftAmountCents === 0) fail('err.overdraftAmount');
    if (p.foreignOpsTenths > 0 && p.foreignAmountCents === 0) fail('err.foreignAmount');
    return p;
  }
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    const name = v.trim().replace(/\s+/g, ' ');
    if (name.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return name;
  }
  function makeOffer(input, id) {
    if (!isObj(input)) fail('err.offer');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const o = { id, name: cleanName(input.name) };
    for (const [k, kind] of Object.entries(OFFER)) o[STORE(k, kind)] = PARSERS[kind](input[k], k);
    return o;
  }

  // Coût annuel d'une offre, ligne par ligne (centimes).
  function annualCost(profile, offer) {
    const excess = Math.max(0, profile.withdrawalsTenths - offer.freeWithdrawalsTenths); // retraits payants par mois (dixièmes)
    const perForeign = offer.foreignFixedCents + Math.round(profile.foreignAmountCents * offer.foreignPctBp / 10000);
    const lines = {
      account: offer.accountCents * 12,
      card: offer.cardCents,
      withdrawals: Math.round(excess * offer.withdrawalFeeCents * 12 / 10),
      transfers: Math.round(profile.transfersTenths * offer.transferFeeCents * 12 / 10),
      // Intérêts débiteurs : montant moyen × taux annuel × jours / 365.
      overdraft: Math.round(profile.overdraftAmountCents * offer.overdraftRateBp * profile.overdraftDays / (10000 * 365)),
      foreign: Math.round(profile.foreignOpsTenths * perForeign * 12 / 10),
    };
    const total = LINES.reduce((s, k) => s + lines[k], 0);
    return { lines, total, monthly: Math.round(total / 12) };
  }

  // Classement du moins cher au plus cher ; écart avec la meilleure offre.
  function rank(profile, offers, locale = 'fr') {
    if (!profile || !Array.isArray(offers)) fail('err.params');
    const rows = offers.map((o) => ({ id: o.id, name: o.name, ...annualCost(profile, o) }));
    rows.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name, locale));
    const best = rows.length ? rows[0].total : 0;
    return rows.map((r, i) => ({ ...r, rank: i + 1, gap: r.total - best }));
  }

  // --- CSV : une ligne par offre, colonnes traduites fournies par l'interface.
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2);
  function rankingCsv(rows, labels) {
    const cols = ['rank', 'name', ...LINES, 'total', 'gap'];
    if (!Array.isArray(rows) || !rows.length || !isObj(labels) || cols.some((c) => typeof labels[c] !== 'string')) fail('err.csv');
    const out = [cols.map((c) => labels[c])];
    for (const r of rows) out.push(cols.map((c) => (c === 'rank' ? r.rank : c === 'name' ? r.name : dec(LINES.includes(c) ? r.lines[c] : r[c]))));
    return '﻿' + out.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : { app, version, profile, offers }
  const tenths = (n) => (n % 10 ? (n / 10).toFixed(1) : String(n / 10));
  const asInput = (v, kind) => (kind === 'cents' || kind === 'rate' || kind === 'pct' ? dec(v) : kind === 'count' ? tenths(v) : String(v));
  function toInputs(obj, spec) { const out = {}; for (const [k, kind] of Object.entries(spec)) out[k] = asInput(obj[STORE(k, kind)], kind); return out; }
  function checkInts(obj, spec, extra) {
    if (!keysAre(obj, [...extra, ...Object.entries(spec).map(([k, kind]) => STORE(k, kind))])) fail('err.backup');
    for (const [k, kind] of Object.entries(spec)) { const v = obj[STORE(k, kind)]; if (!Number.isSafeInteger(v) || v < 0) fail('err.backup'); }
  }
  function emptyState() { return { profile: null, offers: [] }; }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'profile', 'offers']) || !Array.isArray(data.offers)) fail('err.backup');
    let profile = null;
    if (data.profile !== null) { checkInts(data.profile, PROFILE, []); profile = makeProfile(toInputs(data.profile, PROFILE)); }
    if (data.offers.length > MAX_OFFERS) fail('err.tooMany', { max: MAX_OFFERS });
    const offers = data.offers.map((o) => { checkInts(o, OFFER, ['id', 'name']); return makeOffer({ name: o.name, ...toInputs(o, OFFER) }, o.id); });
    if (new Set(offers.map((o) => o.id)).size !== offers.length) fail('err.backup');
    return { profile, offers };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, ...state });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.BankFeeCore = Object.freeze({
    APP, VERSION, MAX_OFFERS, LINES, PROFILE, OFFER, STORE, parseCents, parseCount, parseDays, parseRate, makeProfile, makeOffer,
    annualCost, rank, rankingCsv, toInputs, emptyState, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BankFeeCore;
})(typeof window === 'undefined' ? globalThis : window);
