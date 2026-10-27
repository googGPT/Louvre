/* LaundryDecoder — logique pure : catalogue des symboles d'entretien textile, combinaison d'une étiquette
   (consigne la plus prudente retenue, conflits et manques signalés), recherche, pictogrammes SVG, sauvegarde.
   Les pictogrammes sont dessinés pour cette appli, dans l'esprit des familles de symboles (bassine, triangle,
   carré, fer, cercle) ; ils ne reproduisent aucune illustration officielle. Températures en °C entiers. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const FAMILIES = Object.freeze(['wash', 'bleach', 'tumble', 'natural', 'iron', 'dry', 'wet']);
  // Catégories affichées : l'entretien professionnel regroupe nettoyage à sec (dry) et à l'eau (wet).
  const CATEGORIES = Object.freeze({ wash: ['wash'], bleach: ['bleach'], tumble: ['tumble'], natural: ['natural'], iron: ['iron'], pro: ['dry', 'wet'] });
  const MODES = Object.freeze(['normal', 'gentle', 'veryGentle']); // du plus énergique au plus doux
  const MAX_LABELS = 300, MAX_NAME = 60, MAX_SYMBOLS = 14;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  // Catalogue ordonné : chaque symbole a une famille et ses propriétés (sans texte : l'interface traduit).
  const S = (family, props) => Object.freeze({ family, ...props });
  const SYMBOLS = Object.freeze({
    w95: S('wash', { kind: 'machine', maxC: 95, mode: 'normal' }),
    w70: S('wash', { kind: 'machine', maxC: 70, mode: 'normal' }),
    w60: S('wash', { kind: 'machine', maxC: 60, mode: 'normal' }),
    w60g: S('wash', { kind: 'machine', maxC: 60, mode: 'gentle' }),
    w50g: S('wash', { kind: 'machine', maxC: 50, mode: 'gentle' }),
    w40: S('wash', { kind: 'machine', maxC: 40, mode: 'normal' }),
    w40g: S('wash', { kind: 'machine', maxC: 40, mode: 'gentle' }),
    w40vg: S('wash', { kind: 'machine', maxC: 40, mode: 'veryGentle' }),
    w30: S('wash', { kind: 'machine', maxC: 30, mode: 'normal' }),
    w30g: S('wash', { kind: 'machine', maxC: 30, mode: 'gentle' }),
    w30vg: S('wash', { kind: 'machine', maxC: 30, mode: 'veryGentle' }),
    whand: S('wash', { kind: 'hand', maxC: 40 }),
    wno: S('wash', { kind: 'none' }),
    bany: S('bleach', { level: 2 }), // tout agent de blanchiment
    boxy: S('bleach', { level: 1 }), // agents oxygénés seulement (pas de chlore)
    bno: S('bleach', { level: 0 }),
    tnormal: S('tumble', { level: 2 }),
    tlow: S('tumble', { level: 1 }),
    tno: S('tumble', { level: 0 }),
    nline: S('natural', { method: 'line', drip: false, shade: false }),
    nlineDrip: S('natural', { method: 'line', drip: true, shade: false }),
    nflat: S('natural', { method: 'flat', drip: false, shade: false }),
    nflatDrip: S('natural', { method: 'flat', drip: true, shade: false }),
    nlineShade: S('natural', { method: 'line', drip: false, shade: true }),
    nflatShade: S('natural', { method: 'flat', drip: false, shade: true }),
    i200: S('iron', { maxC: 200 }),
    i150: S('iron', { maxC: 150 }),
    i110: S('iron', { maxC: 110 }),
    ino: S('iron', { maxC: 0 }),
    dP: S('dry', { kind: 'pro', solvent: 'P', mode: 'normal' }),
    dPg: S('dry', { kind: 'pro', solvent: 'P', mode: 'gentle' }),
    dF: S('dry', { kind: 'pro', solvent: 'F', mode: 'normal' }),
    dFg: S('dry', { kind: 'pro', solvent: 'F', mode: 'gentle' }),
    dno: S('dry', { kind: 'none' }),
    ww: S('wet', { kind: 'pro', mode: 'normal' }),
    wwg: S('wet', { kind: 'pro', mode: 'gentle' }),
    wwvg: S('wet', { kind: 'pro', mode: 'veryGentle' }),
    wwno: S('wet', { kind: 'none' }),
  });
  const IDS = Object.freeze(Object.keys(SYMBOLS));

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const has = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(SYMBOLS, id);
  // Texte comparable : sans accents ni casse.
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Liste de symboles d'une étiquette : connus, sans doublon, remis dans l'ordre du catalogue.
  function cleanSymbols(ids) {
    if (!Array.isArray(ids)) fail('err.symbol');
    if (ids.length > MAX_SYMBOLS) fail('err.tooManySymbols', { max: MAX_SYMBOLS });
    if (!ids.every(has)) fail('err.symbol');
    if (new Set(ids).size !== ids.length) fail('err.symbol');
    return IDS.filter((id) => ids.includes(id));
  }
  const gentlest = (modes) => MODES[Math.max(...modes.map((m) => MODES.indexOf(m)))];

  // Fusion d'une famille : la consigne la plus prudente l'emporte quand plusieurs symboles se contredisent.
  function mergeFamily(family, ids) {
    const syms = ids.map((id) => SYMBOLS[id]);
    switch (family) {
      case 'wash': {
        if (syms.some((s) => s.kind === 'none')) return { kind: 'none' };
        const temps = syms.map((s) => s.maxC);
        if (syms.some((s) => s.kind === 'hand')) return { kind: 'hand', maxC: Math.min(...temps) };
        return { kind: 'machine', maxC: Math.min(...temps), mode: gentlest(syms.map((s) => s.mode)) };
      }
      case 'bleach': case 'tumble': return { level: Math.min(...syms.map((s) => s.level)) };
      case 'iron': return { maxC: Math.min(...syms.map((s) => s.maxC)) };
      case 'natural': return { ids: ids.slice() }; // modes de séchage non ordonnés : tous listés
      case 'dry': {
        if (syms.some((s) => s.kind === 'none')) return { kind: 'none' };
        // F (hydrocarbures seulement) est plus restrictif que P (solvants usuels, dont ceux de F).
        return { kind: 'pro', solvent: syms.some((s) => s.solvent === 'F') ? 'F' : 'P', mode: gentlest(syms.map((s) => s.mode)) };
      }
      case 'wet': {
        if (syms.some((s) => s.kind === 'none')) return { kind: 'none' };
        return { kind: 'pro', mode: gentlest(syms.map((s) => s.mode)) };
      }
      default: return fail('err.symbol');
    }
  }

  // Combinaison d'une étiquette : consignes par famille, conflits, avertissements, familles absentes.
  function combine(input) {
    const ids = cleanSymbols(input);
    const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, ids.filter((id) => SYMBOLS[id].family === f)]));
    const families = {}, conflicts = [], warnings = [], missing = [];
    for (const f of FAMILIES) {
      const list = byFamily[f];
      if (!list.length) { families[f] = null; missing.push(f); continue; }
      families[f] = mergeFamily(f, list);
      if (list.length > 1) conflicts.push({ type: f === 'natural' ? 'naturalMany' : 'duplicate', family: f, ids: list });
    }
    const forbidden = (f) => families[f] && families[f].kind === 'none';
    if (forbidden('wash') && forbidden('dry') && forbidden('wet')) conflicts.push({ type: 'noCleaning' });
    else if (forbidden('wash') && !(families.dry && families.dry.kind === 'pro') && !(families.wet && families.wet.kind === 'pro')) warnings.push({ type: 'noMethod' });
    if (families.tumble && families.tumble.level === 0 && !families.natural) warnings.push({ type: 'dryingUnknown' });
    if (families.bleach && families.bleach.level > 0 && forbidden('wash')) warnings.push({ type: 'bleachNoWash' });
    return { ids, families, conflicts, warnings, missing, empty: ids.length === 0 };
  }

  // Recherche dans le dictionnaire : chaque mot doit apparaître dans le texte traduit du symbole
  // (fourni par l'interface), ou un nombre doit égaler la température du symbole (« 40 »).
  function search(query, textOf) {
    const q = norm(query);
    if (!q) return IDS.slice();
    const words = q.split(' ');
    return IDS.filter((id) => {
      const hay = norm(textOf(id)), s = SYMBOLS[id];
      return words.every((w) => hay.includes(w) || (/^\d{2,3}$/.test(w) && s.maxC === Number(w)));
    });
  }

  // --- Pictogrammes (viewBox 48 × 48, trait « currentColor »)
  const NS = 'http://www.w3.org/2000/svg';
  const CROSS = '<path d="M5 5 43 43M43 5 5 43" stroke-width="3.2"/>';
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="2.4" fill="currentColor" stroke="none"/>`;
  const label = (txt, y, size) => `<text x="24" y="${y}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${size}" fill="currentColor" stroke="none">${txt}</text>`;
  const bars = (mode, y, x1, x2) => (mode === 'gentle' ? [y] : mode === 'veryGentle' ? [y, y + 4] : []).map((v) => `<path d="M${x1} ${v} H${x2}"/>`).join('');
  function shapes(id) {
    const s = SYMBOLS[id];
    const tub = '<path d="M5 14 L10 36 H38 L43 14"/><path d="M5 14 q4.75 -5 9.5 0 t9.5 0 t9.5 0 t9.5 0"/>';
    switch (s.family) {
      case 'wash':
        if (s.kind === 'hand') return tub + '<path d="M19 30 V9 M23 30 V6 M27 30 V8 M31 30 V12 M19 22 L14 17 M19 30 C21 33 29 33 31 28"/>';
        if (s.kind === 'none') return tub + CROSS;
        return tub + label(String(s.maxC), 31, 12) + bars(s.mode, 41, 9, 39);
      case 'bleach': {
        const tri = '<path d="M24 6 L44 40 H4 Z"/>';
        if (s.level === 1) return tri + '<path d="M17 37 L25 22 M24 37 L32 23"/>';
        return s.level === 0 ? tri + CROSS : tri;
      }
      case 'tumble': {
        const base = '<rect x="6" y="6" width="36" height="36" rx="2"/><circle cx="24" cy="24" r="12"/>';
        if (s.level === 0) return base + CROSS;
        return base + (s.level === 2 ? dot(19.5, 24) + dot(28.5, 24) : dot(24, 24));
      }
      case 'natural': {
        let d = '<rect x="6" y="6" width="36" height="36" rx="2"/>';
        if (s.method === 'line') d += s.drip ? '<path d="M20 13 V36 M28 13 V36"/>' : '<path d="M24 13 V36"/>';
        else d += s.drip ? '<path d="M13 20 H36 M13 28 H36"/>' : '<path d="M13 24 H36"/>';
        if (s.shade) d += '<path d="M6 14 L14 6 M6 21 L21 6"/>';
        return d;
      }
      case 'iron': {
        const body = '<path d="M5 37 C7 27 13 21 22 21 H42 V37 Z"/><path d="M25 21 C25 14 27 12 31 12 H42 V21"/>';
        if (s.maxC === 0) return body + CROSS;
        const n = s.maxC >= 200 ? 3 : s.maxC >= 150 ? 2 : 1;
        return body + [[30], [26, 34], [22, 30, 38]][n - 1].map((x) => dot(x, 30)).join('');
      }
      default: { // dry et wet : cercle avec lettre
        const circle = '<circle cx="24" cy="21" r="15"/>';
        const letter = s.family === 'wet' ? 'W' : s.kind === 'pro' ? s.solvent : 'P';
        const core = circle + label(s.kind === 'none' && s.family === 'dry' ? '' : letter, 27, 16);
        if (s.kind === 'none') return (s.family === 'dry' ? circle : core) + CROSS;
        return core + bars(s.mode, 41, 12, 36);
      }
    }
  }
  // Un pictogramme seul (pour l'interface).
  function svg(id) {
    if (!has(id)) fail('err.symbol');
    return `<svg xmlns="${NS}" viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes(id)}</svg>`;
  }
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Étiquette complète en SVG autonome (export) : titre, pictogrammes alignés, lignes de consignes.
  function labelSvg(ids, title, lines = [], rtl = false) {
    const list = cleanSymbols(ids);
    if (!list.length) fail('err.noSymbols');
    const perRow = 7, cell = 56, pad = 16, rows = Math.ceil(list.length / perRow);
    const width = pad * 2 + perRow * cell, top = 44, textTop = top + rows * cell + 16;
    const height = textTop + lines.length * 20 + pad;
    const icons = list.map((id, k) => `<g transform="translate(${pad + (k % perRow) * cell + 4} ${top + Math.floor(k / perRow) * cell})" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${shapes(id)}</g>`).join('');
    // Textes alignés au début de la ligne (à droite en arabe).
    const tx = rtl ? `x="${width - pad}" text-anchor="end" direction="rtl"` : `x="${pad}"`;
    const text = lines.map((l, k) => `<text ${tx} y="${textTop + k * 20}" font-family="sans-serif" font-size="13" fill="#111">${xml(l)}</text>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" color="#111">` +
      `<rect width="${width}" height="${height}" fill="#fff"/><text ${tx} y="28" font-family="sans-serif" font-size="17" font-weight="700" fill="#111">${xml(title)}</text>${icons}${text}</svg>\n`;
  }

  // --- Étiquettes enregistrées et sauvegarde
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return s;
  }
  function makeLabel(input, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    const symbols = cleanSymbols(input.symbols);
    if (!symbols.length) fail('err.noSymbols');
    return { id, name: cleanName(input.name), symbols };
  }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'laundrydecoder' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'labels']) || !Array.isArray(data.labels)) fail('err.backup');
    if (data.labels.length > MAX_LABELS) fail('err.tooMany', { max: MAX_LABELS });
    const labels = data.labels.map((l) => {
      if (!isPlain(l) || !sameKeys(l, ['id', 'name', 'symbols'])) fail('err.backup');
      return makeLabel(l, l.id);
    });
    if (new Set(labels.map((l) => l.id)).size !== labels.length) fail('err.backup');
    return { labels };
  }
  function backup(data) {
    const v = validateData({ app: 'laundrydecoder', version: VERSION, ...data });
    return JSON.stringify({ app: 'laundrydecoder', version: VERSION, ...v }, null, 2);
  }

  const api = { VERSION, FAMILIES, CATEGORIES, MODES, SYMBOLS, IDS, MAX_LABELS, MAX_NAME, MAX_SYMBOLS, norm, cleanSymbols, combine, search, svg, labelSvg, makeLabel, validateData, backup };
  root.LaundryCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LaundryCore;
})(typeof window === 'undefined' ? globalThis : window);
