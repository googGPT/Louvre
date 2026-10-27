/* IconStudio — interface. Logique dans core.js (IconCore) ; textes dans LouvreI18n (appli sans argent).
   La grille et les formes sont construites avec createElementNS + setAttribute à partir de IconCore.shapeAttrs :
   aucune chaîne saisie n'est insérée comme balisage. */
(() => {
  'use strict';
  const C = window.IconCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-iconstudio-v1';
  const ACTIVE = 'louvre-iconstudio-active';
  const NS = 'http://www.w3.org/2000/svg';
  const PREVIEW = [16, 24, 32, 48, 64, 128];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const svgEl = (tag, attrs = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of attrs) n.setAttribute(k, String(v)); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let icons = [], activeId = null, readOnly = false, sel = null;
  const histories = new Map(); // id d'icône -> historique (mémoire seulement)
  let pending = []; // points cliqués pour la forme en cours
  let cursor = null; // viseur clavier [x, y] sur la grille (null : invisible)

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function active() { return icons.find((i) => i.id === activeId) || null; }
  function hist() { const ic = active(); if (!ic) return null; if (!histories.has(ic.id)) histories.set(ic.id, C.history(ic)); return histories.get(ic.id); }
  function save(next) {
    if (readOnly) { say('draw-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); icons = next; return true; }
    catch (e) { say('draw-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function remember() { try { localStorage.setItem(ACTIVE, activeId || ''); } catch (_) { /* confort */ } }
  // Toute modification d'icône passe ici : historique + enregistrement immédiat (aucun différé à forcer).
  function apply(next, msg) {
    const h = hist();
    if (!save(icons.map((i) => (i.id === next.id ? next : i)))) return false;
    histories.set(next.id, C.commit(h, next));
    if (sel && !next.shapes.some((s) => s.id === sel)) sel = null;
    render();
    if (msg) say('draw-status', msg, 'ok');
    return true;
  }
  function guard(statusId, fn) { try { return fn(); } catch (e) { say(statusId, errText(e), 'error'); return null; } }

  // --- Style courant
  const tool = () => document.querySelector('input[name=tool]:checked').value;
  function styleNow() {
    return { fill: $('fill-none').checked ? 'none' : $('fill').value, stroke: $('stroke-none').checked ? 'none' : $('stroke').value, sw: $('sw').value, round: $('round').checked };
  }
  function loadStyle(s) {
    $('fill-none').checked = s.fill === 'none'; if (s.fill !== 'none') $('fill').value = s.fill;
    $('stroke-none').checked = s.stroke === 'none'; if (s.stroke !== 'none') $('stroke').value = s.stroke;
    $('sw').value = String(s.sw); $('round').checked = s.round;
    if (s.type === 'rect') $('rx').value = String(s.rx);
  }
  const typeName = (s) => t('tool.' + s.type);

  // --- Grille de dessin
  function renderCanvas() {
    const ic = active(), box = $('canvas');
    if (!ic) { box.replaceChildren(el('p', 'empty', t('icon.none'))); return; }
    const n = ic.size;
    const svg = svgEl('svg', [['viewBox', `-0.5 -0.5 ${n + 1} ${n + 1}`], ['class', 'board']]);
    svg.append(svgEl('rect', [['x', 0], ['y', 0], ['width', n], ['height', n], ['class', 'paper']].concat(ic.bg ? [['fill', ic.bg]] : [])));
    const grid = svgEl('g', [['class', 'gridlines']]);
    for (let k = 0; k <= n; k++) {
      const major = k % 4 === 0 ? ' major' : '';
      grid.append(svgEl('line', [['x1', k], ['y1', 0], ['x2', k], ['y2', n], ['class', 'gl' + major]]), svgEl('line', [['x1', 0], ['y1', k], ['x2', n], ['y2', k], ['class', 'gl' + major]]));
    }
    svg.append(grid);
    for (const s of ic.shapes) {
      const { tag, attrs } = C.shapeAttrs(s);
      const node = svgEl(tag, attrs); node.dataset.id = s.id; node.setAttribute('class', 'shape' + (s.id === sel ? ' selected' : ''));
      svg.append(node);
    }
    if (sel) { // contour de sélection par-dessus
      const s = ic.shapes.find((x) => x.id === sel);
      if (s) { const { tag, attrs } = C.shapeAttrs(s); const o = svgEl(tag, attrs.filter(([k]) => !['fill', 'stroke', 'stroke-width'].includes(k))); o.setAttribute('class', 'sel-outline'); svg.append(o); }
    }
    for (const [x, y] of pending) svg.append(svgEl('circle', [['cx', x], ['cy', y], ['r', Math.max(0.35, n / 48)], ['class', 'pending']]));
    if (pending.length > 1) svg.append(svgEl('polyline', [['points', pending.map((p) => p.join(',')).join(' ')], ['class', 'pending-line']]));
    if (cursor && tool() !== 'select' && tool() !== 'path') {
      const [x, y] = cursor, r = Math.max(0.6, n / 30);
      svg.append(svgEl('path', [['d', `M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}`], ['class', 'cursor']]));
    }
    box.replaceChildren(svg);
  }
  function gridPoint(ev) {
    const ic = active(), svg = $('canvas').querySelector('svg'), r = svg.getBoundingClientRect(), n = ic.size;
    const x = (ev.clientX - r.left) / r.width * (n + 1) - 0.5, y = (ev.clientY - r.top) / r.height * (n + 1) - 0.5;
    return [Math.min(n, Math.max(0, Math.round(x))), Math.min(n, Math.max(0, Math.round(y)))];
  }
  function addFrom(input, msgKey) {
    const ic = active();
    const r = guard('draw-status', () => C.addShape(ic, { ...styleNow(), ...input }));
    pending = [];
    if (!r) { renderCanvas(); return; }
    sel = r.id;
    apply(r.icon, t(msgKey || 'draw.added', { name: typeName(input) }));
  }
  // Pose d'un point (clic, toucher ou clavier) : deux points suffisent pour rectangle, cercle et ligne.
  function placePoint(p) {
    const ic = active(), tl = tool();
    pending.push(p);
    const [a, b] = pending;
    if (tl === 'rect' && b) addFrom({ type: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), rx: $('rx').value });
    else if (tl === 'circle' && b) addFrom({ type: 'circle', cx: a[0], cy: a[1], r: Math.min(ic.size / 2, Math.max(0.5, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) / 2)) });
    else if (tl === 'line' && b) addFrom({ type: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    else { renderCanvas(); toolHint(); }
  }
  $('canvas').addEventListener('click', (ev) => {
    const ic = active(); if (!ic || readOnly) return;
    const tl = tool();
    cursor = null; // le pointeur remplace le viseur clavier
    if (tl === 'select') {
      const id = ev.target && ev.target.dataset ? ev.target.dataset.id : null;
      sel = id || null; render(); if (sel) loadStyle(ic.shapes.find((s) => s.id === sel));
      return;
    }
    if (tl === 'path') return;
    placePoint(gridPoint(ev));
  });
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  $('canvas').addEventListener('keydown', (ev) => {
    const ic = active(); if (!ic || readOnly) return;
    const tl = tool(), d = ARROWS[ev.key];
    if (tl === 'select') {
      if (!sel) return;
      if (d) { ev.preventDefault(); nudge(d[0], d[1]); }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); apply(C.removeShape(ic, sel), t('layers.deleted')); }
      return;
    }
    if (tl === 'path') return;
    // Outils de dessin au clavier : flèches = viseur (Maj = 4 cases), Entrée/Espace = poser, Échap = effacer.
    if (d) {
      ev.preventDefault();
      const k = ev.shiftKey ? 4 : 1, c = cursor || [Math.round(ic.size / 2), Math.round(ic.size / 2)];
      cursor = [Math.min(ic.size, Math.max(0, c[0] + d[0] * k)), Math.min(ic.size, Math.max(0, c[1] + d[1] * k))];
      renderCanvas(); say('draw-status', t('cursor.at', { x: cursor[0], y: cursor[1] }));
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      cursor = cursor || [Math.round(ic.size / 2), Math.round(ic.size / 2)];
      placePoint([...cursor]);
    } else if (ev.key === 'Escape' && pending.length) { ev.preventDefault(); pending = []; renderCanvas(); toolHint(); }
  });
  function nudge(dx, dy) { const ic = active(); const next = guard('draw-status', () => C.translateShape(ic, sel, dx, dy)); if (next) apply(next); }
  $('nudge').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b && sel) nudge(Number(b.dataset.dx), Number(b.dataset.dy)); });
  $('poly-finish').addEventListener('click', () => {
    if (pending.length < 2) { say('draw-status', t('err.points'), 'error'); return; }
    addFrom({ type: 'polyline', points: pending, closed: $('poly-closed').checked });
  });
  $('poly-cancel').addEventListener('click', () => { pending = []; renderCanvas(); toolHint(); });
  $('path-add').addEventListener('click', () => { if (active() && !readOnly) addFrom({ type: 'path', d: $('path-d').value }); });
  function toolHint() {
    const tl = tool();
    $('poly-box').hidden = tl !== 'polyline'; $('path-box').hidden = tl !== 'path';
    const base = tl === 'polyline' ? t('hint.polyline', { n: pending.length }) : t('hint.' + tl);
    $('tool-hint').textContent = tl === 'select' || tl === 'path' ? base : `${base} ${t('hint.keys')}`;
  }
  document.querySelectorAll('input[name=tool]').forEach((r) => r.addEventListener('change', () => { pending = []; cursor = null; toolHint(); renderCanvas(); }));

  // --- Style : appliqué à la forme choisie dès qu'il change
  for (const id of ['fill', 'fill-none', 'stroke', 'stroke-none', 'sw', 'rx', 'round']) $(id).addEventListener('change', () => {
    const ic = active(); if (!ic || !sel || readOnly) return;
    const s = ic.shapes.find((x) => x.id === sel);
    const patch = styleNow(); if (s.type === 'rect') patch.rx = $('rx').value;
    const next = guard('draw-status', () => C.updateShape(ic, sel, patch));
    if (next) apply(next);
  });

  // --- Calques et propriétés
  function renderLayers() {
    const ic = active(), ul = $('layers');
    if (!ic || !ic.shapes.length) { ul.replaceChildren(el('li', 'empty', t('layers.empty'))); $('props-box').hidden = true; return; }
    const list = [...ic.shapes].reverse(); // dessus en premier
    ul.replaceChildren(...list.map((s, k) => {
      const li = el('li', s.id === sel ? 'current' : ''), pick = el('button', 'pick');
      pick.type = 'button'; pick.setAttribute('aria-pressed', String(s.id === sel));
      const sw = el('span', 'swatch'); sw.style.background = s.fill !== 'none' ? s.fill : 'transparent'; sw.style.borderColor = s.stroke !== 'none' ? s.stroke : 'var(--line)';
      pick.append(sw, el('span', '', `${typeName(s)} ${s.id.slice(1)}`));
      pick.addEventListener('click', () => { sel = s.id; loadStyle(s); render(); });
      const acts = el('div', 'acts');
      const mk = (txt, aria, fn, disabled) => { const b = el('button', 'btn small', txt); b.type = 'button'; b.setAttribute('aria-label', aria); b.title = aria; b.disabled = disabled || readOnly; b.addEventListener('click', fn); return b; };
      const name = `${typeName(s)} ${s.id.slice(1)}`;
      acts.append(
        mk('↑', t('layers.up', { name }), () => apply(C.moveShape(ic, s.id, 'up')), k === 0),
        mk('↓', t('layers.down', { name }), () => apply(C.moveShape(ic, s.id, 'down')), k === list.length - 1),
        mk('⧉', t('layers.dup', { name }), () => { const r = guard('draw-status', () => C.duplicateShape(ic, s.id)); if (r) { sel = r.id; apply(r.icon, t('layers.duplicated')); } }),
        mk('✕', t('layers.delete', { name }), () => apply(C.removeShape(ic, s.id), t('layers.deleted'))),
      );
      li.append(pick, acts); return li;
    }));
    renderProps();
  }
  const PROP_FIELDS = { rect: ['x', 'y', 'w', 'h', 'rx'], circle: ['cx', 'cy', 'r'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], path: ['d'] };
  function renderProps() {
    const ic = active(), s = ic && ic.shapes.find((x) => x.id === sel);
    $('props-box').hidden = !s;
    if (!s) return;
    const box = $('props');
    box.replaceChildren(...PROP_FIELDS[s.type].map((f) => {
      const lab = el('label', 'field' + (f === 'points' || f === 'd' ? ' wide' : '')), input = el(f === 'd' ? 'textarea' : 'input');
      input.id = 'prop-' + f; input.dir = 'ltr';
      if (f === 'points') input.value = s.points.map((p) => p.map(C.fmt).join(',')).join(' ');
      else if (f === 'd') { input.value = s.d; input.rows = 2; }
      else { input.value = C.fmt(s[f]); input.inputMode = 'decimal'; }
      input.addEventListener('change', () => {
        const patch = f === 'points' ? { points: guard('draw-status', () => C.parsePoints(input.value)) } : { [f]: input.value };
        if (f === 'points' && !patch.points) return;
        const next = guard('draw-status', () => C.updateShape(active(), s.id, patch));
        if (next) apply(next); else input.value = f === 'points' ? s.points.map((p) => p.map(C.fmt).join(',')).join(' ') : f === 'd' ? s.d : C.fmt(s[f]);
      });
      lab.append(el('span', '', t('prop.' + f)), input); return lab;
    }));
    if (s.type === 'polyline') {
      const lab = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'prop-closed'; cb.checked = s.closed;
      cb.addEventListener('change', () => { const next = guard('draw-status', () => C.updateShape(active(), s.id, { closed: cb.checked })); if (next) apply(next); else cb.checked = s.closed; });
      lab.append(cb, el('span', '', t('poly.closed'))); box.append(lab);
    }
  }

  // --- Aperçus et code
  function dataUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function renderPreview() {
    const ic = active();
    if (!ic) { $('previews').replaceChildren(); $('contrast').replaceChildren(); $('svg-code').value = ''; return; }
    const svg = C.toSvg(ic);
    $('svg-code').value = svg;
    const url = dataUrl(svg);
    renderContrast();
    $('previews').replaceChildren(...['light', 'dark'].map((bg) => {
      const row = el('div', 'prev-row ' + bg);
      for (const px of PREVIEW) {
        const fig = el('figure'), img = el('img'); img.src = url; img.width = px; img.height = px; img.alt = t('preview.alt', { px });
        fig.append(img, el('figcaption', '', `${px}`)); row.append(fig);
      }
      return row;
    }));
  }
  // Contraste : couleur la moins lisible sur chaque fond (seuil indicatif 3:1).
  function renderContrast() {
    const ic = active(), ul = $('contrast');
    if (!ic || !ic.shapes.length) { ul.replaceChildren(); return; }
    ul.replaceChildren(...C.contrastReport(ic).map((r) => {
      const where = ic.bg ? t('contrast.own') : r.bg === '#ffffff' ? t('contrast.light') : t('contrast.dark');
      const li = el('li', r.ok ? 'ok' : 'low');
      const chip = el('span', 'swatch'); chip.style.background = r.color; chip.style.borderColor = r.bg;
      const ratio = L.number(r.ratio, { maximumFractionDigits: 2 });
      const iso = (x) => `\u2066${x}\u2069`; // isolé : reste lisible dans une phrase arabe
      li.append(chip, el('span', '', `${t('contrast.line', { where, ratio: iso(`${ratio}:1`), color: iso(r.color) })} ${r.ok ? t('contrast.ok') : t('contrast.low')}`));
      return li;
    }));
  }
  function renderIcons() {
    const sel_ = $('icon-select');
    sel_.replaceChildren(...[...icons].sort((a, b) => a.name.localeCompare(b.name, L.locale)).map((i) => { const o = el('option', '', `${i.name} (${i.size}×${i.size})`); o.value = i.id; return o; }));
    if (activeId) sel_.value = activeId;
    const ic = active();
    for (const id of ['rename-icon', 'delete-icon', 'grid-size', 'bg-on', 'bg-color', 'export-svg', 'export-png']) $(id).disabled = !ic || (readOnly && !id.startsWith('export'));
    for (const id of ['new-icon', 'sample', 'path-add', 'poly-finish']) $(id).disabled = readOnly;
    if (ic) { $('grid-size').value = String(ic.size); $('bg-on').checked = !!ic.bg; if (ic.bg) $('bg-color').value = ic.bg; }
    const h = hist();
    $('undo').disabled = !h || !h.past.length || readOnly; $('redo').disabled = !h || !h.future.length || readOnly;
  }
  function render() { renderIcons(); renderCanvas(); renderLayers(); renderPreview(); toolHint(); }

  // --- Icônes
  function createIcon(name, size = 24, shapes = []) {
    if (icons.length >= C.MAX.icons) throw new Error(`err.tooManyIcons|${JSON.stringify({ max: C.MAX.icons })}`);
    const ic = C.makeIcon({ name, size, bg: null, shapes }, newId());
    if (!save([...icons, ic])) return null;
    activeId = ic.id; remember(); sel = null; pending = []; render();
    return ic;
  }
  $('icon-select').addEventListener('change', (e) => { activeId = e.target.value; remember(); sel = null; pending = []; cursor = null; render(); });
  $('new-icon').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('icon.newDefault', { n: icons.length + 1 }));
    if (name === null) return;
    guard('icon-status', () => { if (createIcon(name, Number($('grid-size').value) || 24)) say('icon-status', t('icon.created'), 'ok'); });
  });
  $('rename-icon').addEventListener('click', () => {
    const ic = active(); if (!ic) return;
    const name = prompt(t('prompt.rename'), ic.name);
    if (name === null) return;
    guard('icon-status', () => { const next = C.makeIcon({ ...ic, name }, ic.id); if (save(icons.map((i) => (i.id === ic.id ? next : i)))) { histories.delete(ic.id); render(); say('icon-status', t('icon.renamed'), 'ok'); } });
  });
  $('delete-icon').addEventListener('click', () => {
    const ic = active(); if (!ic || !confirm(t('confirm.delete', { name: ic.name, n: ic.shapes.length }))) return;
    if (save(icons.filter((i) => i.id !== ic.id))) { histories.delete(ic.id); activeId = icons[0] ? icons[0].id : null; remember(); sel = null; render(); say('icon-status', t('icon.deleted'), 'ok'); }
  });
  $('grid-size').addEventListener('change', () => {
    const ic = active(); if (!ic) return;
    const next = guard('icon-status', () => C.scaleIcon(ic, Number($('grid-size').value)));
    if (next && apply(next)) say('icon-status', t('icon.scaled', { n: next.size }), 'ok'); else render();
  });
  for (const id of ['bg-on', 'bg-color']) $(id).addEventListener('change', () => {
    const ic = active(); if (!ic) return;
    const next = guard('icon-status', () => C.makeIcon({ ...ic, bg: $('bg-on').checked ? $('bg-color').value : null }, ic.id));
    if (next) apply(next);
  });
  $('undo').addEventListener('click', () => step(C.undo));
  $('redo').addEventListener('click', () => step(C.redo));
  function step(fn) {
    const h = hist(); if (!h) return;
    const nh = fn(h); if (nh === h) return;
    if (!save(icons.map((i) => (i.id === nh.present.id ? nh.present : i)))) return;
    histories.set(nh.present.id, nh);
    if (sel && !nh.present.shapes.some((s) => s.id === sel)) sel = null;
    render(); say('draw-status', fn === C.undo ? t('draw.undone') : t('draw.redone'), 'ok');
  }
  document.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); step(C.undo); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); step(C.redo); }
  });

  // Exemple : une petite maison, nommée dans la langue affichée.
  $('sample').addEventListener('click', () => guard('icon-status', () => {
    const shapes = [
      { id: 's1', type: 'rect', x: 5, y: 11, w: 14, h: 10, rx: 0, fill: '#ffd43b', stroke: '#343a40', sw: 1, round: true },
      { id: 's2', type: 'polyline', points: [[3, 11], [12, 3], [21, 11]], closed: true, fill: '#e8590c', stroke: '#343a40', sw: 1, round: true },
      { id: 's3', type: 'rect', x: 10, y: 14, w: 4, h: 7, rx: 1, fill: '#343a40', stroke: 'none', sw: 0, round: false },
      { id: 's4', type: 'path', d: 'M16 4H18V8L16 6.5Z', fill: '#495057', stroke: 'none', sw: 0, round: false },
    ];
    if (createIcon(t('sample.name'), 24, shapes)) say('icon-status', t('sample.added'), 'ok');
  }));

  // --- Exports
  function download(name, data, type) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-svg').addEventListener('click', () => {
    const ic = active(); if (!ic) return;
    guard('backup-status', () => { download(C.fileName(ic.name, 'svg'), C.toSvg(ic), 'image/svg+xml'); say('backup-status', t('export.svgDone'), 'ok'); });
  });
  $('export-png').addEventListener('click', async () => {
    const ic = active(); if (!ic) return;
    const px = Number($('png-size').value);
    try {
      const url = URL.createObjectURL(new Blob([C.toSvg(ic, px)], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('err.png')); img.src = url; });
      const cv = document.createElement('canvas'); cv.width = px; cv.height = px;
      cv.getContext('2d').drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (!blob) throw new Error('err.png');
      download(C.fileName(ic.name, 'png').replace(/\.png$/, `-${px}.png`), blob);
      say('backup-status', t('export.pngDone', { px }), 'ok');
    } catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('import-svg').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (readOnly) throw new Error('storage.readonly');
      if (file.size > C.MAX.file) throw new Error('err.fileBig');
      if (icons.length >= C.MAX.icons) throw new Error(`err.tooManyIcons|${JSON.stringify({ max: C.MAX.icons })}`);
      const name = file.name.replace(/\.svg$/i, '').slice(0, C.MAX.name) || t('icon.imported');
      const r = C.importSvg(await file.text(), name, newId());
      if (!save([...icons, r.icon])) return;
      activeId = r.icon.id; remember(); sel = null; render();
      say('backup-status', t('import.done', { n: r.imported, ignored: r.ignored }) + (r.ignored ? ' ' + t('import.ignored', { n: r.ignored }) : ''), 'ok');
    } catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('export').addEventListener('click', () => guard('backup-status', () => { download('iconstudio-backup.json', C.backup(icons), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 10_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: icons.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      histories.clear(); activeId = next[0] ? next[0].id : null; remember(); sel = null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('iconstudio-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) icons = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = icons.some((i) => i.id === last) ? last : (icons[0] ? icons[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  if (!readOnly && !icons.length) { try { createIcon(t('icon.firstName')); } catch (_) { /* stockage bloqué */ } }
  L.onChange(() => { for (const id of ['icon-status', 'draw-status', 'backup-status']) say(id, ''); render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
