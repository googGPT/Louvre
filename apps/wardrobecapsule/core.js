/* WardrobeCapsule — logique pure : garde-robe capsule, compteur de tenues compatibles, suggestions déterministes,
   manques signalés. Une tenue = haut + bas + chaussures, ou pièce unique (robe, combinaison) + chaussures.
   Règles explicites : les couleurs neutres vont avec tout ; au plus N couleurs non neutres distinctes par tenue
   (N choisi par l'utilisateur) ; toutes les pièces partagent la saison et l'occasion demandées (ou au moins une). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const CATEGORIES = Object.freeze(['top', 'bottom', 'onepiece', 'shoes', 'outer', 'accessory']);
  const OUTFIT_CATS = Object.freeze(['top', 'bottom', 'onepiece', 'shoes']); // pièces qui composent une tenue
  // Couleurs proposées : teinte d'affichage et caractère neutre (règle fixe, affichée dans l'appli).
  const COLORS = Object.freeze({
    black: { hex: '#1f1f1f', neutral: true }, white: { hex: '#f8f9fa', neutral: true }, grey: { hex: '#8a8f98', neutral: true },
    navy: { hex: '#1b2a4a', neutral: true }, beige: { hex: '#d8c3a5', neutral: true }, brown: { hex: '#7a4e2d', neutral: true },
    denim: { hex: '#4a6fa5', neutral: true }, red: { hex: '#c92a2a', neutral: false }, pink: { hex: '#e64980', neutral: false },
    orange: { hex: '#e8590c', neutral: false }, yellow: { hex: '#f2c94c', neutral: false }, green: { hex: '#2f9e44', neutral: false },
    olive: { hex: '#6b7a2a', neutral: false }, blue: { hex: '#1c7ed6', neutral: false }, purple: { hex: '#7048e8', neutral: false },
    burgundy: { hex: '#7d1d3f', neutral: false },
  });
  const COLOR_IDS = Object.freeze(Object.keys(COLORS));
  const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
  const OCCASIONS = Object.freeze(['casual', 'work', 'sport', 'evening']);
  const MAX_ITEMS = 200, MAX_NAME = 60, MAX_TARGET = 50, MAX_ACCENTS = 3, LIST_CAP = 5000;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const cmpText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const byName = (a, b) => cmpText(a.name, b.name) || cmpText(a.id, b.id);
  const hasColor = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(COLORS, c);

  // Sous-ensemble non vide d'une liste fixe, remis dans l'ordre de référence.
  function subset(values, ref, key) {
    if (!Array.isArray(values) || !values.length || !values.every((v) => ref.includes(v)) || new Set(values).size !== values.length) fail(key);
    return ref.filter((v) => values.includes(v));
  }
  function makeItem(input, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    if (typeof input.name !== 'string' || !input.name.trim()) fail('err.nameRequired');
    const name = input.name.replace(/\s+/g, ' ').trim();
    if (name.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    if (!CATEGORIES.includes(input.category)) fail('err.category');
    if (!hasColor(input.color)) fail('err.color');
    return { id, name, category: input.category, color: input.color, seasons: subset(input.seasons, SEASONS, 'err.seasons'), occasions: subset(input.occasions, OCCASIONS, 'err.occasions') };
  }

  // Règles de la capsule : objectif par catégorie (0 = aucun), palette autorisée (vide = libre), couleurs vives max par tenue.
  function makeRules(input) {
    if (!isPlain(input.targets) || !sameKeys(input.targets, CATEGORIES)) fail('err.backup');
    const targets = {};
    for (const c of CATEGORIES) {
      const v = typeof input.targets[c] === 'string' ? (input.targets[c].trim() === '' ? 0 : Number(input.targets[c])) : input.targets[c];
      if (!Number.isInteger(v) || v < 0 || v > MAX_TARGET) fail('err.target', { max: MAX_TARGET });
      targets[c] = v;
    }
    if (!Array.isArray(input.palette) || !input.palette.every(hasColor) || new Set(input.palette).size !== input.palette.length) fail('err.palette');
    const maxAccents = Number(input.maxAccents);
    if (!Number.isInteger(maxAccents) || maxAccents < 0 || maxAccents > MAX_ACCENTS) fail('err.accents', { max: MAX_ACCENTS });
    return { targets, palette: COLOR_IDS.filter((c) => input.palette.includes(c)), maxAccents };
  }
  const DEFAULT_RULES = Object.freeze({ targets: Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c, 0]))), palette: Object.freeze([]), maxAccents: 1 });

  // Filtre : saison et occasion précises, ou « all » (au moins une saison et une occasion communes).
  function checkFilter(f) {
    if (!isPlain(f) || !(f.season === 'all' || SEASONS.includes(f.season)) || !(f.occasion === 'all' || OCCASIONS.includes(f.occasion))) fail('err.filter');
    return f;
  }
  const accents = (pieces) => new Set(pieces.map((p) => p.color).filter((c) => !COLORS[c].neutral)).size;
  function shares(pieces, field, wanted) {
    if (wanted !== 'all') return pieces.every((p) => p[field].includes(wanted));
    return pieces[0][field].some((v) => pieces.every((p) => p[field].includes(v)));
  }
  function compatible(pieces, rules, filter) {
    return accents(pieces) <= rules.maxAccents && shares(pieces, 'seasons', filter.season) && shares(pieces, 'occasions', filter.occasion);
  }
  // La pièce peut-elle servir sous ce filtre (avant même de l'associer) ?
  const fits = (p, filter) => (filter.season === 'all' || p.seasons.includes(filter.season)) && (filter.occasion === 'all' || p.occasions.includes(filter.occasion));

  // Énumération exacte de toutes les tenues compatibles ; liste conservée jusqu'à LIST_CAP, ordre déterministe.
  function outfits(items, rules, filter) {
    checkFilter(filter);
    const of = (c) => items.filter((i) => i.category === c && fits(i, filter)).sort(byName);
    const tops = of('top'), bottoms = of('bottom'), ones = of('onepiece'), shoes = of('shoes');
    const uses = Object.fromEntries(items.map((i) => [i.id, 0]));
    const list = []; let count = 0, sets = 0, ones2 = 0;
    const take = (pieces) => {
      count++; if (pieces.length === 3) sets++; else ones2++;
      for (const p of pieces) uses[p.id]++;
      if (list.length < LIST_CAP) list.push(pieces.map((p) => p.id));
    };
    for (const t of tops) for (const b of bottoms) {
      if (!compatible([t, b], rules, filter)) continue; // élagage : si haut + bas ne vont pas, aucune chaussure n'y changera rien
      for (const s of shoes) if (compatible([t, b, s], rules, filter)) take([t, b, s]);
    }
    for (const o of ones) for (const s of shoes) if (compatible([o, s], rules, filter)) take([o, s]);
    return { count, sets, ones: ones2, list, uses, truncated: count > list.length };
  }

  // Suggestions : choix glouton des tenues qui utilisent le plus de pièces encore non proposées
  // (égalités : ordre de la liste, donc déterministe).
  function suggest(result, n) {
    const picked = [], seen = new Set(), used = new Set();
    for (let k = 0; k < n && picked.length < result.list.length; k++) {
      let best = -1, bestScore = -1;
      result.list.forEach((o, idx) => {
        if (used.has(idx)) return;
        const score = o.filter((id) => !seen.has(id)).length;
        if (score > bestScore) { best = idx; bestScore = score; }
      });
      if (best < 0) break;
      used.add(best); picked.push(result.list[best]); for (const id of result.list[best]) seen.add(id);
    }
    return picked;
  }
  // Tenue du jour : rang = nombre de jours depuis le 1970-01-01 modulo le nombre de tenues listées.
  function dayNumber(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('err.date');
    const [y, m, d] = day.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d), back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) fail('err.date');
    return Math.floor(t / 86400000);
  }
  function ofDay(result, day) { return result.list.length ? result.list[((dayNumber(day) % result.list.length) + result.list.length) % result.list.length] : null; }

  // Bilan de la capsule : effectifs et objectifs, couleurs hors palette, pièces sans tenue, gain d'une pièce neutre.
  function analyze(items, rules, filter) {
    const res = outfits(items, rules, filter);
    const have = Object.fromEntries(CATEGORIES.map((c) => [c, items.filter((i) => i.category === c).length]));
    const missing = CATEGORIES.filter((c) => rules.targets[c] > have[c]).map((c) => ({ category: c, n: rules.targets[c] - have[c] }));
    const excess = CATEGORIES.filter((c) => rules.targets[c] > 0 && have[c] > rules.targets[c]).map((c) => ({ category: c, n: have[c] - rules.targets[c] }));
    const outOfPalette = rules.palette.length ? items.filter((i) => !rules.palette.includes(i.color)).map((i) => i.id) : [];
    const orphans = items.filter((i) => OUTFIT_CATS.includes(i.category) && fits(i, filter) && res.uses[i.id] === 0).sort(byName).map((i) => i.id);
    const unfit = items.filter((i) => OUTFIT_CATS.includes(i.category) && !fits(i, filter)).map((i) => i.id);
    // Pièce hypothétique : première couleur neutre de la palette (sinon noir), pour la saison et l'occasion du filtre.
    const neutral = rules.palette.find((c) => COLORS[c].neutral) || 'black'; // couleur réellement neutre, même si aucune n'a encore été choisie
    const ghost = (category) => ({ id: 'ghost-item', name: '￿', category, color: neutral,
      seasons: filter.season === 'all' ? SEASONS.slice() : [filter.season], occasions: filter.occasion === 'all' ? OCCASIONS.slice() : [filter.occasion] });
    const gains = OUTFIT_CATS.map((c) => ({ category: c, gain: outfits([...items, ghost(c)], rules, filter).count - res.count })).sort((a, b) => b.gain - a.gain || OUTFIT_CATS.indexOf(a.category) - OUTFIT_CATS.indexOf(b.category));
    return { result: res, have, missing, excess, outOfPalette, orphans, unfit, neutral, gains };
  }

  // --- Export CSV des tenues (en-têtes et libellés traduits fournis par l'interface)
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(list, items, opts) {
    const { headers, colorLabel } = opts;
    if (!Array.isArray(headers) || headers.length !== 5) fail('err.headers');
    const by = new Map(items.map((i) => [i.id, i]));
    const lines = [headers.map(csvCell).join(';')];
    list.forEach((o, k) => {
      const ps = o.map((id) => by.get(id));
      const [a, b, c] = ps.length === 3 ? ps : [ps[0], null, ps[1]];
      lines.push([k + 1, csvCell(a.name), csvCell(b ? b.name : ''), csvCell(c.name), csvCell(ps.map((p) => colorLabel(p.color)).join(' + '))].join(';'));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'wardrobecapsule' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'rules', 'items']) || !isPlain(data.rules) || !Array.isArray(data.items)) fail('err.backup');
    if (!sameKeys(data.rules, ['targets', 'palette', 'maxAccents'])) fail('err.backup');
    if (Object.values(data.rules.targets || {}).some((v) => typeof v !== 'number') || typeof data.rules.maxAccents !== 'number') fail('err.backup');
    const rules = makeRules(data.rules);
    if (data.items.length > MAX_ITEMS) fail('err.tooMany', { max: MAX_ITEMS });
    const items = data.items.map((i) => {
      if (!isPlain(i) || !sameKeys(i, ['id', 'name', 'category', 'color', 'seasons', 'occasions'])) fail('err.backup');
      return makeItem(i, i.id);
    });
    if (new Set(items.map((i) => i.id)).size !== items.length) fail('err.backup');
    return { rules, items };
  }
  function backup(data) {
    const v = validateData({ app: 'wardrobecapsule', version: VERSION, ...data });
    return JSON.stringify({ app: 'wardrobecapsule', version: VERSION, ...v }, null, 2);
  }

  const api = { VERSION, CATEGORIES, OUTFIT_CATS, COLORS, COLOR_IDS, SEASONS, OCCASIONS, MAX_ITEMS, MAX_ACCENTS, LIST_CAP, DEFAULT_RULES,
    makeItem, makeRules, accents, compatible, outfits, suggest, dayNumber, ofDay, analyze, toCSV, validateData, backup };
  root.CapsuleCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CapsuleCore;
})(typeof window === 'undefined' ? globalThis : window);
