/* TransitCompare — logique pure : itinéraires faits de segments (marche, bus, train, voiture, vélo…),
   totaux (temps, attente, marche, coût, correspondances), coût généralisé selon VOS pondérations,
   classement expliqué et valeur du temps « de bascule » entre les deux premiers.
   Montants en centimes entiers ; durées en minutes entières ; pondérations en dixièmes (1,5 -> 15).
   Aucune valeur par défaut n'est présentée comme une norme : tout est saisi par l'utilisateur. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MODES = Object.freeze(['walk', 'bus', 'tram', 'metro', 'train', 'car', 'bike', 'scooter', 'taxi', 'other']);
  const MAX_TRIPS = 100, MAX_ROUTES = 8, MAX_SEGMENTS = 12, MAX_NAME = 60, MAX_LABEL = 40;
  const MAX_MINUTES = 1440, MAX_WAIT = 600, MAX_CENTS = 9999999, MAX_VOT = 100000000; // 1 000 000 par heure au plus
  const MIN_WEIGHT = 0, MAX_WEIGHT = 50, MAX_PENALTY = 120; // pondérations 0,0 à 5,0 ; pénalité en minutes
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const str = (v) => (v === undefined || v === null ? '' : String(v)).trim();

  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function text(v, max, required, keyRequired, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    if (/[\u0000-\u001f]/.test(s)) fail('err.backup');
    return s;
  }
  // « 2,10 », « 2.1 » ou « 0 » -> centimes (zéro permis : la marche est gratuite).
  function parseCents(value, key = 'err.cost') {
    const s = str(value).replace(/[\s  ]/g, '').replace(',', '.');
    if (s === '') return 0;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents > MAX_CENTS) fail(key);
    return cents;
  }
  function parseInt0(value, min, max, key) {
    const s = str(value);
    if (s === '' && min === 0) return 0;
    if (!/^\d{1,5}$/.test(s)) fail(key, { min, max });
    const n = Number(s);
    if (n < min || n > max) fail(key, { min, max });
    return n;
  }
  // Pondération décimale « 1,5 » -> 15 dixièmes, de 0 à 5.
  function parseWeight(value) {
    const s = str(value).replace(',', '.');
    if (!/^\d(\.\d)?$/.test(s)) fail('err.weight');
    const n = Math.round(Number(s) * 10);
    if (n < MIN_WEIGHT || n > MAX_WEIGHT) fail('err.weight');
    return n;
  }

  // --- Préférences : valeur du temps (centimes par heure), pondérations marche / attente, pénalité par correspondance.
  function defaultPrefs() { return { votCents: 0, walkWeight: 10, waitWeight: 10, transferMinutes: 0 }; }
  function makePrefs(input) {
    if (!isPlain(input)) fail('err.backup');
    return {
      votCents: parseCents(input.vot, 'err.vot'),
      walkWeight: parseWeight(input.walkWeight),
      waitWeight: parseWeight(input.waitWeight),
      transferMinutes: parseInt0(input.transferMinutes, 0, MAX_PENALTY, 'err.penalty'),
    };
  }
  function validatePrefs(p) {
    if (!isPlain(p) || !sameKeys(p, ['votCents', 'walkWeight', 'waitWeight', 'transferMinutes'])) fail('err.backup');
    const ints = [[p.votCents, 0, MAX_CENTS], [p.walkWeight, MIN_WEIGHT, MAX_WEIGHT], [p.waitWeight, MIN_WEIGHT, MAX_WEIGHT], [p.transferMinutes, 0, MAX_PENALTY]];
    for (const [v, lo, hi] of ints) if (!Number.isSafeInteger(v) || v < lo || v > hi) fail('err.backup');
    return { votCents: p.votCents, walkWeight: p.walkWeight, waitWeight: p.waitWeight, transferMinutes: p.transferMinutes };
  }

  // --- Segments et itinéraires
  function makeSegment(input) {
    if (!isPlain(input)) fail('err.backup');
    if (!MODES.includes(input.mode)) fail('err.mode');
    const minutes = Number.isSafeInteger(input.minutes) ? input.minutes : parseInt0(input.minutesText, 1, MAX_MINUTES, 'err.minutes');
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) fail('err.minutes', { min: 1, max: MAX_MINUTES });
    const waitMinutes = Number.isSafeInteger(input.waitMinutes) ? input.waitMinutes : parseInt0(input.waitText, 0, MAX_WAIT, 'err.wait');
    if (!Number.isSafeInteger(waitMinutes) || waitMinutes < 0 || waitMinutes > MAX_WAIT) fail('err.wait', { min: 0, max: MAX_WAIT });
    const costCents = Number.isSafeInteger(input.costCents) ? input.costCents : parseCents(input.costText);
    if (!Number.isSafeInteger(costCents) || costCents < 0 || costCents > MAX_CENTS) fail('err.cost');
    return { mode: input.mode, minutes, waitMinutes, costCents, label: text(input.label, MAX_LABEL, false, '', 'err.labelLong') };
  }
  function makeRoute(name, id, segments = []) {
    checkId(id);
    if (!Array.isArray(segments) || segments.length > MAX_SEGMENTS) fail('err.tooManySegments', { max: MAX_SEGMENTS });
    return { id, name: text(name, MAX_NAME, true, 'err.routeName', 'err.nameLong'), segments: segments.map(makeSegment) };
  }
  function makeTrip(name, id, routes = []) {
    checkId(id);
    if (!Array.isArray(routes) || routes.length > MAX_ROUTES) fail('err.tooManyRoutes', { max: MAX_ROUTES });
    const clean = routes.map((r) => { if (!isPlain(r) || !sameKeys(r, ['id', 'name', 'segments'])) fail('err.backup'); return makeRoute(r.name, r.id, r.segments); });
    if (new Set(clean.map((r) => r.id)).size !== clean.length) fail('err.backup');
    return { id, name: text(name, MAX_NAME, true, 'err.tripName', 'err.nameLong'), routes: clean };
  }
  function addSegment(route, segment) {
    if (route.segments.length >= MAX_SEGMENTS) fail('err.tooManySegments', { max: MAX_SEGMENTS });
    return { ...route, segments: [...route.segments, makeSegment(segment)] };
  }
  function removeSegment(route, index) {
    if (!Number.isInteger(index) || index < 0 || index >= route.segments.length) fail('err.segment');
    return { ...route, segments: route.segments.filter((_, i) => i !== index) };
  }
  function moveSegment(route, index, delta) {
    const j = index + delta;
    if (!Number.isInteger(index) || index < 0 || index >= route.segments.length || j < 0 || j >= route.segments.length) return route;
    const segs = route.segments.slice(); [segs[index], segs[j]] = [segs[j], segs[index]];
    return { ...route, segments: segs };
  }

  // --- Totaux : une correspondance = chaque montée dans un véhicule après la première (la marche n'en est pas une).
  function totals(route) {
    let walk = 0, ride = 0, wait = 0, cost = 0, boardings = 0;
    for (const s of route.segments) {
      if (s.mode === 'walk') walk += s.minutes; else { ride += s.minutes; boardings += 1; }
      wait += s.waitMinutes; cost += s.costCents;
    }
    return { walkMinutes: walk, rideMinutes: ride, waitMinutes: wait, totalMinutes: walk + ride + wait, costCents: cost, transfers: Math.max(0, boardings - 1), segments: route.segments.length };
  }
  // Minutes pondérées, en dixièmes de minute (entiers) : trajet ×1, marche et attente × vos pondérations, + pénalité par correspondance.
  function weightedTenths(tot, prefs) {
    return 10 * tot.rideMinutes + prefs.walkWeight * tot.walkMinutes + prefs.waitWeight * tot.waitMinutes + 10 * prefs.transferMinutes * tot.transfers;
  }
  // Valeur monétaire de minutes pondérées : votCents par heure -> centimes (arrondi au centime).
  const timeCents = (tenths, votCents) => Math.round(votCents * tenths / 600);

  function score(route, prefs) {
    const tot = totals(route), wt = weightedTenths(tot, prefs);
    const transferTenths = 10 * prefs.transferMinutes * tot.transfers;
    const parts = {
      moneyCents: tot.costCents,
      timeCents: timeCents(wt - transferTenths, prefs.votCents),
      transferCents: timeCents(wt, prefs.votCents) - timeCents(wt - transferTenths, prefs.votCents), // somme exacte des parts
    };
    return { ...tot, weightedTenths: wt, ...parts, scoreCents: parts.moneyCents + parts.timeCents + parts.transferCents };
  }

  // Valeur du temps à laquelle les deux premiers s'égalisent (A devant B).
  // above : B passe devant si votre temps vaut plus que votCents ; below : s'il vaut moins ; dominant : A gagne toujours.
  function breakEven(a, b) {
    const dc = b.costCents - a.costCents, dt = a.weightedTenths - b.weightedTenths; // dc > 0 : A moins cher ; dt > 0 : A plus lent
    if (dt === 0) return { kind: dc === 0 ? 'equal' : 'dominant', votCents: null };
    const v = dc * 600 / dt;
    if (v <= 0) return { kind: 'dominant', votCents: null }; // A moins cher (ou pareil) ET plus rapide
    return { kind: dt > 0 ? 'above' : 'below', votCents: Math.round(v) };
  }

  // Classement : coût généralisé croissant, puis durée totale, coût, correspondances, nom.
  function rank(routes, prefs, locale = 'fr') {
    const p = validatePrefs(prefs);
    const rows = routes.filter((r) => r.segments.length).map((r) => ({ id: r.id, name: r.name, ...score(r, p) }));
    rows.sort((x, y) => x.scoreCents - y.scoreCents || x.totalMinutes - y.totalMinutes || x.costCents - y.costCents || x.transfers - y.transfers || x.name.localeCompare(y.name, locale));
    const best = rows[0];
    const out = rows.map((r, i) => ({
      ...r, rank: i + 1,
      deltaScoreCents: best ? r.scoreCents - best.scoreCents : 0,
      deltaMinutes: best ? r.totalMinutes - best.totalMinutes : 0,
      deltaCostCents: best ? r.costCents - best.costCents : 0,
      deltaTransfers: best ? r.transfers - best.transfers : 0,
    }));
    return { rows: out, empty: routes.length - rows.length, pivot: out.length > 1 ? breakEven(out[0], out[1]) : null };
  }

  // --- CSV (séparateur « ; », BOM UTF-8, protection contre les formules)
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function centsText(cents, decimal) { const neg = cents < 0, c = Math.abs(cents); return `${neg ? '-' : ''}${Math.floor(c / 100)}${decimal === 'comma' ? ',' : '.'}${String(c % 100).padStart(2, '0')}`; }
  function rankingCSV(result, opts) {
    const { headers, decimal } = opts;
    if (!Array.isArray(headers) || headers.length !== 10) fail('err.headers');
    const lines = [headers.map(csvCell).join(';')];
    for (const r of result.rows) {
      lines.push([r.rank, csvCell(r.name), r.totalMinutes, r.rideMinutes, r.walkMinutes, r.waitMinutes, r.transfers, centsText(r.costCents, decimal),
        centsText(r.timeCents + r.transferCents, decimal), centsText(r.scoreCents, decimal)].join(';'));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function emptyData() { return { prefs: defaultPrefs(), trips: [] }; }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'transitcompare' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'prefs', 'trips']) || !Array.isArray(data.trips)) fail('err.backup');
    if (data.trips.length > MAX_TRIPS) fail('err.tooManyTrips', { max: MAX_TRIPS });
    const prefs = validatePrefs(data.prefs);
    const trips = data.trips.map((tr) => {
      if (!isPlain(tr) || !sameKeys(tr, ['id', 'name', 'routes'])) fail('err.backup');
      for (const r of Array.isArray(tr.routes) ? tr.routes : []) {
        if (!isPlain(r) || !Array.isArray(r.segments)) fail('err.backup');
        for (const s of r.segments) if (!isPlain(s) || !sameKeys(s, ['mode', 'minutes', 'waitMinutes', 'costCents', 'label']) || !Number.isSafeInteger(s.minutes) || !Number.isSafeInteger(s.waitMinutes) || !Number.isSafeInteger(s.costCents)) fail('err.backup');
      }
      return makeTrip(tr.name, tr.id, tr.routes);
    });
    const ids = trips.flatMap((tr) => [tr.id, ...tr.routes.map((r) => r.id)]);
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return { prefs, trips };
  }
  function backup(data) {
    const clean = validateData({ app: 'transitcompare', version: VERSION, prefs: data.prefs, trips: data.trips });
    return JSON.stringify({ app: 'transitcompare', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, MODES, MAX_TRIPS, MAX_ROUTES, MAX_SEGMENTS, MAX_MINUTES, MAX_WAIT, MAX_PENALTY,
    parseCents, parseWeight, defaultPrefs, makePrefs, validatePrefs, makeSegment, makeRoute, makeTrip, addSegment, removeSegment, moveSegment,
    totals, weightedTenths, score, breakEven, rank, centsText, rankingCSV, emptyData, validateData, backup,
  };
  root.TransitCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TransitCore;
})(typeof window === 'undefined' ? globalThis : window);
