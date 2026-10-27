/* TimelineBuilder — logique pure : dates à précision variable (année, mois ou jour, avant notre ère possible),
   périodes, pistes, échelle linéaire, graduations, empilement des libellés, rendu SVG et export CSV.
   Calendrier : grégorien proleptique (pas de conversion julienne) ; années stockées en numérotation
   astronomique (1 av. J.-C. = 0, 2 av. J.-C. = -1), affichées en numérotation historique (sans an 0). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ timelines: 30, tracks: 8, events: 300, title: 100, note: 300, name: 60, year: 9999 });
  const COLORS = Object.freeze(['#1971c2', '#c2255c', '#2b8a3e', '#e8590c', '#6741d9', '#0c8599', '#5c940d', '#862e9c']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('err.id'); return id; }
  function text(v, max, key, required = true) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(key);
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(key);
    if (s.length > max) fail('err.tooLong', { max });
    return s;
  }

  // --- Calendrier (algorithmes « days from civil » / « civil from days », valables pour les années négatives)
  const fdiv = (a, b) => Math.floor(a / b);
  function dayNumber(y, m, d) { // jours depuis le 1970-01-01 (grégorien proleptique)
    const yy = y - (m <= 2 ? 1 : 0);
    const era = fdiv(yy, 400), yoe = yy - era * 400, mp = (m + 9) % 12;
    const doy = fdiv(153 * mp + 2, 5) + d - 1;
    const doe = yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy;
    return era * 146097 + doe - 719468;
  }
  function civil(n) {
    const z = n + 719468, era = fdiv(z, 146097), doe = z - era * 146097;
    const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
    const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100)), mp = fdiv(5 * doy + 2, 153);
    const d = doy - fdiv(153 * mp + 2, 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
    return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
  }
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; // y astronomique (0 est bissextile)
  const monthDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  // Année historique (ère « ce » ou « bce », sans an 0) <-> année astronomique.
  const toAstro = (era, year) => (era === 'bce' ? 1 - year : year);
  const fromAstro = (y) => (y <= 0 ? { era: 'bce', year: 1 - y } : { era: 'ce', year: y });

  // Date saisie : { era, year, month (0 = sans), day (0 = sans) } -> { y, m, d } (m, d = 0 si non précisés).
  function parseDate(input) {
    if (!isObj(input) || !['ce', 'bce'].includes(input.era)) fail('err.era');
    const ys = String(input.year === undefined || input.year === null ? '' : input.year).trim();
    if (!/^\d{1,4}$/.test(ys) || Number(ys) < 1) fail('err.year', { max: MAX.year });
    const ms = String(input.month === undefined || input.month === null || input.month === '' ? 0 : input.month).trim();
    if (!/^\d{1,2}$/.test(ms) || Number(ms) > 12) fail('err.month');
    const ds = String(input.day === undefined || input.day === null || input.day === '' ? 0 : input.day).trim();
    if (!/^\d{1,2}$/.test(ds)) fail('err.day');
    const y = toAstro(input.era, Number(ys)), m = Number(ms), d = Number(ds);
    if (d && !m) fail('err.dayWithoutMonth');
    if (d && d > monthDays(y, m)) fail('err.day');
    return { y, m, d };
  }
  function checkDate(x) {
    if (!isObj(x) || !keysAre(x, ['y', 'm', 'd']) || ![x.y, x.m, x.d].every(Number.isSafeInteger)) fail('err.backup');
    if (x.y < 1 - MAX.year || x.y > MAX.year) fail('err.backup');
    return parseDate({ ...fromAstro(x.y), month: x.m, day: x.d });
  }
  const precision = (x) => (x.d ? 'day' : x.m ? 'month' : 'year');
  // Intervalle couvert par une date imprécise : [premier jour, lendemain du dernier jour).
  function span(x) {
    if (x.d) { const a = dayNumber(x.y, x.m, x.d); return [a, a + 1]; }
    if (x.m) return [dayNumber(x.y, x.m, 1), x.m === 12 ? dayNumber(x.y + 1, 1, 1) : dayNumber(x.y, x.m + 1, 1)];
    return [dayNumber(x.y, 1, 1), dayNumber(x.y + 1, 1, 1)];
  }
  // ISO 8601 (année astronomique sur 4 chiffres, signe « - » avant notre ère) : « 1789-07-14 », « 1969-07 », « -0752 ».
  function iso(x) {
    const y = x.y < 0 ? `-${String(-x.y).padStart(4, '0')}` : String(x.y).padStart(4, '0');
    return y + (x.m ? `-${String(x.m).padStart(2, '0')}` : '') + (x.d ? `-${String(x.d).padStart(2, '0')}` : '');
  }

  // --- Données
  function makeTrack(input, id) { return { id: checkId(id), name: text(input.name, MAX.name, 'err.trackName') }; }
  function makeEvent(input, id) {
    const start = input.start, end = input.end === undefined ? null : input.end;
    if (!isObj(start) || (end !== null && !isObj(end))) fail('err.date');
    if (end !== null && span(end)[1] <= span(start)[0]) fail('err.endBeforeStart');
    if (end !== null && span(end)[0] === span(start)[0] && span(end)[1] === span(start)[1]) fail('err.sameDates');
    const note = input.note === undefined ? '' : input.note;
    if (typeof note !== 'string') fail('err.note');
    if (note.length > MAX.note) fail('err.tooLong', { max: MAX.note });
    return { id: checkId(id), title: text(input.title, MAX.title, 'err.titleRequired'), start, end, track: checkId(input.track), note: note.trim() };
  }
  function makeTimeline(input, id) {
    const tracks = input.tracks || [];
    if (!tracks.length) fail('err.noTrack');
    if (tracks.length > MAX.tracks) fail('err.tooManyTracks', { max: MAX.tracks });
    return { id: checkId(id), name: text(input.name, MAX.name, 'err.nameRequired'), tracks, events: input.events || [] };
  }
  function eventSpan(e) { const a = span(e.start); return [a[0], e.end ? span(e.end)[1] : a[1]]; }
  function sorted(events) { return [...events].sort((a, b) => eventSpan(a)[0] - eventSpan(b)[0] || eventSpan(a)[1] - eventSpan(b)[1] || a.title.localeCompare(b.title)); }
  function removeTrack(t, trackId) {
    if (t.tracks.length <= 1) fail('err.lastTrack');
    if (t.events.some((e) => e.track === trackId)) fail('err.trackNotEmpty');
    return { ...t, tracks: t.tracks.filter((k) => k.id !== trackId) };
  }

  // --- Graduations : pas « ronds » choisis pour ne pas dépasser `maxTicks`.
  const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  function ticks(min, max, maxTicks) {
    const range = max - min, out = [];
    const limit = Math.max(2, maxTicks);
    if (range / 1 <= limit * 1 || range / 7 <= limit) { // jours ou semaines
      const step = range <= limit ? 1 : range / 2 <= limit ? 2 : 7;
      for (let n = Math.ceil(min / step) * step; n <= max; n += step) out.push({ day: n, unit: 'day', ...civil(n) });
      return out;
    }
    const months = range / 30.44;
    const mStep = [1, 2, 3, 6].find((s) => months / s <= limit);
    if (mStep) {
      let { y, m } = civil(min);
      for (;;) {
        if ((m - 1) % mStep === 0) { const n = dayNumber(y, m, 1); if (n > max) break; if (n >= min) out.push({ day: n, unit: m === 1 ? 'year' : 'month', y, m, d: 1 }); }
        m += 1; if (m > 12) { m = 1; y += 1; }
      }
      return out;
    }
    const years = range / 365.2425;
    const step = YEAR_STEPS.find((s) => years / s <= limit) || 10000;
    // Graduations alignées sur l'année historique (…, 200 av., 100 av., 100, 200…) ; pas d'an 0.
    const y0 = civil(min).y, y1 = civil(max).y + 1;
    const h0 = y0 <= 0 ? y0 - 1 : y0;
    for (let h = Math.ceil(h0 / step) * step; ; h += step) {
      if (h === 0) continue;
      const y = h < 0 ? h + 1 : h;
      if (y > y1) break;
      const n = dayNumber(y, 1, 1);
      if (n >= min && n <= max) out.push({ day: n, unit: 'year', y, m: 1, d: 1 });
    }
    return out;
  }

  // --- Mise en page : échelle linéaire, une bande par piste, libellés empilés sans chevauchement.
  const GEO = Object.freeze({ margin: 20, axis: 46, trackHead: 26, lane: 28, gap: 14, bottom: 16 });
  function layout(t, opts = {}) {
    const width = Math.max(320, Math.round(opts.width || 900));
    const labelWidth = opts.labelWidth || ((s) => s.length * 7 + 10);
    const events = sorted(t.events);
    let min, max;
    if (events.length) {
      min = Math.min(...events.map((e) => eventSpan(e)[0])); max = Math.max(...events.map((e) => eventSpan(e)[1]));
      const pad = Math.max(1, Math.round((max - min) * 0.04));
      min -= pad; max += pad;
    } else { min = dayNumber(2000, 1, 1); max = dayNumber(2001, 1, 1); }
    const left = GEO.margin, right = width - GEO.margin, inner = right - left;
    const x = (n) => left + (n - min) / (max - min) * inner;
    const tk = ticks(min, max, Math.floor(inner / 90)).map((k) => ({ ...k, x: x(k.day) }));
    let y = GEO.axis;
    const tracks = t.tracks.map((tr, ti) => {
      const color = COLORS[ti % COLORS.length];
      const lanes = []; // bord droit occupé par voie
      const items = events.filter((e) => e.track === tr.id).map((e) => {
        const [a, b] = eventSpan(e);
        const period = !!e.end;
        let x1 = x(a), x2 = x(b);
        if (!period) { const c = (x1 + x2) / 2; x1 = c; x2 = c; }
        if (period && x2 - x1 < 3) x2 = x1 + 3;
        const lw = labelWidth(e.title);
        const inside = period && x2 - x1 >= lw + 8;
        let side = 'end', lx = period ? (inside ? x1 + 6 : x2 + 6) : x1 + 9;
        if (!inside && lx + lw > right) { side = 'start'; lx = (period ? x1 : x1 - 3) - 6; } // libellé à gauche s'il dépasse
        const occL = Math.min(x1 - (period ? 0 : 6), side === 'start' ? lx - lw : x1);
        const occR = Math.max(x2 + (period ? 0 : 6), side === 'end' && !inside ? lx + lw : x2);
        let lane = lanes.findIndex((r) => r + 8 <= occL);
        if (lane < 0) { lane = lanes.length; lanes.push(occR); } else lanes[lane] = occR;
        return { id: e.id, title: e.title, period, x1, x2, lane, inside, side, lx, color, event: e };
      });
      const top = y, height = GEO.trackHead + Math.max(1, lanes.length) * GEO.lane;
      y += height + GEO.gap;
      return { id: tr.id, name: tr.name, color, top, height, lanes: Math.max(1, lanes.length), items };
    });
    return { width, height: y - GEO.gap + GEO.bottom, min, max, left, right, ticks: tk, tracks, count: events.length };
  }

  // --- Rendu SVG autonome (textes échappés). `fmt` fournit les textes traduits.
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const r1 = (v) => Math.round(v * 10) / 10;
  function toSVG(t, opts, fmt) {
    const g = layout(t, opts);
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-labelledby="tl-title tl-desc" direction="ltr" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`,
      `<title id="tl-title">${esc(t.name)}</title>`, `<desc id="tl-desc">${esc(fmt.desc(g))}</desc>`,
      `<rect width="${g.width}" height="${g.height}" fill="#ffffff"/>`,
      `<line x1="${g.left}" y1="30" x2="${g.right}" y2="30" stroke="#868e96" stroke-width="1"/>`];
    for (const k of g.ticks) {
      out.push(`<line x1="${r1(k.x)}" y1="26" x2="${r1(k.x)}" y2="${g.height - GEO.bottom}" stroke="#e9ecef" stroke-width="1"/>`,
        `<line x1="${r1(k.x)}" y1="26" x2="${r1(k.x)}" y2="34" stroke="#868e96" stroke-width="1"/>`,
        `<text x="${r1(k.x)}" y="20" font-size="11" fill="#495057" text-anchor="middle">${esc(fmt.tick(k))}</text>`);
    }
    for (const tr of g.tracks) {
      out.push(`<rect x="${g.left - 8}" y="${tr.top}" width="${g.right - g.left + 16}" height="${tr.height}" rx="8" fill="${tr.color}" fill-opacity="0.06"/>`,
        `<text x="${g.left}" y="${tr.top + 17}" font-size="12" font-weight="700" fill="${tr.color}">${esc(tr.name)}</text>`);
      for (const it of tr.items) {
        const cy = tr.top + GEO.trackHead + it.lane * GEO.lane + GEO.lane / 2;
        out.push(`<g><title>${esc(`${it.title} — ${fmt.range(it.event)}`)}</title>`);
        if (it.period) out.push(`<rect x="${r1(it.x1)}" y="${r1(cy - 9)}" width="${r1(it.x2 - it.x1)}" height="18" rx="4" fill="${tr.color}" fill-opacity="${it.inside ? 0.9 : 0.75}"/>`);
        else out.push(`<circle cx="${r1(it.x1)}" cy="${r1(cy)}" r="5.5" fill="${tr.color}" stroke="#ffffff" stroke-width="1.5"/>`);
        const fill = it.inside ? '#ffffff' : '#212529';
        // side 'end' = libellé à droite de la marque (le texte commence en lx) ; 'start' = à gauche (il s'y termine).
        out.push(`<text x="${r1(it.lx)}" y="${r1(cy + 4)}" font-size="12" fill="${fill}" text-anchor="${it.side === 'end' ? 'start' : 'end'}">${esc(it.title)}</text></g>`);
      }
      if (!tr.items.length) out.push(`<text x="${g.left}" y="${tr.top + GEO.trackHead + 18}" font-size="12" fill="#868e96">${esc(fmt.emptyTrack)}</text>`);
    }
    out.push('</svg>');
    return out.join('\n') + '\n';
  }

  // --- CSV
  function csvCell(v) {
    let s = String(v);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d{4}(-\d{2}){0,2}$/.test(s))) s = "'" + s; // une date ISO négative reste lisible
    return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(t, lab) {
    const rows = [lab.head];
    for (const tr of t.tracks) {
      for (const e of sorted(t.events.filter((x) => x.track === tr.id))) {
        rows.push([tr.name, e.title, iso(e.start), e.end ? iso(e.end) : '', lab.date(e.start), e.end ? lab.date(e.end) : '', e.note]);
      }
    }
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function uniq(list) { if (new Set(list.map((x) => x.id)).size !== list.length) fail('err.backup'); return list; }
  function validateTimeline(t) {
    if (!isObj(t) || !keysAre(t, ['id', 'name', 'tracks', 'events']) || !Array.isArray(t.tracks) || !Array.isArray(t.events)) fail('err.backup');
    if (t.events.length > MAX.events) fail('err.tooManyEvents', { max: MAX.events });
    const tracks = uniq(t.tracks.map((k) => { if (!isObj(k) || !keysAre(k, ['id', 'name'])) fail('err.backup'); return makeTrack(k, k.id); }));
    const ids = new Set(tracks.map((k) => k.id));
    const events = uniq(t.events.map((e) => {
      if (!isObj(e) || !keysAre(e, ['id', 'title', 'start', 'end', 'track', 'note']) || !ids.has(e.track)) fail('err.backup');
      return makeEvent({ ...e, start: checkDate(e.start), end: e.end === null ? null : checkDate(e.end) }, e.id);
    }));
    return makeTimeline({ name: t.name, tracks, events }, t.id);
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'timelinebuilder' || data.version !== VERSION || !Array.isArray(data.timelines)) fail('err.notBackup');
    if (data.timelines.length > MAX.timelines) fail('err.tooManyTimelines', { max: MAX.timelines });
    return uniq(data.timelines.map(validateTimeline));
  }
  function backup(timelines) { return JSON.stringify({ app: 'timelinebuilder', version: VERSION, timelines: validateBackup({ app: 'timelinebuilder', version: VERSION, timelines }) }, null, 2); }

  root.TimelineCore = Object.freeze({
    VERSION, MAX, COLORS, GEO, dayNumber, civil, isLeap, monthDays, toAstro, fromAstro, parseDate, precision, span, iso,
    makeTrack, makeEvent, makeTimeline, eventSpan, sorted, removeTrack, ticks, layout, toSVG, toCSV, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TimelineCore;
})(typeof window === 'undefined' ? globalThis : window);
