/* NoiseDiary — interface. Calculs dans core.js (NoiseCore) ; textes, dates et nombres dans LouvreI18n (appli sans argent). */
(() => {
  'use strict';
  const C = window.NoiseCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-noisediary-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = String(txt); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const STATUSES = ['form-status', 'night-status', 'stats-status', 'backup-status'];
  const MONDAY = '2024-01-01'; // un lundi : sert à nommer les jours de la semaine dans la langue affichée

  let state = { settings: { ...C.DEFAULT_SETTINGS }, entries: [] };
  let readOnly = false, editingId = null;
  let period = { from: '', to: '' };

  function say(id, txt, kind = '') { const n = $(id); n.textContent = txt; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  // --- Formats
  function dur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return t('dur.m', { m });
    return m ? t('dur.hm', { h: L.number(h), m: String(m).padStart(2, '0') }) : t('dur.h', { h: L.number(h) });
  }
  const typeName = (k) => t('type.' + k);
  const weekdayName = (i, style = 'long') => L.date(C.addDays(MONDAY, i), { weekday: style });
  const longDay = (d) => L.date(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function timeRange(e) { const r = t('range', { a: C.clock(e.start), b: C.clock(e.end) }); return e.end < e.start ? `${r} ${t('nextDay')}` : r; }
  const dots = (n) => '●'.repeat(n) + '○'.repeat(5 - n);

  // --- Menus traduits (valeur conservée au changement de langue)
  function fillSelects() {
    const ty = $('type-select'), it = $('intensity-select'), tv = ty.value || 'music', iv = it.value || '3';
    ty.replaceChildren(...C.TYPES.map((k) => { const o = el('option', '', typeName(k)); o.value = k; return o; }));
    it.replaceChildren(...[1, 2, 3, 4, 5].map((n) => { const o = el('option', '', t('intensity.option', { n, label: t('intensity.' + n) })); o.value = String(n); return o; }));
    ty.value = tv; it.value = iv;
  }

  // --- Statistiques
  function currentStats() {
    try { const s = C.stats(state.entries, state.settings, period.from, period.to, L.locale); return s; }
    catch (e) { say('stats-status', L.error(e), 'error'); return C.stats(state.entries, state.settings, '', '', L.locale); }
  }
  function bars(id, rows) { // rows : [{ label, value, text }]
    const max = Math.max(1, ...rows.map((r) => r.value));
    $(id).replaceChildren(...(rows.length ? rows.map((r) => {
      const li = el('li'), b = el('div', 'bar'), fill = el('i');
      fill.style.width = (r.value ? Math.max(3, Math.round((100 * r.value) / max)) : 0) + '%'; b.append(fill);
      li.append(el('span', 'lbl', r.label), b, el('span', 'val', r.text)); return li;
    }) : [el('li', 'none', t('stats.none'))]));
  }
  function isNightHour(h) { // l'heure h (h:00 à h+1:00) touche-t-elle la plage de nuit ?
    const { nightStart: a, nightEnd: b } = state.settings, s = h * 60, f = s + 60;
    const inN = (m) => (a < b ? m >= a && m < b : m >= a || m < b);
    for (let m = s; m < f; m += 15) if (inN(m)) return true;
    return false;
  }
  function renderStats(s) {
    $('k-count').textContent = L.number(s.count);
    $('k-total').textContent = s.count ? dur(s.totalMin) : '—';
    $('k-nights').textContent = L.number(s.nights.length);
    $('k-night').textContent = s.count ? dur(s.nightMin) : '—';
    $('k-days').textContent = L.number(s.daysWithEntries);
    $('k-avg').textContent = s.count ? t('avg', { avg: L.number(s.avgIntensity, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : '—';
    const max = Math.max(1, ...s.byHour), hours = $('hours');
    hours.replaceChildren(...s.byHour.map((m, h) => {
      const d = el('div', isNightHour(h) ? 'night' : ''), fill = el('i');
      fill.style.height = (m ? Math.max(4, Math.round((100 * m) / max)) : 0) + '%';
      d.title = t('hour.title', { h: C.clock(h * 60), d: dur(m) }); d.append(fill); return d;
    }));
    const peak = s.byHour.indexOf(Math.max(...s.byHour));
    hours.setAttribute('aria-label', s.count ? t('hours.aria', { h: C.clock(peak * 60), d: dur(s.byHour[peak]) }) : t('stats.none'));
    bars('weekdays', s.count ? s.byWeekday.map((w, i) => ({ label: weekdayName(i), value: w.count, text: `${L.number(w.count)} · ${dur(w.minutes)}` })) : []);
    bars('types', s.byType.map((x) => ({ label: typeName(x.type), value: x.count, text: `${L.number(x.count)} · ${dur(x.minutes)}` })));
    bars('sources', s.sources.slice(0, 6).map((x) => ({ label: x.source, value: x.count, text: `${L.number(x.count)} · ${dur(x.minutes)}` })));
  }

  // --- Journal
  function renderJournal(s) {
    const list = [...s.entries].reverse(), shown = list.slice(0, 300);
    $('journal-empty').hidden = list.length > 0;
    $('journal-count').textContent = list.length ? t('journal.count', { n: list.length, shown: shown.length }) : '';
    $('journal').replaceChildren(...shown.map((e) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', `${longDay(e.day)} · ${timeRange(e)}`));
      const meta = el('span', '', `${dur(C.duration(e))} · ${typeName(e.type)} · `);
      const dot = el('span', 'dots', dots(e.intensity)); dot.setAttribute('aria-label', t('intensity.aria', { n: e.intensity, label: t('intensity.' + e.intensity) })); dot.setAttribute('role', 'img');
      meta.append(dot); txt.append(meta);
      if (e.source) txt.append(el('span', '', t('entry.source', { source: e.source })));
      if (e.notes) txt.append(el('span', 'notes', e.notes));
      const acts = el('div', 'acts');
      const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { when: `${longDay(e.day)} ${C.clock(e.start)}` }));
      edit.addEventListener('click', () => startEdit(e.id));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { when: `${longDay(e.day)} ${C.clock(e.start)}` }));
      del.addEventListener('click', () => {
        if (!confirm(t('confirm.delete', { when: `${longDay(e.day)} · ${timeRange(e)}` }))) return;
        if (save({ ...state, entries: state.entries.filter((x) => x.id !== e.id) })) { if (editingId === e.id) resetForm(); render(); say('form-status', t('entry.deleted'), 'ok'); }
      });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }

  function renderNightForm() { $('night-start').value = C.clock(state.settings.nightStart); $('night-end').value = C.clock(state.settings.nightEnd); }
  function render() { say('stats-status', ''); const s = currentStats(); renderStats(s); renderJournal(s); }

  // --- Saisie
  function resetForm() {
    const f = $('entry-form'); editingId = null;
    f.day.value = today(); f.start.value = ''; f.end.value = ''; f.source.value = ''; f.notes.value = '';
    $('save').textContent = t('btn.add'); $('save').dataset.i18n = 'btn.add'; $('cancel-edit').hidden = true; $('h-form').textContent = t('form.title'); $('h-form').dataset.i18n = 'form.title';
  }
  function startEdit(id) {
    const e = state.entries.find((x) => x.id === id); if (!e) return;
    const f = $('entry-form'); editingId = id;
    f.day.value = e.day; f.start.value = C.clock(e.start); f.end.value = C.clock(e.end); f.type.value = e.type; f.intensity.value = String(e.intensity); f.source.value = e.source; f.notes.value = e.notes;
    $('save').dataset.i18n = 'btn.update'; $('save').textContent = t('btn.update'); $('cancel-edit').hidden = false;
    $('h-form').dataset.i18n = 'form.editTitle'; $('h-form').textContent = t('form.editTitle');
    say('form-status', t('entry.editing')); f.start.focus();
  }
  $('entry-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    try {
      const input = { day: f.day.value, start: f.start.value, end: f.end.value, type: f.type.value, intensity: f.intensity.value, source: f.source.value, notes: f.notes.value };
      const id = editingId && state.entries.some((x) => x.id === editingId) ? editingId : newId();
      const e = C.makeEntry(input, id);
      if (id !== editingId && state.entries.length >= C.MAX.entries) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX.entries })}`);
      const entries = id === editingId ? state.entries.map((x) => (x.id === id ? e : x)) : [...state.entries, e];
      if (!save({ ...state, entries })) return;
      const was = id === editingId;
      resetForm(); f.day.value = e.day; render();
      say('form-status', t(was ? 'entry.updated' : 'entry.added', { when: `${longDay(e.day)} · ${timeRange(e)}`, d: dur(C.duration(e)) }), 'ok');
    } catch (err) { say('form-status', L.error(err), 'error'); }
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); say('form-status', ''); });

  // Exemple dans la langue affichée : une dizaine de jours d'observations, dont des nuits.
  $('sample').addEventListener('click', () => {
    try {
      const d0 = today(), src = t('sample.src1'), src2 = t('sample.src2');
      const raw = [
        [-9, '23:10', '01:30', 'music', 4, src, t('sample.note1')], [-8, '22:40', '23:20', 'footsteps', 3, src, ''],
        [-7, '08:00', '11:45', 'works', 5, src2, t('sample.note2')], [-6, '23:50', '02:10', 'music', 4, src, t('sample.note3')],
        [-4, '06:15', '06:40', 'impacts', 2, src, ''], [-3, '21:30', '22:30', 'voices', 3, '', ''],
        [-2, '00:30', '03:00', 'music', 5, src, t('sample.note1')], [-1, '14:00', '15:00', 'appliance', 2, '', ''],
      ];
      const add = raw.map(([k, s, e, type, n, source, notes]) => C.makeEntry({ day: C.addDays(d0, k), start: s, end: e, type, intensity: String(n), source, notes }, newId()));
      if (state.entries.length + add.length > C.MAX.entries) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX.entries })}`);
      if (save({ ...state, entries: [...state.entries, ...add] })) { render(); say('form-status', t('sample.added', { n: add.length }), 'ok'); }
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  $('night-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    try {
      const settings = C.makeSettings({ nightStart: $('night-start').value, nightEnd: $('night-end').value });
      if (save({ ...state, settings })) { render(); say('night-status', t('night.saved', { a: C.clock(settings.nightStart), b: C.clock(settings.nightEnd) }), 'ok'); }
    } catch (e) { say('night-status', L.error(e), 'error'); }
  });

  // --- Période
  function setPeriod(from, to) { period = { from, to }; $('from').value = from; $('to').value = to; render(); }
  for (const id of ['from', 'to']) $(id).addEventListener('change', () => { period = { from: $('from').value, to: $('to').value }; render(); });
  $('p-30').addEventListener('click', () => { const d = today(); setPeriod(C.addDays(d, -29), d); });
  $('p-all').addEventListener('click', () => setPeriod('', ''));

  // --- Exports
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function periodEntries() { return C.inPeriod(state.entries, period.from, period.to); }
  $('export-csv').addEventListener('click', () => {
    try {
      const list = periodEntries();
      if (!list.length) { say('backup-status', t('csv.none'), 'error'); return; }
      const headers = ['csv.day', 'csv.weekday', 'csv.start', 'csv.end', 'csv.endDay', 'csv.minutes', 'csv.nightMinutes', 'csv.type', 'csv.intensity', 'csv.source', 'csv.notes'].map((k) => t(k));
      download('noisediary.csv', C.toCSV(list, state.settings, { headers, type: typeName, weekday: (i) => weekdayName(i) }), 'text/csv;charset=utf-8');
      say('backup-status', t('csv.done', { n: list.length }), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });

  // Rapport imprimable : faits saisis seulement, sans interprétation.
  function buildReport() {
    const s = currentStats(), r = $('report');
    const from = period.from || s.firstDay, to = period.to || s.lastDay;
    const h = el('h1', '', t('report.title'));
    const meta = el('p', '', from ? t('report.period', { from: longDay(from), to: longDay(to) }) : t('report.noPeriod'));
    const gen = el('p', 'muted', t('report.generated', { day: longDay(today()), a: C.clock(state.settings.nightStart), b: C.clock(state.settings.nightEnd) }));
    const facts = el('ul');
    for (const line of [t('report.count', { n: s.count }), t('report.total', { d: dur(s.totalMin) }), t('report.nights', { n: s.nights.length, d: dur(s.nightMin) }), t('report.days', { n: s.daysWithEntries })]) facts.append(el('li', '', line));
    const table = el('table'), head = el('tr');
    for (const k of ['csv.day', 'report.hours', 'csv.minutes', 'csv.type', 'csv.intensity', 'csv.source', 'csv.notes']) head.append(el('th', '', t(k)));
    const thead = el('thead'); thead.append(head); const tbody = el('tbody');
    for (const e of s.entries) {
      const tr = el('tr');
      tr.append(el('td', '', longDay(e.day)), el('td', '', timeRange(e)), el('td', '', dur(C.duration(e))), el('td', '', typeName(e.type)), el('td', '', `${e.intensity}/5`), el('td', '', e.source), el('td', 'notes', e.notes));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    r.replaceChildren(h, meta, gen, facts, table, el('p', 'muted', t('report.disclaimer')));
  }
  $('print').addEventListener('click', () => {
    if (!periodEntries().length) { say('backup-status', t('csv.none'), 'error'); return; }
    buildReport(); say('backup-status', t('report.ready'), 'ok'); window.print();
  });
  window.addEventListener('beforeprint', buildReport);

  $('export').addEventListener('click', () => {
    try { download('noisediary-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: state.entries.length, b: next.entries.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; resetForm(); renderNightForm(); render();
      say('backup-status', t('backup.restored', { n: next.entries.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: e instanceof SyntaxError ? t('err.backup') : L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('noisediary-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillSelects(); resetForm(); renderNightForm(); render();
  // Nouvelle langue : menus et textes générés réaffichés, saisie en cours conservée.
  L.onChange(() => {
    for (const s of STATUSES) say(s, '');
    fillSelects();
    $('save').textContent = t($('save').dataset.i18n); $('h-form').textContent = t($('h-form').dataset.i18n);
    render();
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
