/* PriceJournal — logique pure : relevés de prix datés par produit et magasin, prix unitaire (au kg, au litre,
   à la pièce), évolution dans le temps, variation en %, meilleur prix observé, export CSV.
   Montants en centimes entiers ; dates en jours civils « AAAA-MM-JJ » ; quantités avec unité explicite.
   Les comparaisons de prix unitaires sont exactes (produits croisés), sans arrondi. */
(function (root) {
  'use strict';

  const APP = 'pricejournal', VERSION = 1;
  const UNITS = Object.freeze({
    g: { dim: 'mass', factor: 1 }, kg: { dim: 'mass', factor: 1000 },
    ml: { dim: 'volume', factor: 1 }, cl: { dim: 'volume', factor: 10 }, l: { dim: 'volume', factor: 1000 },
    piece: { dim: 'piece', factor: 1 },
  });
  // Prix unitaire affiché : par kg, par litre ou par pièce (taille en unités de base).
  const PER = Object.freeze({ mass: { unit: 'kg', size: 1000 }, volume: { unit: 'l', size: 1000 }, piece: { unit: 'piece', size: 1 } });
  const MAX_ENTRIES = 2000, MAX_PRODUCT = 60, MAX_STORE = 40;
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const str = (v) => String(v === undefined || v === null ? '' : v).trim();

  function parseCents(value) {
    const s = str(value).replace(/[\s  ]/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) fail('err.price');
    const [a, b = ''] = s.split('.');
    const c = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (c <= 0) fail('err.pricePositive');
    return c;
  }
  // Contenance positive, 3 décimales au plus.
  function parseQty(value) {
    const s = str(value).replace(/[\s  ]/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(s) || !(Number(s) > 0) || Number(s) > 999999) fail('err.qty');
    return Number(s);
  }
  function parseCount(value) {
    const s = str(value);
    if (s === '') return 1;
    if (!/^\d{1,3}$/.test(s) || Number(s) < 1) fail('err.count');
    return Number(s);
  }
  // Jour civil réel (pas de 31 février), entre 1990 et 2100.
  function parseDay(value) {
    const s = str(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) fail('err.date');
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1990 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) fail('err.date');
    return s;
  }
  function cleanText(v, max, reqKey, longKey) {
    if (typeof v !== 'string' || !v.trim()) fail(reqKey);
    const s = v.trim().replace(/\s+/g, ' ');
    if (s.length > max) fail(longKey, { max });
    return s;
  }
  // Clé de regroupement d'un produit (même nom, casse et accents composés ignorés).
  const productKey = (name) => name.normalize('NFC').toLowerCase();

  function makeEntry(input, id) {
    if (!isObj(input)) fail('err.entry');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (!Object.prototype.hasOwnProperty.call(UNITS, input.unit)) fail('err.unit');
    return {
      id, product: cleanText(input.product, MAX_PRODUCT, 'err.productRequired', 'err.productLong'),
      store: cleanText(input.store, MAX_STORE, 'err.storeRequired', 'err.storeLong'),
      date: parseDay(input.date), priceCents: parseCents(input.price), qty: parseQty(input.qty), unit: input.unit, count: parseCount(input.count),
    };
  }

  // Quantité totale en unités de base, arrondie au millième.
  // La quantité de base en millièmes reste un entier sûr dans les bornes de saisie.
  const baseQtyMilli = (e) => Math.round(e.qty * 1000) * UNITS[e.unit].factor * e.count;
  const baseQty = (e) => baseQtyMilli(e) / 1000;
  const dimOf = (e) => UNITS[e.unit].dim;
  function unitPriceCents(e) { return Math.round(e.priceCents * PER[dimOf(e)].size / baseQty(e)); }
  // Comparaison exacte des prix unitaires : a.prix/a.qté − b.prix/b.qté (signe seulement).
  const cmpUnit = (a, b) => {
    const left = BigInt(a.priceCents) * BigInt(baseQtyMilli(b));
    const right = BigInt(b.priceCents) * BigInt(baseQtyMilli(a));
    return left < right ? -1 : left > right ? 1 : 0;
  };
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  // Ajout d'un relevé : la dimension doit rester celle des relevés existants du même produit.
  function addEntry(entries, entry) {
    if (entries.length >= MAX_ENTRIES) fail('err.tooMany', { max: MAX_ENTRIES });
    const same = entries.find((e) => productKey(e.product) === productKey(entry.product));
    if (same && dimOf(same) !== dimOf(entry)) fail('err.dimMismatch', { dim: dimOf(same) });
    return [...entries, same ? { ...entry, product: same.product } : entry];
  }

  // Produits connus, avec nombre de relevés (tri alphabétique selon la langue).
  function products(entries, locale = 'fr') {
    const map = new Map();
    for (const e of entries) {
      const k = productKey(e.product);
      if (!map.has(k)) map.set(k, { key: k, name: e.product, count: 0, dim: dimOf(e) });
      map.get(k).count++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
  }

  // Analyse d'un produit : relevés datés, meilleur prix, variation entre le premier et le dernier relevé.
  function analyze(entries, key) {
    // Ordre chronologique ; à date égale, ordre de saisie.
    const list = entries.map((e, i) => ({ e, i })).filter((x) => productKey(x.e.product) === key)
      .sort((a, b) => byDate(a.e, b.e) || a.i - b.i).map((x) => ({ ...x.e, unitPriceCents: unitPriceCents(x.e) }));
    if (!list.length) return null;
    const dim = dimOf(list[0]);
    const best = list.reduce((m, e) => (cmpUnit(e, m) < 0 ? e : m));
    const worst = list.reduce((m, e) => (cmpUnit(e, m) > 0 ? e : m));
    const first = list[0], last = list[list.length - 1];
    // Variation exacte du prix unitaire, en % arrondi au dixième.
    const ratio = (last.priceCents * baseQty(first)) / (first.priceCents * baseQty(last));
    const variationPct = Math.round((ratio - 1) * 1000) / 10;
    const lastVsBestPct = Math.round(((last.priceCents * baseQty(best)) / (best.priceCents * baseQty(last)) - 1) * 1000) / 10;
    // Dernier prix relevé dans chaque magasin.
    const stores = new Map();
    for (const e of list) stores.set(e.store.toLowerCase(), e);
    const byStore = [...stores.values()].sort((a, b) => cmpUnit(a, b) || a.store.localeCompare(b.store));
    return { key, name: list[0].product, dim, per: PER[dim].unit, entries: list, best, worst, first, last, variationPct: list.length > 1 ? variationPct : null, lastVsBestPct, byStore };
  }

  // --- CSV de tous les relevés (ordre chronologique), en-têtes traduits fournis par l'interface.
  const COLUMNS = Object.freeze(['date', 'product', 'store', 'price', 'qty', 'unit', 'count', 'unitPrice', 'per']);
  function cell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const dec = (c) => (c / 100).toFixed(2);
  function entriesCsv(entries, labels, unitLabel = (u) => u) {
    if (!Array.isArray(entries) || !entries.length || !isObj(labels) || COLUMNS.some((c) => typeof labels[c] !== 'string')) fail('err.csv');
    const rows = [COLUMNS.map((c) => labels[c])];
    for (const e of [...entries].sort((a, b) => byDate(a, b) || a.product.localeCompare(b.product))) {
      rows.push([e.date, e.product, e.store, dec(e.priceCents), e.qty, unitLabel(e.unit), e.count, dec(unitPriceCents(e)), unitLabel(PER[dimOf(e)].unit)]);
    }
    return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : { app, version, entries }
  const FIELDS = ['id', 'product', 'store', 'date', 'priceCents', 'qty', 'unit', 'count'];
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== APP || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'entries']) || !Array.isArray(data.entries)) fail('err.backup');
    if (data.entries.length > MAX_ENTRIES) fail('err.tooMany', { max: MAX_ENTRIES });
    let entries = [];
    for (const raw of data.entries) {
      if (!keysAre(raw, FIELDS)) fail('err.backup');
      if (!Number.isSafeInteger(raw.priceCents) || raw.priceCents <= 0 || raw.priceCents > 99999999) fail('err.backup');
      if (typeof raw.qty !== 'number' || !(raw.qty > 0) || raw.qty > 999999) fail('err.backup');
      if (!Number.isInteger(raw.count)) fail('err.backup');
      const e = makeEntry({ product: raw.product, store: raw.store, date: raw.date, price: dec(raw.priceCents), qty: String(raw.qty), unit: raw.unit, count: String(raw.count) }, raw.id);
      if (e.qty !== raw.qty) fail('err.backup');
      entries = addEntry(entries, e);
    }
    if (new Set(entries.map((e) => e.id)).size !== entries.length) fail('err.backup');
    return { entries };
  }
  function backup(state) {
    const clean = validateBackup({ app: APP, version: VERSION, entries: state.entries });
    return JSON.stringify({ app: APP, version: VERSION, ...clean }, null, 2);
  }

  root.PriceJournalCore = Object.freeze({
    APP, VERSION, UNITS, PER, MAX_ENTRIES, COLUMNS, parseCents, parseQty, parseCount, parseDay, productKey, makeEntry, baseQty, unitPriceCents,
    addEntry, products, analyze, entriesCsv, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PriceJournalCore;
})(typeof window === 'undefined' ? globalThis : window);
