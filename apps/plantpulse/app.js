/* PlantPulse — interface. Calculs dans core.js (PlantCore) ; textes et formats dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.PlantCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-plantpulse-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let data = { plants: [], history: [] };
  let readOnly = false;
  let editing = null; // identifiant de la plante en cours de modification
  const form = $('plant-form'), care = $('care-form');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { plants: next.plants, history: next.history }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const kindLabel = (k) => t('kind.' + k);
  const plantName = (id) => { const p = data.plants.find((x) => x.id === id); return p ? p.name : '?'; };
  const shortDate = (day) => L.date(day, { day: 'numeric', month: 'short' });
  function relText(days) {
    if (days < 0) return t('rel.late', { n: -days });
    if (days === 0) return t('rel.today');
    return t('rel.in', { n: days });
  }
  const tp = (key, n) => t(key, { n }); // texte au pluriel selon n
  const monthName = (m) => L.date(`2026-${String(m).padStart(2, '0')}-01`, { month: 'short' });

  // ---------- Aujourd'hui
  function renderToday() {
    const today = todayDay();
    $('today-label').textContent = L.date(today, { weekday: 'long', day: 'numeric', month: 'long' });
    const s = C.summary(data.plants, data.history, today);
    $('k-late').textContent = L.number(s.late); $('k-today').textContent = L.number(s.today);
    $('k-week').textContent = L.number(s.week); $('k-plants').textContent = L.number(s.plants);
    const due = C.dueToday(data.plants, data.history, today, L.locale);
    if (!due.length) { $('due').replaceChildren(el('li', 'empty', t(data.plants.length ? 'today.none' : 'today.noPlant'))); return; }
    $('due').replaceChildren(...due.map((d) => {
      const li = el('li', d.days < 0 ? 'late' : ''), txt = el('div', 'txt');
      txt.append(el('b', '', `${kindLabel(d.kind)} — ${d.plant.name}`));
      txt.append(el('span', 'rel', `${relText(d.days)} · ${t('due.last', { date: shortDate(d.last) })}`));
      if (d.plant.place) txt.append(el('span', '', d.plant.place));
      const acts = el('div', 'acts');
      const done = el('button', 'btn good', t('btn.done')); done.type = 'button';
      done.setAttribute('aria-label', t('aria.done', { kind: kindLabel(d.kind), name: d.plant.name }));
      done.addEventListener('click', () => markDone(d.plant.id, d.kind, 'due-status'));
      acts.append(done); li.append(txt, acts); return li;
    }));
  }
  function markDone(plantId, kind, statusId) {
    try {
      const next = C.recordCare(data, { plantId, kind, date: todayDay(), note: '' }, newId(), todayDay());
      if (!save(next)) return;
      render();
      const p = data.plants.find((x) => x.id === plantId);
      say(statusId, t('done.saved', { kind: kindLabel(kind), name: p.name, date: shortDate(C.nextDue(p, kind, data.history)) }), 'ok');
    } catch (e) { say(statusId, L.error(e), 'error'); }
  }

  // ---------- Formulaire de plante
  function buildMonths() { // conserve les cases cochées lors d'un changement de langue
    const box = $('months'), checked = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
    box.replaceChildren(...Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1), lab = el('label', 'month'), cb = el('input');
      cb.type = 'checkbox'; cb.value = m; cb.checked = checked.has(m);
      lab.append(cb, el('span', '', monthName(i + 1))); return lab;
    }));
  }
  function setMonths(list) { for (const cb of $('months').querySelectorAll('input')) cb.checked = list.includes(Number(cb.value)); }
  $('season-on').addEventListener('change', () => { $('season-box').hidden = !$('season-on').checked; });
  function readForm() {
    const tasks = {};
    for (const k of C.KINDS) tasks[k] = { every: form['every-' + k].value, since: form['since-' + k].value };
    const season = $('season-on').checked ? { months: [...$('months').querySelectorAll('input:checked')].map((i) => Number(i.value)), pct: form.pct.value } : null;
    return { name: form.name.value, place: form.place.value, note: form.note.value, tasks, season };
  }
  function resetForm() {
    editing = null; form.reset(); form.pct.value = '150'; setMonths([]); $('season-box').hidden = true;
    $('cancel-edit').hidden = true; $('save-plant').textContent = t('btn.save');
  }
  function fillForm(p) {
    editing = p.id;
    form.name.value = p.name; form.place.value = p.place; form.note.value = p.note;
    for (const k of C.KINDS) {
      const task = p.tasks[k];
      form['every-' + k].value = task ? String(task.every) : '';
      form['since-' + k].value = task ? C.lastDone(p, k, data.history) : '';
    }
    $('season-on').checked = !!p.season; $('season-box').hidden = !p.season;
    setMonths(p.season ? p.season.months : []); form.pct.value = p.season ? String(p.season.pct) : '150';
    $('cancel-edit').hidden = false; $('save-plant').textContent = t('btn.update');
    say('plant-status', t('plant.editing', { name: p.name })); form.name.focus();
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const plant = C.makePlant(readForm(), editing || newId(), todayDay());
      const norm = (s) => s.toLocaleLowerCase(L.locale);
      if (data.plants.some((p) => p.id !== plant.id && norm(p.name) === norm(plant.name) && p.place === plant.place)) throw new Error('err.plantExists');
      // L'historique est conservé : le dernier soin reste le plus récent entre la fiche et l'historique.
      if (!save(C.upsertPlant(data, plant))) return;
      say('plant-status', t(editing ? 'plant.updated' : 'plant.added', { name: plant.name }), 'ok');
      resetForm(); render();
    } catch (e) { say('plant-status', L.error(e), 'error'); }
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); say('plant-status', ''); });

  // ---------- Liste des plantes
  function renderPlants() {
    const list = $('plants'), today = todayDay();
    if (!data.plants.length) { list.replaceChildren(el('li', 'empty', t('plant.empty'))); return; }
    list.replaceChildren(...C.sortPlants(data.plants, L.locale).map((p) => {
      const li = el('li', 'plant'), head = el('div', 'txt');
      head.append(el('b', '', p.name));
      const meta = [p.place, p.season ? t('plant.season', { pct: L.number(p.season.pct), months: p.season.months.map(monthName).join(', ') }) : ''].filter(Boolean).join(' · ');
      if (meta) head.append(el('span', '', meta));
      if (p.note) head.append(el('span', 'note', p.note));
      const tasks = el('ul', 'tasks');
      for (const k of C.KINDS) {
        const s = C.taskStatus(p, k, data.history, today);
        if (!s) continue;
        const row = el('li', 'task ' + s.state), info = el('div', 'txt');
        info.append(el('b', '', kindLabel(k)), el('span', '', `${tp('plant.every', s.interval)} · ${t('plant.next', { date: shortDate(s.due) })} · ${relText(s.days)}`));
        const done = el('button', 'btn small', t('btn.done')); done.type = 'button';
        done.setAttribute('aria-label', t('aria.done', { kind: kindLabel(k), name: p.name }));
        done.addEventListener('click', () => markDone(p.id, k, 'plant-status'));
        row.append(info, done); tasks.append(row);
      }
      const acts = el('div', 'acts');
      const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: p.name }));
      edit.addEventListener('click', () => fillForm(p));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: p.name }));
      del.addEventListener('click', () => {
        const n = data.history.filter((h) => h.plantId === p.id).length;
        if (!confirm(t('plant.confirmDelete', { name: p.name, n }))) return;
        if (save(C.removePlant(data, p.id))) { if (editing === p.id) resetForm(); render(); say('plant-status', t('plant.deleted', { name: p.name }), 'ok'); }
      });
      acts.append(edit, del); li.append(head, tasks, acts); return li;
    }));
  }

  // ---------- Historique
  function renderCareForm() {
    const sel = care.plant, cur = sel.value;
    const plants = C.sortPlants(data.plants, L.locale);
    sel.replaceChildren(...plants.map((p) => { const o = el('option', '', p.place ? `${p.name} (${p.place})` : p.name); o.value = p.id; return o; }));
    if (plants.some((p) => p.id === cur)) sel.value = cur;
    $('add-care').disabled = !plants.length;
    const f = $('h-filter'), fcur = f.value;
    const all = el('option', '', t('history.all')); all.value = '';
    f.replaceChildren(all, ...plants.map((p) => { const o = el('option', '', p.name); o.value = p.id; return o; }));
    f.value = plants.some((p) => p.id === fcur) ? fcur : '';
  }
  care.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!care.plant.value) throw new Error('err.plantUnknown');
      const date = care.date.value || todayDay();
      const next = C.recordCare(data, { plantId: care.plant.value, kind: care.kind.value, date, note: care.note.value }, newId(), todayDay());
      if (!save(next)) return;
      say('care-status', t('care.added', { kind: kindLabel(care.kind.value), name: plantName(care.plant.value), date: L.date(date) }), 'ok');
      care.note.value = ''; render();
    } catch (e) { say('care-status', L.error(e), 'error'); }
  });
  $('h-filter').addEventListener('change', renderHistory);
  function renderHistory() {
    const f = $('h-filter').value, items = data.history.filter((h) => !f || h.plantId === f);
    const list = $('history');
    if (!items.length) { list.replaceChildren(el('li', 'empty', t('history.empty'))); return; }
    const shown = items.slice(0, 200);
    list.replaceChildren(...shown.map((h) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', `${kindLabel(h.kind)} — ${plantName(h.plantId)}`), el('span', '', L.date(h.date)));
      if (h.note) txt.append(el('span', 'note', h.note));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button';
      del.setAttribute('aria-label', t('aria.removeCare', { kind: kindLabel(h.kind), name: plantName(h.plantId), date: L.date(h.date) }));
      del.addEventListener('click', () => { if (save(C.removeEvent(data, h.id))) { render(); say('care-status', t('care.removed'), 'ok'); } });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
    if (items.length > shown.length) list.append(el('li', 'empty', tp('history.more', items.length - shown.length)));
  }

  function render() { renderToday(); renderPlants(); renderCareForm(); renderHistory(); $('export-ics').disabled = !data.plants.length; }

  // ---------- Exemple dans la langue affichée (valeurs de démonstration, pas des recommandations)
  $('sample').addEventListener('click', () => {
    if (data.plants.length && !confirm(t('sample.confirm'))) return;
    try {
      const today = todayDay(), ago = (n) => C.addDays(today, -n);
      const mk = (k, place, tasks, season) => C.makePlant({ name: t('sample.' + k), place: t('sample.place.' + place), note: '', tasks, season }, newId(), today);
      const plants = [
        mk('fern', 'bath', { water: { every: '3', since: ago(4) }, feed: { every: '30', since: ago(10) } }, null),
        mk('cactus', 'window', { water: { every: '14', since: ago(14) }, repot: { every: '730', since: ago(200) } }, { months: [11, 12, 1, 2], pct: '200' }),
        mk('basil', 'kitchen', { water: { every: '2', since: ago(1) }, feed: { every: '15', since: ago(10) } }, null),
      ];
      let next = { plants, history: [] };
      next = C.recordCare(next, { plantId: plants[0].id, kind: 'feed', date: ago(10), note: t('sample.note') }, newId(), today);
      if (!save(next)) return;
      resetForm(); render(); say('due-status', t('sample.done'), 'ok');
    } catch (e) { say('due-status', L.error(e), 'error'); }
  });

  // ---------- Export agenda et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => {
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const out = C.toICS(data.plants, data.history, todayDay(), Number($('horizon').value), stamp, {
        summary: (p, k) => `${kindLabel(k)} — ${p.name}`,
        description: (p, k) => `${tp('plant.every', p.tasks[k].every)}${p.place ? ' · ' + p.place : ''} · PlantPulse`,
      });
      download('plantpulse.ics', out.text, 'text/calendar;charset=utf-8');
      say('ics-status', tp('ics.done', out.count), 'ok');
    } catch (e) { say('ics-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('plantpulse-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (e) { throw new Error('err.json'); }
      const next = C.validateData(parsed);
      if (!confirm(t('backup.confirm', { a: data.plants.length, b: next.plants.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true; resetForm(); render();
      say('backup-status', tp('backup.restored', next.plants.length), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('plantpulse-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  buildMonths(); resetForm();
  L.onChange(() => { // la saisie en cours (formulaires, mois cochés) est conservée
    for (const id of ['due-status', 'plant-status', 'care-status', 'ics-status', 'backup-status']) say(id, '');
    $('save-plant').textContent = t(editing ? 'btn.update' : 'btn.save');
    buildMonths(); render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
