/* PaintEstimator — logique pure : surfaces à peindre, litres nécessaires, meilleure combinaison de pots.
   Unités internes entières : longueurs en cm, surfaces en cm², volumes en ml, montants en centimes,
   rendement en dixièmes de m²/L. Aucune valeur par défaut inventée : rendement et pots sont saisis. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ projects: 50, rooms: 30, openings: 20, cans: 8, name: 60, needMl: 2000000 }); // 2 000 L au plus pour la combinaison
  const KINDS = Object.freeze(['door', 'window', 'other']); // types d'ouvertures (déduites des murs)
  const ID = /^[a-z0-9-]{6,64}$/i;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }

  // Décimal saisi (« 2,5 » ou « 2.5 ») -> entier à l'échelle 10^dec (ex. dec=2 : 2,5 -> 250).
  function parseScaled(value, dec, key, min, max) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    const re = dec > 0 ? new RegExp(`^\\d{1,7}(\\.\\d{1,${dec}})?$`) : /^\d{1,7}$/;
    if (!re.test(s)) fail(key);
    const [a, b = ''] = s.split('.');
    const n = Number(a) * 10 ** dec + Number((b + '0'.repeat(dec)).slice(0, dec) || 0);
    if (n < min || n > max) fail(key);
    return n;
  }
  const parseLengthCm = (v, key = 'err.length') => parseScaled(v, 2, key, 1, 100000); // 0,01 m à 1 000 m
  const parseHeightCm = (v, key = 'err.height') => parseScaled(v, 2, key, 1, 2000); // 0,01 m à 20 m
  function parseCents(v) { return parseScaled(v, 2, 'err.price', 1, 99999999); } // 0,01 à 999 999,99
  function parseVolumeMl(v) { return parseScaled(v, 3, 'err.volume', 10, 200000); } // 0,01 L à 200 L

  function cleanName(v, key = 'err.nameRequired') {
    if (typeof v !== 'string' || !v.trim()) fail(key);
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return v.trim();
  }

  // --- Constructeurs (saisie brute -> objet validé)
  function makeRoom(input, id, openings = []) {
    const ceiling = input.ceiling === undefined || input.ceiling === null || String(input.ceiling).trim() === ''
      ? 0 : parseScaled(input.ceiling, 2, 'err.ceiling', 0, 10000000) * 100; // m² (2 décimales) -> cm²
    return { id: checkId(id), name: cleanName(input.name), perimeterCm: parseLengthCm(input.perimeter, 'err.perimeter'), heightCm: parseHeightCm(input.height), ceilingCm2: ceiling, openings };
  }
  function makeOpening(input, id) {
    if (!KINDS.includes(input.kind)) fail('err.kind');
    const count = parseScaled(input.count === undefined || input.count === '' ? '1' : input.count, 0, 'err.count', 1, 50);
    return { id: checkId(id), kind: input.kind, widthCm: parseHeightCm(input.width, 'err.width'), heightCm: parseHeightCm(input.height, 'err.height'), count };
  }
  function makeCan(input, id) { return { id: checkId(id), volumeMl: parseVolumeMl(input.volume), priceCents: parseCents(input.price) }; }
  // Réglages : couches (1 à 10), rendement en m²/L (1 décimale, saisi d'après l'étiquette), marge en % (0 à 50).
  function makeSettings(input) {
    const coats = parseScaled(input.coats, 0, 'err.coats', 1, 10);
    const coverage10 = parseScaled(input.coverage, 1, 'err.coverage', 10, 1000); // 1,0 à 100,0 m²/L
    const marginPct = parseScaled(input.margin === undefined || input.margin === '' ? '0' : input.margin, 0, 'err.margin', 0, 50);
    return { coats, coverage10, marginPct };
  }
  function makeProject(name, id) { return { id: checkId(id), name: cleanName(name), coats: 2, coverage10: 0, marginPct: 0, cans: [], rooms: [] }; }

  // --- Surfaces
  // Murs = périmètre × hauteur ; on retire portes, fenêtres et autres ouvertures ; plafond éventuel ajouté.
  function roomAreas(room) {
    const wallCm2 = room.perimeterCm * room.heightCm;
    const openingsCm2 = room.openings.reduce((s, o) => s + o.widthCm * o.heightCm * o.count, 0);
    if (openingsCm2 > wallCm2) fail('err.openingsTooBig', { room: room.name });
    for (const o of room.openings) if (o.heightCm > room.heightCm) fail('err.openingTooHigh', { room: room.name });
    const netCm2 = wallCm2 - openingsCm2;
    return { wallCm2, openingsCm2, netCm2, ceilingCm2: room.ceilingCm2, totalCm2: netCm2 + room.ceilingCm2 };
  }

  // Litres nécessaires (en ml, arrondis au ml supérieur) : surface × couches ÷ rendement, puis marge.
  // cm² ÷ 10 000 = m² ; m² ÷ (rendement10 ÷ 10) = L ; L × 1 000 = ml  =>  ml = cm² × couches ÷ rendement10.
  function needMl(totalCm2, coats, coverage10) {
    if (!coverage10) return null;
    return Math.ceil(totalCm2 * coats / coverage10);
  }
  function withMargin(ml, marginPct) { return Math.ceil(ml * (100 + marginPct) / 100); }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  // Meilleure combinaison de pots couvrant au moins `need` ml : coût minimal, puis moins de surplus, puis moins de pots.
  // Programmation dynamique exacte (sac à dos non borné) en unités de pgcd des contenances.
  function bestCombination(need, cans) {
    if (!cans.length) return null;
    if (need > MAX.needMl) return { tooBig: true };
    if (need <= 0) return { items: [], totalMl: 0, totalCents: 0, count: 0, leftoverMl: 0 };
    const g = cans.reduce((a, c) => gcd(a, c.volumeMl), 0);
    const units = cans.map((c) => c.volumeMl / g);
    const N = Math.ceil(need / g), M = N + Math.max(...units);
    const cost = new Float64Array(M + 1).fill(Infinity), cnt = new Int32Array(M + 1), prev = new Int16Array(M + 1).fill(-1);
    cost[0] = 0;
    for (let v = 1; v <= M; v++) {
      for (let i = 0; i < cans.length; i++) {
        const u = units[i]; if (u > v || cost[v - u] === Infinity) continue;
        const c = cost[v - u] + cans[i].priceCents, k = cnt[v - u] + 1;
        if (c < cost[v] || (c === cost[v] && k < cnt[v])) { cost[v] = c; cnt[v] = k; prev[v] = i; }
      }
    }
    let best = -1;
    for (let v = N; v <= M; v++) {
      if (cost[v] === Infinity) continue;
      if (best < 0 || cost[v] < cost[best]) best = v; // v croissant : à coût égal, on garde le moindre surplus
    }
    const qty = new Array(cans.length).fill(0);
    for (let v = best; v > 0; v -= units[prev[v]]) qty[prev[v]]++;
    const items = cans.map((c, i) => ({ canId: c.id, volumeMl: c.volumeMl, priceCents: c.priceCents, qty: qty[i] }))
      .filter((x) => x.qty > 0).sort((a, b) => b.volumeMl - a.volumeMl);
    const totalMl = best * g;
    return { items, totalMl, totalCents: cost[best], count: cnt[best], leftoverMl: totalMl - need };
  }
  // Pour comparaison : n'acheter qu'une seule contenance.
  function singleSize(need, cans) {
    return cans.map((c) => { const qty = Math.max(0, Math.ceil(need / c.volumeMl)); return { canId: c.id, volumeMl: c.volumeMl, qty, totalCents: qty * c.priceCents, leftoverMl: qty * c.volumeMl - need }; })
      .sort((a, b) => a.totalCents - b.totalCents || a.leftoverMl - b.leftoverMl);
  }

  // Estimation complète d'un projet.
  function estimate(project) {
    const rooms = project.rooms.map((r) => ({ id: r.id, name: r.name, ...roomAreas(r) }));
    const totalCm2 = rooms.reduce((s, r) => s + r.totalCm2, 0);
    const paintedCm2 = totalCm2 * project.coats; // surface à couvrir, toutes couches comprises
    const rawMl = needMl(totalCm2, project.coats, project.coverage10);
    const need = rawMl === null ? null : withMargin(rawMl, project.marginPct);
    const combo = need === null ? null : bestCombination(need, project.cans);
    const singles = need === null || (combo && combo.tooBig) ? [] : singleSize(need, project.cans);
    return { rooms, totalCm2, paintedCm2, rawMl, needMl: need, combo, singles };
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  const intIn = (n, a, b) => Number.isSafeInteger(n) && n >= a && n <= b;
  const dec = (n, d) => (n / 10 ** d).toFixed(d); // entier -> texte saisi équivalent
  function validateProject(p) {
    if (keys(p) !== 'cans,coats,coverage10,id,marginPct,name,rooms' || !Array.isArray(p.rooms) || !Array.isArray(p.cans)) fail('err.backup');
    if (p.rooms.length > MAX.rooms || p.cans.length > MAX.cans) fail('err.backup');
    if (!intIn(p.coats, 1, 10) || !(p.coverage10 === 0 || intIn(p.coverage10, 10, 1000)) || !intIn(p.marginPct, 0, 50)) fail('err.backup');
    const cans = p.cans.map((c) => {
      if (keys(c) !== 'id,priceCents,volumeMl' || !intIn(c.volumeMl, 10, 200000) || !intIn(c.priceCents, 1, 99999999)) fail('err.backup');
      return makeCan({ volume: dec(c.volumeMl, 3), price: dec(c.priceCents, 2) }, c.id);
    });
    const rooms = p.rooms.map((r) => {
      if (keys(r) !== 'ceilingCm2,heightCm,id,name,openings,perimeterCm' || !Array.isArray(r.openings) || r.openings.length > MAX.openings) fail('err.backup');
      if (!intIn(r.perimeterCm, 1, 100000) || !intIn(r.heightCm, 1, 2000) || !intIn(r.ceilingCm2, 0, 1e9) || r.ceilingCm2 % 100) fail('err.backup');
      const openings = r.openings.map((o) => {
        if (keys(o) !== 'count,heightCm,id,kind,widthCm' || !intIn(o.widthCm, 1, 2000) || !intIn(o.heightCm, 1, 2000) || !intIn(o.count, 1, 50)) fail('err.backup');
        return makeOpening({ kind: o.kind, width: dec(o.widthCm, 2), height: dec(o.heightCm, 2), count: String(o.count) }, o.id);
      });
      const room = makeRoom({ name: r.name, perimeter: dec(r.perimeterCm, 2), height: dec(r.heightCm, 2), ceiling: dec(r.ceilingCm2 / 100, 2) }, r.id, openings);
      return room;
    });
    const ids = [p.id, ...cans.map((c) => c.id), ...rooms.map((r) => r.id), ...rooms.flatMap((r) => r.openings.map((o) => o.id))];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return { id: checkId(p.id), name: cleanName(p.name), coats: p.coats, coverage10: p.coverage10, marginPct: p.marginPct, cans, rooms };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'paintestimator' || data.version !== VERSION || !Array.isArray(data.projects)) fail('err.notBackup');
    if (keys(data) !== 'app,projects,version') fail('err.backup');
    if (data.projects.length > MAX.projects) fail('err.tooManyProjects', { max: MAX.projects });
    const projects = data.projects.map(validateProject);
    if (new Set(projects.map((p) => p.id)).size !== projects.length) fail('err.backup');
    return projects;
  }
  function backup(projects) { return JSON.stringify({ app: 'paintestimator', version: VERSION, projects: validateBackup({ app: 'paintestimator', version: VERSION, projects }) }, null, 2); }

  // --- Export CSV (séparateur « ; », BOM pour les tableurs, cellules protégées contre les formules)
  function csvCell(v) { let s = String(v); if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  // rows : tableau de tableaux déjà formatés par l'interface (en-têtes traduits).
  function toCsv(rows) { return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

  root.PaintCore = Object.freeze({ VERSION, MAX, KINDS, parseScaled, makeRoom, makeOpening, makeCan, makeSettings, makeProject, roomAreas, needMl, withMargin, bestCombination, singleSize, estimate, validateBackup, backup, toCsv });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PaintCore;
})(typeof window === 'undefined' ? globalThis : window);
