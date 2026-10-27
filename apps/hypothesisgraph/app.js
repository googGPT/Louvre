/* HypothesisGraph — interface. Modèle, validation, mise en page et exports dans core.js (HypCore) ; textes dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.HypCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions (pas d'argent ici)
  const t = L.t;
  const KEY = 'louvre-hypothesisgraph-v1'; // clé de stockage local
  const ACTIVE = 'louvre-hypothesisgraph-active'; // modèle affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let graphs = []; // modèles enregistrés
  let activeId = null; // modèle affiché
  let readOnly = false; // stockage illisible : aucune écriture
  let editNode = null, editEdge = null; // éléments en cours de modification (formulaires)

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const active = () => graphs.find((g) => g.id === activeId) || null;
  const roleName = (r) => t('role.' + r);
  const nodeName = (g, id) => { const n = g.nodes.find((k) => k.id === id); return n ? n.label : ''; };
  const edgeTitle = (g, e) => `${e.label || t('edge.control')}${t('md.colon')}${C.chain(g, [e.from, e.to], t)}`;

  function save(next) {
    if (readOnly) { say('model-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); graphs = next; return true; }
    catch (e) { say('model-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Applique une opération du moteur au modèle affiché, puis enregistre. Lève l'erreur traduite si refusée.
  function change(op) { const cur = active(); const next = op(cur); return save(graphs.map((g) => (g.id === cur.id ? next : g))); }
  function ensureGraph() { // crée un premier modèle si besoin
    if (active()) return true;
    if (graphs.length) { activeId = graphs[0].id; return true; }
    const first = C.newGraph(t('model.defaultName'), newId());
    if (!save([first])) return false;
    activeId = first.id; return true;
  }
  function setActive(id) { activeId = id; editNode = editEdge = null; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort seulement */ } }

  // --- Affichage
  function renderGraphs() {
    const sel = $('graph-select');
    sel.replaceChildren(...graphs.map((g) => { const o = el('option', '', `${g.name} (${g.nodes.length})`); o.value = g.id; return o; }));
    if (!graphs.length) { const o = el('option', '', t('model.none')); o.value = ''; sel.append(o); }
    sel.value = activeId || '';
    $('rename-graph').disabled = $('delete-graph').disabled = !active();
  }

  function renderNodes(g) {
    const list = $('node-list');
    if (!g || !g.nodes.length) { list.replaceChildren(el('li', 'empty', t('vars.empty'))); return; }
    const sorted = [...g.nodes].sort((a, b) => C.ROLES.indexOf(a.role) - C.ROLES.indexOf(b.role) || a.label.localeCompare(b.label, L.locale));
    list.replaceChildren(...sorted.map((n) => {
      const li = el('li'), txt = el('div', 'txt'), acts = el('div', 'acts');
      txt.append(el('b', '', n.label), el('span', 'tag role-' + n.role, roleName(n.role)));
      const edit = el('button', 'btn', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: n.label }));
      edit.addEventListener('click', () => { editNode = n.id; const f = $('node-form'); f.label.value = n.label; f.role.value = n.role; renderForms(); f.label.focus(); });
      const del = el('button', 'btn', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { name: n.label }));
      del.addEventListener('click', () => {
        const links = g.edges.filter((e) => e.from === n.id || e.to === n.id).length;
        if (!confirm(t('confirm.node', { name: n.label, n: links }))) return;
        try { if (change((cur) => C.removeNode(cur, n.id))) { if (editNode === n.id) editNode = null; say('node-status', t('node.removed', { name: n.label }), 'ok'); render(); } }
        catch (e) { say('node-status', L.error(e), 'error'); }
      });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }

  function renderEdges(g) {
    const list = $('edge-list');
    if (!g || !g.edges.length) { list.replaceChildren(el('li', 'empty', t('hyps.empty'))); return; }
    list.replaceChildren(...g.edges.map((e) => {
      const li = el('li'), txt = el('div', 'txt'), acts = el('div', 'acts');
      const ctrl = g.nodes.find((n) => n.id === e.from).role === 'ctrl';
      const head = el('b'); head.append(el('span', 'hyp-label', e.label || t('edge.control')), el('span', 'sign sign-' + ({ '+': 'pos', '-': 'neg', '?': 'unk' })[e.sign], C.signText(e.sign)));
      txt.append(head, el('span', '', ctrl && !C.isModeration(g, e) ? t('edge.controlText', { a: nodeName(g, e.from), b: nodeName(g, e.to) }) : C.sentence(g, e, t)));
      if (C.isModeration(g, e)) txt.append(el('span', 'tag', t('edge.moderation')));
      const name = e.label || t('edge.control');
      const edit = el('button', 'btn', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name }));
      edit.addEventListener('click', () => { editEdge = e.id; renderForms(); const f = $('edge-form'); f.from.value = e.from; f.to.value = e.to; f.sign.value = e.sign; f.label.value = e.label; f.from.focus(); });
      const del = el('button', 'btn', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { name }));
      del.addEventListener('click', () => {
        const mods = g.edges.filter((k) => k.to === e.id).length;
        if (mods && !confirm(t('confirm.edge', { name, n: mods }))) return;
        try { if (change((cur) => C.removeEdge(cur, e.id))) { if (editEdge === e.id) editEdge = null; say('edge-status', t('edge.removed', { name }), 'ok'); render(); } }
        catch (err) { say('edge-status', L.error(err), 'error'); }
      });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }

  // Formulaires : listes de choix reconstruites sans perdre la sélection ni la saisie en cours.
  function renderForms() {
    const g = active(), f = $('edge-form');
    const keepFrom = f.from.value, keepTo = f.to.value;
    const nodes = g ? [...g.nodes].sort((a, b) => a.label.localeCompare(b.label, L.locale)) : [];
    const opt = (v, text) => { const o = el('option', '', text); o.value = v; return o; };
    f.from.replaceChildren(...nodes.map((n) => opt(n.id, `${n.label} (${roleName(n.role)})`)));
    const groupVars = el('optgroup'); groupVars.label = t('f.toVars'); groupVars.append(...nodes.map((n) => opt(n.id, `${n.label} (${roleName(n.role)})`)));
    const targets = g ? g.edges.filter((e) => !C.isModeration(g, e) && e.id !== editEdge) : [];
    const groupHyps = el('optgroup'); groupHyps.label = t('f.toHyps'); groupHyps.append(...targets.map((e) => opt(e.id, edgeTitle(g, e))));
    f.to.replaceChildren(groupVars, ...(targets.length ? [groupHyps] : []));
    if ([...f.from.options].some((o) => o.value === keepFrom)) f.from.value = keepFrom;
    if ([...f.to.options].some((o) => o.value === keepTo)) f.to.value = keepTo;
    else if (f.to.options.length > 1 && f.to.value === f.from.value) f.to.selectedIndex = 1; // proposition : une autre variable
    if (g && !editEdge && !f.label.value) f.label.value = C.nextLabel(g);
    $('node-submit').textContent = t(editNode ? 'btn.saveVar' : 'btn.addVar'); $('node-cancel').hidden = !editNode;
    $('edge-submit').textContent = t(editEdge ? 'btn.saveHyp' : 'btn.addHyp'); $('edge-cancel').hidden = !editEdge;
  }

  // Schéma : le même SVG que l'export, rendu dans la page, avec boîtes déplaçables (souris, doigt ou clavier).
  function renderCanvas(g) {
    const box = $('canvas');
    if (!g || !g.nodes.length) { box.replaceChildren(el('p', 'empty', t('diagram.empty'))); $('legend').replaceChildren(); return; }
    const doc = new DOMParser().parseFromString(C.toSVG(g, roleName, g.name), 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    svg.removeAttribute('width'); svg.removeAttribute('height'); svg.classList.add('graph');
    for (const node of svg.querySelectorAll('[data-node]')) {
      const id = node.getAttribute('data-node'), n = g.nodes.find((k) => k.id === id);
      node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button');
      node.setAttribute('aria-label', t('diagram.node', { name: n.label, role: roleName(n.role) }));
      drag(svg, node, n);
    }
    box.replaceChildren(svg);
    $('legend').replaceChildren(...C.ROLES.filter((r) => g.nodes.some((n) => n.role === r)).map((r) => el('li', 'role-' + r, roleName(r))),
      el('li', 'dash', t('legend.dashed')));
  }
  function drag(svg, node, n) {
    let start = null;
    const point = (ev) => { const m = svg.getScreenCTM(); return m ? new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()) : { x: ev.clientX, y: ev.clientY }; };
    const commit = (x, y) => { try { if (change((cur) => C.moveNode(cur, n.id, x, y))) render(); } catch (e) { say('model-status', L.error(e), 'error'); } };
    node.addEventListener('pointerdown', (ev) => { if (readOnly) return; start = { p: point(ev), x: n.x, y: n.y, moved: false }; node.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    node.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const p = point(ev), dx = p.x - start.p.x, dy = p.y - start.p.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
      node.setAttribute('transform', `translate(${Math.max(0, start.x + dx)} ${Math.max(0, start.y + dy)})`);
    });
    const end = (ev) => {
      if (!start) return;
      const p = point(ev), s = start; start = null;
      if (s.moved) commit(s.x + p.x - s.p.x, s.y + p.y - s.p.y);
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', () => { start = null; render(); });
    node.addEventListener('keydown', (ev) => { // flèches du clavier : déplacement par pas de 16
      const step = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[ev.key];
      if (!step || readOnly) return;
      ev.preventDefault();
      commit(n.x + step[0], n.y + step[1]);
      const again = $('canvas').querySelector(`[data-node="${CSS.escape(n.id)}"]`); if (again) again.focus();
    });
  }

  function renderChecks(g) {
    const diag = $('diag'), paths = $('paths');
    if (!g || !g.nodes.length) { diag.replaceChildren(el('li', 'empty', t('check.empty'))); paths.replaceChildren(); return; }
    const items = C.diagnose(g).map((d) => {
      const e = d.edge && g.edges.find((k) => k.id === d.edge);
      const text = t(d.key, { name: d.node ? nodeName(g, d.node) : '', path: d.path ? C.chain(g, d.path, t) : '', hyp: e ? (e.label || t('edge.control')) : '' });
      const li = el('li', 'lvl-' + d.level); li.append(el('b', '', t('level.' + d.level)), el('span', '', text)); return li;
    });
    diag.replaceChildren(...(items.length ? items : [el('li', 'lvl-ok', t('check.ok'))]));
    const med = C.mediationPaths(g);
    paths.replaceChildren(...(med.length ? med.map((p) => {
      const li = el('li', 'lvl-info');
      li.append(el('b', '', C.chain(g, [p.from, ...p.via, p.to], t)), el('span', '', `${p.labels.filter(Boolean).join(' × ')} · ${t('md.indirect', { sign: C.signText(p.sign) })} ${t(p.partial ? 'md.partial' : 'md.full')}`));
      return li;
    }) : [el('li', 'empty', t('med.none'))]));
  }

  function render() {
    const g = active();
    renderGraphs(); renderForms(); renderNodes(g); renderEdges(g); renderCanvas(g); renderChecks(g);
    $('relayout').disabled = $('export-svg').disabled = $('export-md').disabled = !g || !g.nodes.length;
  }

  // --- Variables
  $('node-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (!ensureGraph()) return;
      const id = editNode || newId(), label = f.label.value;
      if (!change((cur) => C.putNode(cur, { id, label, role: f.role.value }))) return;
      const saved = active().nodes.find((n) => n.id === id);
      say('node-status', t(editNode ? 'node.saved' : 'node.added', { name: saved.label, role: roleName(saved.role) }), 'ok');
      editNode = null; f.label.value = ''; f.label.focus(); render();
    } catch (e) { say('node-status', L.error(e), 'error'); }
  });
  $('node-cancel').addEventListener('click', () => { editNode = null; $('node-form').label.value = ''; say('node-status', ''); renderForms(); });

  // --- Hypothèses
  $('edge-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const g = active();
      if (!g || g.nodes.length < 2) throw new Error('err.needTwo');
      const id = editEdge || newId();
      if (!change((cur) => C.putEdge(cur, { id, from: f.from.value, to: f.to.value, sign: f.sign.value, label: f.label.value }))) return;
      const e = active().edges.find((k) => k.id === id);
      say('edge-status', t(editEdge ? 'edge.saved' : 'edge.added', { name: e.label || t('edge.control') }), 'ok');
      editEdge = null; f.label.value = ''; render();
    } catch (e) { say('edge-status', L.error(e), 'error'); }
  });
  $('edge-cancel').addEventListener('click', () => { editEdge = null; $('edge-form').label.value = ''; say('edge-status', ''); renderForms(); });

  // --- Modèles
  $('graph-select').addEventListener('change', (e) => { setActive(e.target.value); $('edge-form').label.value = ''; render(); });
  $('new-graph').addEventListener('click', () => {
    if (graphs.length >= C.LIMITS.graphs) { say('model-status', t('err.graphsMany', { max: C.LIMITS.graphs }), 'error'); return; }
    const name = prompt(t('prompt.new'), t('model.newDefault', { n: graphs.length + 1 }));
    if (name === null) return;
    try { const g = C.newGraph(name, newId()); if (save([...graphs, g])) { setActive(g.id); $('edge-form').label.value = ''; render(); } } catch (e) { say('model-status', L.error(e), 'error'); }
  });
  $('rename-graph').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name);
    if (name === null) return;
    try { if (change((g) => C.update(g, { name }))) render(); } catch (e) { say('model-status', L.error(e), 'error'); }
  });
  $('delete-graph').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.nodes.length }))) return;
    if (save(graphs.filter((g) => g.id !== cur.id))) { setActive(graphs[0] ? graphs[0].id : null); $('edge-form').label.value = ''; render(); }
  });
  $('relayout').addEventListener('click', () => { try { if (change((g) => C.applyLayout(g))) { render(); say('model-status', t('diagram.relaid'), 'ok'); } } catch (e) { say('model-status', L.error(e), 'error'); } });

  // Exemple : un modèle de démonstration complet, dans la langue affichée (nouveau modèle, rien n'est remplacé).
  $('sample').addEventListener('click', () => {
    try {
      if (graphs.length >= C.LIMITS.graphs) throw new Error(`err.graphsMany|${JSON.stringify({ max: C.LIMITS.graphs })}`);
      const id = { x: newId(), m: newId(), y: newId(), w: newId(), c: newId() };
      let g = C.newGraph(t('sample.name'), newId());
      g = C.putNode(g, { id: id.x, label: t('sample.iv'), role: 'iv' });
      g = C.putNode(g, { id: id.m, label: t('sample.med'), role: 'med' });
      g = C.putNode(g, { id: id.y, label: t('sample.dv'), role: 'dv' });
      g = C.putNode(g, { id: id.w, label: t('sample.mod'), role: 'mod' });
      g = C.putNode(g, { id: id.c, label: t('sample.ctrl'), role: 'ctrl' });
      const direct = newId();
      g = C.putEdge(g, { id: newId(), from: id.x, to: id.m, sign: '+', label: 'H1' });
      g = C.putEdge(g, { id: newId(), from: id.m, to: id.y, sign: '+', label: 'H2' });
      g = C.putEdge(g, { id: direct, from: id.x, to: id.y, sign: '+', label: 'H3' });
      g = C.putEdge(g, { id: newId(), from: id.w, to: direct, sign: '-', label: 'H4' });
      g = C.putEdge(g, { id: newId(), from: id.c, to: id.y, sign: '?', label: '' });
      if (save([...graphs, g])) { setActive(g.id); $('edge-form').label.value = ''; render(); say('model-status', t('sample.added'), 'ok'); }
    } catch (e) { say('model-status', L.error(e), 'error'); }
  });

  // --- Exports
  const fileName = (s) => (s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'hypothesisgraph').slice(0, 40);
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-svg').addEventListener('click', () => { const g = active(); if (!g) return; download(fileName(g.name) + '.svg', C.toSVG(g, roleName, g.name), 'image/svg+xml'); say('model-status', t('export.svg'), 'ok'); });
  $('export-md').addEventListener('click', () => { const g = active(); if (!g) return; download(fileName(g.name) + '.md', C.toMarkdown(g, t), 'text/markdown'); say('model-status', t('export.md'), 'ok'); });
  $('export').addEventListener('click', () => {
    try { download('hypothesisgraph-backup.json', C.backup(graphs), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: graphs.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      setActive(next[0] ? next[0].id : null);
      $('warning').hidden = true; $('export-raw').hidden = true; $('edge-form').label.value = ''; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('hypothesisgraph-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) graphs = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = graphs.some((g) => g.id === last) ? last : (graphs[0] ? graphs[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const s of ['model-status', 'node-status', 'edge-status', 'backup-status']) say(s, ''); render(); }); // nouvelle langue : on réaffiche, la saisie reste
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
