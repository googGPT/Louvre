/* PetCareLog — logique pure : animaux, soins récurrents (vaccins, vermifuges, toilettage…) aux récurrences saisies,
   rendez-vous, suivi du poids, dépenses par animal et par catégorie, exports CSV et .ics.
   Aucun conseil vétérinaire : chaque récurrence est saisie par l'utilisateur.
   Montants en centimes entiers ; poids en grammes entiers ; dates en jours civils « AAAA-MM-JJ » (calculs en UTC). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const CARE_TYPES = Object.freeze(['vaccine', 'deworm', 'flea', 'grooming', 'checkup', 'other']);
  const UNITS = Object.freeze(['day', 'week', 'month', 'year']); // unité de la récurrence
  const EXPENSE_CATS = Object.freeze(['food', 'vet', 'meds', 'grooming', 'insurance', 'gear', 'other']);
  const MAX_PETS = 30, MAX_CARES = 300, MAX_APPTS = 500, MAX_WEIGHTS = 2000, MAX_EXPENSES = 5000;
  const MAX_NAME = 40, MAX_LABEL = 60, MAX_NOTE = 200, MAX_EVERY = 120, MAX_GRAMS = 1000000, MAX_CENTS = 99999999;
  const MAX_ICS_EVENTS = 3000, MAX_HORIZON = 730;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');

  // --- Jours civils
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function toUTC(day) { if (!isDay(day)) fail('err.date'); const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
  function addDays(day, n) { return fromUTC(toUTC(day) + n * 86400000); }
  function dayDiff(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); }
  // Ajout de mois ancré : le 31 janvier + 1 mois = 28 (ou 29) février ; jamais de débordement sur le mois suivant.
  function addMonths(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    const idx = (y * 12 + (m - 1)) + n, ny = Math.floor(idx / 12), nm = idx % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return fromUTC(Date.UTC(ny, nm, Math.min(d, last)));
  }
  function addInterval(day, n, unit) {
    if (!isDay(day)) fail('err.date');
    switch (unit) {
      case 'day': return addDays(day, n);
      case 'week': return addDays(day, 7 * n);
      case 'month': return addMonths(day, n);
      case 'year': return addMonths(day, 12 * n);
      default: return fail('err.unit');
    }
  }

  // --- Saisies
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function text(v, max, required, keyRequired, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    return s;
  }
  // « 12,50 » ou « 12.5 » -> 1250 centimes.
  function parseCents(value) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) fail('err.amount');
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents <= 0) fail('err.amount');
    return cents;
  }
  // Poids saisi avec son unité (kg à 3 décimales au plus, ou g entiers) -> grammes entiers.
  function parseGrams(value, unit) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(',', '.');
    let g;
    if (unit === 'kg') { if (!/^\d{1,4}(\.\d{1,3})?$/.test(s)) fail('err.weight'); const [a, b = ''] = s.split('.'); g = Number(a) * 1000 + Number((b + '000').slice(0, 3)); }
    else if (unit === 'g') { if (!/^\d{1,7}$/.test(s)) fail('err.weight'); g = Number(s); }
    else fail('err.unit');
    if (g <= 0 || g > MAX_GRAMS) fail('err.weight');
    return g;
  }
  function parseEvery(value) {
    const s = String(value === undefined || value === null ? '' : value).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > MAX_EVERY) fail('err.every', { max: MAX_EVERY });
    return Number(s);
  }
  function checkTime(v) {
    if (v === '' || v === undefined || v === null) return '';
    if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail('err.time');
    return v;
  }

  function makePet(input, id) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    const birth = input.birth === undefined || input.birth === null ? '' : input.birth;
    if (birth !== '' && !isDay(birth)) fail('err.birth');
    return { id, name: text(input.name, MAX_NAME, true, 'err.petName', 'err.nameLong'), species: text(input.species, MAX_NAME, false, '', 'err.speciesLong'), birth };
  }
  // Soin récurrent : « tous les {every} {unit} », à partir du dernier soin fait (last).
  function makeCare(input, id, pets, today) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!pets.some((p) => p.id === input.petId)) fail('err.petUnknown');
    if (!CARE_TYPES.includes(input.type)) fail('err.careType');
    const label = text(input.label, MAX_LABEL, false, '', 'err.labelLong');
    const every = parseEvery(input.every);
    if (!UNITS.includes(input.unit)) fail('err.unit');
    if (!isDay(input.last)) fail('err.last');
    if (isDay(today) && dayDiff(input.last, today) > 0) fail('err.lastFuture');
    return { id, petId: input.petId, type: input.type, label, every, unit: input.unit, last: input.last, note: text(input.note, MAX_NOTE, false, '', 'err.noteLong') };
  }
  function makeAppt(input, id, pets) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!pets.some((p) => p.id === input.petId)) fail('err.petUnknown');
    const title = text(input.title, MAX_LABEL, true, 'err.apptTitle', 'err.labelLong'); // vérifiés dans l'ordre du formulaire
    if (!isDay(input.date)) fail('err.date');
    return { id, petId: input.petId, date: input.date, time: checkTime(input.time), title, place: text(input.place, MAX_LABEL, false, '', 'err.labelLong') };
  }
  function makeWeight(input, id, pets, today) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!pets.some((p) => p.id === input.petId)) fail('err.petUnknown');
    if (!isDay(input.date)) fail('err.date');
    if (isDay(today) && dayDiff(input.date, today) > 0) fail('err.dateFuture');
    const grams = typeof input.grams === 'number' ? input.grams : parseGrams(input.value, input.unit);
    if (!Number.isSafeInteger(grams) || grams <= 0 || grams > MAX_GRAMS) fail('err.weight');
    return { id, petId: input.petId, date: input.date, grams };
  }
  function makeExpense(input, id, pets) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!pets.some((p) => p.id === input.petId)) fail('err.petUnknown');
    if (!isDay(input.date)) fail('err.date');
    if (!EXPENSE_CATS.includes(input.category)) fail('err.category');
    const cents = typeof input.cents === 'number' ? input.cents : parseCents(input.amount);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) fail('err.amount');
    return { id, petId: input.petId, date: input.date, category: input.category, cents, label: text(input.label, MAX_LABEL, false, '', 'err.labelLong') };
  }

  // --- Soins : échéances
  function nextDue(care) { return addInterval(care.last, care.every, care.unit); }
  function careStatus(care, today) {
    const next = nextDue(care), days = dayDiff(next, today);
    return { next, days, state: days < 0 ? 'late' : days === 0 ? 'today' : days <= 14 ? 'soon' : 'ok' };
  }
  // Soin fait le jour `date` : il devient le nouveau point de départ (jamais reculé, jamais dans le futur).
  function markCareDone(care, date, today) {
    if (!isDay(date)) fail('err.date');
    if (isDay(today) && dayDiff(date, today) > 0) fail('err.dateFuture');
    return dayDiff(date, care.last) > 0 ? { ...care, last: date } : care;
  }
  function caresFor(cares, petId, today) {
    return cares.filter((c) => c.petId === petId).map((c) => ({ ...c, ...careStatus(c, today) }))
      .sort((a, b) => a.days - b.days || CARE_TYPES.indexOf(a.type) - CARE_TYPES.indexOf(b.type));
  }
  function apptsFor(appts, petId, today) {
    const list = appts.filter((a) => a.petId === petId).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
    return { upcoming: list.filter((a) => dayDiff(a.date, today) >= 0), past: list.filter((a) => dayDiff(a.date, today) < 0).reverse() };
  }

  // --- Poids
  function weightSeries(weights, petId) {
    return weights.filter((w) => w.petId === petId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1)));
  }
  function weightStats(series) {
    if (!series.length) return null;
    const first = series[0], last = series[series.length - 1];
    const grams = series.map((w) => w.grams);
    return { count: series.length, first, last, minGrams: Math.min(...grams), maxGrams: Math.max(...grams), changeGrams: last.grams - first.grams,
      changePermil: Math.round(1000 * (last.grams - first.grams) / first.grams) }; // ‰ : l'interface l'affiche en %
  }
  // Coordonnées du graphique (SVG) : x proportionnel au temps réel, y au poids ; marges d'au moins 5 % autour des valeurs.
  function chartGeometry(series, width, height, pad) {
    if (!series.length) return null;
    const t0 = toUTC(series[0].date), t1 = toUTC(series[series.length - 1].date), span = Math.max(1, t1 - t0);
    let lo = Math.min(...series.map((w) => w.grams)), hi = Math.max(...series.map((w) => w.grams));
    const margin = Math.max(Math.round((hi - lo) * 0.1), Math.round(hi * 0.05), 1);
    lo = Math.max(0, lo - margin); hi += margin;
    const iw = width - pad.left - pad.right, ih = height - pad.top - pad.bottom;
    const x = (day) => pad.left + (series.length === 1 ? iw / 2 : iw * (toUTC(day) - t0) / span);
    const y = (g) => pad.top + ih * (hi - g) / (hi - lo);
    const r = (v) => Math.round(v * 10) / 10;
    return { lo, hi, points: series.map((w) => ({ id: w.id, date: w.date, grams: w.grams, x: r(x(w.date)), y: r(y(w.grams)) })),
      ticks: [hi, Math.round((hi + lo) / 2), lo].map((g) => ({ grams: g, y: r(y(g)) })) };
  }

  // --- Dépenses
  function expenseTotals(expenses, filter = {}) {
    const byCategory = {}, byPet = {};
    let total = 0, count = 0;
    for (const e of expenses) {
      if (filter.petId && e.petId !== filter.petId) continue;
      if (filter.year && e.date.slice(0, 4) !== String(filter.year)) continue;
      total += e.cents; count += 1;
      byCategory[e.category] = (byCategory[e.category] || 0) + e.cents;
      byPet[e.petId] = (byPet[e.petId] || 0) + e.cents;
    }
    return { total, count, byCategory, byPet };
  }
  function years(expenses) { return [...new Set(expenses.map((e) => e.date.slice(0, 4)))].sort().reverse(); }

  // --- CSV (séparateur « ; », BOM UTF-8, protection contre les formules)
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function centsText(cents, decimal) { return `${Math.floor(cents / 100)}${decimal === 'comma' ? ',' : '.'}${String(cents % 100).padStart(2, '0')}`; }
  function gramsText(g, decimal) { return `${Math.floor(g / 1000)}${decimal === 'comma' ? ',' : '.'}${String(g % 1000).padStart(3, '0')}`; }
  function expensesCSV(expenses, opts) {
    const { headers, petName, catLabel, decimal } = opts;
    if (!Array.isArray(headers) || headers.length !== 5) fail('err.headers');
    const rows = [...expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const lines = [headers.map(csvCell).join(';')];
    for (const e of rows) lines.push([e.date, csvCell(petName(e.petId)), csvCell(catLabel(e.category)), csvCell(e.label), centsText(e.cents, decimal)].join(';'));
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }
  function weightsCSV(weights, opts) {
    const { headers, petName, decimal } = opts;
    if (!Array.isArray(headers) || headers.length !== 3) fail('err.headers');
    const rows = [...weights].sort((a, b) => (a.petId === b.petId ? (a.date < b.date ? -1 : 1) : (petName(a.petId) < petName(b.petId) ? -1 : 1)));
    const lines = [headers.map(csvCell).join(';')];
    for (const w of rows) lines.push([w.date, csvCell(petName(w.petId)), gramsText(w.grams, decimal)].join(';'));
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  // --- Agenda .ics : soins (occurrences calculées sur la période, ancrées sur le dernier soin) et rendez-vous.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  function careOccurrences(care, from, to) {
    const out = [];
    for (let k = 1; ; k += 1) {
      const day = addInterval(care.last, k * care.every, care.unit);
      if (dayDiff(day, to) > 0) break;
      if (dayDiff(day, from) >= 0) out.push(day);
      else if (!out.length && dayDiff(addInterval(care.last, (k + 1) * care.every, care.unit), from) > 0) out.push(from); // retard : à faire dès `from`
      if (out.length > MAX_ICS_EVENTS) fail('err.icsTooMany', { max: MAX_ICS_EVENTS });
    }
    return out;
  }
  function toICS(data, from, days, stamp, txt) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    if (!Number.isInteger(days) || days < 1 || days > MAX_HORIZON) fail('err.horizon');
    if (!txt || typeof txt.care !== 'function' || typeof txt.appt !== 'function') fail('err.icsText');
    const to = addDays(from, days - 1), d8 = (d) => d.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//PetCareLog//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    let count = 0;
    const push = (ev) => { count += 1; if (count > MAX_ICS_EVENTS) fail('err.icsTooMany', { max: MAX_ICS_EVENTS }); lines.push(...ev); };
    for (const c of data.cares) for (const day of careOccurrences(c, from, to)) {
      push(['BEGIN:VEVENT', `UID:${c.id}-${d8(day)}@petcarelog.louvre`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(day)}`, `DTEND;VALUE=DATE:${d8(addDays(day, 1))}`,
        fold(`SUMMARY:${icsEscape(txt.care(c))}`), 'TRANSP:TRANSPARENT', 'END:VEVENT']);
    }
    for (const a of data.appts) {
      if (dayDiff(a.date, from) < 0 || dayDiff(a.date, to) > 0) continue;
      const when = a.time ? [`DTSTART:${d8(a.date)}T${a.time.replace(':', '')}00`, 'DURATION:PT1H'] : [`DTSTART;VALUE=DATE:${d8(a.date)}`, `DTEND;VALUE=DATE:${d8(addDays(a.date, 1))}`];
      push(['BEGIN:VEVENT', `UID:${a.id}@petcarelog.louvre`, `DTSTAMP:${stamp}`, ...when, fold(`SUMMARY:${icsEscape(txt.appt(a))}`),
        ...(a.place ? [fold(`LOCATION:${icsEscape(a.place)}`)] : []), 'END:VEVENT']);
    }
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n') + '\r\n', count };
  }

  // --- Ensemble des données
  function emptyData() { return { pets: [], cares: [], appts: [], weights: [], expenses: [] }; }
  function removePet(data, id) {
    const keep = (x) => x.petId !== id;
    return { pets: data.pets.filter((p) => p.id !== id), cares: data.cares.filter(keep), appts: data.appts.filter(keep), weights: data.weights.filter(keep), expenses: data.expenses.filter(keep) };
  }
  const LIMITS = { pets: MAX_PETS, cares: MAX_CARES, appts: MAX_APPTS, weights: MAX_WEIGHTS, expenses: MAX_EXPENSES };
  // Ajoute (ou remplace, même identifiant) un élément d'une liste, en respectant la limite.
  function upsert(data, list, item) {
    const arr = data[list];
    if (!Array.isArray(arr) || !LIMITS[list]) fail('err.backup');
    const exists = arr.some((x) => x.id === item.id);
    if (!exists && arr.length >= LIMITS[list]) fail('err.tooMany', { max: LIMITS[list] });
    return { ...data, [list]: exists ? arr.map((x) => (x.id === item.id ? item : x)) : [...arr, item] };
  }
  function removeItem(data, list, id) { return { ...data, [list]: data[list].filter((x) => x.id !== id) }; }

  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'petcarelog' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'pets', 'cares', 'appts', 'weights', 'expenses'])) fail('err.backup');
    for (const k of Object.keys(LIMITS)) {
      if (!Array.isArray(data[k])) fail('err.backup');
      if (data[k].length > LIMITS[k]) fail('err.tooMany', { max: LIMITS[k] });
    }
    const pets = data.pets.map((p) => { if (!isPlain(p) || !sameKeys(p, ['id', 'name', 'species', 'birth'])) fail('err.backup'); return makePet(p, p.id); });
    const keyed = (list, keys, make) => data[list].map((x) => { if (!isPlain(x) || !sameKeys(x, keys)) fail('err.backup'); return make(x); });
    const cares = keyed('cares', ['id', 'petId', 'type', 'label', 'every', 'unit', 'last', 'note'], (c) => {
      if (!Number.isInteger(c.every)) fail('err.backup');
      return makeCare({ ...c, every: String(c.every) }, c.id, pets, null);
    });
    const appts = keyed('appts', ['id', 'petId', 'date', 'time', 'title', 'place'], (a) => makeAppt(a, a.id, pets));
    const weights = keyed('weights', ['id', 'petId', 'date', 'grams'], (w) => { if (!Number.isSafeInteger(w.grams)) fail('err.backup'); return makeWeight(w, w.id, pets, null); });
    const expenses = keyed('expenses', ['id', 'petId', 'date', 'category', 'cents', 'label'], (e) => { if (!Number.isSafeInteger(e.cents)) fail('err.backup'); return makeExpense(e, e.id, pets); });
    const all = [pets, cares, appts, weights, expenses].flat().map((x) => x.id);
    if (new Set(all).size !== all.length) fail('err.backup');
    return { pets, cares, appts, weights, expenses };
  }
  function backup(data) {
    const clean = validateData({ app: 'petcarelog', version: VERSION, pets: data.pets, cares: data.cares, appts: data.appts, weights: data.weights, expenses: data.expenses });
    return JSON.stringify({ app: 'petcarelog', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, CARE_TYPES, UNITS, EXPENSE_CATS, MAX_PETS, MAX_EVERY, MAX_ICS_EVENTS, LIMITS,
    isDay, addDays, addMonths, addInterval, dayDiff, parseCents, parseGrams, parseEvery,
    makePet, makeCare, makeAppt, makeWeight, makeExpense, nextDue, careStatus, markCareDone, caresFor, apptsFor,
    weightSeries, weightStats, chartGeometry, expenseTotals, years, centsText, expensesCSV, weightsCSV, careOccurrences, toICS,
    emptyData, removePet, upsert, removeItem, validateData, backup,
  };
  root.PetCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PetCore;
})(typeof window === 'undefined' ? globalThis : window);
