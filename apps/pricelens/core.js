/* PriceLens — logique pure : prix unitaire (au kg, au litre, à la pièce) et classement.
   Les montants sont en centimes entiers ; les comparaisons utilisent des fractions exactes. */
(function (root) {
  'use strict';

  const VERSION = 1;
  // Chaque unité saisie est convertie vers une unité de base (g, ml ou pièce).
  const UNITS = Object.freeze({
    g: { dim: 'masse', factor: 1, label: 'g' },
    kg: { dim: 'masse', factor: 1000, label: 'kg' },
    ml: { dim: 'volume', factor: 1, label: 'ml' },
    cl: { dim: 'volume', factor: 10, label: 'cl' },
    l: { dim: 'volume', factor: 1000, label: 'L' },
    piece: { dim: 'pièce', factor: 1, label: 'pièce(s)' },
  });
  // Unité d'affichage du prix unitaire par dimension, et taille en unités de base.
  const PER = Object.freeze({ masse: { label: '€/kg', size: 1000 }, volume: { label: '€/L', size: 1000 }, 'pièce': { label: '€/pièce', size: 1 } });
  const MAX_ITEMS = 40, MAX_LISTS = 200, MAX_NAME = 80;

  function fail(m) { throw new Error(m); }

  // « 2,49 » ou « 2.49 » -> 249 centimes (refuse les montants ambigus).
  function parseCents(value) {
    const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) fail('Prix invalide (ex. 2,49)');
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents <= 0) fail('Le prix doit être positif');
    return cents;
  }
  // Quantité décimale positive (ex. 1,5), au plus 3 décimales.
  function parseQty(value, label = 'Quantité') {
    const s = String(value).trim().replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(s) || Number(s) <= 0) fail(`${label} invalide`);
    return Number(s);
  }

  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('Nom du produit obligatoire');
    if (v.trim().length > MAX_NAME) fail(`Nom trop long (${MAX_NAME} caractères au plus)`);
    return v.trim();
  }

  // Produit saisi : prix total payé, nombre d'unités du lot, contenance d'une unité.
  function makeItem(input, id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('Identifiant invalide');
    const unit = input.unit;
    if (!Object.prototype.hasOwnProperty.call(UNITS, unit)) fail('Unité inconnue');
    const count = input.count === undefined || input.count === '' ? 1 : parseQty(input.count, 'Nombre d\'unités');
    if (!Number.isInteger(count) || count > 999) fail('Nombre d\'unités : entier de 1 à 999');
    return { id, name: cleanName(input.name), priceCents: parseCents(input.price), qty: parseQty(input.qty), unit, count };
  }

  // Quantité totale en unités de base (g, ml ou pièces), arrondie au millième pour éviter les flottants.
  function baseQty(item) { return Math.round(item.qty * UNITS[item.unit].factor * item.count * 1000) / 1000; }

  // Prix unitaire affiché (€/kg, €/L, €/pièce) en centimes, arrondi au centime le plus proche.
  function unitPriceCents(item) {
    const dim = UNITS[item.unit].dim;
    return Math.round(item.priceCents * PER[dim].size / baseQty(item));
  }

  // Classement par dimension : le moins cher d'abord ; économie par rapport au plus cher du groupe.
  function compare(items) {
    const groups = {};
    for (const item of items) (groups[UNITS[item.unit].dim] ||= []).push(item);
    const result = [];
    for (const dim of Object.keys(PER)) {
      const list = groups[dim];
      if (!list) continue;
      // Comparaison exacte a.prix/a.qté < b.prix/b.qté  <=>  a.prix*b.qté < b.prix*a.qté
      const sorted = [...list].sort((a, b) => (a.priceCents * baseQty(b) - b.priceCents * baseQty(a)) || a.name.localeCompare(b.name, 'fr'));
      const best = unitPriceCents(sorted[0]), worst = unitPriceCents(sorted[sorted.length - 1]);
      result.push({
        dim,
        per: PER[dim].label,
        rows: sorted.map((item, rank) => {
          const up = unitPriceCents(item);
          return {
            ...item,
            rank: rank + 1,
            unitPriceCents: up,
            vsBest: best ? Math.round(1000 * (up - best) / best) / 10 : 0, // % plus cher que le meilleur
            ratio: worst ? up / worst : 1, // pour la barre visuelle
          };
        }),
        savingPct: worst ? Math.round(1000 * (worst - best) / worst) / 10 : 0, // gain du meilleur sur le plus cher
      });
    }
    return { groups: result, mixed: result.length > 1 };
  }

  function eur(cents) { return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }

  // --- Listes enregistrées et sauvegarde
  function makeList(name, id, items = []) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('Identifiant invalide');
    return { id, name: cleanName(name), items };
  }
  function validateItem(it) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) fail('Produit invalide');
    if (Object.keys(it).sort().join(',') !== 'count,id,name,priceCents,qty,unit') fail('Champs de produit inattendus');
    if (!Number.isSafeInteger(it.priceCents) || it.priceCents <= 0 || it.priceCents > 99999999) fail('Prix enregistré invalide');
    if (typeof it.qty !== 'number' || !(it.qty > 0) || it.qty > 999999) fail('Quantité enregistrée invalide');
    return makeItem({ name: it.name, price: (it.priceCents / 100).toFixed(2), qty: String(it.qty), unit: it.unit, count: String(it.count) }, it.id);
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Sauvegarde illisible');
    if (data.app !== 'pricelens' || data.version !== VERSION || !Array.isArray(data.lists)) fail('Ce fichier n\'est pas une sauvegarde PriceLens');
    if (data.lists.length > MAX_LISTS) fail('Trop de comparaisons');
    const lists = data.lists.map((l) => {
      if (!l || typeof l !== 'object' || Object.keys(l).sort().join(',') !== 'id,items,name' || !Array.isArray(l.items)) fail('Comparaison invalide');
      if (l.items.length > MAX_ITEMS) fail(`Trop de produits dans une comparaison (${MAX_ITEMS} au plus)`);
      const items = l.items.map(validateItem);
      if (new Set(items.map((i) => i.id)).size !== items.length) fail('Produits en double');
      return makeList(l.name, l.id, items);
    });
    if (new Set(lists.map((l) => l.id)).size !== lists.length) fail('Comparaisons en double');
    return lists;
  }
  function backup(lists) { return JSON.stringify({ app: 'pricelens', version: VERSION, lists: validateBackup({ app: 'pricelens', version: VERSION, lists }) }, null, 2); }

  root.PriceCore = Object.freeze({ VERSION, UNITS, PER, MAX_ITEMS, parseCents, parseQty, makeItem, baseQty, unitPriceCents, compare, eur, makeList, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PriceCore;
})(typeof window === 'undefined' ? globalThis : window);
