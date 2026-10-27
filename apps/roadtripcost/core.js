/* RoadTripCost — logique pure : coût d'un voyage routier par étape et par personne.
   Montants en centimes entiers ; distances en mètres ; consommation en millilitres aux 100 km ;
   prix du carburant en millièmes d'unité monétaire par litre. Aucun prix ni consommation n'est
   fourni : tout est saisi par l'utilisateur (calculs sur hypothèses). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ trips: 30, stages: 60, passengers: 20, name: 60, distanceM: 5000000, consMl: 50000, priceMillis: 99999, cents: 9999999 });
  const ID = /^[a-z0-9-]{6,64}$/i;
  // Conversions exactes : mile international, gallons US et impérial.
  const DIST = Object.freeze({ km: 1000, mi: 1609.344 });
  const VOLUME = Object.freeze({ l: 1, galus: 3.785411784, galuk: 4.54609 });
  const CONS = Object.freeze(['l100', 'kml', 'mpgus', 'mpguk']);
  const COSTS = Object.freeze(['tollsCents', 'lodgingCents', 'mealsCents', 'otherCents']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanName(v, key = 'err.nameRequired') {
    if (typeof v !== 'string' || !v.trim()) fail(key);
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    if (/[\u0000-\u001f]/.test(v)) fail(key);
    return v.trim();
  }
  // Nombre décimal positif saisi (« 6,5 » ou « 6.5 »), au plus `dec` décimales.
  function parseDec(value, key, dec = 3) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (!new RegExp(`^\\d{1,7}(\\.\\d{1,${dec}})?$`).test(s)) fail(key);
    return Number(s);
  }
  // Montant saisi -> centimes (vide = 0).
  function parseCents(value, key = 'err.amount') {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return 0;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const c = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (c > MAX.cents) fail(key);
    return c;
  }

  // --- Unités
  function toMeters(value, unit) {
    if (!Object.prototype.hasOwnProperty.call(DIST, unit)) fail('err.unit');
    const m = Math.round(parseDec(value, 'err.distance', 1) * DIST[unit]);
    if (m < 100 || m > MAX.distanceM) fail('err.distance');
    return m;
  }
  // Consommation saisie -> mL aux 100 km. km/L et mpg sont inversés (plus c'est grand, moins on consomme).
  function toMlPer100(value, unit) {
    if (!CONS.includes(unit)) fail('err.unit');
    const v = parseDec(value, 'err.consumption', 2);
    if (v <= 0) fail('err.consumption');
    const l100 = unit === 'l100' ? v : unit === 'kml' ? 100 / v : (100 * VOLUME[unit === 'mpgus' ? 'galus' : 'galuk']) / (v * DIST.mi / 1000);
    const ml = Math.round(l100 * 1000);
    if (ml < 500 || ml > MAX.consMl) fail('err.consumption'); // entre 0,5 et 50 L/100 km
    return ml;
  }
  // Prix saisi par litre ou par gallon -> millièmes d'unité monétaire par litre.
  function toPriceMillis(value, unit) {
    if (!Object.prototype.hasOwnProperty.call(VOLUME, unit)) fail('err.unit');
    const p = Math.round(parseDec(value, 'err.price', 3) * 1000 / VOLUME[unit]);
    if (p < 1 || p > MAX.priceMillis) fail('err.price');
    return p;
  }

  // --- Constructeurs
  function makeTrip(name, id) { return { id: checkId(id), name: cleanName(name), consMl: 0, priceMillis: 0, passengers: [], stages: [] }; }
  function makeVehicle(input) { return { consMl: toMlPer100(input.consumption, input.consUnit), priceMillis: toPriceMillis(input.price, input.priceUnit) }; }
  function makePassenger(name, id) { return { id: checkId(id), name: cleanName(name, 'err.passengerRequired') }; }
  // riders : null = tous les passagers ; sinon la liste de ceux qui partagent cette étape.
  function makeStage(input, id, passengers) {
    const st = {
      id: checkId(id), name: cleanName(input.name, 'err.stageRequired'), distanceM: toMeters(input.distance, input.distUnit),
      priceMillis: input.price === undefined || String(input.price).trim() === '' ? null : toPriceMillis(input.price, input.priceUnit),
      tollsCents: parseCents(input.tolls), lodgingCents: parseCents(input.lodging), mealsCents: parseCents(input.meals), otherCents: parseCents(input.other),
      riders: null,
    };
    if (Array.isArray(input.riders)) {
      const known = new Set(passengers.map((p) => p.id));
      const riders = [...new Set(input.riders)];
      if (!riders.length) fail('err.noRider');
      if (riders.some((r) => !known.has(r))) fail('err.id');
      // Tous cochés = « tous » (un passager ajouté plus tard partagera aussi l'étape).
      st.riders = riders.length === passengers.length ? null : passengers.map((p) => p.id).filter((p) => riders.includes(p));
    }
    return st;
  }

  // --- Calculs
  // Partage d'un montant en centimes : parts égales ; les centimes restants vont à tour de rôle
  // (décalage selon le rang de l'étape) pour que le total soit exact sans pénaliser toujours le même.
  function split(cents, ids, offset = 0) {
    if (!ids.length) return {};
    const n = ids.length, base = Math.floor(cents / n), extra = cents % n, out = {};
    ids.forEach((id, i) => { out[id] = base + (((i - offset) % n + n) % n < extra ? 1 : 0); });
    return out;
  }
  function stageCost(trip, st, index = 0) {
    const price = st.priceMillis === null ? trip.priceMillis : st.priceMillis;
    const fuelMl = Math.round(st.distanceM * trip.consMl / 100000); // m × mL/100 km
    // centimes = m × mL/100km × millièmes/L / 1e9 (entier exact avant l'arrondi final)
    const fuelCents = Math.round(st.distanceM * trip.consMl * price / 1e9);
    const extras = COSTS.reduce((s, k) => s + st[k], 0);
    const riders = st.riders === null ? trip.passengers.map((p) => p.id) : st.riders;
    const total = fuelCents + extras;
    return { id: st.id, name: st.name, distanceM: st.distanceM, priceMillis: price, fuelMl, fuelCents, extrasCents: extras, totalCents: total, riders, shares: split(total, riders, index) };
  }
  function summary(trip) {
    const stages = trip.stages.map((s, i) => stageCost(trip, s, i));
    const sum = (k) => stages.reduce((s, x) => s + x[k], 0);
    const byCat = { fuelCents: sum('fuelCents') };
    for (const k of COSTS) byCat[k] = trip.stages.reduce((s, x) => s + x[k], 0);
    const people = trip.passengers.map((p) => ({ id: p.id, name: p.name, cents: stages.reduce((s, x) => s + (x.shares[p.id] || 0), 0), stages: stages.filter((x) => x.riders.includes(p.id)).length }));
    const distanceM = sum('distanceM'), totalCents = sum('totalCents');
    return {
      stages, people, byCat, distanceM, fuelMl: sum('fuelMl'), totalCents,
      perKmCents: distanceM ? Math.round(totalCents * 1000 / distanceM) : 0,
      unshared: stages.filter((x) => !x.riders.length).reduce((s, x) => s + x.totalCents, 0), // étapes sans passager : non réparties
      ready: trip.consMl > 0 && trip.priceMillis > 0,
    };
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  const intIn = (n, a, b) => Number.isSafeInteger(n) && n >= a && n <= b;
  function validateTrip(tr) {
    if (keys(tr) !== 'consMl,id,name,passengers,priceMillis,stages' || !Array.isArray(tr.passengers) || !Array.isArray(tr.stages)) fail('err.backup');
    if (tr.passengers.length > MAX.passengers) fail('err.tooManyPassengers', { max: MAX.passengers });
    if (tr.stages.length > MAX.stages) fail('err.tooManyStages', { max: MAX.stages });
    if (!(tr.consMl === 0 || intIn(tr.consMl, 500, MAX.consMl)) || !intIn(tr.priceMillis, 0, MAX.priceMillis)) fail('err.backup');
    const trip = { ...makeTrip(tr.name, tr.id), consMl: tr.consMl, priceMillis: tr.priceMillis };
    trip.passengers = tr.passengers.map((p) => { if (keys(p) !== 'id,name') fail('err.backup'); return makePassenger(p.name, p.id); });
    const pids = new Set(trip.passengers.map((p) => p.id));
    trip.stages = tr.stages.map((s) => {
      if (keys(s) !== 'distanceM,id,lodgingCents,mealsCents,name,otherCents,priceMillis,riders,tollsCents') fail('err.backup');
      if (!intIn(s.distanceM, 100, MAX.distanceM) || !(s.priceMillis === null || intIn(s.priceMillis, 1, MAX.priceMillis))) fail('err.backup');
      for (const k of COSTS) if (!intIn(s[k], 0, MAX.cents)) fail('err.backup');
      if (!(s.riders === null || (Array.isArray(s.riders) && s.riders.length && s.riders.every((r) => pids.has(r)) && new Set(s.riders).size === s.riders.length))) fail('err.backup');
      return { id: checkId(s.id), name: cleanName(s.name, 'err.stageRequired'), distanceM: s.distanceM, priceMillis: s.priceMillis, tollsCents: s.tollsCents, lodgingCents: s.lodgingCents, mealsCents: s.mealsCents, otherCents: s.otherCents, riders: s.riders === null ? null : [...s.riders] };
    });
    const ids = [trip.id, ...trip.passengers.map((p) => p.id), ...trip.stages.map((s) => s.id)];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return trip;
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'roadtripcost' || data.version !== VERSION || !Array.isArray(data.trips)) fail('err.notBackup');
    if (keys(data) !== 'app,trips,version') fail('err.backup');
    if (data.trips.length > MAX.trips) fail('err.tooManyTrips', { max: MAX.trips });
    const trips = data.trips.map(validateTrip);
    if (new Set(trips.map((t) => t.id)).size !== trips.length) fail('err.backup');
    return trips;
  }
  function backup(trips) { return JSON.stringify({ app: 'roadtripcost', version: VERSION, trips: validateBackup({ app: 'roadtripcost', version: VERSION, trips }) }, null, 2); }

  // CSV pour tableur (séparateur « ; », BOM UTF-8, cellules protégées contre les formules).
  function csvCell(v) { let s = String(v); if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function toCsv(rows) { return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

  root.RoadCore = Object.freeze({ VERSION, MAX, DIST, VOLUME, CONS, COSTS, parseDec, parseCents, toMeters, toMlPer100, toPriceMillis, makeTrip, makeVehicle, makePassenger, makeStage, split, stageCost, summary, validateBackup, backup, toCsv });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RoadCore;
})(typeof window === 'undefined' ? globalThis : window);
