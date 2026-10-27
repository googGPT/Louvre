/* TravelPackingWeight — logique pure : poids des bagages, comparaison aux limites saisies,
   propositions de déplacement d'objets entre bagages. Poids internes en grammes entiers.
   Aucune limite de compagnie n'est fournie : l'utilisateur saisit celles de son billet. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ trips: 30, bags: 10, items: 300, name: 60, itemG: 100000, limitG: 100000, tareG: 30000, qty: 99 });
  const TYPES = Object.freeze(['cabin', 'checked', 'personal']); // cabine, soute, objet personnel
  // Conversions exactes (définitions légales de la livre et de l'once avoirdupois).
  const UNITS = Object.freeze({ g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return v.trim();
  }

  // « 1,5 » kg -> 1 500 g ; arrondi au gramme. Vide autorisé si allowEmpty (renvoie 0 = pas de limite).
  function toGrams(value, unit, key, max, allowEmpty = false) {
    if (!Object.prototype.hasOwnProperty.call(UNITS, unit)) fail('err.unit');
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '' && allowEmpty) return 0;
    if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) fail(key);
    const g = Math.round(Number(s) * UNITS[unit]);
    if (g < (allowEmpty ? 0 : 1) || g > max) fail(key);
    return g;
  }
  function parseQty(v) {
    const s = String(v === undefined || v === '' ? '1' : v).trim();
    if (!/^\d{1,2}$/.test(s) || Number(s) < 1 || Number(s) > MAX.qty) fail('err.qty');
    return Number(s);
  }

  // --- Constructeurs
  function makeLimits(input, unit) {
    return { cabin: toGrams(input.cabin, unit, 'err.limit', MAX.limitG, true), checked: toGrams(input.checked, unit, 'err.limit', MAX.limitG, true), personal: toGrams(input.personal, unit, 'err.limit', MAX.limitG, true) };
  }
  function makeBag(input, id, unit) {
    if (!TYPES.includes(input.type)) fail('err.type');
    return { id: checkId(id), name: cleanName(input.name), type: input.type, tareG: toGrams(input.tare === '' || input.tare === undefined ? '0' : input.tare, unit, 'err.tare', MAX.tareG, true) };
  }
  function makeItem(input, id, unit) {
    return { id: checkId(id), name: cleanName(input.name), weightG: toGrams(input.weight, unit, 'err.weight', MAX.itemG), qty: parseQty(input.qty), bagId: checkId(input.bagId), fixed: input.fixed === true };
  }
  function makeTrip(name, id) { return { id: checkId(id), name: cleanName(name), limits: { cabin: 0, checked: 0, personal: 0 }, bags: [], items: [] }; }

  // --- Poids par bagage
  const limitOf = (trip, bag) => trip.limits[bag.type] || 0; // 0 = aucune limite saisie
  function totals(trip, items = trip.items) {
    return trip.bags.map((b) => {
      const itemsG = items.filter((i) => i.bagId === b.id).reduce((s, i) => s + i.weightG * i.qty, 0);
      const totalG = b.tareG + itemsG, limitG = limitOf(trip, b);
      return { bagId: b.id, name: b.name, type: b.type, tareG: b.tareG, itemsG, totalG, limitG, excessG: limitG ? Math.max(0, totalG - limitG) : 0, spareG: limitG ? Math.max(0, limitG - totalG) : null };
    });
  }
  function summary(trip) {
    const tt = totals(trip);
    return { totalG: tt.reduce((s, b) => s + b.totalG, 0), overweight: tt.filter((b) => b.excessG > 0).length, excessG: tt.reduce((s, b) => s + b.excessG, 0), bags: tt };
  }

  // --- Propositions de déplacement
  // Pour chaque bagage en excès (le plus gros excès d'abord) :
  //  1) si une seule unité d'objet suffit à résorber l'excès, on prend la plus légère qui suffit et qui tient ailleurs ;
  //  2) sinon on déplace l'unité la plus lourde qui tient ailleurs, et on recommence.
  // Destination : le bagage où l'unité tient avec le moins de marge restante (meilleur ajustement) ;
  // un bagage sans limite saisie n'est choisi qu'en dernier recours. Les objets « à garder » ne bougent pas.
  function suggestMoves(trip) {
    const load = new Map(totals(trip).map((t) => [t.bagId, t.totalG]));
    const limit = new Map(trip.bags.map((b) => [b.id, limitOf(trip, b)]));
    const order = new Map(trip.bags.map((b, i) => [b.id, i]));
    const units = new Map(trip.items.map((i) => [i.id, i.qty])); // unités restantes de chaque objet à sa place d'origine
    const raw = [], unresolved = [];
    const spare = (id) => (limit.get(id) ? limit.get(id) - load.get(id) : Infinity);
    function destination(from, w) {
      let best = null;
      for (const b of trip.bags) {
        if (b.id === from) continue;
        const s = spare(b.id);
        if (s < w) continue;
        if (!best || s < spare(best) || (s === spare(best) && order.get(b.id) < order.get(best))) best = b.id;
      }
      return best;
    }
    const over = trip.bags.filter((b) => limit.get(b.id) && load.get(b.id) > limit.get(b.id))
      .sort((a, b) => (load.get(b.id) - limit.get(b.id)) - (load.get(a.id) - limit.get(a.id)) || order.get(a.id) - order.get(b.id));
    for (const bag of over) {
      let guard = 0;
      while (load.get(bag.id) > limit.get(bag.id) && guard++ < 10000) {
        const excess = load.get(bag.id) - limit.get(bag.id);
        const cands = trip.items.filter((i) => i.bagId === bag.id && !i.fixed && units.get(i.id) > 0)
          .sort((a, b) => a.weightG - b.weightG || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
        let pick = null;
        for (const i of cands) { if (i.weightG >= excess) { const d = destination(bag.id, i.weightG); if (d) { pick = [i, d]; break; } } }
        if (!pick) for (const i of [...cands].reverse()) { const d = destination(bag.id, i.weightG); if (d) { pick = [i, d]; break; } }
        if (!pick) { unresolved.push({ bagId: bag.id, name: bag.name, excessG: excess }); break; }
        const [item, to] = pick;
        units.set(item.id, units.get(item.id) - 1);
        load.set(bag.id, load.get(bag.id) - item.weightG); load.set(to, load.get(to) + item.weightG);
        raw.push({ itemId: item.id, name: item.name, weightG: item.weightG, from: bag.id, to });
      }
    }
    const merged = [];
    for (const m of raw) {
      const same = merged.find((x) => x.itemId === m.itemId && x.to === m.to);
      if (same) same.qty++; else merged.push({ ...m, qty: 1 });
    }
    return { moves: merged, unresolved, after: trip.bags.map((b) => ({ bagId: b.id, totalG: load.get(b.id), limitG: limit.get(b.id) })) };
  }

  // Applique des déplacements : retire les unités du bagage d'origine, les regroupe avec un objet identique à l'arrivée.
  function applyMoves(trip, moves, newId) {
    let items = trip.items.map((i) => ({ ...i }));
    for (const m of moves) {
      const src = items.find((i) => i.id === m.itemId);
      if (!src || src.bagId !== m.from || src.qty < m.qty || src.fixed || !trip.bags.some((b) => b.id === m.to)) fail('err.moveStale');
      const twin = items.find((i) => i.bagId === m.to && i.name === src.name && i.weightG === src.weightG && !i.fixed && i.id !== src.id);
      if (twin && twin.qty + m.qty <= MAX.qty) { twin.qty += m.qty; src.qty -= m.qty; } // regroupé avec l'objet identique
      else if (src.qty === m.qty) src.bagId = m.to; // tout l'objet change de bagage
      else { src.qty -= m.qty; items.push({ ...src, id: checkId(newId()), qty: m.qty, bagId: m.to }); } // une partie seulement
      items = items.filter((i) => i.qty > 0);
    }
    return { ...trip, items: items.filter((i) => i.qty > 0) };
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  const intIn = (n, a, b) => Number.isSafeInteger(n) && n >= a && n <= b;
  function validateTrip(tr) {
    if (keys(tr) !== 'bags,id,items,limits,name' || !Array.isArray(tr.bags) || !Array.isArray(tr.items) || keys(tr.limits) !== 'cabin,checked,personal') fail('err.backup');
    if (tr.bags.length > MAX.bags || tr.items.length > MAX.items) fail('err.backup');
    for (const k of TYPES) if (!intIn(tr.limits[k], 0, MAX.limitG)) fail('err.backup');
    const bags = tr.bags.map((b) => {
      if (keys(b) !== 'id,name,tareG,type' || !intIn(b.tareG, 0, MAX.tareG)) fail('err.backup');
      return makeBag({ name: b.name, type: b.type, tare: String(b.tareG) }, b.id, 'g');
    });
    const bagIds = new Set(bags.map((b) => b.id));
    const items = tr.items.map((i) => {
      if (keys(i) !== 'bagId,fixed,id,name,qty,weightG' || typeof i.fixed !== 'boolean' || !intIn(i.weightG, 1, MAX.itemG) || !intIn(i.qty, 1, MAX.qty) || !bagIds.has(i.bagId)) fail('err.backup');
      return makeItem({ name: i.name, weight: String(i.weightG), qty: String(i.qty), bagId: i.bagId, fixed: i.fixed }, i.id, 'g');
    });
    const ids = [tr.id, ...bags.map((b) => b.id), ...items.map((i) => i.id)];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return { id: checkId(tr.id), name: cleanName(tr.name), limits: { cabin: tr.limits.cabin, checked: tr.limits.checked, personal: tr.limits.personal }, bags, items };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'travelpackingweight' || data.version !== VERSION || !Array.isArray(data.trips)) fail('err.notBackup');
    if (keys(data) !== 'app,trips,version') fail('err.backup');
    if (data.trips.length > MAX.trips) fail('err.tooManyTrips', { max: MAX.trips });
    const trips = data.trips.map(validateTrip);
    if (new Set(trips.map((t) => t.id)).size !== trips.length) fail('err.backup');
    return trips;
  }
  function backup(trips) { return JSON.stringify({ app: 'travelpackingweight', version: VERSION, trips: validateBackup({ app: 'travelpackingweight', version: VERSION, trips }) }, null, 2); }

  function csvCell(v) { let s = String(v); if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function toCsv(rows) { return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

  root.PackCore = Object.freeze({ VERSION, MAX, TYPES, UNITS, toGrams, parseQty, makeLimits, makeBag, makeItem, makeTrip, totals, summary, suggestMoves, applyMoves, validateBackup, backup, toCsv });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PackCore;
})(typeof window === 'undefined' ? globalThis : window);
