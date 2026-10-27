/* MoveBox — logique pure : inventaire des cartons d'un déménagement, recherche, suivi, statistiques, export.
   Poids en grammes entiers (saisis en kg) ; le poids maximal par carton est une hypothèse choisie par l'utilisateur. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const STATUSES = Object.freeze(['packed', 'loaded', 'delivered', 'opened']); // emballé -> chargé -> livré -> ouvert
  const MAX_BOXES = 999, MAX_NUMBER = 9999, MAX_ITEMS = 100, MAX_ITEM = 80, MAX_ROOM = 40, MAX_NOTES = 200, MAX_WEIGHT_G = 100000;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  // Texte comparable : sans accents ni casse (« Vaisselle » trouve « vaisselle », « tele » trouve « Télé »).
  function norm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

  // « 12,5 » kg -> 12 500 g ; vide -> null (poids inconnu).
  function parseWeightKg(value) {
    const s = String(value ?? '').trim().replace(',', '.');
    if (!s) return null;
    if (!/^\d{1,3}(\.\d{1,3})?$/.test(s)) fail('err.weight', { max: MAX_WEIGHT_G / 1000 });
    const g = Math.round(Number(s) * 1000);
    if (g <= 0 || g > MAX_WEIGHT_G) fail('err.weight', { max: MAX_WEIGHT_G / 1000 });
    return g;
  }
  // Contenu : un objet par ligne (ou séparé par « ; »). Lignes vides ignorées.
  function parseItems(value) {
    const items = (Array.isArray(value) ? value : String(value ?? '').split(/[\n;]+/)).map(clean).filter(Boolean);
    if (items.length > MAX_ITEMS) fail('err.tooManyItems', { max: MAX_ITEMS });
    if (items.some((i) => i.length > MAX_ITEM)) fail('err.itemLong', { max: MAX_ITEM });
    return items;
  }
  function parseNumber(value) {
    const s = String(value ?? '').trim().replace(/^#/, '');
    if (!/^\d{1,4}$/.test(s) || Number(s) < 1 || Number(s) > MAX_NUMBER) fail('err.number', { max: MAX_NUMBER });
    return Number(s);
  }
  function nextNumber(boxes) { return Math.min(MAX_NUMBER, boxes.reduce((m, b) => Math.max(m, b.number), 0) + 1); }

  function makeBox(input, id, boxes = []) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    const number = parseNumber(input.number);
    if (boxes.some((b) => b.id !== id && b.number === number)) fail('err.numberTaken', { n: number });
    if (typeof input.room !== 'string' || !input.room.trim()) fail('err.roomRequired');
    const room = clean(input.room);
    if (room.length > MAX_ROOM) fail('err.roomLong', { max: MAX_ROOM });
    const items = parseItems(input.items);
    const status = input.status === undefined ? 'packed' : input.status;
    if (!STATUSES.includes(status)) fail('err.status');
    const notes = clean(input.notes ?? '');
    if (notes.length > MAX_NOTES) fail('err.notesLong', { max: MAX_NOTES });
    const weightG = typeof input.weightG === 'number' || input.weightG === null ? input.weightG : parseWeightKg(input.weight);
    if (weightG !== null && (!Number.isInteger(weightG) || weightG <= 0 || weightG > MAX_WEIGHT_G)) fail('err.weight', { max: MAX_WEIGHT_G / 1000 });
    return { id, number, room, items, fragile: input.fragile === true, weightG, status, notes };
  }
  // Pièce existante réutilisée telle quelle (même casse) : « salon » rejoint « Salon ».
  function matchRoom(room, boxes) { const r = boxes.find((b) => norm(b.room) === norm(room)); return r ? r.room : clean(room); }

  // --- Suivi
  function nextStatus(status) { const i = STATUSES.indexOf(status); return STATUSES[Math.min(i + 1, STATUSES.length - 1)]; }
  function setStatus(boxes, ids, status) {
    if (!STATUSES.includes(status)) fail('err.status');
    const set = new Set(ids);
    return boxes.map((b) => (set.has(b.id) ? { ...b, status } : b));
  }

  // --- Recherche : chaque mot doit se trouver dans le numéro, la pièce, le contenu ou les notes.
  function search(boxes, query) {
    const q = norm(query);
    if (!q) return [];
    const words = q.split(' ');
    const num = /^#?\d{1,4}$/.test(q) ? Number(q.replace('#', '')) : null;
    const out = [];
    for (const b of boxes) {
      const hay = [norm(b.room), ...b.items.map(norm), norm(b.notes)];
      const all = words.every((w) => hay.some((h) => h.includes(w)) || String(b.number) === w.replace('#', ''));
      if (num !== null ? b.number === num || all : all) {
        const hits = b.items.map((it, k) => (words.some((w) => norm(it).includes(w)) ? k : -1)).filter((k) => k >= 0);
        out.push({ box: b, hits });
      }
    }
    return out.sort((a, b) => a.box.number - b.box.number);
  }

  // --- Statistiques (poids connus additionnés ; cartons sans poids comptés à part).
  function stats(boxes, maxWeightG) {
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    let weightG = 0, unknownWeight = 0, fragile = 0;
    const rooms = new Map();
    for (const b of boxes) {
      byStatus[b.status]++;
      if (b.weightG === null) unknownWeight++; else weightG += b.weightG;
      if (b.fragile) fragile++;
      const k = norm(b.room);
      if (!rooms.has(k)) rooms.set(k, { room: b.room, count: 0, weightG: 0, arrived: 0 });
      const r = rooms.get(k); r.count++; r.weightG += b.weightG || 0;
      if (b.status === 'delivered' || b.status === 'opened') r.arrived++;
    }
    const heavy = maxWeightG ? boxes.filter((b) => b.weightG !== null && b.weightG > maxWeightG).map((b) => b.number).sort((a, c) => a - c) : [];
    const arrived = byStatus.delivered + byStatus.opened;
    return { count: boxes.length, byStatus, arrived, weightG, unknownWeight, fragile, heavy, rooms: [...rooms.values()] };
  }

  // --- Export CSV de l'inventaire (en-têtes et libellés fournis par l'interface, traduits).
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(boxes, opts) {
    const { headers, statusLabel, yes, no, decimal } = opts;
    if (!Array.isArray(headers) || headers.length !== 7) fail('err.headers');
    const lines = [headers.map(csvCell).join(';')];
    for (const b of boxes.slice().sort((a, c) => a.number - c.number)) {
      const kg = b.weightG === null ? '' : String(b.weightG / 1000).replace('.', decimal === 'comma' ? ',' : '.');
      lines.push([b.number, csvCell(b.room), csvCell(b.items.join(' | ')), b.fragile ? yes : no, kg, csvCell(statusLabel(b.status)), csvCell(b.notes)].join(';'));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'movebox' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'settings', 'boxes']) || !Array.isArray(data.boxes) || !isPlain(data.settings)) fail('err.backup');
    if (!sameKeys(data.settings, ['maxWeightG'])) fail('err.backup');
    const m = data.settings.maxWeightG;
    if (m !== null && (!Number.isInteger(m) || m <= 0 || m > MAX_WEIGHT_G)) fail('err.backup');
    if (data.boxes.length > MAX_BOXES) fail('err.tooManyBoxes', { max: MAX_BOXES });
    const boxes = [];
    for (const b of data.boxes) {
      if (!isPlain(b) || !sameKeys(b, ['id', 'number', 'room', 'items', 'fragile', 'weightG', 'status', 'notes'])) fail('err.backup');
      if (!Number.isInteger(b.number) || !Array.isArray(b.items) || !b.items.every((i) => typeof i === 'string') || typeof b.fragile !== 'boolean' || typeof b.notes !== 'string') fail('err.backup');
      if (boxes.some((x) => x.id === b.id)) fail('err.backup');
      boxes.push(makeBox({ ...b, number: String(b.number) }, b.id, boxes));
    }
    return { settings: { maxWeightG: m }, boxes };
  }
  function backup(data) {
    const v = validateData({ app: 'movebox', version: VERSION, ...data });
    return JSON.stringify({ app: 'movebox', version: VERSION, ...v }, null, 2);
  }

  const api = {
    VERSION, STATUSES, MAX_BOXES, MAX_WEIGHT_G,
    norm, parseWeightKg, parseItems, parseNumber, nextNumber, makeBox, matchRoom, nextStatus, setStatus, search, stats, toCSV, validateData, backup,
  };
  root.MoveCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MoveCore;
})(typeof window === 'undefined' ? globalThis : window);
