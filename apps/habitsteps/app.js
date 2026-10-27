/* HabitSteps — interface. Les calculs sont dans core.js (HabitCore). */
(() => {
  'use strict';
  const C = window.HabitCore;
  const KEY = 'louvre-habitsteps-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let habits = [];
  let readOnly = false;
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', 'Stockage illisible : restaurez une sauvegarde valide avant de modifier.', 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); habits = next; return true; }
    catch (e) { say('backup-status', 'Enregistrement impossible (stockage plein ou bloqué) : ' + e.message, 'error'); return false; }
  }
  function update(id, fn) { return save(habits.map((h) => (h.id === id ? fn(h) : h))); }
  const fmtDay = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); };
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

  function toggleDay(h, day) {
    try {
      if (!update(h.id, (x) => C.toggle(x, day, today()))) return;
      render();
      const again = $('habits').querySelector(`[data-id="${h.id}"] .check`); if (again && day === today()) again.focus();
    } catch (e) { say('backup-status', e.message, 'error'); }
  }

  function card(h) {
    const t = today(), done = h.checks.includes(t), s = C.streaks(h, t), r = C.rate(h, t);
    const box = el('article', 'habit' + (h.archived ? ' archived' : '')); box.dataset.id = h.id;
    const top = el('div', 'habit-top');
    const check = el('button', 'check', done ? '✓' : ''); check.type = 'button';
    check.setAttribute('aria-pressed', String(done)); check.setAttribute('aria-label', `${h.name} : ${done ? 'fait aujourd\'hui (toucher pour annuler)' : 'marquer comme fait aujourd\'hui'}`);
    check.disabled = h.archived;
    check.addEventListener('click', () => toggleDay(h, t));
    const name = el('div', 'habit-name'); name.append(el('strong', '', h.name), el('span', '', C.goalLabel(h.goal)));
    top.append(check, name);
    const mini = el('div', 'mini');
    const stat = (label, value) => { const d = el('div'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    mini.append(stat('Série en cours', plural(s.current, s.unit)), stat('Meilleure série', plural(s.best, s.unit)),
      stat(h.goal.type === 'daily' ? 'Sur 30 jours' : 'Sur 8 semaines', `${r.pct.toLocaleString('fr-FR')} %`));
    box.append(top, mini);
    if (h.goal.type === 'weekly') { // progression de la semaine
      const n = C.weekProgress(h, t), bar = el('div', 'week'), fill = el('i');
      fill.style.width = Math.min(100, Math.round(100 * n / h.goal.times)) + '%'; bar.append(fill);
      const lab = el('span', '', `Cette semaine : ${n} / ${h.goal.times}${n >= h.goal.times ? ' — objectif atteint' : ''}`); lab.style.fontSize = '13px'; lab.style.color = 'var(--muted)';
      box.append(lab, bar);
    }
    const heat = el('div', 'heat'); heat.setAttribute('role', 'group'); heat.setAttribute('aria-label', '12 dernières semaines');
    for (const col of C.grid(h, t, 12)) for (const cell of col) {
      const b = el('button', (cell.done ? 'done' : '') + (cell.future ? ' future' : '') + (cell.day === t ? ' today' : '')); b.type = 'button';
      b.title = `${fmtDay(cell.day)} : ${cell.done ? 'fait' : 'non fait'}`; b.setAttribute('aria-label', b.title);
      b.disabled = cell.future || h.archived; if (cell.future) b.tabIndex = -1;
      b.addEventListener('click', () => toggleDay(h, cell.day));
      heat.append(b);
    }
    box.append(heat);
    const acts = el('div', 'habit-acts');
    const mk = (label, fn) => { const b = el('button', 'btn', label); b.type = 'button'; b.setAttribute('aria-label', `${label} : ${h.name}`); b.addEventListener('click', fn); acts.append(b); };
    mk('Renommer', () => { const n = prompt('Nouveau nom :', h.name); if (n === null) return; try { const fixed = C.makeHabit({ name: n, goal: h.goal }, h.created, h.id); if (update(h.id, (x) => ({ ...x, name: fixed.name }))) render(); } catch (e) { say('backup-status', e.message, 'error'); } });
    mk(h.archived ? 'Réactiver' : 'Archiver', () => { if (update(h.id, (x) => ({ ...x, archived: !x.archived }))) render(); });
    mk('Supprimer', () => { if (confirm(`Supprimer « ${h.name} » et tout son historique ?`) && save(habits.filter((x) => x.id !== h.id))) render(); });
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
      if (habits.length >= C.MAX_HABITS) throw new Error('Nombre maximal d\'habitudes atteint');
      const goal = form.type.value === 'weekly' ? { type: 'weekly', times: Number(form.times.value) } : { type: 'daily' };
      const h = C.makeHabit({ name: form.name.value, goal }, today(), newId());
      if (!save([...habits, h])) return;
      say('form-status', `« ${h.name} » ajoutée. Pointez-la dès qu'elle est faite.`, 'ok');
      form.name.value = ''; render();
    } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('sample').addEventListener('click', () => {
    try {
      const t = today();
      const walk = C.makeHabit({ name: 'Marcher 20 minutes', goal: { type: 'daily' } }, t, newId());
      const sport = C.makeHabit({ name: 'Séance de sport', goal: { type: 'weekly', times: 3 } }, t, newId());
      let w = walk, s = sport;
      for (const back of [1, 2, 3, 5, 6, 7, 8]) w = C.toggle(w, C.addDays(t, -back), t);
      for (const back of [2, 3, 4, 9, 10, 12]) s = C.toggle(s, C.addDays(t, -back), t);
      if (save([...habits, w, s])) { render(); say('form-status', '2 habitudes d\'exemple ajoutées, avec un peu d\'historique.', 'ok'); }
    } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('show-archived').addEventListener('change', render);

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('habitsteps-sauvegarde.json', C.backup(habits), 'application/json'); say('backup-status', 'Sauvegarde téléchargée.', 'ok'); }
    catch (e) { say('backup-status', e.message, 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Fichier trop volumineux');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(`Remplacer les ${habits.length} habitude(s) de cet appareil par les ${next.length} de la sauvegarde ?`)) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', `Sauvegarde restaurée : ${next.length} habitude(s).`, 'ok');
    } catch (e) { say('backup-status', 'Restauration refusée : ' + e.message, 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('habitsteps-stockage-brut.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage (et rafraîchissement si l'appli reste ouverte après minuit)
  try { const raw = localStorage.getItem(KEY); if (raw) habits = C.validateBackup(JSON.parse(raw)); }
  catch (e) { readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false; }
  let shown = today();
  render();
  setInterval(() => { if (today() !== shown) { shown = today(); render(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== shown) { shown = today(); render(); } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
