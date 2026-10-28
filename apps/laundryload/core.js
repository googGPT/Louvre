/* LaundryLoad — logique pure : vêtements enregistrés et regroupement automatique en charges de lessive compatibles.
   Règles explicites : couleurs séparées (blancs, clairs, couleurs, foncés ; blancs et clairs réunis sur demande),
   programmes séparés (normal, délicat, laine), température d'une charge = minimum de ses articles,
   écart de température maximal et capacité de la machine choisis par l'utilisateur. Poids en grammes entiers. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const COLORS = Object.freeze(['white', 'light', 'color', 'dark']);
  const MATERIALS = Object.freeze(['cotton', 'linen', 'synthetic', 'blend', 'wool', 'silk']);
  const CARES = Object.freeze(['machine', 'hand', 'none']);
  const TEMPS = Object.freeze([20, 30, 40, 50, 60, 90, 95]); // températures maximales d'étiquette (°C)
  const PROGRAMS = Object.freeze(['normal', 'delicate', 'wool']);
  const GAPS = Object.freeze([0, 10, 20, 30]); // écarts de température proposés (null = sans limite)
  const MAX_GARMENTS = 300, MAX_NAME = 60, MAX_GARMENT_G = 20000, MIN_CAP_G = 1000, MAX_CAP_G = 30000;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const cmpText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  // « 0,25 » kg -> 250 g (au gramme près).
  function parseKg(value, min, max, key) {
    const s = String(value ?? '').trim().replace(',', '.');
    if (!/^\d{1,2}(\.\d{1,3})?$/.test(s)) fail(key, { min: min / 1000, max: max / 1000 });
    const g = Math.round(Number(s) * 1000);
    if (g < min || g > max) fail(key, { min: min / 1000, max: max / 1000 });
    return g;
  }
  const parseWeight = (v) => parseKg(v, 10, MAX_GARMENT_G, 'err.weight');
  const parseCapacity = (v) => parseKg(v, MIN_CAP_G, MAX_CAP_G, 'err.capacity');

  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return s;
  }

  // Vêtement : la température maximale n'existe que pour un lavage en machine.
  function makeGarment(input, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    const name = cleanName(input.name);
    if (!COLORS.includes(input.color)) fail('err.color');
    if (!MATERIALS.includes(input.material)) fail('err.material');
    if (!CARES.includes(input.care)) fail('err.care');
    let maxC = null;
    if (input.care === 'machine') {
      maxC = Number(input.maxC);
      if (!TEMPS.includes(maxC)) fail('err.temp');
    }
    const weightG = typeof input.weightG === 'number' ? input.weightG : parseWeight(input.weight);
    if (!Number.isInteger(weightG) || weightG < 10 || weightG > MAX_GARMENT_G) fail('err.weight', { min: 0.01, max: MAX_GARMENT_G / 1000 });
    for (const k of ['tumble', 'delicate', 'inBasket']) if (typeof input[k] !== 'boolean') fail('err.backup');
    return { id, name, color: input.color, material: input.material, care: input.care, maxC, tumble: input.tumble, delicate: input.delicate, weightG, inBasket: input.inBasket };
  }

  // Réglages : capacité obligatoire pour planifier ; écart null = sans limite ; remplissage des programmes doux en %.
  function makeSettings(input) {
    const capacityG = input.capacityG === null ? null : (typeof input.capacityG === 'number' ? input.capacityG : parseCapacity(input.capacity));
    if (capacityG !== null && (!Number.isInteger(capacityG) || capacityG < MIN_CAP_G || capacityG > MAX_CAP_G)) fail('err.capacity', { min: MIN_CAP_G / 1000, max: MAX_CAP_G / 1000 });
    if (typeof input.mergeLight !== 'boolean') fail('err.backup');
    const gap = input.tempGapC === null || input.tempGapC === '' ? null : Number(input.tempGapC);
    if (gap !== null && !GAPS.includes(gap)) fail('err.gap');
    const fill = Number(input.gentleFillPct);
    if (!Number.isInteger(fill) || fill < 10 || fill > 100) fail('err.fill');
    return { capacityG, mergeLight: input.mergeLight, tempGapC: gap, gentleFillPct: fill };
  }
  const DEFAULT_SETTINGS = Object.freeze({ capacityG: null, mergeLight: false, tempGapC: null, gentleFillPct: 100 });

  // Programme imposé par l'article : laine > délicat (case cochée ou soie) > normal.
  function programOf(g) { return g.material === 'wool' ? 'wool' : (g.delicate || g.material === 'silk') ? 'delicate' : 'normal'; }
  function colorClass(g, mergeLight) { return mergeLight && (g.color === 'white' || g.color === 'light') ? 'whiteLight' : g.color; }
  const CLASS_ORDER = ['white', 'whiteLight', 'light', 'color', 'dark'];

  // Regroupement : groupes (couleur × programme), bandes de température, puis remplissage « premier qui convient »
  // par poids décroissant (déterministe : égalités départagées par nom puis identifiant).
  function plan(garments, settings) {
    if (!settings.capacityG) fail('err.noCapacity');
    const basket = garments.filter((g) => g.inBasket);
    const excluded = { hand: basket.filter((g) => g.care === 'hand').map((g) => g.id), none: basket.filter((g) => g.care === 'none').map((g) => g.id) };
    const groups = new Map();
    for (const g of basket.filter((x) => x.care === 'machine')) {
      const key = `${colorClass(g, settings.mergeLight)}|${programOf(g)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      const [ca, pa] = a.split('|'), [cb, pb] = b.split('|');
      return (CLASS_ORDER.indexOf(ca) - CLASS_ORDER.indexOf(cb)) || (PROGRAMS.indexOf(pa) - PROGRAMS.indexOf(pb));
    });
    const loads = [];
    for (const key of keys) {
      const [color, program] = key.split('|');
      const cap = program === 'normal' ? settings.capacityG : Math.floor(settings.capacityG * settings.gentleFillPct / 100);
      let rest = groups.get(key).slice().sort((a, b) => (b.maxC - a.maxC) || (b.weightG - a.weightG) || cmpText(a.name, b.name) || cmpText(a.id, b.id));
      const bands = [];
      while (rest.length) {
        const top = rest[0].maxC;
        const inBand = settings.tempGapC === null ? rest : rest.filter((g) => g.maxC >= top - settings.tempGapC);
        bands.push(inBand); rest = rest.filter((g) => !inBand.includes(g));
      }
      const groupLoads = [];
      for (const band of bands) {
        const bins = [];
        for (const g of band.slice().sort((a, b) => (b.weightG - a.weightG) || cmpText(a.name, b.name) || cmpText(a.id, b.id))) {
          const bin = bins.find((x) => !x.over && x.weightG + g.weightG <= cap);
          if (bin) { bin.items.push(g); bin.weightG += g.weightG; }
          else bins.push({ items: [g], weightG: g.weightG, over: g.weightG > cap });
        }
        for (const bin of bins) {
          const maxC = Math.min(...bin.items.map((g) => g.maxC));
          const items = bin.items.slice().sort((a, b) => (a.maxC - b.maxC) || cmpText(a.name, b.name) || cmpText(a.id, b.id));
          groupLoads.push({
            color, program, maxC, capacityG: cap, weightG: bin.weightG, over: bin.over,
            fillPct: Math.round(100 * bin.weightG / cap),
            items: items.map((g) => g.id),
            limitedBy: items.filter((g) => g.maxC === maxC).map((g) => g.id),
            colder: items.filter((g) => g.maxC > maxC).map((g) => g.id), // lavés plus froid que leur maximum
            tumble: items.filter((g) => g.tumble).map((g) => g.id),
            air: items.filter((g) => !g.tumble).map((g) => g.id),
          });
        }
      }
      groupLoads.sort((a, b) => (b.maxC - a.maxC) || (b.weightG - a.weightG));
      groupLoads.forEach((l, k) => { l.part = k + 1; l.parts = groupLoads.length; l.bands = bands.length; loads.push(l); });
    }
    const totalG = loads.reduce((s, l) => s + l.weightG, 0);
    return { loads, excluded, totalG, inBasket: basket.length };
  }

  // --- Export CSV des charges (en-têtes et libellés fournis par l'interface, traduits).
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(result, garments, opts) {
    const { headers, colorLabel, programLabel, yes, no, decimal } = opts;
    if (!Array.isArray(headers) || headers.length !== 7) fail('err.headers');
    const byId = new Map(garments.map((g) => [g.id, g]));
    const kg = (g) => String(g / 1000).replace('.', decimal === 'comma' ? ',' : '.');
    const lines = [headers.map(csvCell).join(';')];
    result.loads.forEach((l, k) => {
      for (const id of l.items) {
        const g = byId.get(id);
        lines.push([k + 1, csvCell(colorLabel(l.color)), csvCell(programLabel(l.program)), l.maxC, csvCell(g.name), kg(g.weightG), csvCell(g.tumble ? yes : no)].join(';'));
      }
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'laundryload' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'settings', 'garments']) || !isPlain(data.settings) || !Array.isArray(data.garments)) fail('err.backup');
    if (!sameKeys(data.settings, ['capacityG', 'mergeLight', 'tempGapC', 'gentleFillPct'])) fail('err.backup');
    const settings = makeSettings(data.settings);
    if (data.garments.length > MAX_GARMENTS) fail('err.tooMany', { max: MAX_GARMENTS });
    const garments = data.garments.map((g) => {
      if (!isPlain(g) || !sameKeys(g, ['id', 'name', 'color', 'material', 'care', 'maxC', 'tumble', 'delicate', 'weightG', 'inBasket'])) fail('err.backup');
      if (g.care !== 'machine' && g.maxC !== null) fail('err.backup');
      if (g.care === 'machine' && !Number.isInteger(g.maxC)) fail('err.backup');
      return makeGarment(g, g.id);
    });
    if (new Set(garments.map((g) => g.id)).size !== garments.length) fail('err.backup');
    return { settings, garments };
  }
  function backup(data) {
    const v = validateData({ app: 'laundryload', version: VERSION, ...data });
    return JSON.stringify({ app: 'laundryload', version: VERSION, ...v }, null, 2);
  }

  const api = { VERSION, COLORS, MATERIALS, CARES, TEMPS, PROGRAMS, GAPS, MAX_GARMENTS, DEFAULT_SETTINGS, parseWeight, parseCapacity, makeGarment, makeSettings, programOf, colorClass, plan, toCSV, validateData, backup };
  root.LoadCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LoadCore;
})(typeof window === 'undefined' ? globalThis : window);
