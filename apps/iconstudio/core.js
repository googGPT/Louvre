/* IconStudio — logique pure : formes, calques, historique, sérialisation SVG contrôlée, import SVG assaini.
   Sécurité : une icône n'est qu'une liste de formes validées (nombres, couleurs #rrggbb, chemin normalisé).
   Le SVG exporté est reconstruit attribut par attribut à partir de ces valeurs : aucune donnée saisie n'est
   recopiée telle quelle dans le balisage. L'import lit seulement rect, circle, line, polyline, polygon et path,
   et reconstruit chaque forme ; tout le reste (script, style, liens, transformations, filtres…) est ignoré. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const SIZES = Object.freeze([16, 24, 32, 48]);
  const TYPES = Object.freeze(['rect', 'circle', 'line', 'polyline', 'path']);
  const MAX = Object.freeze({ icons: 100, shapes: 200, name: 60, points: 60, segments: 200, file: 500000, history: 100 });
  const ID = /^[a-z0-9-]{6,64}$/i;
  const SHAPE_ID = /^s\d{1,6}$/;
  const COLOR = /^#[0-9a-f]{6}$/;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // --- Valeurs élémentaires
  function num(v, min, max, key, step = 0.5) { // nombre fini, multiple de « step », dans [min, max]
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(v) ? Number(v.replace(',', '.')) : NaN;
    if (!Number.isFinite(n) || n < min || n > max) fail(key, { min, max });
    if (Math.abs(n / step - Math.round(n / step)) > 1e-9) fail(key, { min, max });
    return Math.round(n / step) * step;
  }
  function color(v, key = 'err.color') {
    if (v === 'none') return 'none';
    if (typeof v !== 'string') fail(key);
    const s = v.trim().toLowerCase();
    if (COLOR.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map((c) => c + c).join('');
    fail(key);
  }
  const fmt = (n) => String(Math.round(n * 100) / 100).replace(/^-0$/, '0'); // au plus 2 décimales, sans « -0 »

  // --- Chemins : M L H V C Q Z (absolus ou relatifs) -> segments absolus, réécrits proprement.
  const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };
  function parsePath(d, size) {
    if (typeof d !== 'string' || !d.trim() || d.length > 6000) fail('err.path');
    if (!/^[\sMmLlHhVvCcQqZz0-9eE.,+-]+$/.test(d)) fail('err.pathCmd');
    const toks = d.match(/[MmLlHhVvCcQqZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    const lo = -size, hi = 2 * size;
    const out = [];
    let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0;
    const coord = (v) => { const n = Math.round(v * 100) / 100; if (!Number.isFinite(n) || n < lo || n > hi) fail('err.pathRange', { min: lo, max: hi }); return n; };
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
      else if (!cmd) fail('err.path');
      const up = cmd.toUpperCase(), rel = cmd !== up, n = ARGS[up];
      if (!out.length && up !== 'M') fail('err.pathStart');
      if (up === 'Z') { out.push({ c: 'Z', v: [] }); x = sx; y = sy; cmd = null; continue; }
      const a = [];
      for (let k = 0; k < n; k++) { if (i >= toks.length || /[A-Za-z]/.test(toks[i])) fail('err.path'); a.push(Number(toks[i++])); }
      let v;
      if (up === 'H') { v = [coord(rel ? x + a[0] : a[0])]; x = v[0]; }
      else if (up === 'V') { v = [coord(rel ? y + a[0] : a[0])]; y = v[0]; }
      else {
        v = a.map((val, k) => coord(rel ? val + (k % 2 ? y : x) : val));
        x = v[n - 2]; y = v[n - 1];
      }
      out.push({ c: up, v });
      if (up === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; } // paires suivantes après M = lignes
      if (out.length > MAX.segments) fail('err.pathLong', { max: MAX.segments });
    }
    if (!out.length) fail('err.path');
    return out;
  }
  // « 2,3 4,5 » -> [[2, 3], [4, 5]] (les valeurs sont ensuite validées par makeShape).
  function parsePoints(text) {
    if (typeof text !== 'string' || !text.trim()) fail('err.points');
    const nums = text.trim().split(/[\s,;]+/);
    if (nums.length % 2 || nums.length > 2 * MAX.points) fail('err.points');
    const out = [];
    for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    return out;
  }
  function formatPath(segs) { return segs.map((s) => s.c + s.v.map(fmt).join(' ')).join(''); }

  // --- Formes
  const COMMON = ['id', 'type', 'fill', 'stroke', 'sw', 'round'];
  const FIELDS = Object.freeze({
    rect: ['x', 'y', 'w', 'h', 'rx'], circle: ['cx', 'cy', 'r'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points', 'closed'], path: ['d'],
  });
  function makeShape(input, size) {
    if (!input || typeof input !== 'object') fail('err.shape');
    if (!TYPES.includes(input.type)) fail('err.shapeType');
    if (typeof input.id !== 'string' || !SHAPE_ID.test(input.id)) fail('err.id');
    const c = (v) => num(v, 0, size, 'err.coord');
    const s = { id: input.id, type: input.type, fill: input.type === 'line' ? 'none' : color(input.fill === undefined ? 'none' : input.fill), stroke: color(input.stroke === undefined ? 'none' : input.stroke), sw: num(input.sw === undefined ? 0 : input.sw, 0, size / 4, 'err.sw'), round: input.round === true };
    if (input.round !== undefined && typeof input.round !== 'boolean') fail('err.shape');
    if (input.type === 'rect') {
      Object.assign(s, { x: c(input.x), y: c(input.y), w: num(input.w, 0.5, size, 'err.size'), h: num(input.h, 0.5, size, 'err.size'), rx: num(input.rx === undefined ? 0 : input.rx, 0, size / 2, 'err.rx') });
      if (s.x + s.w > size || s.y + s.h > size) fail('err.coord', { min: 0, max: size });
      if (s.rx > Math.min(s.w, s.h) / 2) fail('err.rx', { min: 0, max: Math.min(s.w, s.h) / 2 });
    } else if (input.type === 'circle') {
      Object.assign(s, { cx: c(input.cx), cy: c(input.cy), r: num(input.r, 0.5, size / 2, 'err.size') });
    } else if (input.type === 'line') {
      Object.assign(s, { x1: c(input.x1), y1: c(input.y1), x2: c(input.x2), y2: c(input.y2) });
      if (s.x1 === s.x2 && s.y1 === s.y2) fail('err.lineZero');
    } else if (input.type === 'polyline') {
      if (!Array.isArray(input.points) || input.points.length < 2) fail('err.points');
      if (input.points.length > MAX.points) fail('err.tooManyPoints', { max: MAX.points });
      s.points = input.points.map((p) => { if (!Array.isArray(p) || p.length !== 2) fail('err.points'); return [c(p[0]), c(p[1])]; });
      s.closed = input.closed === true;
      if (input.closed !== undefined && typeof input.closed !== 'boolean') fail('err.shape');
      if (s.closed && s.points.length < 3) fail('err.points');
    } else {
      s.d = formatPath(parsePath(input.d, size));
    }
    if (s.type === 'line' || (s.type === 'polyline' && !s.closed)) { if (s.stroke === 'none' || s.sw === 0) fail('err.invisible'); }
    else if (s.fill === 'none' && (s.stroke === 'none' || s.sw === 0)) fail('err.invisible');
    // Ordre des clés fixe (sauvegardes comparables).
    const out = {};
    for (const k of [...COMMON, ...FIELDS[s.type]]) out[k] = s[k];
    return out;
  }
  // Attributs SVG d'une forme : seule source du rendu (aperçu dans la page et fichier exporté).
  function shapeAttrs(s) {
    const a = [];
    let tag = s.type;
    if (s.type === 'rect') { a.push(['x', s.x], ['y', s.y], ['width', s.w], ['height', s.h]); if (s.rx) a.push(['rx', s.rx]); }
    else if (s.type === 'circle') a.push(['cx', s.cx], ['cy', s.cy], ['r', s.r]);
    else if (s.type === 'line') a.push(['x1', s.x1], ['y1', s.y1], ['x2', s.x2], ['y2', s.y2]);
    else if (s.type === 'polyline') { tag = s.closed ? 'polygon' : 'polyline'; a.push(['points', s.points.map((p) => p.map(fmt).join(',')).join(' ')]); }
    else a.push(['d', s.d]);
    a.push(['fill', s.fill]);
    if (s.stroke !== 'none' && s.sw > 0) {
      a.push(['stroke', s.stroke], ['stroke-width', s.sw]);
      if (s.round) a.push(['stroke-linecap', 'round'], ['stroke-linejoin', 'round']);
    }
    return { tag, attrs: a.map(([k, v]) => [k, typeof v === 'number' ? fmt(v) : v]) };
  }

  // --- Icônes
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    const s = v.replace(/\s+/g, ' ').trim();
    if ([...s].length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return s;
  }
  function makeIcon(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const size = Number(input.size);
    if (!SIZES.includes(size)) fail('err.gridSize');
    if (!Array.isArray(input.shapes)) fail('err.shape');
    if (input.shapes.length > MAX.shapes) fail('err.tooManyShapes', { max: MAX.shapes });
    const bg = input.bg === undefined || input.bg === null ? null : color(input.bg);
    if (bg === 'none') fail('err.color');
    const shapes = input.shapes.map((s) => makeShape(s, size));
    if (new Set(shapes.map((s) => s.id)).size !== shapes.length) fail('err.id');
    return { id, name: cleanName(input.name), size, bg, shapes };
  }
  function nextShapeId(icon) { return 's' + (icon.shapes.reduce((m, s) => Math.max(m, Number(s.id.slice(1))), 0) + 1); }
  function addShape(icon, input) {
    if (icon.shapes.length >= MAX.shapes) fail('err.tooManyShapes', { max: MAX.shapes });
    const s = makeShape({ ...input, id: nextShapeId(icon) }, icon.size);
    return { icon: { ...icon, shapes: [...icon.shapes, s] }, id: s.id };
  }
  function updateShape(icon, id, patch) {
    const cur = icon.shapes.find((s) => s.id === id);
    if (!cur) fail('err.noShape');
    const next = makeShape({ ...cur, ...patch, id, type: cur.type }, icon.size);
    return { ...icon, shapes: icon.shapes.map((s) => (s.id === id ? next : s)) };
  }
  function removeShape(icon, id) { return { ...icon, shapes: icon.shapes.filter((s) => s.id !== id) }; }
  // Calques : le dernier de la liste est dessiné au-dessus. « up » = vers le dessus.
  function moveShape(icon, id, where) {
    const list = [...icon.shapes], i = list.findIndex((s) => s.id === id);
    if (i === -1) fail('err.noShape');
    const [s] = list.splice(i, 1);
    const j = where === 'top' ? list.length : where === 'bottom' ? 0 : where === 'up' ? Math.min(list.length, i + 1) : where === 'down' ? Math.max(0, i - 1) : fail('err.shape');
    list.splice(j, 0, s);
    return { ...icon, shapes: list };
  }
  // Déplace une forme de (dx, dy) unités ; refusé si elle sortirait de la grille.
  function translateShape(icon, id, dx, dy) {
    const s = icon.shapes.find((x) => x.id === id);
    if (!s) fail('err.noShape');
    const p = {};
    if (s.type === 'rect') Object.assign(p, { x: s.x + dx, y: s.y + dy });
    else if (s.type === 'circle') Object.assign(p, { cx: s.cx + dx, cy: s.cy + dy });
    else if (s.type === 'line') Object.assign(p, { x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy });
    else if (s.type === 'polyline') p.points = s.points.map(([x, y]) => [x + dx, y + dy]);
    else p.d = formatPath(parsePath(s.d, icon.size).map((g) => ({ c: g.c, v: g.c === 'H' ? [g.v[0] + dx] : g.c === 'V' ? [g.v[0] + dy] : g.v.map((v, k) => v + (k % 2 ? dy : dx)) })));
    return updateShape(icon, id, p);
  }
  function duplicateShape(icon, id) {
    const s = icon.shapes.find((x) => x.id === id);
    if (!s) fail('err.noShape');
    const r = addShape(icon, { ...s });
    try { return { icon: translateShape(r.icon, r.id, 1, 1), id: r.id }; } catch (_) { return r; } // décalée si elle tient dans la grille
  }
  // Change la taille de la grille en gardant les proportions (coordonnées arrondies au demi-pas).
  function scaleIcon(icon, size) {
    if (!SIZES.includes(size)) fail('err.gridSize');
    const k = size / icon.size, h = (v) => Math.round(v * k * 2) / 2;
    const shapes = icon.shapes.map((s) => {
      const t = { ...s, sw: s.sw ? Math.max(0.5, Math.min(size / 4, h(s.sw))) : 0 };
      if (s.type === 'rect') Object.assign(t, { x: h(s.x), y: h(s.y), w: Math.max(0.5, h(s.w)), h: Math.max(0.5, h(s.h)), rx: h(s.rx) });
      if (s.type === 'rect') { t.w = Math.min(t.w, size - t.x); t.h = Math.min(t.h, size - t.y); t.rx = Math.min(t.rx, Math.floor(Math.min(t.w, t.h)) / 2); }
      if (s.type === 'circle') Object.assign(t, { cx: h(s.cx), cy: h(s.cy), r: Math.max(0.5, Math.min(size / 2, h(s.r))) });
      if (s.type === 'line') Object.assign(t, { x1: h(s.x1), y1: h(s.y1), x2: h(s.x2), y2: h(s.y2) });
      if (s.type === 'polyline') t.points = s.points.map(([x, y]) => [h(x), h(y)]);
      if (s.type === 'path') t.d = formatPath(parsePath(s.d, icon.size).map((g) => ({ c: g.c, v: g.v.map((v) => Math.round(v * k * 100) / 100) })));
      return t;
    });
    return makeIcon({ ...icon, size, shapes }, icon.id);
  }

  // --- Export SVG : balisage écrit ici, valeurs uniquement numériques ou couleurs validées.
  function toSvg(icon, px) {
    const ic = makeIcon(icon, icon.id); // revalide tout avant d'écrire
    const dim = px ? ` width="${Number(px)}" height="${Number(px)}"` : '';
    const lines = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ic.size} ${ic.size}"${dim}>`];
    if (ic.bg) lines.push(`  <rect width="${ic.size}" height="${ic.size}" fill="${ic.bg}"/>`);
    for (const s of ic.shapes) { const { tag, attrs } = shapeAttrs(s); lines.push(`  <${tag} ${attrs.map(([k, v]) => `${k}="${v}"`).join(' ')}/>`); }
    lines.push('</svg>');
    return lines.join('\n') + '\n';
  }
  function fileName(name, ext) {
    const base = String(name).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50);
    return `${base || 'icon'}.${ext}`;
  }

  // --- Import SVG limité et assaini
  const NAMED = { black: '#000000', white: '#ffffff', currentcolor: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff' };
  function importColor(v) {
    if (v === undefined) return undefined;
    const s = String(v).trim().toLowerCase();
    if (s === 'none' || s === 'transparent') return 'none';
    if (NAMED[s]) return NAMED[s];
    try { return color(s); } catch (_) { return '#000000'; } // url(#…), rgb()… : approximé en noir
  }
  function parseAttrs(src) {
    const a = {};
    for (const m of src.matchAll(/([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
    if (a.style) for (const decl of a.style.split(';')) { const [k, v] = decl.split(':').map((x) => (x || '').trim()); if (['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].includes(k) && v) a[k] = v; }
    return a;
  }
  const INHERIT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'];
  const SHAPE_TAGS = new Set(['rect', 'circle', 'line', 'polyline', 'polygon', 'path']);
  const NEUTRAL = new Set(['svg', 'g', 'title', 'desc', 'metadata']);
  function importSvg(text, name, id) {
    if (typeof text !== 'string') fail('err.importSvg');
    if (text.length > MAX.file) fail('err.fileBig');
    const src = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?\?>/g, '');
    const open = /<\s*svg\b([^>]*)>/i.exec(src);
    if (!open) fail('err.importSvg');
    const sa = parseAttrs(open[1]);
    let vb = (sa.viewbox || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
      const w = parseFloat(sa.width), h = parseFloat(sa.height);
      vb = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? [0, 0, w, h] : [0, 0, 24, 24];
    }
    const side = Math.max(vb[2], vb[3]);
    const size = vb[0] === 0 && vb[1] === 0 && vb[2] === vb[3] && SIZES.includes(vb[2]) ? vb[2] : 24;
    const k = size / side;
    const X = (v) => (Number(v) - vb[0]) * k, Y = (v) => (Number(v) - vb[1]) * k;
    const half = (v) => Math.round(v * 2) / 2;
    const stack = []; // éléments ouverts : { tag, attrs hérités, skip }
    let shapes = [], ignored = 0, n = 0;
    const ctx = () => (stack.length ? stack[stack.length - 1] : { inh: {}, skip: false, transform: false });
    for (const m of src.matchAll(/<\s*(\/?)\s*([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>/g)) {
      const closing = m[1] === '/', tag = m[2].toLowerCase(), selfClose = m[4] === '/';
      if (closing) { const i = stack.map((e) => e.tag).lastIndexOf(tag); if (i > -1) stack.length = i; continue; }
      const a = parseAttrs(m[3]), parent = ctx();
      const inh = { ...parent.inh };
      for (const key of INHERIT) if (a[key] !== undefined) inh[key] = a[key];
      const skip = parent.skip || (!NEUTRAL.has(tag) && !SHAPE_TAGS.has(tag));
      const transform = parent.transform || a.transform !== undefined;
      if (!selfClose && !SHAPE_TAGS.has(tag)) stack.push({ tag, inh, skip, transform });
      else if (!selfClose) stack.push({ tag, inh, skip: true, transform }); // contenu d'une forme : ignoré
      if (!SHAPE_TAGS.has(tag)) { if (skip && !parent.skip) ignored++; continue; } // élément non pris en charge (son contenu est sauté)
      if (parent.skip || transform || shapes.length >= MAX.shapes) { ignored++; continue; }
      const fill = importColor(inh.fill), stroke = importColor(inh.stroke);
      const swRaw = inh['stroke-width'] !== undefined ? parseFloat(inh['stroke-width']) : 1;
      const base = {
        id: 's' + (++n), fill: fill === undefined ? '#000000' : fill, stroke: stroke === undefined ? 'none' : stroke,
        sw: Number.isFinite(swRaw) && swRaw > 0 ? Math.max(0.5, Math.min(size / 4, half(swRaw * k))) : 0,
        round: inh['stroke-linecap'] === 'round' || inh['stroke-linejoin'] === 'round',
      };
      let input;
      try {
        if (tag === 'rect') {
          const w = half(Number(a.width) * k), h = half(Number(a.height) * k), rx = half(Number(a.rx !== undefined ? a.rx : a.ry !== undefined ? a.ry : 0) * k);
          input = { ...base, type: 'rect', x: half(X(a.x || 0)), y: half(Y(a.y || 0)), w, h, rx: Math.min(rx, Math.floor(Math.min(w, h)) / 2) };
        } else if (tag === 'circle') input = { ...base, type: 'circle', cx: half(X(a.cx || 0)), cy: half(Y(a.cy || 0)), r: half(Number(a.r) * k) };
        else if (tag === 'line') input = { ...base, type: 'line', x1: half(X(a.x1 || 0)), y1: half(Y(a.y1 || 0)), x2: half(X(a.x2 || 0)), y2: half(Y(a.y2 || 0)) };
        else if (tag === 'polyline' || tag === 'polygon') {
          const nums = (a.points || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
          if (nums.length % 2 || nums.some((v) => !Number.isFinite(v))) throw new Error('err.points');
          const points = [];
          for (let j = 0; j < nums.length; j += 2) points.push([half(X(nums[j])), half(Y(nums[j + 1]))]);
          input = { ...base, type: 'polyline', points, closed: tag === 'polygon' };
        } else {
          const segs = parsePath(String(a.d || ''), Math.max(side, size) * 4).map((g) => ({ c: g.c, v: g.c === 'H' ? [X(g.v[0])] : g.c === 'V' ? [Y(g.v[0])] : g.v.map((v, j) => (j % 2 ? Y(v) : X(v))) }));
          input = { ...base, type: 'path', d: formatPath(segs) };
        }
        shapes.push(makeShape(input, size));
      } catch (_) { ignored++; n--; }
    }
    if (!shapes.length) fail('err.importEmpty');
    shapes = shapes.map((s, j) => ({ ...s, id: 's' + (j + 1) }));
    return { icon: makeIcon({ name, size, bg: null, shapes }, id), imported: shapes.length, ignored };
  }

  // --- Contraste (WCAG 2.x) : luminance relative et rapport (L1 + 0,05) / (L2 + 0,05), de 1 à 21.
  function luminance(hex) {
    const c = color(hex);
    if (c === 'none') fail('err.color');
    const ch = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100; // arrondi au centième
  }
  // Couleurs réellement peintes par l'icône (remplissages, contours d'épaisseur non nulle), sans doublon.
  function paintColors(icon) {
    const out = [];
    for (const s of icon.shapes) {
      if (s.fill !== 'none') out.push(s.fill);
      if (s.stroke !== 'none' && s.sw > 0) out.push(s.stroke);
    }
    return [...new Set(out)];
  }
  // Pour chaque fond (celui de l'icône s'il existe, sinon les fonds clairs/sombres fournis) :
  // la couleur la moins contrastée et son rapport. Seuil indicatif 3:1 (WCAG 1.4.11, éléments graphiques).
  // Limite assumée : on compare chaque couleur au fond, pas aux formes qu'elle recouvre.
  const NON_TEXT_MIN = 3;
  function contrastReport(icon, backgrounds = ['#ffffff', '#1e1e1e']) {
    const colors = paintColors(icon);
    const bgs = icon.bg ? [icon.bg] : backgrounds.map((b) => color(b));
    return bgs.map((bg) => {
      let worst = null;
      for (const c of colors) { const r = contrast(c, bg); if (!worst || r < worst.ratio) worst = { color: c, ratio: r }; }
      return { bg, color: worst ? worst.color : null, ratio: worst ? worst.ratio : null, ok: worst ? worst.ratio >= NON_TEXT_MIN : true };
    });
  }

  // --- Historique (annuler / rétablir), en mémoire
  function history(present) { return { past: [], present, future: [] }; }
  function commit(h, next) { return { past: [...h.past, h.present].slice(-MAX.history), present: next, future: [] }; }
  function undo(h) { return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h; }
  function redo(h) { return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h; }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'iconstudio' || data.version !== VERSION) fail('err.notBackup');
    if (keys(data) !== 'app,icons,version' || !Array.isArray(data.icons)) fail('err.backup');
    if (data.icons.length > MAX.icons) fail('err.tooManyIcons', { max: MAX.icons });
    const icons = data.icons.map((ic) => {
      if (keys(ic) !== 'bg,id,name,shapes,size' || !Array.isArray(ic.shapes)) fail('err.backup');
      for (const s of ic.shapes) if (!s || typeof s !== 'object' || !TYPES.includes(s.type) || keys(s) !== [...COMMON, ...FIELDS[s.type]].sort().join(',')) fail('err.backup');
      const x = makeIcon(ic, ic.id);
      if (JSON.stringify(x) !== JSON.stringify({ id: ic.id, name: ic.name, size: ic.size, bg: ic.bg, shapes: ic.shapes })) fail('err.backup'); // valeurs déjà normalisées attendues
      return x;
    });
    if (new Set(icons.map((x) => x.id)).size !== icons.length) fail('err.backup');
    return icons;
  }
  function backup(icons) { return JSON.stringify({ app: 'iconstudio', version: VERSION, icons: validateBackup({ app: 'iconstudio', version: VERSION, icons }) }, null, 2); }

  root.IconCore = Object.freeze({
    VERSION, SIZES, TYPES, MAX, FIELDS, num, color, fmt, parsePath, formatPath, parsePoints, makeShape, shapeAttrs, makeIcon, nextShapeId,
    addShape, updateShape, removeShape, moveShape, translateShape, duplicateShape, scaleIcon, toSvg, fileName, importSvg,
    luminance, contrast, paintColors, contrastReport, NON_TEXT_MIN,
    history, commit, undo, redo, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.IconCore;
})(typeof window === 'undefined' ? globalThis : window);
