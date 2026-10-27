/* NoiseDiary — logique pure : journal daté de nuisances sonores observées et statistiques factuelles.
   Jours civils « AAAA-MM-JJ », heures murales en minutes depuis minuit (0 à 1439) ; une observation dont
   l'heure de fin est antérieure à l'heure de début se termine le lendemain. L'intensité est une perception
   notée de 1 à 5 par l'utilisateur : aucune mesure en décibels, aucun avis juridique. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const DAYM = 1440;
  const MAX = Object.freeze({ entries: 2000, source: 80, notes: 500 });
  const TYPES = Object.freeze(['music', 'voices', 'footsteps', 'impacts', 'furniture', 'appliance', 'works', 'traffic', 'animal', 'alarm', 'other']);
  const DEFAULT_SETTINGS = Object.freeze({ nightStart: 22 * 60, nightEnd: 7 * 60 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const mod = (n, m) => ((n % m) + m) % m;

  // --- Jours et heures
  function isDay(s) {
    const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number), z = new Date(Date.UTC(y, mo - 1, d));
    return y >= 1970 && y <= 2100 && z.getUTCMonth() === mo - 1 && z.getUTCDate() === d;
  }
  function addDays(s, n) { if (!isDay(s)) fail('err.date'); return new Date(Date.parse(s + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  // Jour de la semaine : 0 = lundi … 6 = dimanche (calcul en UTC, sans piège de fuseau).
  function weekday(s) { if (!isDay(s)) fail('err.date'); return (new Date(s + 'T12:00:00Z').getUTCDay() + 6) % 7; }
  function parseClock(v, key = 'err.clock') {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < DAYM) return v;
    const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(key);
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const clock = (min) => { const x = mod(Math.round(min), DAYM); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

  function cleanText(v, max, key, required) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(key);
    const s = v.replace(/\r\n?/g, '\n').trim();
    if (required && !s) fail(key + 'Required');
    if (s.length > max) fail(key + 'Long', { max });
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)) fail(key);
    return s;
  }

  // --- Observation
  function makeEntry(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (!isDay(input.day)) fail('err.date');
    const start = parseClock(input.start, 'err.start'), end = parseClock(input.end, 'err.end');
    if (start === end) fail('err.sameTime');
    if (!TYPES.includes(input.type)) fail('err.type');
    const intensity = Number(input.intensity);
    if (!Number.isInteger(intensity) || intensity < 1 || intensity > 5 || !/^[1-5]$/.test(String(input.intensity).trim())) fail('err.intensity');
    const source = cleanText(input.source, MAX.source, 'err.source', false);
    const notes = cleanText(input.notes, MAX.notes, 'err.notes', false);
    return { id, day: input.day, start, end, type: input.type, intensity, source, notes };
  }
  // Durée en minutes ; fin avant début = fin le lendemain.
  function duration(e) { return e.end > e.start ? e.end - e.start : e.end + DAYM - e.start; }
  // Intervalle en minutes depuis minuit du jour de l'observation (la fin peut dépasser 1440).
  function span(e) { return [e.start, e.start + duration(e)]; }
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  function makeSettings(input) {
    const nightStart = parseClock(input.nightStart, 'err.nightStart'), nightEnd = parseClock(input.nightEnd, 'err.nightEnd');
    if (nightStart === nightEnd) fail('err.nightSame');
    return { nightStart, nightEnd };
  }
  // Minutes de l'observation qui tombent dans chaque nuit. La nuit est nommée par le jour où elle commence
  // (22:00–07:00 : la nuit du 3 va du 3 à 22:00 au 4 à 07:00).
  function nightOverlap(e, settings) {
    const [s, f] = span(e), len = mod(settings.nightEnd - settings.nightStart, DAYM), out = [];
    for (let k = -1; k <= 1; k += 1) {
      const a = k * DAYM + settings.nightStart, m = overlap(s, f, a, a + len);
      if (m > 0) out.push({ night: addDays(e.day, k), minutes: m });
    }
    return out;
  }

  // --- Période et statistiques
  function checkPeriod(from, to) {
    if (from && !isDay(from)) fail('err.from');
    if (to && !isDay(to)) fail('err.to');
    if (from && to && from > to) fail('err.period');
    return { from: from || '', to: to || '' };
  }
  function inPeriod(entries, from, to) {
    const p = checkPeriod(from, to);
    return entries.filter((e) => (!p.from || e.day >= p.from) && (!p.to || e.day <= p.to));
  }
  const byTime = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start || (a.id < b.id ? -1 : 1));
  function sortEntries(entries, desc = false) { const s = [...entries].sort(byTime); return desc ? s.reverse() : s; }

  // `locale` sert seulement à trier les sources à égalité de nombre.
  function stats(entries, settings, from, to, locale = 'fr') {
    const list = sortEntries(inPeriod(entries, from, to));
    const byHour = Array(24).fill(0); // minutes de bruit par heure de l'horloge
    const byWeekday = Array.from({ length: 7 }, () => ({ count: 0, minutes: 0 }));
    const byType = {}, sources = new Map(), nights = new Map();
    let totalMin = 0, sumIntensity = 0, maxIntensity = 0, nightMin = 0;
    for (const e of list) {
      const d = duration(e), [s, f] = span(e);
      totalMin += d; sumIntensity += e.intensity; maxIntensity = Math.max(maxIntensity, e.intensity);
      for (let h = Math.floor(s / 60); h * 60 < f; h += 1) byHour[h % 24] += overlap(s, f, h * 60, h * 60 + 60);
      const w = byWeekday[weekday(e.day)]; w.count += 1; w.minutes += d;
      (byType[e.type] ||= { count: 0, minutes: 0 }); byType[e.type].count += 1; byType[e.type].minutes += d;
      if (e.source) { const key = e.source.toLocaleLowerCase(); const cur = sources.get(key) || { source: e.source, count: 0, minutes: 0 }; cur.count += 1; cur.minutes += d; sources.set(key, cur); }
      for (const n of nightOverlap(e, settings)) { nightMin += n.minutes; const cur = nights.get(n.night) || { night: n.night, count: 0, minutes: 0 }; cur.count += 1; cur.minutes += n.minutes; nights.set(n.night, cur); }
    }
    const count = list.length;
    return {
      count, totalMin, nightMin,
      avgIntensity: count ? Math.round((sumIntensity * 10) / count) / 10 : 0, maxIntensity,
      firstDay: count ? list[0].day : null, lastDay: count ? list.reduce((m, e) => (e.day > m ? e.day : m), list[0].day) : null,
      daysWithEntries: new Set(list.map((e) => e.day)).size,
      byHour, byWeekday,
      byType: TYPES.filter((t) => byType[t]).map((t) => ({ type: t, ...byType[t] })).sort((a, b) => b.count - a.count || b.minutes - a.minutes),
      sources: [...sources.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes || a.source.localeCompare(b.source, locale)),
      nights: [...nights.values()].sort((a, b) => (a.night < b.night ? -1 : 1)),
      entries: list,
    };
  }

  // --- Export CSV (séparateur « ; », BOM pour les tableurs ; cellules neutralisées contre les formules)
  function csvCell(v) { let s = String(v); if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  // text.headers : 11 en-têtes traduits ; text.type(k) et text.weekday(i) : libellés dans la langue affichée.
  function toCSV(entries, settings, text) {
    if (!text || !Array.isArray(text.headers) || text.headers.length !== 11) fail('err.csv');
    const rows = [text.headers];
    for (const e of sortEntries(entries)) {
      const night = nightOverlap(e, settings).reduce((s, n) => s + n.minutes, 0);
      rows.push([e.day, text.weekday(weekday(e.day)), clock(e.start), clock(e.end), e.end < e.start ? addDays(e.day, 1) : e.day,
        duration(e), night, text.type(e.type), e.intensity, e.source, e.notes]);
    }
    return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'noisediary' || data.version !== VERSION || !Array.isArray(data.entries)) fail('err.notBackup');
    if (keys(data) !== 'app,entries,settings,version') fail('err.backup');
    if (keys(data.settings) !== 'nightEnd,nightStart' || !Number.isSafeInteger(data.settings.nightStart) || !Number.isSafeInteger(data.settings.nightEnd)) fail('err.backup');
    const settings = makeSettings(data.settings);
    if (data.entries.length > MAX.entries) fail('err.tooMany', { max: MAX.entries });
    const entries = data.entries.map((e) => {
      if (keys(e) !== 'day,end,id,intensity,notes,source,start,type') fail('err.backup');
      if (![e.start, e.end, e.intensity].every(Number.isSafeInteger) || typeof e.source !== 'string' || typeof e.notes !== 'string') fail('err.backup');
      const x = makeEntry(e, e.id);
      if (x.source !== e.source || x.notes !== e.notes) fail('err.backup'); // texte non normalisé : fichier modifié à la main
      return x;
    });
    if (new Set(entries.map((e) => e.id)).size !== entries.length) fail('err.backup');
    return { settings, entries };
  }
  function backup(state) {
    const clean = validateBackup({ app: 'noisediary', version: VERSION, settings: state.settings, entries: state.entries });
    return JSON.stringify({ app: 'noisediary', version: VERSION, settings: clean.settings, entries: clean.entries }, null, 2);
  }

  root.NoiseCore = Object.freeze({ VERSION, MAX, TYPES, DEFAULT_SETTINGS, isDay, addDays, weekday, parseClock, clock, makeEntry, duration, span, makeSettings, nightOverlap, checkPeriod, inPeriod, sortEntries, stats, toCSV, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NoiseCore;
})(typeof window === 'undefined' ? globalThis : window);
