/* PlantPulse — logique pure : plantes, soins récurrents (arrosage, engrais, rempotage), échéances,
   retards, historique, ajustement saisonnier et export .ics.
   Aucune donnée botanique : chaque fréquence (en jours) et chaque coefficient sont saisis par l'utilisateur.
   Dates en jours civils « AAAA-MM-JJ », calculées en UTC (aucun piège d'heure d'été). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const KINDS = Object.freeze(['water', 'feed', 'repot']); // arrosage, engrais, rempotage
  const SEASONAL_KINDS = Object.freeze(['water', 'feed']); // le coefficient saisonnier ne touche pas le rempotage
  const MAX_PLANTS = 150, MAX_HISTORY = 3000, MAX_NAME = 60, MAX_PLACE = 40, MAX_NOTE = 300, MAX_HNOTE = 120;
  const MAX_EVERY = 3650, MIN_PCT = 25, MAX_PCT = 400, MAX_ICS_EVENTS = 3000, MAX_HORIZON = 730;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // --- Jours civils
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function toUTC(day) { if (!isDay(day)) fail('err.date'); const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function addDays(day, n) { return new Date(toUTC(day) + n * 86400000).toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); } // a - b, en jours
  const monthOf = (day) => Number(day.slice(5, 7));

  // --- Saisies
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function cleanText(v, max, required, keyRequired, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    return s;
  }
  // Fréquence en jours : entier de 1 à 3650 ; vide = soin non suivi (null).
  function parseEvery(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (!/^\d{1,4}$/.test(s)) fail('err.every', { max: MAX_EVERY });
    const n = Number(s);
    if (n < 1 || n > MAX_EVERY) fail('err.every', { max: MAX_EVERY });
    return n;
  }
  // Coefficient saisonnier en pourcentage entier : 150 = intervalles 1,5 fois plus longs.
  function parsePct(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,3}$/.test(s)) fail('err.pct', { min: MIN_PCT, max: MAX_PCT });
    const n = Number(s);
    if (n < MIN_PCT || n > MAX_PCT) fail('err.pct', { min: MIN_PCT, max: MAX_PCT });
    return n;
  }

  // Plante saisie. input.tasks = { water: { every, since }, … } ; since = dernier soin connu (jour civil).
  // input.season = null ou { months: [11, 12, 1, 2], pct: 150 }.
  function makePlant(input, id, today) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    const name = cleanText(input.name, MAX_NAME, true, 'err.nameRequired', 'err.nameLong');
    const place = cleanText(input.place, MAX_PLACE, false, '', 'err.placeLong');
    const note = cleanText(input.note, MAX_NOTE, false, '', 'err.noteLong');
    const tasksIn = isPlain(input.tasks) ? input.tasks : {};
    const tasks = {};
    for (const kind of KINDS) {
      const t = isPlain(tasksIn[kind]) ? tasksIn[kind] : {};
      let every;
      try { every = parseEvery(t.every); } catch (e) { fail('err.every.' + kind, { max: MAX_EVERY }); }
      if (every === null) { tasks[kind] = null; continue; }
      const since = t.since === undefined || t.since === '' ? today : t.since;
      if (!isDay(since)) fail('err.since.' + kind);
      if (isDay(today) && dayDiff(since, today) > 0) fail('err.sinceFuture');
      tasks[kind] = { every, since };
    }
    if (!KINDS.some((k) => tasks[k])) fail('err.noTask');
    let season = null;
    if (input.season) {
      if (!isPlain(input.season) || !Array.isArray(input.season.months)) fail('err.backup');
      const months = [...new Set(input.season.months.map(Number))].sort((a, b) => a - b);
      if (!months.length) fail('err.seasonMonths');
      if (months.some((m) => !Number.isInteger(m) || m < 1 || m > 12) || months.length > 11) fail('err.seasonMonths');
      season = { months, pct: parsePct(input.season.pct) };
    }
    return { id, name, place, note, tasks, season };
  }

  // --- Calculs d'échéance
  // Intervalle appliqué après un soin fait le jour `from` : la fréquence saisie, multipliée par le
  // coefficient si `from` tombe dans un mois de la saison. Arrondi au jour le plus proche (moitié vers le haut), au moins 1 jour.
  function intervalAfter(plant, kind, from) {
    const task = plant.tasks[kind];
    if (!task) fail('err.task');
    const s = plant.season;
    if (s && SEASONAL_KINDS.includes(kind) && s.months.includes(monthOf(from))) return Math.max(1, Math.floor((task.every * s.pct + 50) / 100));
    return task.every;
  }
  // Dernier soin : le plus récent entre la date « dernier soin connu » de la fiche et l'historique.
  function lastDone(plant, kind, history) {
    const task = plant.tasks[kind];
    if (!task) return null;
    let last = task.since;
    for (const h of history) if (h.plantId === plant.id && h.kind === kind && h.date > last) last = h.date;
    return last;
  }
  function nextDue(plant, kind, history) {
    const last = lastDone(plant, kind, history);
    return last === null ? null : addDays(last, intervalAfter(plant, kind, last));
  }
  // État d'un soin : retard (late), aujourd'hui (today), bientôt (soon, ≤ 7 jours), plus tard (ok).
  function taskStatus(plant, kind, history, today) {
    const due = nextDue(plant, kind, history);
    if (due === null) return null;
    const days = dayDiff(due, today);
    return { kind, due, days, last: lastDone(plant, kind, history), interval: intervalAfter(plant, kind, lastDone(plant, kind, history)),
      state: days < 0 ? 'late' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'ok' };
  }
  // Soins à faire aujourd'hui (retards compris), du plus en retard au moins en retard.
  function dueToday(plants, history, today, locale = 'fr') {
    const out = [];
    for (const p of plants) for (const kind of KINDS) {
      const s = taskStatus(p, kind, history, today);
      if (s && s.days <= 0) out.push({ plant: p, ...s });
    }
    return out.sort((a, b) => a.days - b.days || a.plant.name.localeCompare(b.plant.name, locale) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  }
  function summary(plants, history, today) {
    let late = 0, todayN = 0, week = 0;
    for (const p of plants) for (const kind of KINDS) {
      const s = taskStatus(p, kind, history, today);
      if (!s) continue;
      if (s.days < 0) late += 1; else if (s.days === 0) todayN += 1; else if (s.days <= 7) week += 1;
    }
    return { plants: plants.length, late, today: todayN, week };
  }
  // Échéances futures entre `from` et `to` inclus, en enchaînant les intervalles (saisons comprises).
  // Un soin en retard est placé à `from` (il reste à faire), puis la série reprend à partir de là.
  function schedule(plant, kind, history, from, to) {
    if (dayDiff(to, from) < 0) fail('err.date');
    const out = [];
    let due = nextDue(plant, kind, history);
    if (due === null) return out;
    if (dayDiff(due, from) < 0) due = from;
    while (dayDiff(to, due) >= 0) {
      out.push(due);
      if (out.length > MAX_ICS_EVENTS) fail('err.icsTooMany', { max: MAX_ICS_EVENTS });
      due = addDays(due, intervalAfter(plant, kind, due));
    }
    return out;
  }

  // --- Historique
  function makeEvent(input, id) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    checkId(input.plantId);
    if (!KINDS.includes(input.kind)) fail('err.kind');
    if (!isDay(input.date)) fail('err.date');
    return { id, plantId: input.plantId, kind: input.kind, date: input.date, note: cleanText(input.note, MAX_HNOTE, false, '', 'err.hnoteLong') };
  }
  // Ajoute un soin fait ; au-delà de la limite, les soins les plus anciens sont oubliés.
  function recordCare(data, input, id, today) {
    const plant = data.plants.find((p) => p.id === input.plantId);
    if (!plant) fail('err.plantUnknown');
    if (!plant.tasks[input.kind]) fail('err.task');
    const ev = makeEvent(input, id);
    if (data.history.some((h) => h.id === ev.id)) fail('err.backup'); // identifiant d'historique unique
    if (isDay(today) && dayDiff(ev.date, today) > 0) fail('err.dateFuture');
    let history = [...data.history, ev].sort(byDateDesc);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    return { ...data, history };
  }
  function byDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); }
  function removeEvent(data, id) { return { ...data, history: data.history.filter((h) => h.id !== id) }; }
  function removePlant(data, id) { return { plants: data.plants.filter((p) => p.id !== id), history: data.history.filter((h) => h.plantId !== id) }; }
  function upsertPlant(data, plant) {
    const exists = data.plants.some((p) => p.id === plant.id);
    if (!exists && data.plants.length >= MAX_PLANTS) fail('err.tooManyPlants', { max: MAX_PLANTS });
    // Un soin retiré de la fiche emporte son historique (il ne compterait plus nulle part).
    const history = data.history.filter((h) => h.plantId !== plant.id || plant.tasks[h.kind]);
    return { plants: exists ? data.plants.map((p) => (p.id === plant.id ? plant : p)) : [...data.plants, plant], history };
  }

  // --- Export agenda (.ics, RFC 5545) : une occurrence par échéance calculée (les saisons rendent une RRULE inexacte).
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n'); }
  function fold(line) {
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  // text.summary(plant, kind) et text.description(plant, kind) : libellés traduits par l'interface.
  function toICS(plants, history, from, days, stamp, text) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    if (!Number.isInteger(days) || days < 1 || days > MAX_HORIZON) fail('err.horizon');
    if (!text || typeof text.summary !== 'function' || typeof text.description !== 'function') fail('err.icsText');
    const to = addDays(from, days - 1);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//PlantPulse//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    let count = 0;
    for (const p of plants) for (const kind of KINDS) {
      for (const day of schedule(p, kind, history, from, to)) {
        count += 1;
        if (count > MAX_ICS_EVENTS) fail('err.icsTooMany', { max: MAX_ICS_EVENTS });
        lines.push('BEGIN:VEVENT', `UID:${p.id}-${kind}-${day.replace(/-/g, '')}@plantpulse.louvre`, `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, '')}`,
          fold(`SUMMARY:${icsEscape(text.summary(p, kind))}`), fold(`DESCRIPTION:${icsEscape(text.description(p, kind))}`),
          'TRANSP:TRANSPARENT', 'END:VEVENT');
      }
    }
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n') + '\r\n', count };
  }

  // --- Sauvegarde
  function validatePlant(p) {
    if (!isPlain(p) || !sameKeys(p, ['id', 'name', 'place', 'note', 'tasks', 'season'])) fail('err.backup');
    if (!isPlain(p.tasks) || !sameKeys(p.tasks, KINDS)) fail('err.backup');
    const tasks = {};
    for (const k of KINDS) {
      const t = p.tasks[k];
      if (t === null) { tasks[k] = { every: '' }; continue; }
      if (!isPlain(t) || !sameKeys(t, ['every', 'since']) || !Number.isInteger(t.every) || !isDay(t.since)) fail('err.backup');
      tasks[k] = { every: String(t.every), since: t.since };
    }
    if (p.season !== null && (!isPlain(p.season) || !sameKeys(p.season, ['months', 'pct']) || !Number.isInteger(p.season.pct) || !p.season.months.every(Number.isInteger))) fail('err.backup');
    for (const k of ['name', 'place', 'note']) if (typeof p[k] !== 'string') fail('err.backup');
    const season = p.season ? { months: p.season.months, pct: String(p.season.pct) } : null;
    const clean = makePlant({ name: p.name, place: p.place, note: p.note, tasks, season }, p.id, null);
    if (season && clean.season.months.join(',') !== p.season.months.join(',')) fail('err.backup');
    return clean;
  }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'plantpulse' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'plants', 'history']) || !Array.isArray(data.plants) || !Array.isArray(data.history)) fail('err.backup');
    if (data.plants.length > MAX_PLANTS) fail('err.tooManyPlants', { max: MAX_PLANTS });
    if (data.history.length > MAX_HISTORY) fail('err.backup');
    const plants = data.plants.map(validatePlant);
    if (new Set(plants.map((p) => p.id)).size !== plants.length) fail('err.backup');
    const history = data.history.map((h) => {
      if (!isPlain(h) || !sameKeys(h, ['id', 'plantId', 'kind', 'date', 'note']) || typeof h.note !== 'string') fail('err.backup');
      const ev = makeEvent(h, h.id);
      const plant = plants.find((p) => p.id === ev.plantId);
      if (!plant || !plant.tasks[ev.kind]) fail('err.backup'); // soin orphelin
      return ev;
    });
    if (new Set(history.map((h) => h.id)).size !== history.length) fail('err.backup');
    return { plants, history: history.sort(byDateDesc) };
  }
  function backup(data) {
    const clean = validateData({ app: 'plantpulse', version: VERSION, plants: data.plants, history: data.history });
    return JSON.stringify({ app: 'plantpulse', version: VERSION, ...clean }, null, 2);
  }
  function sortPlants(plants, locale = 'fr') { return [...plants].sort((a, b) => a.name.localeCompare(b.name, locale) || (a.id < b.id ? -1 : 1)); }

  const api = {
    VERSION, KINDS, SEASONAL_KINDS, MAX_PLANTS, MAX_HISTORY, MAX_EVERY, MIN_PCT, MAX_PCT, MAX_ICS_EVENTS, MAX_HORIZON,
    isDay, addDays, dayDiff, parseEvery, parsePct, makePlant, intervalAfter, lastDone, nextDue, taskStatus, dueToday, summary,
    schedule, makeEvent, recordCare, removeEvent, removePlant, upsertPlant, toICS, validateData, backup, sortPlants, own,
  };
  root.PlantCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PlantCore;
})(typeof window === 'undefined' ? globalThis : window);
