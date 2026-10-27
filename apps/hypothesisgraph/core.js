/* HypothesisGraph — logique pure : modèle de recherche (variables et hypothèses), validation, cycles,
   chemins de médiation, mise en page automatique en couches, géométrie des flèches, exports SVG et Markdown. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const ROLES = Object.freeze(['iv', 'dv', 'med', 'mod', 'ctrl']); // indépendante, dépendante, médiatrice, modératrice, contrôle
  const SIGNS = Object.freeze(['+', '-', '?']);
  const LIMITS = Object.freeze({ graphs: 30, nodes: 40, edges: 80, label: 40, name: 80, hyp: 12, coord: 4000 });
  const NODE = Object.freeze({ w: 168, h: 58 }); // taille d'une boîte (unités SVG)
  const GAP = Object.freeze({ col: 240, row: 96, margin: 32 });
  const ID_RE = /^[a-z0-9-]{6,64}$/i;
  const HYP_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,11}$/; // H1, H2a, H3.1…

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function cleanLabel(v) {
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (!s) fail('err.labelRequired');
    if (s.length > LIMITS.label) fail('err.labelLong', { max: LIMITS.label });
    return s;
  }
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    if (v.trim().length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    return v.trim();
  }
  const coord = (v) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > LIMITS.coord) fail('err.backup'); return Math.round(v); };

  // --- Validation complète d'un modèle (utilisée à chaque modification et à la restauration)
  function makeGraph(g) {
    if (!keysAre(g, ['edges', 'id', 'manual', 'name', 'nodes'])) fail('err.backup');
    if (typeof g.id !== 'string' || !ID_RE.test(g.id)) fail('err.id');
    if (typeof g.manual !== 'boolean' || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) fail('err.backup');
    if (g.nodes.length > LIMITS.nodes) fail('err.nodesMany', { max: LIMITS.nodes });
    if (g.edges.length > LIMITS.edges) fail('err.edgesMany', { max: LIMITS.edges });
    const ids = new Set(), labels = new Set();
    const nodes = g.nodes.map((n) => {
      if (!keysAre(n, ['id', 'label', 'role', 'x', 'y'])) fail('err.backup');
      if (typeof n.id !== 'string' || !ID_RE.test(n.id) || ids.has(n.id)) fail('err.id');
      if (!ROLES.includes(n.role)) fail('err.role');
      const label = cleanLabel(n.label);
      if (labels.has(norm(label))) fail('err.nodeDup', { name: label });
      ids.add(n.id); labels.add(norm(label));
      return { id: n.id, label, role: n.role, x: coord(n.x), y: coord(n.y) };
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeById = new Map(), pairs = new Set(), hyps = new Set();
    for (const e of g.edges) {
      if (!keysAre(e, ['from', 'id', 'label', 'sign', 'to'])) fail('err.backup');
      if (typeof e.id !== 'string' || !ID_RE.test(e.id) || ids.has(e.id)) fail('err.id');
      ids.add(e.id); edgeById.set(e.id, e);
    }
    const edges = g.edges.map((e) => {
      if (!nodeIds.has(e.from)) fail('err.edgeEnds');
      if (!SIGNS.includes(e.sign)) fail('err.sign');
      if (e.from === e.to) fail('err.selfLoop');
      if (!nodeIds.has(e.to)) {
        const target = edgeById.get(e.to);
        if (!target) fail('err.edgeEnds');
        if (!nodeIds.has(target.to)) fail('err.modTarget'); // pas de modération d'une modération
        if (target.from === e.from || target.to === e.from) fail('err.modOwn');
      }
      const pair = `${e.from}>${e.to}`;
      if (pairs.has(pair)) fail('err.edgeDup');
      pairs.add(pair);
      if (typeof e.label !== 'string') fail('err.backup');
      const label = e.label.trim();
      const fromCtrl = nodes.find((n) => n.id === e.from).role === 'ctrl';
      if (!label && !fromCtrl) fail('err.hypRequired');
      if (label) {
        if (!HYP_RE.test(label)) fail('err.hypFormat');
        if (hyps.has(label.toLowerCase())) fail('err.hypDup', { label });
        hyps.add(label.toLowerCase());
      }
      return { id: e.id, from: e.from, to: e.to, sign: e.sign, label };
    });
    return { id: g.id, name: cleanName(g.name), manual: g.manual, nodes, edges };
  }
  const newGraph = (name, id) => makeGraph({ id, name, manual: false, nodes: [], edges: [] });

  // Étiquette libre suivante : H1, H2… (saute celles déjà prises, ex. « H2a » n'empêche pas H2).
  function nextLabel(g) {
    const used = new Set(g.edges.map((e) => e.label.toLowerCase()));
    let i = 1; while (used.has('h' + i)) i++;
    return 'H' + i;
  }
  const isModeration = (g, e) => !g.nodes.some((n) => n.id === e.to);

  // --- Opérations : chacune renvoie un NOUVEAU modèle revalidé.
  function update(g, patch) { const x = clone(g); for (const k of ['name', 'manual']) if (k in patch) x[k] = patch[k]; return makeGraph(x); }
  function putNode(g, node) {
    const x = clone(g), i = x.nodes.findIndex((n) => n.id === node.id);
    if (i >= 0) x.nodes[i] = { ...x.nodes[i], label: node.label, role: node.role };
    else {
      if (x.nodes.length >= LIMITS.nodes) fail('err.nodesMany', { max: LIMITS.nodes });
      x.nodes.push({ id: node.id, label: node.label, role: node.role, x: 0, y: 0 });
    }
    return placeAfterChange(makeGraph(x), node.id);
  }
  // Supprime une variable, ses flèches et les modérations qui visaient ces flèches.
  function removeNode(g, nodeId) {
    const x = clone(g);
    if (!x.nodes.some((n) => n.id === nodeId)) fail('err.notFound');
    x.nodes = x.nodes.filter((n) => n.id !== nodeId);
    let gone = new Set([nodeId]);
    for (let k = 0; k < 2; k++) { // flèches liées, puis modérations de ces flèches
      const drop = x.edges.filter((e) => gone.has(e.from) || gone.has(e.to)).map((e) => e.id);
      gone = new Set([...gone, ...drop]);
    }
    x.edges = x.edges.filter((e) => !gone.has(e.id));
    return placeAfterChange(makeGraph(x));
  }
  function putEdge(g, edge) {
    const x = clone(g), i = x.edges.findIndex((e) => e.id === edge.id);
    const clean = { id: edge.id, from: edge.from, to: edge.to, sign: edge.sign, label: String(edge.label || '').trim() };
    if (i >= 0) {
      const old = x.edges[i];
      if ((old.from !== clean.from || old.to !== clean.to) && x.edges.some((e) => e.to === old.id)) fail('err.edgeModerated');
      x.edges[i] = clean;
    } else {
      if (x.edges.length >= LIMITS.edges) fail('err.edgesMany', { max: LIMITS.edges });
      x.edges.push(clean);
    }
    return placeAfterChange(makeGraph(x));
  }
  function removeEdge(g, edgeId) {
    const x = clone(g);
    if (!x.edges.some((e) => e.id === edgeId)) fail('err.notFound');
    x.edges = x.edges.filter((e) => e.id !== edgeId && e.to !== edgeId); // ses modérations disparaissent avec elle
    return placeAfterChange(makeGraph(x));
  }
  function moveNode(g, nodeId, px, py) {
    const x = clone(g), n = x.nodes.find((k) => k.id === nodeId); if (!n) fail('err.notFound');
    n.x = Math.round(Math.min(LIMITS.coord - NODE.w, Math.max(0, px)));
    n.y = Math.round(Math.min(LIMITS.coord - NODE.h, Math.max(0, py)));
    x.manual = true;
    return makeGraph(x);
  }
  // Après un ajout ou une suppression : mise en page complète tant que l'utilisateur n'a rien déplacé ;
  // sinon, seule la nouvelle variable est placée, sur une place libre proche de sa position calculée.
  function placeAfterChange(g, newId) {
    if (!g.manual) return applyLayout(g);
    if (!newId) return g;
    const n = g.nodes.find((k) => k.id === newId);
    if (!n || n.x || n.y) return g;
    const pos = layout(g).positions[newId];
    let { x, y } = pos;
    const busy = (px, py) => g.nodes.some((o) => o.id !== newId && Math.abs(o.x - px) < NODE.w + 8 && Math.abs(o.y - py) < NODE.h + 8);
    let guard = 0;
    while (busy(x, y) && guard++ < 60) y += GAP.row / 2;
    return makeGraph({ ...clone(g), nodes: g.nodes.map((k) => (k.id === newId ? { ...k, x, y } : k)) });
  }
  function applyLayout(g) {
    const { positions } = layout(g);
    return makeGraph({ ...clone(g), manual: false, nodes: g.nodes.map((n) => ({ ...n, ...positions[n.id] })) });
  }

  // --- Cycles : composantes fortement connexes (Tarjan) sur les flèches variable → variable, avec un cycle explicite pour chacune.
  function nodeEdges(g) { const ids = new Set(g.nodes.map((n) => n.id)); return g.edges.filter((e) => ids.has(e.to)); }
  function cycles(g) {
    const adj = new Map(g.nodes.map((n) => [n.id, []]));
    for (const e of nodeEdges(g)) adj.get(e.from).push(e.to);
    let index = 0; const idx = new Map(), low = new Map(), stack = [], on = new Set(), comps = [];
    function strong(v) { // récursion bornée : 40 variables au plus
      idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
      for (const w of adj.get(v)) {
        if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      }
      if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) comps.push(c); }
    }
    for (const n of g.nodes) if (!idx.has(n.id)) strong(n.id);
    // Pour chaque composante : un circuit concret, trouvé par parcours en largeur depuis son premier sommet (ordre du modèle).
    const order = new Map(g.nodes.map((n, i) => [n.id, i]));
    return comps.map((c) => {
      const set = new Set(c), start = [...c].sort((a, b) => order.get(a) - order.get(b))[0];
      const prev = new Map(), queue = [start]; let end = null;
      while (queue.length && !end) {
        const v = queue.shift();
        for (const w of adj.get(v)) {
          if (!set.has(w)) continue;
          if (w === start) { end = v; break; }
          if (!prev.has(w)) { prev.set(w, v); queue.push(w); }
        }
      }
      const path = [start]; let v = end; const back = [];
      while (v !== start) { back.push(v); v = prev.get(v); }
      path.push(...back.reverse(), start);
      return { nodes: c, path };
    });
  }

  // --- Chemins de médiation : variable indépendante → médiatrice(s) → dépendante ; signe attendu = produit des signes.
  const signProduct = (signs) => (signs.includes('?') ? '?' : signs.filter((s) => s === '-').length % 2 ? '-' : '+');
  function mediationPaths(g) {
    const byId = new Map(g.nodes.map((n) => [n.id, n])), out = new Map(g.nodes.map((n) => [n.id, []]));
    for (const e of nodeEdges(g)) out.get(e.from).push(e);
    const paths = [];
    const direct = (a, b) => nodeEdges(g).some((e) => e.from === a && e.to === b);
    function walk(start, v, edges, seen) {
      if (paths.length >= 50 || edges.length > 6) return;
      for (const e of out.get(v)) {
        const w = byId.get(e.to);
        if (seen.has(w.id)) continue;
        if (w.role === 'dv' && edges.length >= 1) {
          const all = [...edges, e];
          paths.push({ from: start, to: w.id, via: all.slice(0, -1).map((x) => x.to), labels: all.map((x) => x.label), sign: signProduct(all.map((x) => x.sign)), partial: direct(start, w.id) });
        } else if (w.role === 'med') walk(start, w.id, [...edges, e], new Set([...seen, w.id]));
      }
    }
    for (const n of g.nodes) if (n.role === 'iv') walk(n.id, n.id, [], new Set([n.id]));
    return paths;
  }

  // --- Diagnostic : erreurs de conception probables (signaux à vérifier).
  function diagnose(g) {
    const out = [], ne = nodeEdges(g), mods = g.edges.filter((e) => isModeration(g, e));
    for (const c of cycles(g)) out.push({ level: 'error', key: 'diag.cycle', path: c.path });
    if (g.nodes.length && !g.nodes.some((n) => n.role === 'dv')) out.push({ level: 'warn', key: 'diag.noDv' });
    for (const n of g.nodes) {
      const inc = ne.filter((e) => e.to === n.id && byRole(g, e.from) !== 'ctrl'), outg = g.edges.filter((e) => e.from === n.id);
      const touched = g.edges.some((e) => e.from === n.id || e.to === n.id);
      if (!touched) { out.push({ level: 'warn', key: 'diag.isolated', node: n.id }); continue; }
      if (n.role === 'iv' && inc.length) out.push({ level: 'warn', key: 'diag.ivIncoming', node: n.id });
      if (n.role === 'dv' && outg.length) out.push({ level: 'warn', key: 'diag.dvOutgoing', node: n.id });
      if (n.role === 'med' && (!inc.length || !ne.some((e) => e.from === n.id))) out.push({ level: 'warn', key: 'diag.medIncomplete', node: n.id });
      if (n.role === 'mod' && !mods.some((e) => e.from === n.id)) out.push({ level: 'warn', key: 'diag.modNoArrow', node: n.id });
      if (n.role === 'ctrl' && ne.some((e) => e.from === n.id && byRole(g, e.to) !== 'dv')) out.push({ level: 'info', key: 'diag.ctrlNotDv', node: n.id });
    }
    for (const e of mods) if (byRole(g, e.from) !== 'mod') out.push({ level: 'info', key: 'diag.modRole', node: e.from, edge: e.id });
    for (const e of g.edges) if (e.sign === '?' && e.label) out.push({ level: 'info', key: 'diag.noSign', edge: e.id });
    return out;
  }
  function byRole(g, id) { const n = g.nodes.find((k) => k.id === id); return n ? n.role : null; }

  // --- Mise en page automatique (« en couches ») : causes à gauche, effets à droite, modératrices au-dessus,
  // variables de contrôle en dessous. Ordre dans chaque couche affiné par barycentres pour limiter les croisements.
  function layout(g) {
    const core = g.nodes.filter((n) => n.role !== 'mod' && n.role !== 'ctrl');
    const coreIds = new Set(core.map((n) => n.id));
    const ce = nodeEdges(g).filter((e) => coreIds.has(e.from) && coreIds.has(e.to));
    // 1) retirer les flèches qui ferment un cycle (parcours en profondeur), pour obtenir un graphe sans circuit
    const adj = new Map(core.map((n) => [n.id, []]));
    for (const e of ce) adj.get(e.from).push(e.to);
    const state = new Map(), back = new Set();
    const dfs = (v) => { state.set(v, 1); for (const w of adj.get(v)) { if (state.get(w) === 1) back.add(`${v}>${w}`); else if (!state.has(w)) dfs(w); } state.set(v, 2); };
    for (const n of [...core].sort((a, b) => (a.role === 'iv' ? -1 : 0) - (b.role === 'iv' ? -1 : 0))) if (!state.has(n.id)) dfs(n.id);
    const dag = ce.filter((e) => !back.has(`${e.from}>${e.to}`));
    // 2) couche = plus long chemin depuis une source
    const layer = new Map(core.map((n) => [n.id, 0]));
    for (let k = 0; k < core.length; k++) for (const e of dag) if (layer.get(e.to) < layer.get(e.from) + 1) layer.set(e.to, layer.get(e.from) + 1);
    for (const n of core) if (n.role === 'med' && layer.get(n.id) === 0 && !dag.some((e) => e.to === n.id)) layer.set(n.id, 1);
    // 3) toutes les dépendantes alignées sur la dernière couche
    const nonDv = core.filter((n) => n.role !== 'dv').map((n) => layer.get(n.id));
    const dvLayer = Math.max(1, nonDv.length ? Math.max(...nonDv) + 1 : 1, ...core.filter((n) => n.role === 'dv').map((n) => layer.get(n.id)));
    for (const n of core) if (n.role === 'dv') layer.set(n.id, dvLayer);
    if (!core.some((n) => n.role !== 'dv')) for (const n of core) layer.set(n.id, 0);
    const nLayers = core.length ? Math.max(...core.map((n) => layer.get(n.id))) + 1 : 1;
    const cols = Array.from({ length: nLayers }, () => []);
    for (const n of core) cols[layer.get(n.id)].push(n.id);
    // 4) barycentres : quatre allers-retours
    const nb = new Map(core.map((n) => [n.id, []]));
    for (const e of dag) { nb.get(e.from).push(e.to); nb.get(e.to).push(e.from); }
    const rank = new Map(); cols.forEach((c) => c.forEach((id, i) => rank.set(id, i)));
    for (let it = 0; it < 4; it++) {
      const seq = it % 2 ? [...cols.keys()].reverse() : [...cols.keys()];
      for (const ci of seq) {
        const bary = (id) => { const ns = nb.get(id).filter((w) => Math.abs(layer.get(w) - ci) === 1); return ns.length ? ns.reduce((s, w) => s + rank.get(w), 0) / ns.length : rank.get(id); };
        cols[ci].sort((a, b) => bary(a) - bary(b) || rank.get(a) - rank.get(b));
        cols[ci].forEach((id, i) => rank.set(id, i));
      }
    }
    // 5) coordonnées : chaque couche centrée verticalement ; rangée du haut pour les modératrices
    const mods = g.nodes.filter((n) => n.role === 'mod'), ctrls = g.nodes.filter((n) => n.role === 'ctrl');
    const top = GAP.margin + (mods.length ? GAP.row + 48 : 0); // place pour les flèches de modération
    const tallest = Math.max(1, ...cols.map((c) => c.length));
    const pos = {};
    cols.forEach((c, ci) => c.forEach((id, i) => {
      pos[id] = { x: GAP.margin + ci * GAP.col, y: top + (i + (tallest - c.length) / 2) * GAP.row };
    }));
    const centre = (id) => ({ x: pos[id].x + NODE.w / 2, y: pos[id].y + NODE.h / 2 });
    // Modératrices : au-dessus du milieu de la (première) flèche qu'elles modèrent ; sans collision dans la rangée.
    const row = (list, y, wanted) => {
      const items = list.map((n) => ({ id: n.id, x: wanted(n) })).sort((a, b) => a.x - b.x);
      let minX = GAP.margin;
      for (const it of items) { it.x = Math.max(minX, it.x); minX = it.x + NODE.w + 16; pos[it.id] = { x: Math.round(it.x), y: Math.round(y) }; }
    };
    row(mods, GAP.margin, (m) => {
      const e = g.edges.find((k) => k.from === m.id && isModeration(g, k));
      const t = e && g.edges.find((k) => k.id === e.to);
      if (t && pos[t.from] && pos[t.to]) return (centre(t.from).x + centre(t.to).x) / 2 - NODE.w / 2;
      const d = g.edges.find((k) => k.from === m.id && pos[k.to]);
      return d ? pos[d.to].x : GAP.margin;
    });
    const bottom = top + tallest * GAP.row + 24;
    row(ctrls, bottom, (c) => { const d = g.edges.find((k) => k.from === c.id && pos[k.to] && byRole(g, k.to) !== 'ctrl'); return d ? pos[d.to].x : GAP.margin + (nLayers - 1) * GAP.col; });
    for (const id of Object.keys(pos)) pos[id] = { x: Math.round(pos[id].x), y: Math.round(pos[id].y) };
    const b = bounds(g.nodes.map((n) => ({ ...n, ...pos[n.id] })));
    return { positions: pos, width: b.width, height: b.height };
  }
  function bounds(nodes) {
    if (!nodes.length) return { width: 720, height: 320 };
    return { width: Math.max(720, Math.max(...nodes.map((n) => n.x)) + NODE.w + GAP.margin), height: Math.max(320, Math.max(...nodes.map((n) => n.y)) + NODE.h + GAP.margin) };
  }
  // Taille du dessin : boîtes, plus les courbes qui passent sous la dernière rangée.
  function canvas(g, geo = geometry(g)) {
    const b = bounds(g.nodes), pts = Object.values(geo);
    return { width: Math.ceil(Math.max(b.width, ...pts.map((q) => Math.max(q.mx, q.cx) + 40))), height: Math.ceil(Math.max(b.height, ...pts.map((q) => q.my + 30))) };
  }
  // Deux boîtes se chevauchent-elles ? (utile aux tests de lisibilité)
  function overlaps(nodes) {
    const out = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (Math.abs(a.x - b.x) < NODE.w && Math.abs(a.y - b.y) < NODE.h) out.push([a.id, b.id]);
    }
    return out;
  }

  // --- Géométrie : les flèches partent et arrivent au bord des boîtes ; une modération vise le milieu de sa flèche.
  // Une flèche qui traverserait une autre boîte (ex. X → Y passant sur la médiatrice) devient une courbe
  // (Bézier quadratique) contournant les boîtes ; deux flèches opposées A → B et B → A s'écartent l'une de l'autre.
  function border(n, tx, ty) {
    const cx = n.x + NODE.w / 2, cy = n.y + NODE.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const s = Math.min(dx ? (NODE.w / 2) / Math.abs(dx) : Infinity, dy ? (NODE.h / 2) / Math.abs(dy) : Infinity);
    return { x: cx + dx * s, y: cy + dy * s };
  }
  const BENDS = Object.freeze([0, 48, -48, 80, -80, 120, -120, 170, -170, 230, -230]); // décalages essayés, dans l'ordre
  function geometry(g) {
    const byId = new Map(g.nodes.map((n) => [n.id, n])), geo = {}, ne = nodeEdges(g);
    const c = (n) => ({ x: n.x + NODE.w / 2, y: n.y + NODE.h / 2 });
    const quad = (p, k, q, t) => ({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * k.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * k.y + t * t * q.y });
    const inside = (pt, skip) => g.nodes.some((o) => !skip.includes(o.id) && pt.x > o.x - 6 && pt.x < o.x + NODE.w + 6 && pt.y > o.y - 6 && pt.y < o.y + NODE.h + 6);
    for (const e of ne) {
      const a = byId.get(e.from), b = byId.get(e.to), ca = c(a), cb = c(b);
      const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
      let nx = -(cb.y - ca.y) / len, ny = (cb.x - ca.x) / len; // normale unitaire, orientée vers le haut (ou la gauche)
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      const ctrl = (d) => ({ x: (ca.x + cb.x) / 2 + 2 * d * nx, y: (ca.y + cb.y) / 2 + 2 * d * ny }); // sommet de la courbe à d du segment
      // Tracé réel pour un décalage d : du bord de A au bord de B, via le point de contrôle.
      const route = (d) => {
        const k = ctrl(d), p = border(a, d ? k.x : cb.x, d ? k.y : cb.y), q = border(b, d ? k.x : ca.x, d ? k.y : ca.y);
        return { p, q, k: d ? k : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
      };
      const clear = (d) => { // la courbe ne touche aucune autre boîte et reste dans le dessin, étiquette comprise
        const { p, q, k } = route(d);
        for (let i = 1; i < 20; i++) { const pt = quad(p, k, q, i / 20); if (pt.x < 8 || pt.y < 24 || inside(pt, [a.id, b.id])) return false; }
        return true;
      };
      const moderated = g.edges.some((k) => k.to === e.id); // une flèche modérée se courbe de préférence vers le haut, côté modératrices
      const twin = ne.some((k) => k.from === e.to && k.to === e.from);
      const side = e.from < e.to ? 1 : -1; // même règle pour A → B et B → A : chacune de son côté
      const tries = twin ? BENDS.filter((d) => d * side > 0 && Math.abs(d) <= 120).concat([side * 30]).sort((x, y) => Math.abs(x) - Math.abs(y))
        : moderated ? BENDS.filter((d) => d >= 0).concat(BENDS.filter((d) => d < 0)) : BENDS;
      const d = tries.find(clear) ?? tries[tries.length - 1];
      const { p, q, k: kk } = route(d);
      const mid = quad(p, kk, q, 0.5);
      geo[e.id] = { x1: p.x, y1: p.y, cx: kk.x, cy: kk.y, x2: q.x, y2: q.y, mx: mid.x, my: mid.y, bend: d };
    }
    for (const e of g.edges) {
      if (byId.has(e.to)) continue;
      const t = geo[e.to], a = byId.get(e.from), p = border(a, t.mx, t.my);
      geo[e.id] = { x1: p.x, y1: p.y, cx: (p.x + t.mx) / 2, cy: (p.y + t.my) / 2, x2: t.mx, y2: t.my, mx: (p.x + t.mx) / 2, my: (p.y + t.my) / 2, bend: 0 };
    }
    for (const k of Object.keys(geo)) for (const f of ['x1', 'y1', 'cx', 'cy', 'x2', 'y2', 'mx', 'my']) geo[k][f] = Math.round(geo[k][f] * 10) / 10;
    return geo;
  }
  // Découpe d'un libellé en deux lignes au plus (environ 20 caractères par ligne).
  function wrap(label, max = 20) {
    if (label.length <= max) return [label];
    const words = label.split(' '); let a = '';
    for (const w of words) { if ((a + ' ' + w).trim().length > max && a) break; a = (a + ' ' + w).trim(); }
    if (!a) a = label.slice(0, max);
    let b = label.slice(a.length).trim();
    if (b.length > max) b = b.slice(0, max - 1) + '…';
    return b ? [a, b] : [a];
  }

  // --- Export SVG autonome (couleurs fixes, aucune ressource externe). roleName(role) fournit le libellé traduit.
  const COLORS = Object.freeze({ iv: ['#e7f0fb', '#1864ab'], dv: ['#fdecec', '#b02525'], med: ['#e3f6ee', '#087f5b'], mod: ['#fff4e0', '#a05a00'], ctrl: ['#eef0f3', '#5c6670'] });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const signText = (s) => (s === '-' ? '−' : s);
  function toSVG(g, roleName, title) {
    const geo = geometry(g), cyc = new Set(cycles(g).flatMap((c) => c.nodes)), b = canvas(g, geo);
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.width} ${b.height}" width="${b.width}" height="${b.height}" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="${esc(title)}">`,
      `<title>${esc(title)}</title>`,
      '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#33414d"/></marker></defs>',
      `<rect width="${b.width}" height="${b.height}" fill="#ffffff"/>`];
    for (const e of g.edges) {
      const q = geo[e.id], mod = isModeration(g, e), loop = !mod && cyc.has(e.from) && cyc.has(e.to);
      const ctrl = byRole(g, e.from) === 'ctrl';
      out.push(`<path data-edge="${esc(e.id)}" d="M${q.x1} ${q.y1}Q${q.cx} ${q.cy} ${q.x2} ${q.y2}" fill="none" stroke="${loop ? '#c92a2a' : '#33414d'}" stroke-width="2"${mod || ctrl ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`);
      const txt = `${e.label}${e.label ? ' ' : ''}(${signText(e.sign)})`;
      // Étiquette au milieu ; décalée de côté quand une flèche de modération arrive (ou part) à cet endroit.
      const moderated = g.edges.some((k) => k.to === e.id);
      const [lx, ly, anchor] = mod ? [q.mx - 8, q.my + 4, 'end'] : moderated ? [q.mx + 10, q.my - 6, 'start'] : [q.mx, q.my - 6, 'middle'];
      out.push(`<text x="${lx}" y="${ly}" font-size="13" font-weight="700" text-anchor="${anchor}" fill="#33414d" stroke="#ffffff" stroke-width="4" paint-order="stroke">${esc(txt)}</text>`);
    }
    for (const n of g.nodes) {
      const [fill, stroke] = COLORS[n.role], lines = wrap(n.label);
      out.push(`<g data-node="${esc(n.id)}" transform="translate(${n.x} ${n.y})"><rect width="${NODE.w}" height="${NODE.h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
      lines.forEach((l, i) => out.push(`<text x="${NODE.w / 2}" y="${(lines.length === 1 ? 27 : 20) + i * 16}" font-size="14" font-weight="700" text-anchor="middle" fill="#1b2a35">${esc(l)}</text>`));
      out.push(`<text x="${NODE.w / 2}" y="${NODE.h - 7}" font-size="11" text-anchor="middle" fill="${stroke}">${esc(roleName(n.role))}</text></g>`);
    }
    out.push('</svg>');
    return out.join('\n') + '\n';
  }

  // --- Hypothèses formulées. tr(clé, paramètres) fournit les phrases dans la langue choisie.
  const SIGN_KEY = Object.freeze({ '+': 'Pos', '-': 'Neg', '?': 'Unk' });
  function sentence(g, e, tr) {
    const name = (id) => g.nodes.find((n) => n.id === id).label;
    if (isModeration(g, e)) {
      const t = g.edges.find((k) => k.id === e.to);
      return tr('md.mod' + SIGN_KEY[e.sign], { m: name(e.from), a: name(t.from), b: name(t.to) });
    }
    return tr('md.direct' + SIGN_KEY[e.sign], { a: name(e.from), b: name(e.to) });
  }
  // Chemin lisible « A → M → Y » (flèche fournie par la langue : ← en arabe, écrit de droite à gauche).
  const chain = (g, ids, tr) => ids.map((id) => g.nodes.find((n) => n.id === id).label).join(tr('md.arrow'));
  // --- Liste Markdown complète : variables, hypothèses, chemins de médiation, contrôles, avertissements.
  function toMarkdown(g, tr) {
    const lines = [`# ${g.name}`, '', `## ${tr('md.variables')}`, ''];
    for (const r of ROLES) { const list = g.nodes.filter((n) => n.role === r); if (list.length) lines.push(`- **${tr('role.' + r + 's')}**${tr('md.colon')}${list.map((n) => n.label).join(tr('md.listSep'))}`); }
    const hyps = g.edges.filter((e) => byRole(g, e.from) !== 'ctrl');
    lines.push('', `## ${tr('md.hypotheses')}`, '');
    if (!hyps.length) lines.push(`- ${tr('md.none')}`);
    for (const e of hyps) lines.push(`- **${e.label}** (${signText(e.sign)})${tr('md.colon')}${sentence(g, e, tr)}`);
    const paths = mediationPaths(g);
    if (paths.length) {
      lines.push('', `## ${tr('md.mediation')}`, '');
      for (const p of paths) lines.push(`- ${chain(g, [p.from, ...p.via, p.to], tr)} (${p.labels.filter(Boolean).join(' × ')})${tr('md.colon')}${tr('md.indirect', { sign: signText(p.sign) })} ${tr(p.partial ? 'md.partial' : 'md.full')}`);
    }
    const ctrls = g.edges.filter((e) => byRole(g, e.from) === 'ctrl' && !isModeration(g, e));
    if (ctrls.length) { lines.push('', `## ${tr('md.controls')}`, ''); for (const e of ctrls) lines.push(`- ${chain(g, [e.from, e.to], tr)}${e.label ? ` (${e.label})` : ''}`); }
    const cyc = cycles(g);
    if (cyc.length) { lines.push('', `## ${tr('md.warnings')}`, ''); for (const c of cyc) lines.push(`- ${tr('md.cycle', { path: chain(g, c.path, tr) })}`); }
    return lines.join('\n') + '\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'hypothesisgraph' || data.version !== VERSION || !Array.isArray(data.graphs)) fail('err.notBackup');
    if (!keysAre(data, ['app', 'graphs', 'version'])) fail('err.backup');
    if (data.graphs.length > LIMITS.graphs) fail('err.graphsMany', { max: LIMITS.graphs });
    const graphs = data.graphs.map(makeGraph);
    if (new Set(graphs.map((x) => x.id)).size !== graphs.length) fail('err.backup');
    return graphs;
  }
  function backup(graphs) { return JSON.stringify({ app: 'hypothesisgraph', version: VERSION, graphs: validateBackup({ app: 'hypothesisgraph', version: VERSION, graphs }) }, null, 2); }

  root.HypCore = Object.freeze({
    VERSION, ROLES, SIGNS, LIMITS, NODE, makeGraph, newGraph, nextLabel, isModeration, update, putNode, removeNode, putEdge, removeEdge, moveNode, applyLayout,
    cycles, mediationPaths, diagnose, layout, bounds, canvas, overlaps, geometry, wrap, toSVG, sentence, chain, signText, toMarkdown, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HypCore;
})(typeof window === 'undefined' ? globalThis : window);
