/* CommuteCarbon — logique pure : émissions de trajets réguliers à partir de facteurs saisis par l'utilisateur.
   Unités explicites : distances stockées en mètres entiers (saisie en km ou en miles) ; facteurs en milligrammes
   de CO2e par km (saisie en g CO2e/km, 3 décimales au plus) ; émissions en milligrammes entiers.
   Un facteur « véhicule » (g par véhicule-km) est partagé entre les occupants ; un facteur « passager »
   (g par passager-km) s'applique tel quel à chaque personne. Aucune valeur officielle n'est fournie. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ factors: 30, scenarios: 20, trips: 30, name: 60, maxDistance: 1000, maxMgPerKm: 5000000, maxPassengers: 9, maxWeeks: 53 });
  const UNITS = Object.freeze({ km: 1000, mi: 1609.344 }); // mètres par unité
  const BASES = Object.freeze(['vehicle', 'passenger']);
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const checkId = (id) => { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; };

  // Nombre décimal positif saisi (« 12,5 » ou « 12.5 »), au plus `dec` décimales.
  function parseDecimal(value, dec, key, params) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    const re = new RegExp(`^\\d{1,7}(\\.\\d{1,${dec}})?$`);
    if (!re.test(s)) fail(key, params);
    return s;
  }
  // Décimal exact -> entier à l'échelle 10^dec (sans flottant) : « 171.5 » avec dec=3 -> 171500.
  function scaled(s, dec) {
    const [a, b = ''] = s.split('.');
    return Number(a) * 10 ** dec + Number((b + '0'.repeat(dec)).slice(0, dec));
  }
  function cleanName(v, key = 'err.name') {
    if (typeof v !== 'string') fail(key + 'Required');
    const s = v.replace(/\s+/g, ' ').trim();
    if (/[\u0000-\u001f\u007f]/.test(s)) fail('err.control');
    if (!s) fail(key + 'Required');
    if (s.length > LIMITS.name) fail(key + 'Long', { max: LIMITS.name });
    return s;
  }

  // Distance aller : 0,1 à 1000 dans l'unité choisie (km ou mi), convertie en mètres entiers.
  function parseDistance(value, unit) {
    if (!Object.prototype.hasOwnProperty.call(UNITS, unit)) fail('err.unit');
    const s = parseDecimal(value, 2, 'err.distance', { max: LIMITS.maxDistance });
    const hundredths = scaled(s, 2);
    if (hundredths < 10 || hundredths > LIMITS.maxDistance * 100) fail('err.distance', { max: LIMITS.maxDistance });
    return Math.round(hundredths * UNITS[unit] / 100);
  }
  // Distance stockée -> valeur dans l'unité d'origine (pour la réafficher), 2 décimales.
  const distanceIn = (meters, unit) => Math.round(meters / UNITS[unit] * 100) / 100;

  // Facteur en g CO2e/km (0 accepté : vélo, marche) -> mg CO2e/km entiers.
  function parseFactor(value) {
    const s = parseDecimal(value, 3, 'err.factor', { max: LIMITS.maxMgPerKm / 1000 });
    const mg = scaled(s, 3);
    if (mg > LIMITS.maxMgPerKm) fail('err.factor', { max: LIMITS.maxMgPerKm / 1000 });
    return mg;
  }
  function parseBounded(value, min, max, key) {
    const s = String(value === undefined || value === null ? '' : value).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < min || Number(s) > max) fail(key, { min, max });
    return Number(s);
  }
  const parsePassengers = (v) => parseBounded(v, 1, LIMITS.maxPassengers, 'err.passengers');
  const parseDays = (v) => parseBounded(v, 1, 7, 'err.days');
  const parseWeeks = (v) => parseBounded(v, 1, LIMITS.maxWeeks, 'err.weeks');

  // --- Facteurs, trajets, scénarios
  function makeFactor(input, id) {
    checkId(id);
    if (!isObj(input)) fail('err.backup');
    if (!BASES.includes(input.basis)) fail('err.basis');
    const mgPerKm = typeof input.mgPerKm === 'number' ? input.mgPerKm : parseFactor(input.gPerKm);
    if (!Number.isSafeInteger(mgPerKm) || mgPerKm < 0 || mgPerKm > LIMITS.maxMgPerKm) fail('err.factor', { max: LIMITS.maxMgPerKm / 1000 });
    return { id, name: cleanName(input.name), mgPerKm, basis: input.basis };
  }
  function makeTrip(input, id, factors) {
    checkId(id);
    if (!isObj(input)) fail('err.backup');
    if (!Object.prototype.hasOwnProperty.call(UNITS, input.unit)) fail('err.unit');
    let distanceM;
    if (typeof input.distanceM === 'number') {
      distanceM = input.distanceM;
      if (!Number.isSafeInteger(distanceM) || distanceM < Math.round(UNITS[input.unit] / 10) || distanceM > Math.round(LIMITS.maxDistance * UNITS[input.unit])) fail('err.distance', { max: LIMITS.maxDistance });
    } else distanceM = parseDistance(input.distance, input.unit);
    if (!Array.isArray(factors) || !factors.some((f) => f.id === input.factorId)) fail('err.mode');
    const passengers = typeof input.passengers === 'number' ? parsePassengers(String(input.passengers)) : parsePassengers(input.passengers);
    const daysPerWeek = typeof input.daysPerWeek === 'number' ? parseDays(String(input.daysPerWeek)) : parseDays(input.daysPerWeek);
    if (typeof input.roundTrip !== 'boolean') fail('err.backup');
    return { id, name: cleanName(input.name, 'err.tripName'), distanceM, unit: input.unit, factorId: input.factorId, passengers, roundTrip: input.roundTrip, daysPerWeek };
  }
  function makeScenario(input, id) {
    checkId(id);
    if (!isObj(input)) fail('err.backup');
    const weeksPerYear = typeof input.weeksPerYear === 'number' ? parseWeeks(String(input.weeksPerYear)) : parseWeeks(input.weeksPerYear);
    const trips = input.trips === undefined ? [] : input.trips;
    if (!Array.isArray(trips)) fail('err.backup');
    if (trips.length > LIMITS.trips) fail('err.tripsMany', { max: LIMITS.trips });
    return { id, name: cleanName(input.name, 'err.scenarioName'), weeksPerYear, trips };
  }

  // --- Calculs. Numérateur exact en entiers : mètres × trajets × jours × mg/km ; diviseur : 1000 × occupants.
  // Bornes : 1 000 mi ≈ 1,6e6 m × 2 × 7 × 5e6 mg × 53 semaines ≈ 6e15 < 2^53 : pas de perte de précision.
  function share(trip, factor) { return factor.basis === 'vehicle' ? trip.passengers : 1; }
  function weeklyParts(trip, factor) {
    const legs = trip.roundTrip ? 2 : 1;
    return { num: trip.distanceM * legs * trip.daysPerWeek * factor.mgPerKm, den: 1000 * share(trip, factor), metersWeek: trip.distanceM * legs * trip.daysPerWeek };
  }
  // Émissions d'un trajet : par semaine et par an (votre part), en mg ; distance parcourue par semaine en m.
  function tripEmissions(trip, factor, weeksPerYear) {
    const p = weeklyParts(trip, factor);
    return { weekMg: Math.round(p.num / p.den), yearMg: Math.round(p.num * weeksPerYear / p.den), metersWeek: p.metersWeek };
  }
  // Addition exacte de fractions non négatives, puis arrondi unique au mg.
  // BigInt évite toute perte de précision avant l'arrondi final.
  function sumParts(parts, weeks = 1) {
    let numerator = 0n, denominator = 1n;
    const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
    for (const part of parts) {
      const n = BigInt(part.num), d = BigInt(part.den);
      const g = gcd(denominator, d);
      const nextDen = denominator / g * d;
      numerator = numerator * (d / g) + n * (denominator / g);
      denominator = nextDen;
      const common = gcd(numerator, denominator);
      numerator /= common; denominator /= common;
    }
    const x = Number((2n * numerator * BigInt(weeks) + denominator) / (2n * denominator));
    if (!Number.isSafeInteger(x)) fail('err.backup');
    return x;
  }
  // Totaux d'un scénario : semaine, mois (= année / 12), année ; détail par trajet et par mode.
  function scenarioTotals(scenario, factors) {
    const byId = new Map(factors.map((f) => [f.id, f]));
    const trips = scenario.trips.map((trip) => ({ trip, factor: byId.get(trip.factorId), ...tripEmissions(trip, byId.get(trip.factorId), scenario.weeksPerYear) }));
    const parts = scenario.trips.map((trip) => weeklyParts(trip, byId.get(trip.factorId)));
    const yearMg = sumParts(parts, scenario.weeksPerYear);
    const modes = new Map();
    for (let i = 0; i < trips.length; i++) {
      const id = trips[i].factor.id;
      if (!modes.has(id)) modes.set(id, []);
      modes.get(id).push(parts[i]);
    }
    return {
      weekMg: sumParts(parts), monthMg: Math.round(yearMg / 12), yearMg,
      metersWeek: trips.reduce((a, r) => a + r.metersWeek, 0), trips,
      byMode: [...modes].map(([factorId, group]) => ({ factorId, yearMg: sumParts(group, scenario.weeksPerYear) }))
        .sort((a, b) => b.yearMg - a.yearMg),
    };
  }
  // Comparaison de scénarios par rapport à une référence : écart annuel en mg et en % (1 décimale ; null si référence nulle).
  function compare(scenarios, factors, refId) {
    const totals = scenarios.map((s) => ({ id: s.id, name: s.name, ...scenarioTotals(s, factors) }));
    const ref = totals.find((x) => x.id === refId) || totals[0];
    const max = Math.max(0, ...totals.map((x) => x.yearMg));
    return {
      refId: ref ? ref.id : null,
      rows: totals.map((x) => ({
        id: x.id, name: x.name, weekMg: x.weekMg, monthMg: x.monthMg, yearMg: x.yearMg,
        diffYearMg: ref ? x.yearMg - ref.yearMg : 0,
        diffPct: ref && ref.yearMg > 0 ? Math.round(1000 * (x.yearMg - ref.yearMg) / ref.yearMg) / 10 : null,
        ratio: max ? x.yearMg / max : 0,
      })),
    };
  }
  // Facteur utilisé par combien de trajets (on refuse de supprimer un facteur utilisé).
  function factorUses(data, factorId) { return data.scenarios.reduce((a, s) => a + s.trips.filter((t) => t.factorId === factorId).length, 0); }

  // --- Export CSV : une ligne par trajet et une ligne de total par scénario. Nombres avec le séparateur décimal demandé.
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = {
    head: ['Scénario', 'Trajet', 'Mode', 'Facteur (g CO2e/km)', 'Base du facteur', 'Distance aller', 'Unité', 'Aller-retour', 'Jours par semaine', 'Occupants', 'Semaines par an', 'kg CO2e par semaine', 'kg CO2e par mois', 'kg CO2e par an'],
    basis: { vehicle: 'par véhicule-km', passenger: 'par passager-km' }, yes: 'oui', no: 'non', total: 'Total', decimal: ',',
  };
  // mg -> kg avec 3 décimales, sans flottant ; signe conservé.
  function kg(mg, decimal) {
    const neg = mg < 0, a = Math.abs(mg), g = Math.round(a / 1000);
    const s = `${Math.floor(g / 1000)}${decimal}${String(g % 1000).padStart(3, '0')}`;
    return (neg && g ? '-' : '') + s;
  }
  const dec = (n, decimal) => String(n).replace('.', decimal);
  function csv(data, texts = DEFAULT_TEXTS) {
    const d = texts.decimal === '.' ? '.' : ',', sep = d === ',' ? ';' : ',';
    const byId = new Map(data.factors.map((f) => [f.id, f]));
    const rows = [texts.head];
    for (const s of data.scenarios) {
      const tot = scenarioTotals(s, data.factors);
      for (const r of tot.trips) {
        const f = byId.get(r.trip.factorId);
        rows.push([s.name, r.trip.name, f.name, dec(f.mgPerKm / 1000, d), texts.basis[f.basis], dec(distanceIn(r.trip.distanceM, r.trip.unit), d), r.trip.unit,
          r.trip.roundTrip ? texts.yes : texts.no, r.trip.daysPerWeek, f.basis === 'vehicle' ? r.trip.passengers : '', s.weeksPerYear,
          kg(r.weekMg, d), kg(Math.round(r.yearMg / 12), d), kg(r.yearMg, d)]);
      }
      rows.push([s.name, texts.total, '', '', '', '', '', '', '', '', s.weeksPerYear, kg(tot.weekMg, d), kg(tot.monthMg, d), kg(tot.yearMg, d)]);
    }
    return '﻿' + rows.map((row) => row.map(csvCell).join(sep)).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde { app, version, factors, scenarios }, validée champ par champ.
  function emptyData() { return { factors: [], scenarios: [] }; }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'commutecarbon' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'factors', 'scenarios']) || !Array.isArray(data.factors) || !Array.isArray(data.scenarios)) fail('err.backup');
    if (data.factors.length > LIMITS.factors) fail('err.factorsMany', { max: LIMITS.factors });
    if (data.scenarios.length > LIMITS.scenarios) fail('err.scenariosMany', { max: LIMITS.scenarios });
    const factors = data.factors.map((f) => {
      if (!isObj(f) || !keysAre(f, ['id', 'name', 'mgPerKm', 'basis']) || typeof f.mgPerKm !== 'number') fail('err.backup');
      return makeFactor(f, f.id);
    });
    if (new Set(factors.map((f) => f.id)).size !== factors.length) fail('err.backup');
    const tripIds = new Set();
    const scenarios = data.scenarios.map((s) => {
      if (!isObj(s) || !keysAre(s, ['id', 'name', 'weeksPerYear', 'trips']) || typeof s.weeksPerYear !== 'number' || !Number.isSafeInteger(s.weeksPerYear) || !Array.isArray(s.trips)) fail('err.backup');
      const trips = s.trips.map((t) => {
        if (!isObj(t) || !keysAre(t, ['id', 'name', 'distanceM', 'unit', 'factorId', 'passengers', 'roundTrip', 'daysPerWeek'])) fail('err.backup');
        if (typeof t.distanceM !== 'number' || !Number.isSafeInteger(t.passengers) || !Number.isSafeInteger(t.daysPerWeek)) fail('err.backup');
        const trip = makeTrip(t, t.id, factors);
        if (tripIds.has(trip.id)) fail('err.backup');
        tripIds.add(trip.id); return trip;
      });
      return makeScenario({ name: s.name, weeksPerYear: s.weeksPerYear, trips }, s.id);
    });
    if (new Set(scenarios.map((s) => s.id)).size !== scenarios.length) fail('err.backup');
    return { factors, scenarios };
  }
  function backup(data) {
    const clean = validateBackup({ app: 'commutecarbon', version: VERSION, factors: data.factors, scenarios: data.scenarios });
    return JSON.stringify({ app: 'commutecarbon', version: VERSION, ...clean }, null, 2);
  }

  root.CommuteCore = Object.freeze({
    VERSION, LIMITS, UNITS, BASES, parseDistance, distanceIn, parseFactor, parsePassengers, parseDays, parseWeeks,
    makeFactor, makeTrip, makeScenario, tripEmissions, scenarioTotals, compare, factorUses, csv, csvCell, kg, emptyData, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CommuteCore;
})(typeof window === 'undefined' ? globalThis : window);
