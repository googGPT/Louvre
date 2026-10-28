/* HomeEnergyLog — logique pure : relevés de compteurs, consommations entre relevés, par jour et par mois,
   comparaison de périodes, détection d'un relevé en baisse, coût sur un prix unitaire saisi.
   Unités internes entières : index en millièmes d'unité (milli), prix en 1/10 000 de devise par unité,
   montants en centimes, dates en jours civils « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ meters: 10, readings: 2000, name: 40 });
  // Unités autorisées par type de compteur (le gaz peut être relevé en m³ ou en kWh).
  const KINDS = Object.freeze({ electricity: ['kWh'], gas: ['m3', 'kWh'], water: ['m3', 'L'] });
  const ID = /^[a-z0-9-]{6,64}$/i;
  const DAY_MS = 86400000;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }

  // --- Jours civils (calculs en UTC : aucun piège d'heure d'été)
  function parseDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('err.date');
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (y < 1990 || y > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) fail('err.date');
    return s;
  }
  const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
  const numDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  const monthStart = (n) => numDay(n).slice(0, 8) + '01';
  function nextMonth(day) { const [y, m] = day.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; }

  // Décimal saisi -> entier à l'échelle 10^dec.
  function parseScaled(value, dec, key, min, max) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (!new RegExp(`^\\d{1,9}(\\.\\d{1,${dec}})?$`).test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const n = Number(a) * 10 ** dec + Number((b + '0'.repeat(dec)).slice(0, dec));
    if (n < min || n > max) fail(key);
    return n;
  }
  const parseIndex = (v) => parseScaled(v, 3, 'err.value', 0, 99999999999); // index 0 à 99 999 999,999
  const parsePrice = (v) => parseScaled(v, 4, 'err.unitPrice', 1, 999999); // 0,0001 à 99,9999 par unité

  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return v.trim();
  }

  // --- Constructeurs
  function makeMeter(input, id) {
    if (!Object.prototype.hasOwnProperty.call(KINDS, input.kind)) fail('err.kind');
    if (!KINDS[input.kind].includes(input.unit)) fail('err.unit');
    const p = input.price === undefined || input.price === null || String(input.price).trim() === '' ? 0 : parsePrice(input.price);
    return { id: checkId(id), name: cleanName(input.name), kind: input.kind, unit: input.unit, price1e4: p, readings: [] };
  }
  function makeReading(input, id) {
    return { id: checkId(id), day: parseDay(input.day), valueMilli: parseIndex(input.value), reset: input.reset === true };
  }
  const sortReadings = (rs) => [...rs].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  // Contrôle d'un nouveau relevé par rapport à ses voisins (date unique, index croissant sauf compteur remplacé).
  function checkReading(meter, r) {
    if (meter.readings.some((x) => x.day === r.day && x.id !== r.id)) fail('err.duplicateDay');
    if (meter.readings.length >= MAX.readings && !meter.readings.some((x) => x.id === r.id)) fail('err.tooManyReadings', { max: MAX.readings });
    const others = sortReadings(meter.readings.filter((x) => x.id !== r.id));
    const prev = [...others].reverse().find((x) => x.day < r.day), next = others.find((x) => x.day > r.day);
    if (prev && !r.reset && r.valueMilli < prev.valueMilli) fail('err.decrease', { day: prev.day, value: prev.valueMilli / 1000 });
    if (next && !next.reset && next.valueMilli < r.valueMilli) fail('err.decreaseNext', { day: next.day, value: next.valueMilli / 1000 });
    return r;
  }
  function addReading(meter, r) { checkReading(meter, r); return { ...meter, readings: sortReadings([...meter.readings.filter((x) => x.id !== r.id), r]) }; }

  // Coût en centimes, arrondi au plus proche : milli/1000 unités × price1e4/10 000 × 100 = milli × price1e4 / 100 000.
  function costCents(milli, price1e4) {
    if (!price1e4) return null;
    const num = BigInt(Math.round(milli)) * BigInt(price1e4);
    return Number((num + 50000n) / 100000n);
  }

  // Périodes entre relevés consécutifs. Relevé « reset » (compteur remplacé) : la période qui y mène est ignorée.
  // Relevé en baisse sans reset : anomalie signalée, consommation non comptée.
  function periods(meter) {
    const rs = sortReadings(meter.readings), out = [];
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1], b = rs[i], days = dayNum(b.day) - dayNum(a.day);
      const base = { from: a.day, to: b.day, days, fromId: a.id, toId: b.id };
      if (b.reset) { out.push({ ...base, status: 'reset', milli: null }); continue; }
      if (b.valueMilli < a.valueMilli) { out.push({ ...base, status: 'decrease', milli: null }); continue; }
      const milli = b.valueMilli - a.valueMilli;
      out.push({ ...base, status: 'ok', milli, perDayMilli: milli / days, costCents: costCents(milli, meter.price1e4) });
    }
    return out;
  }

  // Consommation entre deux jours [from, to[ en répartissant chaque période uniformément sur ses jours.
  function consumptionBetween(meter, from, to) {
    parseDay(from); parseDay(to);
    const f = dayNum(from), t = dayNum(to);
    if (t <= f) fail('err.range');
    let sum = 0, covered = 0;
    for (const p of periods(meter)) {
      if (p.status !== 'ok') continue;
      const a = Math.max(f, dayNum(p.from)), b = Math.min(t, dayNum(p.to));
      if (b <= a) continue;
      sum += p.milli * (b - a) / p.days; covered += b - a;
    }
    const milli = Math.round(sum), days = t - f;
    return { from, to, days, coveredDays: covered, complete: covered === days, milli, perDayMilli: covered ? sum / covered : null, costCents: costCents(milli, meter.price1e4) };
  }

  // Consommation par mois civil, sur les mois touchés par au moins une période valide.
  function monthly(meter) {
    const ok = periods(meter).filter((p) => p.status === 'ok');
    if (!ok.length) return [];
    const first = monthStart(Math.min(...ok.map((p) => dayNum(p.from)))), lastDay = Math.max(...ok.map((p) => dayNum(p.to)));
    const out = [];
    for (let m = first; dayNum(m) < lastDay; m = nextMonth(m)) {
      const c = consumptionBetween(meter, m, nextMonth(m));
      if (c.coveredDays) out.push({ month: m.slice(0, 7), ...c });
    }
    return out;
  }

  // Comparaison de deux périodes : écart de la moyenne par jour (sur les jours couverts).
  function compare(meter, a, b) {
    const A = consumptionBetween(meter, a.from, a.to), B = consumptionBetween(meter, b.from, b.to);
    if (!A.coveredDays || !B.coveredDays) fail('err.noData');
    const diffPct = A.perDayMilli ? Math.round(1000 * (B.perDayMilli - A.perDayMilli) / A.perDayMilli) / 10 : null;
    return { a: A, b: B, diffPct };
  }

  // Synthèse : total, moyenne par jour, nombre d'anomalies.
  function summary(meter) {
    const ps = periods(meter), ok = ps.filter((p) => p.status === 'ok');
    const milli = ok.reduce((s, p) => s + p.milli, 0), days = ok.reduce((s, p) => s + p.days, 0);
    return { milli, days, perDayMilli: days ? milli / days : null, costCents: costCents(milli, meter.price1e4), anomalies: ps.filter((p) => p.status === 'decrease').length, last: ok.length ? ok[ok.length - 1] : null };
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateMeter(m) {
    if (keys(m) !== 'id,kind,name,price1e4,readings,unit' || !Array.isArray(m.readings)) fail('err.backup');
    if (!(m.price1e4 === 0 || (Number.isSafeInteger(m.price1e4) && m.price1e4 > 0 && m.price1e4 <= 999999))) fail('err.backup');
    if (m.readings.length > MAX.readings) fail('err.tooManyReadings', { max: MAX.readings });
    const meter = makeMeter({ name: m.name, kind: m.kind, unit: m.unit, price: m.price1e4 ? (m.price1e4 / 1e4).toFixed(4) : '' }, m.id);
    const readings = m.readings.map((r) => {
      if (keys(r) !== 'day,id,reset,valueMilli' || typeof r.reset !== 'boolean' || !Number.isSafeInteger(r.valueMilli) || r.valueMilli < 0 || r.valueMilli > 99999999999) fail('err.backup');
      return makeReading({ day: r.day, value: (r.valueMilli / 1000).toFixed(3), reset: r.reset }, r.id);
    });
    // Les baisses déjà enregistrées sont acceptées (elles sont signalées comme anomalies), mais pas les doublons.
    if (new Set(readings.map((r) => r.day)).size !== readings.length || new Set(readings.map((r) => r.id)).size !== readings.length) fail('err.backup');
    return { ...meter, readings: sortReadings(readings) };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'homeenergylog' || data.version !== VERSION || !Array.isArray(data.meters)) fail('err.notBackup');
    if (keys(data) !== 'app,meters,version') fail('err.backup');
    if (data.meters.length > MAX.meters) fail('err.tooManyMeters', { max: MAX.meters });
    const meters = data.meters.map(validateMeter);
    const ids = [...meters.map((m) => m.id), ...meters.flatMap((m) => m.readings.map((r) => r.id))];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return meters;
  }
  function backup(meters) { return JSON.stringify({ app: 'homeenergylog', version: VERSION, meters: validateBackup({ app: 'homeenergylog', version: VERSION, meters }) }, null, 2); }

  function csvCell(v) { let s = String(v); if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function toCsv(rows) { return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

  root.EnergyCore = Object.freeze({ VERSION, MAX, KINDS, parseDay, dayNum, numDay, nextMonth, parseIndex, parsePrice, makeMeter, makeReading, checkReading, addReading, costCents, periods, consumptionBetween, monthly, compare, summary, validateBackup, backup, toCsv });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EnergyCore;
})(typeof window === 'undefined' ? globalThis : window);
