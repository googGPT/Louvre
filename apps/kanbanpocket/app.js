/* KanbanPocket — interface. Règles dans core.js (KanbanCore) ; textes dans LouvreI18n (appli sans argent).
   Déplacements : boutons, Maj + flèches au clavier, glisser à la souris ou au doigt (événements pointer). */
(() => {
  'use strict';
  const C = window.KanbanCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-kanbanpocket-v1';
  const ACTIVE = 'louvre-kanbanpocket-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  let boards = [], activeId = null, readOnly = false, editing = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cur = () => boards.find((b) => b.id === activeId) || null;
  const errText = (e) => (e instanceof SyntaxError ? t('err.backup') : L.error(e));
  // Nom affiché : le nom saisi, sinon « À faire » (première), « Fait » (dernière), « En cours » (deuxième), « Colonne n ».
  function colName(col, i) {
    if (col.name) return col.name;
    const last = (cur() ? cur().columns.length : 3) - 1;
    if (i === 0) return t('col.d0');
    if (i === last) return t('col.d2');
    return i === 1 ? t('col.d1') : t('col.n', { n: i + 1 });
  }
  const day = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); boards = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  // Applique une transformation du tableau affiché ; les erreurs du moteur (WIP…) sont affichées dans `statusId`.
  function change(fn, statusId) {
    const b = cur(); if (!b) return false;
    try { const next = fn(b); return save(boards.map((x) => (x.id === b.id ? next : x))); }
    catch (e) { say(statusId, errText(e), 'error'); return false; }
  }

  // --- Affichage
  function filters() { return { text: $('f-text').value, label: $('f-label').value, due: $('f-due').value }; }
  function renderBoards() {
    const sel = $('board-select');
    sel.replaceChildren(...boards.map((b) => { const o = el('option', '', `${b.name} (${b.cards.length})`); o.value = b.id; return o; }));
    if (activeId) sel.value = activeId;
    for (const id of ['rename-board', 'delete-board', 'add-column', 'export-csv']) $(id).disabled = !cur();
    $('save-card').disabled = !cur();
  }
  function renderForm() {
    const b = cur(), sel = $('c-col'), keep = sel.value;
    sel.replaceChildren(...(b ? b.columns.map((c, i) => { const o = el('option', '', colName(c, i)); o.value = c.id; return o; }) : []));
    if (b && b.columns.some((c) => c.id === keep)) sel.value = keep;
    $('h-card').textContent = editing ? t('card.editTitle') : t('card.title');
    $('save-card').textContent = editing ? t('btn.saveCard') : t('btn.addCard');
    $('cancel-edit').hidden = !editing;
    for (const id of ['c-title', 'c-labels', 'c-due', 'c-col', 'c-notes']) $(id).disabled = !b || readOnly;
  }
  function renderFilters() {
    const b = cur(), sel = $('f-label'), keep = sel.value;
    const labels = b ? C.allLabels(b).sort((x, y) => x.localeCompare(y, L.locale)) : [];
    const all = el('option', '', t('label.all')); all.value = '';
    sel.replaceChildren(all, ...labels.map((l) => { const o = el('option', '', l); o.value = l; return o; }));
    sel.value = labels.some((l) => l === keep) ? keep : '';
  }
  function renderStats() {
    const b = cur(), s = b ? C.stats(b, today()) : { total: 0, done: 0, overdue: 0, overWip: 0 };
    $('k-total').textContent = L.number(s.total); $('k-done').textContent = L.number(s.done);
    $('k-overdue').textContent = L.number(s.overdue); $('k-overwip').textContent = L.number(s.overWip);
    $('k-overdue').className = s.overdue ? 'bad' : ''; $('k-overwip').className = s.overWip ? 'bad' : '';
  }
  function smallBtn(text, key, label, onClick, disabled) {
    const b = el('button', 'btn small', text); b.type = 'button'; b.dataset.key = key; b.setAttribute('aria-label', label); b.title = label;
    b.disabled = disabled || readOnly; b.addEventListener('click', onClick); return b;
  }
  function renderBoard() {
    const b = cur(), box = $('board');
    const focusKey = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    if (!b) { box.replaceChildren(el('p', 'empty', t('board.empty'))); $('filter-info').textContent = ''; return; }
    const visible = new Set(C.filterCards(b, filters(), today()));
    $('filter-info').textContent = t('filter.info', { n: visible.size, total: L.number(b.cards.length) });
    const wips = C.wip(b), rtl = L.dir === 'rtl', last = b.columns.length - 1;
    box.style.setProperty('--cols', String(b.columns.length));
    box.replaceChildren(...b.columns.map((col, ci) => {
      const name = colName(col, ci), w = wips[ci];
      const sec = el('section', 'column' + (w.over ? ' over' : w.full ? ' full' : '')); sec.dataset.col = col.id;
      sec.setAttribute('aria-label', name);
      const head = el('div', 'col-head');
      head.append(el('h3', '', name), el('span', 'count' + (w.over ? ' bad' : ''), col.wip ? t('wip.of', { n: L.number(w.count), max: L.number(col.wip) }) : L.number(w.count)));
      if (w.over) head.append(el('span', 'tag bad', t('wip.over')));
      else if (w.full) head.append(el('span', 'tag', t('wip.full')));
      // Réglages de la colonne : nom et limite WIP.
      const det = el('details', 'col-set'), sum = el('summary', '', t('col.settings'));
      const form = el('form', 'col-form'); form.noValidate = true;
      const fn = el('label', 'field'), nameIn = el('input'); fn.append(el('span', '', t('f.colName')), nameIn);
      nameIn.value = col.name; nameIn.placeholder = name; nameIn.maxLength = 40; nameIn.dataset.key = `cname-${col.id}`;
      const fw = el('label', 'field'), wipIn = el('input'); fw.append(el('span', '', t('f.wip')), wipIn);
      wipIn.value = col.wip ? String(col.wip) : ''; wipIn.inputMode = 'numeric'; wipIn.maxLength = 2; wipIn.placeholder = t('f.wipPh');
      const row = el('div', 'row tight'), ok = el('button', 'btn small primary', t('btn.saveColumn')); ok.type = 'submit'; ok.disabled = readOnly;
      const del = smallBtn(t('btn.removeColumn'), `cdel-${col.id}`, t('aria.removeColumn', { name }), () => {
        if (!confirm(t('confirm.column', { name }))) return;
        if (change((x) => C.removeColumn(x, col.id), 'board-status')) { renderAll(); say('board-status', t('column.removed', { name }), 'ok'); }
      });
      row.append(ok, del); form.append(fn, fw, row);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (change((x) => ({ ...x, columns: x.columns.map((c) => (c.id === col.id ? C.makeColumn({ name: nameIn.value, wip: wipIn.value }, col.id) : c)) }), 'board-status')) {
          renderAll(); say('board-status', t('column.saved'), 'ok');
        }
      });
      det.append(sum, form);
      const list = el('ul', 'cards'); list.dataset.col = col.id;
      const cards = b.cards.filter((c) => c.col === col.id);
      const shown = cards.filter((c) => visible.has(c.id));
      for (const c of shown) {
        const i = cards.indexOf(c);
        const li = el('li', 'card'); li.tabIndex = 0; li.dataset.card = c.id; li.dataset.key = `card-${c.id}`;
        li.setAttribute('aria-label', t('aria.card', { title: c.title, col: name }));
        const grip = el('span', 'grip', '⠿'); grip.setAttribute('aria-hidden', 'true'); grip.title = t('grip.title');
        const body = el('div', 'body'); body.append(el('b', '', c.title));
        if (c.labels.length) { const tags = el('div', 'labels'); for (const l of c.labels) tags.append(el('span', 'tag', l)); body.append(tags); }
        const meta = [];
        if (c.due) meta.push(t('card.due', { date: day(c.due) }));
        if (c.notes) meta.push(c.notes);
        if (meta.length) body.append(el('span', 'meta', meta.join(' · ')));
        if (C.isOverdue(b, c, today())) body.append(el('span', 'tag bad', t('tag.overdue')));
        const acts = el('div', 'acts');
        const prevName = ci > 0 ? colName(b.columns[ci - 1], ci - 1) : '', nextName = ci < last ? colName(b.columns[ci + 1], ci + 1) : '';
        acts.append(
          smallBtn(rtl ? '→' : '←', `prev-${c.id}`, t('aria.toCol', { title: c.title, col: prevName }), () => moveBy(c.id, 'prev'), ci === 0),
          smallBtn('↑', `up-${c.id}`, t('aria.up', { title: c.title }), () => moveBy(c.id, 'up'), i === 0),
          smallBtn('↓', `down-${c.id}`, t('aria.down', { title: c.title }), () => moveBy(c.id, 'down'), i === cards.length - 1),
          smallBtn(rtl ? '←' : '→', `next-${c.id}`, t('aria.toCol', { title: c.title, col: nextName }), () => moveBy(c.id, 'next'), ci === last),
          smallBtn('✎', `edit-${c.id}`, t('aria.edit', { title: c.title }), () => startEdit(c.id)),
          smallBtn('✕', `del-${c.id}`, t('aria.remove', { title: c.title }), () => removeCard(c.id)),
        );
        li.append(grip, body, acts); list.append(li);
      }
      if (!shown.length) list.append(el('li', 'empty', cards.length ? t('col.hidden', { n: cards.length }) : t('col.empty')));
      sec.append(head, det, list); return sec;
    }));
    if (focusKey) {
      const again = box.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (again && !again.disabled) again.focus();
      else if (again) { const card = again.closest('.card'); if (card) card.focus(); }
    }
  }
  function renderAll() { renderBoards(); renderForm(); renderFilters(); renderStats(); renderBoard(); }

  // --- Déplacements
  function moveBy(cardId, dir) {
    const b = cur(), before = b && b.cards.find((c) => c.id === cardId); if (!before) return;
    if (change((x) => C.moveBy(x, cardId, dir), 'move-status')) {
      const after = cur(), card = after.cards.find((c) => c.id === cardId);
      renderAll();
      if (card.col !== before.col) {
        const ci = after.columns.findIndex((c) => c.id === card.col);
        say('move-status', t('moved.to', { title: card.title, col: colName(after.columns[ci], ci) }), 'ok');
        const node = $('board').querySelector(`[data-card="${CSS.escape(cardId)}"]`); if (node) node.focus();
      } else say('move-status', '');
    }
  }
  // Clavier : Maj + flèches sur une carte (gauche/droite inversées en arabe).
  $('board').addEventListener('keydown', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card || !e.shiftKey || e.target !== card) return;
    const rtl = L.dir === 'rtl';
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: rtl ? 'next' : 'prev', ArrowRight: rtl ? 'prev' : 'next' }[e.key];
    if (!dir) return;
    e.preventDefault();
    moveBy(card.dataset.card, dir);
    const again = $('board').querySelector(`[data-card="${CSS.escape(card.dataset.card)}"]`); if (again) again.focus();
  });

  // Souris et tactile : glisser la carte (au doigt, uniquement par la poignée pour laisser défiler la page).
  let drag = null;
  $('board').addEventListener('pointerdown', (e) => {
    if (readOnly || e.button > 0) return;
    const card = e.target.closest('.card');
    if (!card || e.target.closest('button, input, select, a')) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
    drag = { id: card.dataset.card, card, x: e.clientX, y: e.clientY, pid: e.pointerId, on: false, ghost: null, marker: null, target: null };
  });
  function dropPlace(x, y) { // colonne et position visées sous le pointeur
    const under = document.elementFromPoint(x, y);
    const sec = under && under.closest('.column');
    if (!sec) return null;
    const list = sec.querySelector('.cards');
    const cards = [...list.querySelectorAll('.card')].filter((c) => c.dataset.card !== drag.id);
    let index = cards.length;
    for (let i = 0; i < cards.length; i += 1) { const r = cards[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
    return { col: sec.dataset.col, list, cards, index };
  }
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true;
      const r = drag.card.getBoundingClientRect();
      drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
      drag.ghost = drag.card.cloneNode(true); drag.ghost.className = 'card ghost'; drag.ghost.style.width = `${r.width}px`;
      drag.ghost.removeAttribute('tabindex'); drag.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(drag.ghost); drag.card.classList.add('dragging');
      drag.marker = el('li', 'drop-marker'); drag.marker.setAttribute('aria-hidden', 'true');
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const place = dropPlace(e.clientX, e.clientY);
    drag.target = place;
    if (!place) { drag.marker.remove(); return; }
    const before = place.cards[place.index];
    if (before) place.list.insertBefore(drag.marker, before); else place.list.append(drag.marker);
  }, { passive: false });
  function endDrag(apply) {
    const d = drag; drag = null;
    if (!d || !d.on) return;
    d.ghost.remove(); d.marker.remove(); d.card.classList.remove('dragging');
    if (!apply || !d.target) return;
    const b = cur(), place = d.target;
    // Position parmi toutes les cartes de la colonne (les cartes masquées par un filtre gardent leur rang).
    const all = b.cards.filter((c) => c.col === place.col && c.id !== d.id);
    let index = Infinity;
    if (place.index < place.cards.length) index = all.findIndex((c) => c.id === place.cards[place.index].dataset.card);
    else if (place.cards.length) index = all.findIndex((c) => c.id === place.cards[place.cards.length - 1].dataset.card) + 1;
    const fromCol = b.cards.find((c) => c.id === d.id).col;
    if (change((x) => C.moveCard(x, d.id, place.col, index), 'move-status')) {
      renderAll();
      const ci = cur().columns.findIndex((c) => c.id === place.col);
      const title = cur().cards.find((c) => c.id === d.id).title;
      say('move-status', fromCol === place.col ? t('moved.order', { title }) : t('moved.to', { title, col: colName(cur().columns[ci], ci) }), 'ok');
    }
  }
  window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) endDrag(true); });
  window.addEventListener('pointercancel', () => endDrag(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) endDrag(false); });
  $('board').addEventListener('touchmove', (e) => { if (drag && drag.on) e.preventDefault(); }, { passive: false });

  // --- Cartes
  function resetForm() {
    editing = null;
    for (const id of ['c-title', 'c-labels', 'c-due', 'c-notes']) $(id).value = '';
    renderForm();
  }
  function startEdit(cardId) {
    const c = cur().cards.find((x) => x.id === cardId); if (!c) return;
    editing = cardId;
    $('c-title').value = c.title; $('c-labels').value = c.labels.join(', '); $('c-due').value = c.due; $('c-notes').value = c.notes;
    renderForm(); $('c-col').value = c.col;
    say('card-status', t('card.editing', { title: c.title }));
    $('c-title').focus();
  }
  function removeCard(cardId) {
    const c = cur().cards.find((x) => x.id === cardId); if (!c || !confirm(t('confirm.card', { title: c.title }))) return;
    if (change((x) => ({ ...x, cards: x.cards.filter((q) => q.id !== cardId) }), 'move-status')) {
      if (editing === cardId) resetForm();
      renderAll(); say('move-status', t('card.removed', { title: c.title }), 'ok');
    }
  }
  $('card-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!cur()) return;
    try {
      const card = C.makeCard({ title: $('c-title').value, labels: $('c-labels').value, due: $('c-due').value, notes: $('c-notes').value, col: $('c-col').value }, editing || newId());
      const wasEditing = !!editing;
      if (!change((x) => (wasEditing ? C.updateCard(x, card) : C.addCard(x, card)), 'card-status')) return;
      resetForm(); renderAll();
      say('card-status', wasEditing ? t('card.saved', { title: card.title }) : t('card.added', { title: card.title }), 'ok');
      $('c-title').focus();
    } catch (err) { say('card-status', errText(err), 'error'); }
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); say('card-status', ''); });

  // --- Filtres
  for (const id of ['f-text', 'f-label', 'f-due']) $(id).addEventListener(id === 'f-text' ? 'input' : 'change', renderBoard);
  $('f-reset').addEventListener('click', () => { $('f-text').value = ''; $('f-label').value = ''; $('f-due').value = 'all'; renderBoard(); });

  // --- Tableaux et colonnes
  function select(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort */ } resetForm(); renderAll(); }
  $('board-select').addEventListener('change', (e) => select(e.target.value));
  function addBoard(b, msg) {
    if (boards.length >= C.MAX.boards) throw new Error(`err.tooManyBoards|${JSON.stringify({ max: C.MAX.boards })}`);
    if (!save([...boards, b])) return false;
    select(b.id); say('board-status', msg, 'ok'); return true;
  }
  $('new-board').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('board.newDefault', { n: boards.length + 1 }));
    if (name === null) return;
    try { addBoard(C.makeBoard({ name }, newId(), newId), t('board.created')); } catch (e) { say('board-status', errText(e), 'error'); }
  });
  $('rename-board').addEventListener('click', () => {
    const b = cur(); if (!b) return;
    const name = prompt(t('prompt.rename'), b.name);
    if (name === null) return;
    try { const fixed = C.makeBoard({ ...b, name }, b.id); if (save(boards.map((x) => (x.id === b.id ? fixed : x)))) renderAll(); } catch (e) { say('board-status', errText(e), 'error'); }
  });
  $('delete-board').addEventListener('click', () => {
    const b = cur(); if (!b || !confirm(t('confirm.board', { name: b.name, n: b.cards.length }))) return;
    if (save(boards.filter((x) => x.id !== b.id))) { select(boards[0] ? boards[0].id : null); say('board-status', t('board.deleted'), 'ok'); }
  });
  $('add-column').addEventListener('click', () => {
    const b = cur(); if (!b) return;
    if (b.columns.length >= C.MAX.columns) { say('board-status', t('err.columns', { max: C.MAX.columns }), 'error'); return; }
    // Nouvelle colonne insérée avant la dernière (« terminée » reste en fin).
    if (change((x) => ({ ...x, columns: [...x.columns.slice(0, -1), C.makeColumn({ name: '', wip: '' }, newId()), x.columns[x.columns.length - 1]] }), 'board-status')) {
      renderAll(); say('board-status', t('column.added'), 'ok');
    }
  });
  $('sample').addEventListener('click', () => {
    try {
      const d = today();
      let b = C.makeBoard({ name: t('sample.board') }, newId(), newId);
      b = { ...b, columns: b.columns.map((c, i) => (i === 1 ? { ...c, wip: 3 } : c)) };
      const [todo, doing, done] = b.columns.map((c) => c.id);
      const cards = [
        [t('sample.c1'), t('sample.l1'), C.addDays(d, -2), todo], [t('sample.c2'), `${t('sample.l2')}, ${t('sample.l1')}`, C.addDays(d, 4), todo],
        [t('sample.c3'), t('sample.l3'), '', todo], [t('sample.c4'), t('sample.l2'), C.addDays(d, 1), doing],
        [t('sample.c5'), t('sample.l3'), '', doing], [t('sample.c6'), t('sample.l1'), C.addDays(d, -5), done],
      ];
      for (const [title, labels, due, col] of cards) b = C.addCard(b, C.makeCard({ title, labels, due, col }, newId()));
      addBoard(b, t('sample.added'));
    } catch (e) { say('board-status', errText(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kanban';
  $('export-csv').addEventListener('click', () => {
    const b = cur(); if (!b) return;
    const csv = C.toCSV(b, [t('csv.column'), t('csv.title'), t('csv.labels'), t('csv.due'), t('csv.notes')], colName);
    download(`kanban-${slug(b.name)}.csv`, csv, 'text/csv;charset=utf-8');
    say('backup-status', t('csv.done', { n: b.cards.length }), 'ok');
  });
  $('export').addEventListener('click', () => { try { download('kanbanpocket-backup.json', C.backup(boards), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: boards.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      $('warning').hidden = true; $('export-raw').hidden = true;
      select(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('kanbanpocket-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) boards = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = boards.some((b) => b.id === last) ? last : (boards[0] ? boards[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  if (!readOnly && !boards.length) {
    try { const b = C.makeBoard({ name: t('board.defaultName') }, newId(), newId); if (save([b])) activeId = b.id; } catch (_) { /* stockage bloqué */ }
  }
  // Changement de langue : formulaire et filtres gardent leur saisie ; tout le reste est réaffiché.
  L.onChange(() => { for (const id of ['board-status', 'card-status', 'move-status', 'backup-status']) say(id, ''); renderAll(); });
  renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
