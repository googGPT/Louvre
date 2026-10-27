/* HabitSteps — interface. Les calculs sont dans core.js (HabitCore). */
(() => {
  'use strict';
  const C = window.HabitCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue de l'interface (pas d'argent ici)
  const tr = L.t; // « t » désigne déjà le jour courant dans card()
  const KEY = 'louvre-habitsteps-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let habits = [];
  let readOnly = false;
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', tr('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); habits = next; return true; }
    catch (e) { say('backup-status', tr('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function update(id, fn) { return save(habits.map((h) => (h.id === id ? fn(h) : h))); }
  const fmtDay = (day) => L.date(day, { weekday: 'long', day: 'numeric', month: 'long' });
  const goalLabel = (goal) => (goal.type === 'daily' ? tr('goal.everyDay') : tr('goal.perWeek', { n: goal.times }));
  const count = (n, unit) => tr('unit.' + unit, { n }); // « 3 jours », « 1 semaine »…

  function toggleDay(h, day) {
    try {
      if (!update(h.id, (x) => C.toggle(x, day, today()))) return;
      render();
      const again = $('habits').querySelector(`[data-id="${h.id}"] .check`); if (again && day === today()) again.focus();
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  }

  function card(h) {
    const t = today(), done = h.checks.includes(t), s = C.streaks(h, t), r = C.rate(h, t);
    const box = el('article', 'habit' + (h.archived ? ' archived' : '')); box.dataset.id = h.id;
    const top = el('div', 'habit-top');
    const check = el('button', 'check', done ? '✓' : ''); check.type = 'button';
    check.setAttribute('aria-pressed', String(done)); check.setAttribute('aria-label', tr(done ? 'aria.doneToday' : 'aria.markToday', { name: h.name }));
    check.disabled = h.archived;
    check.addEventListener('click', () => toggleDay(h, t));
    const name = el('div', 'habit-name'); name.append(el('strong', '', h.name), el('span', '', goalLabel(h.goal)));
    top.append(check, name);
    const mini = el('div', 'mini');
    const stat = (label, value) => { const d = el('div'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    mini.append(stat(tr('stat.current'), count(s.current, s.unit)), stat(tr('stat.best'), count(s.best, s.unit)),
      stat(tr(h.goal.type === 'daily' ? 'stat.rate30' : 'stat.rate8'), L.number(r.pct / 100, { style: 'percent', maximumFractionDigits: 1 })));
    box.append(top, mini);
    if (h.goal.type === 'weekly') { // progression de la semaine
      const n = C.weekProgress(h, t), bar = el('div', 'week'), fill = el('i');
      fill.style.width = Math.min(100, Math.round(100 * n / h.goal.times)) + '%'; bar.append(fill);
      const lab = el('span', '', tr('week.progress', { n, max: h.goal.times }) + (n >= h.goal.times ? tr('week.reached') : '')); lab.style.fontSize = '13px'; lab.style.color = 'var(--muted)';
      box.append(lab, bar);
    }
    const heat = el('div', 'heat'); heat.setAttribute('role', 'group'); heat.setAttribute('aria-label', tr('aria.grid', { n: 12 }));
    for (const col of C.grid(h, t, 12)) for (const cell of col) {
      const b = el('button', (cell.done ? 'done' : '') + (cell.future ? ' future' : '') + (cell.day === t ? ' today' : '')); b.type = 'button';
      b.title = tr(cell.done ? 'cell.done' : 'cell.notDone', { day: fmtDay(cell.day) }); b.setAttribute('aria-label', b.title);
      b.disabled = cell.future || h.archived; if (cell.future) b.tabIndex = -1;
      b.addEventListener('click', () => toggleDay(h, cell.day));
      heat.append(b);
    }
    box.append(heat);
    const acts = el('div', 'habit-acts');
    const mk = (label, fn) => { const b = el('button', 'btn', label); b.type = 'button'; b.setAttribute('aria-label', tr('aria.action', { action: label, name: h.name })); b.addEventListener('click', fn); acts.append(b); };
    mk(tr('btn.rename'), () => { const n = prompt(tr('prompt.rename'), h.name); if (n === null) return; try { const fixed = C.makeHabit({ name: n, goal: h.goal }, h.created, h.id); if (update(h.id, (x) => ({ ...x, name: fixed.name }))) render(); } catch (e) { say('backup-status', L.error(e), 'error'); } });
    mk(tr(h.archived ? 'btn.unarchive' : 'btn.archive'), () => { if (update(h.id, (x) => ({ ...x, archived: !x.archived }))) render(); });
    mk(tr('btn.delete'), () => { if (confirm(tr('confirm.delete', { name: h.name })) && save(habits.filter((x) => x.id !== h.id))) render(); });
    box.append(acts);
    return box;
  }

  function render() {
    $('today-label').textContent = '· ' + fmtDay(today());
    const show = $('show-archived').checked;
    const list = habits.filter((h) => show || !h.archived);
    $('habits').replaceChildren(...list.map(card));
    $('empty').hidden = habits.length > 0;
  }

  // --- Formulaire
  const form = $('habit-form');
  form.type.addEventListener('change', () => { form.times.disabled = form.type.value !== 'weekly'; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (habits.length >= C.MAX_HABITS) throw new Error('err.max');
      const goal = form.type.value === 'weekly' ? { type: 'weekly', times: Number(form.times.value) } : { type: 'daily' };
      const h = C.makeHabit({ name: form.name.value, goal }, today(), newId());
      if (!save([...habits, h])) return;
      say('form-status', tr('form.added', { name: h.name }), 'ok');
      form.name.value = ''; render();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('sample').addEventListener('click', () => {
    try {
      const t = today();
      const walk = C.makeHabit({ name: tr('sample.walk'), goal: { type: 'daily' } }, t, newId());
      const sport = C.makeHabit({ name: tr('sample.sport'), goal: { type: 'weekly', times: 3 } }, t, newId());
      let w = walk, s = sport;
      for (const back of [1, 2, 3, 5, 6, 7, 8]) w = C.toggle(w, C.addDays(t, -back), t);
      for (const back of [2, 3, 4, 9, 10, 12]) s = C.toggle(s, C.addDays(t, -back), t);
      if (save([...habits, w, s])) { render(); say('form-status', tr('sample.added'), 'ok'); }
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('show-archived').addEventListener('change', render);

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download(tr('file.backup'), C.backup(habits), 'application/json'); say('backup-status', tr('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (x) { throw new Error('err.json'); }
      const next = C.validateBackup(parsed);
      if (!confirm(tr('backup.confirm', { a: habits.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', tr('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', tr('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download(tr('file.raw'), localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage (et rafraîchissement si l'appli reste ouverte après minuit)
  try { const raw = localStorage.getItem(KEY); if (raw) habits = C.validateBackup(JSON.parse(raw)); }
  catch (e) { readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false; }
  let shown = today();
  render();
  L.onChange(render); // changement de langue : écran retraduit, saisie et données intactes
  setInterval(() => { if (today() !== shown) { shown = today(); render(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== shown) { shown = today(); render(); } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
