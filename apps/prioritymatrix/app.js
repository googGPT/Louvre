/* PriorityMatrix — interface. Règles dans core.js (PriorityCore) ; textes dans LouvreI18n (appli sans argent).
   Classement : glisser (souris ou doigt par la poignée), liste « quadrant », ou Maj + flèches au clavier. */
(() => {
  'use strict';
  const C = window.PriorityCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-prioritymatrix-v1';
  const ACTIVE = 'louvre-prioritymatrix-active';
  const QS = ['q1', 'q2', 'q3', 'q4'];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  let matrices = [], activeId = null, readOnly = false, editing = null, thresholdDirty = false;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cur = () => matrices.find((m) => m.id === activeId) || null;
  const errText = (e) => (e instanceof SyntaxError ? t('err.backup') : L.error(e));
  const day = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); matrices = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function change(fn, statusId) {
    const m = cur(); if (!m) return false;
    try { const next = fn(m); return save(matrices.map((x) => (x.id === m.id ? next : x))); }
    catch (e) { say(statusId, errText(e), 'error'); return false; }
  }
  // Le seuil saisi est enregistré à la sortie du champ, et forcé avant tout changement, export ou fermeture.
  function flushThreshold() {
    if (!thresholdDirty) return true;
    thresholdDirty = false;
    if (change((m) => ({ ...m, threshold: C.parseThreshold($('threshold').value) }), 'matrix-status')) { say('matrix-status', ''); return true; }
    return false;
  }

  // --- Affichage
  function dueText(task) {
    if (!task.due) return t('due.none');
    const d = task.daysLeft;
    const rel = d < 0 ? t('due.late', { n: -d }) : d === 0 ? t('due.today') : t('due.left', { n: d });
    return `${t('due.on', { date: day(task.due) })} · ${rel}`;
  }
  function renderMatrices() {
    const sel = $('matrix-select');
    sel.replaceChildren(...matrices.map((m) => { const o = el('option', '', `${m.name} (${m.tasks.filter((x) => !x.done).length})`); o.value = m.id; return o; }));
    if (activeId) sel.value = activeId;
    for (const id of ['rename-matrix', 'delete-matrix', 'export-md', 'export-csv']) $(id).disabled = !cur();
  }
  function loadThreshold() { const m = cur(); $('threshold').value = m ? String(m.threshold) : ''; $('threshold').disabled = !m || readOnly; thresholdDirty = false; }
  function renderRule() {
    const m = cur();
    $('rule').textContent = m ? t('rule', { n: m.threshold, date: day(C.addDays(today(), m.threshold)) }) : '';
    const s = m ? C.summary(m, today()) : { q1: 0, q2: 0, q3: 0, q4: 0, done: 0, overdue: 0 };
    $('k-q1').textContent = L.number(s.q1); $('k-overdue').textContent = L.number(s.overdue);
    $('k-open').textContent = L.number(s.q1 + s.q2 + s.q3 + s.q4); $('k-done').textContent = L.number(s.done);
    $('k-overdue').className = s.overdue ? 'bad' : '';
  }
  function renderForm() {
    $('h-task').textContent = editing ? t('task.editTitle') : t('task.title');
    $('save-task').textContent = editing ? t('btn.saveTask') : t('btn.addTask');
    $('cancel-edit').hidden = !editing;
    for (const id of ['t-title', 't-due', 't-imp', 't-urg', 't-notes', 'save-task']) $(id).disabled = !cur() || readOnly;
  }
  function smallBtn(text, key, label, onClick) {
    const b = el('button', 'btn small', text); b.type = 'button'; b.dataset.key = key; b.setAttribute('aria-label', label); b.title = label;
    b.disabled = readOnly; b.addEventListener('click', onClick); return b;
  }
  function doneBox(task) {
    const box = el('input'); box.type = 'checkbox'; box.checked = task.done; box.disabled = readOnly; box.dataset.key = `done-${task.id}`;
    box.setAttribute('aria-label', t('aria.done', { title: task.title }));
    box.addEventListener('change', () => {
      if (change((m) => ({ ...m, tasks: m.tasks.map((x) => (x.id === task.id ? { ...x, done: box.checked } : x)) }), 'move-status')) {
        renderAll(); say('move-status', box.checked ? t('task.doneMsg', { title: task.title }) : t('task.reopened', { title: task.title }), 'ok');
      }
    });
    return box;
  }
  function renderGrid() {
    const m = cur(), grid = $('grid');
    const focusKey = document.activeElement && grid.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    if (!m) { grid.replaceChildren(el('p', 'empty', t('matrix.empty'))); $('done').replaceChildren(); return; }
    const x = C.matrix(m, today(), L.locale);
    grid.replaceChildren(...QS.map((q) => {
      const sec = el('section', `quad ${q}`); sec.dataset.q = q; sec.setAttribute('aria-labelledby', `h-${q}`);
      const head = el('div', 'quad-head'), h = el('h3', '', t(`q.${q}`)); h.id = `h-${q}`;
      head.append(h, el('span', 'count', L.number(x[q].length)));
      sec.append(head, el('p', 'quad-sub', `${t(`q.${q}.crit`)} — ${t(`q.${q}.act`)}`));
      const list = el('ol', 'tasks');
      for (const task of x[q]) {
        const li = el('li', 'task' + (task.overdue ? ' late' : '')); li.tabIndex = 0; li.dataset.task = task.id; li.dataset.key = `task-${task.id}`;
        li.setAttribute('aria-label', t('aria.task', { title: task.title, q: t(`q.${q}`) }));
        const grip = el('span', 'grip', '⠿'); grip.setAttribute('aria-hidden', 'true'); grip.title = t('grip.title');
        const body = el('div', 'body'); body.append(el('b', '', task.title));
        body.append(el('span', 'meta', dueText(task)));
        const chips = el('div', 'chips');
        chips.append(el('span', 'tag', t(`reason.${task.reason}`)));
        if (task.overdue) chips.append(el('span', 'tag bad', t('tag.overdue')));
        body.append(chips);
        if (task.notes) body.append(el('span', 'meta', task.notes));
        const acts = el('div', 'acts');
        const sel = el('select', 'qsel'); sel.dataset.key = `qsel-${task.id}`; sel.disabled = readOnly;
        sel.setAttribute('aria-label', t('aria.quadrant', { title: task.title }));
        for (const k of QS) { const o = el('option', '', t(`q.${k}`)); o.value = k; sel.append(o); }
        sel.value = q;
        sel.addEventListener('change', () => place(task.id, sel.value));
        acts.append(doneBox(task), sel, smallBtn('✎', `edit-${task.id}`, t('aria.edit', { title: task.title }), () => startEdit(task.id)),
          smallBtn('✕', `del-${task.id}`, t('aria.remove', { title: task.title }), () => removeTask(task.id)));
        li.append(grip, body, acts); list.append(li);
      }
      if (!x[q].length) list.append(el('li', 'empty', t('q.empty')));
      sec.append(list); return sec;
    }));
    $('done-title').textContent = t('done.count', { n: x.done.length });
    $('done').replaceChildren(...(x.done.length ? x.done.map((task) => {
      const li = el('li', 'check'), txt = el('div', 'txt');
      txt.append(el('b', '', task.title), el('span', '', task.due ? t('due.on', { date: day(task.due) }) : t('due.none')));
      const acts = el('div', 'acts'); acts.append(smallBtn('✕', `del-${task.id}`, t('aria.remove', { title: task.title }), () => removeTask(task.id)));
      li.append(doneBox(task), txt, acts); return li;
    }) : [el('li', 'empty', t('done.empty'))]));
    if (focusKey) {
      const again = document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (again) again.focus();
    }
  }
  function renderAll() { renderMatrices(); renderRule(); renderForm(); renderGrid(); }

  // --- Classement
  function place(taskId, q) {
    flushThreshold();
    const m = cur(), task = m && m.tasks.find((x) => x.id === taskId); if (!task) return;
    if (change((x) => ({ ...x, tasks: x.tasks.map((k) => (k.id === taskId ? C.placeIn(k, q, today(), x.threshold) : k)) }), 'move-status')) {
      renderAll();
      const moved = cur().tasks.find((k) => k.id === taskId);
      say('move-status', t(moved.urgency === 'auto' ? 'moved.auto' : 'moved.manual', { title: task.title, q: t(`q.${q}`) }), 'ok');
      const node = $('grid').querySelector(`[data-task="${CSS.escape(taskId)}"]`); if (node) node.focus();
    }
  }
  $('grid').addEventListener('keydown', (e) => {
    const li = e.target.closest && e.target.closest('.task');
    if (!li || e.target !== li || !e.shiftKey) return;
    const rtl = L.dir === 'rtl'; // la grille est inversée en arabe : « urgent » est à droite
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: rtl ? 'right' : 'left', ArrowRight: rtl ? 'left' : 'right' }[e.key];
    if (!dir) return;
    e.preventDefault();
    const from = li.closest('.quad').dataset.q, to = C.neighbour(from, dir);
    if (to !== from) place(li.dataset.task, to);
  });
  // Glisser (souris : toute la tâche ; doigt : la poignée).
  let drag = null;
  $('grid').addEventListener('pointerdown', (e) => {
    if (readOnly || e.button > 0) return;
    const li = e.target.closest('.task');
    if (!li || e.target.closest('button, input, select')) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
    drag = { id: li.dataset.task, li, x: e.clientX, y: e.clientY, pid: e.pointerId, on: false, ghost: null, q: null };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true;
      const r = drag.li.getBoundingClientRect(); drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
      drag.ghost = drag.li.cloneNode(true); drag.ghost.className = 'task ghost'; drag.ghost.style.width = `${r.width}px`;
      drag.ghost.removeAttribute('tabindex'); drag.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(drag.ghost); drag.li.classList.add('dragging');
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY), quad = under && under.closest('.quad');
    document.querySelectorAll('.quad.drop').forEach((q) => q.classList.remove('drop'));
    drag.q = quad ? quad.dataset.q : null;
    if (quad) quad.classList.add('drop');
  }, { passive: false });
  function endDrag(apply) {
    const d = drag; drag = null;
    if (!d || !d.on) return;
    d.ghost.remove(); d.li.classList.remove('dragging');
    document.querySelectorAll('.quad.drop').forEach((q) => q.classList.remove('drop'));
    const from = d.li.closest('.quad') && d.li.closest('.quad').dataset.q;
    if (apply && d.q && d.q !== from) place(d.id, d.q);
  }
  window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) endDrag(true); });
  window.addEventListener('pointercancel', () => endDrag(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) endDrag(false); });
  $('grid').addEventListener('touchmove', (e) => { if (drag && drag.on) e.preventDefault(); }, { passive: false });

  // --- Tâches
  function resetForm() { editing = null; for (const id of ['t-title', 't-due', 't-notes']) $(id).value = ''; $('t-imp').value = 'yes'; $('t-urg').value = 'auto'; renderForm(); }
  function startEdit(taskId) {
    const task = cur().tasks.find((x) => x.id === taskId); if (!task) return;
    editing = taskId;
    $('t-title').value = task.title; $('t-due').value = task.due; $('t-imp').value = task.important ? 'yes' : 'no'; $('t-urg').value = task.urgency; $('t-notes').value = task.notes;
    renderForm(); say('task-status', t('task.editing', { title: task.title })); $('t-title').focus();
  }
  function removeTask(taskId) {
    const task = cur().tasks.find((x) => x.id === taskId); if (!task || !confirm(t('confirm.task', { title: task.title }))) return;
    if (change((m) => ({ ...m, tasks: m.tasks.filter((x) => x.id !== taskId) }), 'move-status')) {
      if (editing === taskId) resetForm();
      renderAll(); say('move-status', t('task.removed', { title: task.title }), 'ok');
    }
  }
  $('task-form').addEventListener('submit', (e) => {
    e.preventDefault(); flushThreshold();
    const m = cur(); if (!m) return;
    try {
      const old = editing ? m.tasks.find((x) => x.id === editing) : null;
      if (!old && m.tasks.length >= C.MAX.tasks) throw new Error(`err.tooManyTasks|${JSON.stringify({ max: C.MAX.tasks })}`);
      const task = C.makeTask({ title: $('t-title').value, due: $('t-due').value, important: $('t-imp').value === 'yes', urgency: $('t-urg').value, notes: $('t-notes').value, done: old ? old.done : false }, editing || newId());
      if (!change((x) => ({ ...x, tasks: old ? x.tasks.map((k) => (k.id === task.id ? task : k)) : [...x.tasks, task] }), 'task-status')) return;
      const q = C.classify(task, today(), cur().threshold).quadrant;
      resetForm(); renderAll();
      say('task-status', t(old ? 'task.saved' : 'task.added', { title: task.title, q: t(`q.${q}`) }), 'ok');
      $('t-title').focus();
    } catch (err) { say('task-status', errText(err), 'error'); }
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); say('task-status', ''); });
  $('threshold').addEventListener('input', () => { thresholdDirty = true; });
  // À la sortie du champ : enregistrement immédiat, affichage un peu après, pour qu'un clic en cours
  // (qui a provoqué la sortie du champ) ne soit pas déplacé par le nouveau classement.
  let soon = null;
  $('threshold').addEventListener('change', () => { thresholdDirty = true; if (flushThreshold()) { renderRule(); clearTimeout(soon); soon = setTimeout(renderAll, 300); } });

  // --- Matrices
  function select(id) { flushThreshold(); activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort */ } resetForm(); loadThreshold(); renderAll(); }
  $('matrix-select').addEventListener('change', (e) => select(e.target.value));
  function addMatrix(m, msg) {
    if (matrices.length >= C.MAX.matrices) throw new Error(`err.tooManyMatrices|${JSON.stringify({ max: C.MAX.matrices })}`);
    flushThreshold();
    if (!save([...matrices, m])) return false;
    select(m.id); say('matrix-status', msg, 'ok'); return true;
  }
  $('new-matrix').addEventListener('click', () => {
    flushThreshold();
    const name = prompt(t('prompt.new'), t('matrix.newDefault', { n: matrices.length + 1 }));
    if (name === null) return;
    try { addMatrix(C.makeMatrix({ name, threshold: String(cur() ? cur().threshold : 3) }, newId()), t('matrix.created')); } catch (e) { say('matrix-status', errText(e), 'error'); }
  });
  $('rename-matrix').addEventListener('click', () => {
    flushThreshold(); const m = cur(); if (!m) return;
    const name = prompt(t('prompt.rename'), m.name);
    if (name === null) return;
    try { const fixed = C.makeMatrix({ ...m, name, threshold: String(m.threshold) }, m.id); if (save(matrices.map((x) => (x.id === m.id ? fixed : x)))) renderAll(); } catch (e) { say('matrix-status', errText(e), 'error'); }
  });
  $('delete-matrix').addEventListener('click', () => {
    flushThreshold(); const m = cur(); if (!m || !confirm(t('confirm.matrix', { name: m.name, n: m.tasks.length }))) return;
    if (save(matrices.filter((x) => x.id !== m.id))) { thresholdDirty = false; select(matrices[0] ? matrices[0].id : null); say('matrix-status', t('matrix.deleted'), 'ok'); }
  });
  $('sample').addEventListener('click', () => {
    try {
      const d = today();
      const rows = [
        ['s1', 1, true, 'auto'], ['s2', -2, true, 'auto'], ['s3', 20, true, 'auto'], ['s4', null, true, 'auto'],
        ['s5', 2, false, 'auto'], ['s6', null, false, 'urgent'], ['s7', null, false, 'auto'], ['s8', 40, false, 'auto'],
      ];
      const tasks = rows.map(([k, off, important, urgency]) => C.makeTask({ title: t(`sample.${k}`), due: off === null ? '' : C.addDays(d, off), important, urgency }, newId()));
      addMatrix(C.makeMatrix({ name: t('sample.name'), threshold: '3', tasks }, newId()), t('sample.added'));
    } catch (e) { say('matrix-status', errText(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'matrix';
  function labels() {
    return {
      head: [t('csv.quadrant'), t('csv.task'), t('csv.due'), t('csv.days'), t('csv.urgent'), t('csv.important'), t('csv.reason'), t('csv.notes')],
      quadrant: (k) => (k === 'done' ? t('done.title') : `${t(`q.${k}`)} (${t(`q.${k}.crit`)})`), yesNo: (b) => (b ? t('yes') : t('no')),
      reason: (r) => t(`reason.${r}`), none: t('md.none'), rule: (n) => t('rule', { n, date: day(C.addDays(today(), n)) }), due: (task) => dueText(task),
    };
  }
  $('export-md').addEventListener('click', () => { flushThreshold(); const m = cur(); if (!m) return; download(`${slug(m.name)}.md`, C.toMarkdown(m, today(), labels()), 'text/markdown;charset=utf-8'); say('backup-status', t('md.done'), 'ok'); });
  $('export-csv').addEventListener('click', () => { flushThreshold(); const m = cur(); if (!m) return; download(`${slug(m.name)}.csv`, C.toCSV(m, today(), labels()), 'text/csv;charset=utf-8'); say('backup-status', t('csv.done', { n: m.tasks.length }), 'ok'); });
  $('export').addEventListener('click', () => { flushThreshold(); try { download('prioritymatrix-backup.json', C.backup(matrices), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: matrices.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      thresholdDirty = false;
      $('warning').hidden = true; $('export-raw').hidden = true;
      select(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('prioritymatrix-raw-storage.txt', raw, 'text/plain'); });
  window.addEventListener('pagehide', flushThreshold);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushThreshold(); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) matrices = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = matrices.some((m) => m.id === last) ? last : (matrices[0] ? matrices[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  if (!readOnly && !matrices.length) {
    try { const m = C.makeMatrix({ name: t('matrix.defaultName'), threshold: '3' }, newId()); if (save([m])) activeId = m.id; } catch (_) { /* stockage bloqué */ }
  }
  // Changement de langue : formulaire et seuil gardent leur saisie ; tout le reste est réaffiché.
  L.onChange(() => { for (const id of ['matrix-status', 'task-status', 'move-status', 'backup-status']) say(id, ''); renderAll(); });
  loadThreshold(); renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
