/* TimeBlocks — logique pure : blocs horaires d'une journée, chevauchements, totaux, déplacements au pas,
   modèles de journée, export .ics et sauvegarde.
   Les heures sont des minutes entières depuis minuit (0 à 1440) d'un jour civil « AAAA-MM-JJ » ;
   l'export .ics utilise des heures locales « flottantes » (sans fuseau) : 9 h reste 9 h partout. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const DAY = 1440; // minutes dans une journée civile (on ignore volontairement les changements d'heure)
  const STEPS = Object.freeze([5, 15]);
  const CATS = Object.freeze(['focus', 'meeting', 'admin', 'learning', 'personal', 'break']); // clés, traduites à l'affichage
  const MAX = Object.freeze({ blocks: 60, days: 400, templates: 30, title: 60, name: 40, file: 2000000 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const pad = (n) => String(n).padStart(2, '0');

  // --- Jours civils
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function addDays(day, n) {
    if (!isDay(day)) fail('err.day');
    const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }

  // --- Heures : « 09:30 » <-> 570 minutes. « 24:00 » est accepté comme fin de journée.
  function parseTime(v) {
    const m = /^\s*(\d{1,2})[:h.](\d{2})\s*$/i.exec(String(v));
    if (!m) fail('err.time');
    const h = Number(m[1]), min = Number(m[2]);
    if (min > 59 || h > 24 || (h === 24 && min !== 0)) fail('err.time');
    return h * 60 + min;
  }
  function hhmm(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
  function isMinute(n, step = 5) { return Number.isInteger(n) && n >= 0 && n <= DAY && n % step === 0; }
  // Arrondit au pas le plus proche (5 ou 15 minutes).
  function snap(min, step) { if (!STEPS.includes(step)) fail('err.step'); return Math.round(min / step) * step; }

  // --- Blocs
  function cleanText(v, max, key) {
    if (typeof v !== 'string' || !v.trim()) fail(key);
    const s = v.replace(/\s+/g, ' ').trim();
    if ([...s].length > max) fail(key + 'Long', { max });
    return s;
  }
  // Bloc saisi : titre, début et fin (« HH:MM » ou minutes), catégorie. Pas minimal : 5 minutes.
  function makeBlock(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (!input || typeof input !== 'object') fail('err.block');
    const start = typeof input.start === 'number' ? input.start : parseTime(input.start);
    const end = typeof input.end === 'number' ? input.end : parseTime(input.end);
    if (!isMinute(start) || !isMinute(end)) fail('err.step5');
    if (end <= start) fail('err.order');
    if (!CATS.includes(input.cat)) fail('err.cat');
    return { id, title: cleanText(input.title, MAX.title, 'err.title'), start, end, cat: input.cat };
  }
  const byTime = (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id);
  function sortBlocks(blocks) { return [...blocks].sort(byTime); }

  // Chevauchements : chaque paire de blocs qui se recouvrent, avec la durée commune.
  // Deux blocs qui se touchent (10:00-11:00 puis 11:00-12:00) ne se chevauchent pas.
  function overlaps(blocks) {
    const list = sortBlocks(blocks), out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
        out.push({ a: list[i].id, b: list[j].id, minutes: Math.min(list[i].end, list[j].end) - list[j].start });
      }
    }
    return out;
  }
  // Colonnes d'affichage : les blocs qui se recouvrent sont posés côte à côte (glouton, par grappe).
  function layout(blocks) {
    const list = sortBlocks(blocks), out = new Map();
    let cluster = [], clusterEnd = -1, laneEnds = [];
    const flush = () => { const n = laneEnds.length; for (const id of cluster) out.get(id).lanes = n; cluster = []; laneEnds = []; };
    for (const b of list) {
      if (b.start >= clusterEnd) { flush(); clusterEnd = -1; }
      let lane = laneEnds.findIndex((e) => e <= b.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.end); } else laneEnds[lane] = b.end;
      out.set(b.id, { lane, lanes: 1 }); cluster.push(b.id); clusterEnd = Math.max(clusterEnd, b.end);
    }
    flush();
    return out;
  }
  // Union d'intervalles [début, fin) -> intervalles disjoints triés.
  function merge(intervals) {
    const s = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]), out = [];
    for (const [a, b] of s) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
    return out;
  }
  const length = (iv) => iv.reduce((n, [a, b]) => n + b - a, 0);
  function clip(iv, lo, hi) { return iv.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a); }

  // Bilan de la journée. Les minutes en double (chevauchements) ne sont comptées qu'une fois dans « busy ».
  function summary(blocks, settings) {
    const s = makeSettings(settings);
    const byCat = Object.fromEntries(CATS.map((c) => [c, 0]));
    for (const b of blocks) byCat[b.cat] += b.end - b.start; // somme brute par catégorie
    const work = merge(blocks.filter((b) => b.cat !== 'break').map((b) => [b.start, b.end]));
    const all = merge(blocks.map((b) => [b.start, b.end]));
    const range = s.workEnd - s.workStart;
    const inRange = length(clip(all, s.workStart, s.workEnd));
    return {
      byCat,
      busy: length(work), // temps occupé hors pauses
      breaks: length(merge(blocks.filter((b) => b.cat === 'break').map((b) => [b.start, b.end]))),
      range, // durée de la plage de travail réglée
      free: range - inRange, // minutes libres dans la plage
      outside: length(all) - inRange, // minutes planifiées hors plage
      longestRun: work.reduce((m, [a, b]) => Math.max(m, b - a), 0), // plus longue suite sans pause ni trou
      overlapMinutes: blocks.reduce((n, b) => n + b.end - b.start, 0) - length(all),
    };
  }
  // Créneaux libres de la plage de travail (au moins « min » minutes).
  function gaps(blocks, settings, min = 5) {
    const s = makeSettings(settings), busy = merge(blocks.map((b) => [b.start, b.end])), out = [];
    let cur = s.workStart;
    for (const [a, b] of busy) { if (a > cur) out.push([cur, Math.min(a, s.workEnd)]); cur = Math.max(cur, b); if (cur >= s.workEnd) break; }
    if (cur < s.workEnd) out.push([cur, s.workEnd]);
    return out.filter(([a, b]) => b - a >= min).map(([start, end]) => ({ start, end }));
  }

  // Déplacement : décale de « delta » minutes, arrondi au pas, sans sortir de la journée ; la durée est gardée.
  function moveBlock(block, delta, step) {
    const dur = block.end - block.start;
    let start = snap(block.start + delta, step);
    start = Math.max(0, Math.min(DAY - dur, start));
    return { ...block, start, end: start + dur };
  }
  // Redimensionnement d'un bord (« start » ou « end ») au pas ; durée minimale : un pas.
  function resizeBlock(block, edge, delta, step) {
    if (edge === 'end') { const end = Math.max(block.start + step, Math.min(DAY, snap(block.end + delta, step))); return { ...block, end }; }
    if (edge === 'start') { const start = Math.min(block.end - step, Math.max(0, snap(block.start + delta, step))); return { ...block, start }; }
    return fail('err.block');
  }

  // --- Réglages : plage de travail et pas.
  function makeSettings(input = {}) {
    const workStart = typeof input.workStart === 'number' ? input.workStart : parseTime(input.workStart === undefined ? '09:00' : input.workStart);
    const workEnd = typeof input.workEnd === 'number' ? input.workEnd : parseTime(input.workEnd === undefined ? '18:00' : input.workEnd);
    if (!isMinute(workStart) || !isMinute(workEnd)) fail('err.step5');
    if (workEnd <= workStart) fail('err.range');
    const step = input.step === undefined ? 15 : Number(input.step);
    if (!STEPS.includes(step)) fail('err.step');
    return { workStart, workEnd, step };
  }

  // --- Jours et modèles
  function makeDay(date, blocks) {
    if (!isDay(date)) fail('err.day');
    if (!Array.isArray(blocks)) fail('err.block');
    if (blocks.length > MAX.blocks) fail('err.tooMany', { max: MAX.blocks });
    const list = sortBlocks(blocks.map((b) => makeBlock(b, b.id)));
    if (new Set(list.map((b) => b.id)).size !== list.length) fail('err.id');
    return { date, blocks: list };
  }
  // Un modèle garde des blocs sans date (titre, horaires, catégorie).
  function makeTemplate(name, id, blocks) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (!Array.isArray(blocks) || !blocks.length) fail('err.templateEmpty');
    if (blocks.length > MAX.blocks) fail('err.tooMany', { max: MAX.blocks });
    const list = sortBlocks(blocks.map((b, i) => makeBlock(b, b.id || `tpl-${String(i + 1).padStart(3, '0')}`)));
    if (new Set(list.map((b) => b.id)).size !== list.length) fail('err.id');
    return { id, name: cleanText(name, MAX.name, 'err.name'), blocks: list };
  }
  // Applique un modèle à un jour : « replace » remplace les blocs, « merge » les ajoute. Nouveaux identifiants.
  function applyTemplate(day, template, mode, newId) {
    const fresh = template.blocks.map((b) => ({ ...b, id: newId() }));
    const blocks = mode === 'replace' ? fresh : mode === 'merge' ? [...day.blocks, ...fresh] : fail('err.block');
    return makeDay(day.date, blocks);
  }

  // --- Export agenda (.ics, RFC 5545) : heures locales flottantes, sans fuseau.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { // lignes de 75 octets au plus
    const out = []; let cur = '';
    const enc = new TextEncoder();
    for (const ch of line) { if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  function icsTime(date, min) { // 24:00 -> 00:00 le lendemain
    const d = min === DAY ? addDays(date, 1) : date, m = min === DAY ? 0 : min;
    return `${d.replace(/-/g, '')}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
  }
  // `catLabel` permet à l'interface de fournir le nom traduit de la catégorie.
  function toICS(days, stamp, catLabel = (c) => c) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//TimeBlocks//FR', 'CALSCALE:GREGORIAN'];
    for (const day of days) {
      for (const b of day.blocks) {
        lines.push('BEGIN:VEVENT', `UID:${b.id}-${day.date}@timeblocks.louvre`, `DTSTAMP:${stamp}`,
          `DTSTART:${icsTime(day.date, b.start)}`, `DTEND:${icsTime(day.date, b.end)}`,
          fold(`SUMMARY:${icsEscape(b.title)}`), fold(`CATEGORIES:${icsEscape(catLabel(b.cat))}`),
          b.cat === 'break' ? 'TRANSP:TRANSPARENT' : 'TRANSP:OPAQUE', 'END:VEVENT');
      }
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBlockShape(b) { if (keys(b) !== 'cat,end,id,start,title') fail('err.backup'); if (!Number.isInteger(b.start) || !Number.isInteger(b.end)) fail('err.backup'); }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'timeblocks' || data.version !== VERSION) fail('err.notBackup');
    if (keys(data) !== 'app,days,settings,templates,version' || !Array.isArray(data.days) || !Array.isArray(data.templates)) fail('err.backup');
    if (keys(data.settings) !== 'step,workEnd,workStart') fail('err.backup');
    const settings = makeSettings(data.settings);
    if (data.days.length > MAX.days) fail('err.tooManyDays', { max: MAX.days });
    if (data.templates.length > MAX.templates) fail('err.tooManyTemplates', { max: MAX.templates });
    const days = data.days.map((d) => {
      if (keys(d) !== 'blocks,date' || !Array.isArray(d.blocks)) fail('err.backup');
      d.blocks.forEach(validateBlockShape);
      return makeDay(d.date, d.blocks);
    }).filter((d) => d.blocks.length).sort((a, b) => a.date.localeCompare(b.date));
    if (new Set(days.map((d) => d.date)).size !== days.length) fail('err.backup');
    const templates = data.templates.map((t) => {
      if (keys(t) !== 'blocks,id,name' || !Array.isArray(t.blocks)) fail('err.backup');
      t.blocks.forEach(validateBlockShape);
      return makeTemplate(t.name, t.id, t.blocks);
    });
    if (new Set(templates.map((t) => t.id)).size !== templates.length) fail('err.backup');
    return { settings, days, templates };
  }
  function backup(state) {
    const clean = validateBackup({ app: 'timeblocks', version: VERSION, settings: state.settings, days: state.days, templates: state.templates });
    return JSON.stringify({ app: 'timeblocks', version: VERSION, ...clean }, null, 2);
  }

  root.TimeCore = Object.freeze({
    VERSION, DAY, STEPS, CATS, MAX, isDay, addDays, parseTime, hhmm, snap, makeBlock, sortBlocks, overlaps, layout, merge,
    summary, gaps, moveBlock, resizeBlock, makeSettings, makeDay, makeTemplate, applyTemplate, icsEscape, toICS, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TimeCore;
})(typeof window === 'undefined' ? globalThis : window);
