/* TimeBlocks — interface. Logique dans core.js (TimeCore) ; textes et formats dans LouvreI18n (appli sans argent).
   Chaque modification est enregistrée aussitôt (aucun enregistrement différé) ; un glisser n'écrit qu'au lâcher. */
(() => {
  'use strict';
  const C = window.TimeCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-timeblocks-v1';
  const PX_PER_MIN = 64 / 60; // une heure = 64 px dans l'agenda
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let state = { settings: C.makeSettings({}), days: [], templates: [] };
  let current = todayKey(); // jour civil affiché
  let editId = null; // bloc en cours de modification dans le formulaire
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function guard(statusId, fn) { try { return fn(); } catch (e) { say(statusId, errText(e), 'error'); return null; } }
  const blocks = () => { const d = state.days.find((x) => x.date === current); return d ? d.blocks : []; };
  const catName = (c) => t('cat.' + c);

  // Heures et durées selon la langue (24:00 = fin de journée).
  function time(min) {
    if (min === C.DAY) return t('time.endOfDay');
    return new Intl.DateTimeFormat(L.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(2000, 0, 1, Math.floor(min / 60), min % 60));
  }
  const span = (a, b) => `\u2066${time(a)}–${time(b)}\u2069`; // isolé : l'ordre reste juste en arabe
  function dur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h && m ? t('dur.hm', { h: L.number(h), m: String(m).padStart(2, '0') }) : h ? t('dur.h', { h: L.number(h) }) : t('dur.m', { m: L.number(m) });
  }

  // --- Enregistrement : tout passe par ici, validé par la sauvegarde complète.
  function save(next) {
    if (readOnly) { say('agenda-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = C.validateBackup(JSON.parse(localStorage.getItem(KEY))); return true; }
    catch (e) { say('agenda-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function setBlocks(list) {
    const day = C.makeDay(current, list);
    const days = state.days.filter((d) => d.date !== current);
    if (day.blocks.length) days.push(day);
    if (days.length > C.MAX.days) throw new Error(`err.tooManyDays|${JSON.stringify({ max: C.MAX.days })}`);
    return save({ ...state, days });
  }

  // --- Agenda
  function viewRange() {
    const s = state.settings, list = blocks();
    const lo = Math.min(s.workStart, ...list.map((b) => b.start)), hi = Math.max(s.workEnd, ...list.map((b) => b.end));
    return [Math.max(0, Math.floor(lo / 60) * 60), Math.min(C.DAY, Math.ceil(hi / 60) * 60)];
  }
  function renderTimeline() {
    const box = $('timeline'), [v0, v1] = viewRange(), s = state.settings, list = blocks();
    const lay = C.layout(list), clash = new Set(C.overlaps(list).flatMap((o) => [o.a, o.b]));
    const inner = el('div', 'tl-inner'); inner.style.height = `${(v1 - v0) * PX_PER_MIN}px`;
    const work = el('div', 'tl-work'); work.style.top = `${(s.workStart - v0) * PX_PER_MIN}px`; work.style.height = `${(s.workEnd - s.workStart) * PX_PER_MIN}px`;
    inner.append(work);
    for (let h = v0; h <= v1; h += 60) {
      const line = el('div', 'tl-hour'); line.style.top = `${(h - v0) * PX_PER_MIN}px`;
      line.append(el('span', '', time(h))); inner.append(line);
    }
    for (const b of list) {
      const { lane, lanes } = lay.get(b.id);
      const node = el('div', `blk cat-${b.cat}` + (clash.has(b.id) ? ' clash' : '') + (b.id === editId ? ' editing' : '') + (b.end - b.start <= 20 ? ' short' : ''));
      node.tabIndex = 0; node.dataset.id = b.id; node.setAttribute('role', 'button');
      node.setAttribute('aria-label', t('blk.aria', { title: b.title, time: span(b.start, b.end), cat: catName(b.cat) }) + (clash.has(b.id) ? ' ' + t('blk.clash') : ''));
      node.style.top = `${(b.start - v0) * PX_PER_MIN}px`; node.style.height = `${(b.end - b.start) * PX_PER_MIN}px`;
      node.style.setProperty('--lane', lane); node.style.setProperty('--lanes', lanes);
      const txt = el('div', 'blk-txt'); txt.append(el('b', '', b.title), el('span', '', `${span(b.start, b.end)} · ${catName(b.cat)}`));
      const grip = el('span', 'grip'); grip.setAttribute('aria-hidden', 'true');
      node.append(txt, grip); inner.append(node);
    }
    box.replaceChildren(inner);
    if (!list.length) box.append(el('p', 'empty', t('agenda.empty')));
  }
  // Clavier sur un bloc : ↑/↓ déplace d'un pas ; Maj+↑/↓ change la fin ; Alt+↑/↓ change le début ; Suppr efface ; Entrée modifie.
  $('timeline').addEventListener('keydown', (ev) => {
    const node = ev.target.closest('.blk'); if (!node || readOnly) return;
    const b = blocks().find((x) => x.id === node.dataset.id); if (!b) return;
    const step = state.settings.step, dir = { ArrowUp: -1, ArrowDown: 1 }[ev.key];
    if (dir) {
      ev.preventDefault();
      const next = ev.shiftKey ? C.resizeBlock(b, 'end', dir * step, step) : ev.altKey ? C.resizeBlock(b, 'start', dir * step, step) : C.moveBlock(b, dir * step, step);
      commitBlock(next, true);
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeBlock(b.id); }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); startEdit(b); }
  });
  function commitBlock(next, refocus) {
    const ok = guard('agenda-status', () => setBlocks(blocks().map((x) => (x.id === next.id ? next : x))));
    if (!ok) return;
    if (editId === next.id) fillForm(next);
    render();
    say('agenda-status', t('blk.moved', { title: next.title, time: span(next.start, next.end) }), 'ok');
    if (refocus) { const n = $('timeline').querySelector(`.blk[data-id="${CSS.escape(next.id)}"]`); if (n) n.focus(); }
  }
  function removeBlock(id) {
    const b = blocks().find((x) => x.id === id); if (!b) return;
    if (guard('agenda-status', () => setBlocks(blocks().filter((x) => x.id !== id)))) {
      if (editId === id) stopEdit();
      render(); say('agenda-status', t('blk.deleted', { title: b.title }), 'ok');
    }
  }
  // Glisser (souris ou doigt) : corps = déplacer, poignée du bas = redimensionner. Aperçu en direct, écriture au lâcher.
  let drag = null;
  $('timeline').addEventListener('pointerdown', (ev) => {
    const node = ev.target.closest('.blk'); if (!node || readOnly || ev.button > 0) return;
    const b = blocks().find((x) => x.id === node.dataset.id); if (!b) return;
    drag = { node, b, y: ev.clientY, mode: ev.target.classList.contains('grip') ? 'end' : 'move', next: b, moved: false };
    node.setPointerCapture(ev.pointerId);
  });
  $('timeline').addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dy = ev.clientY - drag.y; if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    ev.preventDefault();
    const step = state.settings.step, delta = dy / PX_PER_MIN, v0 = viewRange()[0];
    drag.next = drag.mode === 'end' ? C.resizeBlock(drag.b, 'end', delta, step) : C.moveBlock(drag.b, delta, step);
    drag.node.style.top = `${(drag.next.start - v0) * PX_PER_MIN}px`; drag.node.style.height = `${(drag.next.end - drag.next.start) * PX_PER_MIN}px`;
    drag.node.classList.add('dragging');
    say('agenda-status', span(drag.next.start, drag.next.end));
  });
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { startEdit(d.b); return; } // simple toucher : modifier
    if (d.next.start !== d.b.start || d.next.end !== d.b.end) commitBlock(d.next, false); else render();
  }
  $('timeline').addEventListener('pointerup', endDrag);
  $('timeline').addEventListener('pointercancel', () => { drag = null; render(); });

  // --- Formulaire
  function fillCats() {
    const sel = $('cat'), keep = sel.value || 'focus';
    sel.replaceChildren(...C.CATS.map((c) => { const o = el('option', '', catName(c)); o.value = c; return o; }));
    sel.value = keep;
  }
  // Champ « time » : la fin de journée (24:00) s'écrit 00:00.
  function fillForm(b) { const f = $('block-form'); f.title.value = b.title; f.start.value = C.hhmm(b.start); f.end.value = b.end === C.DAY ? '00:00' : C.hhmm(b.end); f.cat.value = b.cat; }
  function startEdit(b) {
    editId = b.id; fillForm(b);
    $('h-block').textContent = t('block.edit'); $('submit').textContent = t('btn.save');
    $('cancel-edit').hidden = false; $('delete-block').hidden = false;
    render(); $('block-form').title.focus();
  }
  function stopEdit() {
    editId = null; $('h-block').textContent = t('block.title'); $('submit').textContent = t('btn.add');
    $('cancel-edit').hidden = true; $('delete-block').hidden = true;
  }
  // Fin « 00:00 » après le début : on comprend minuit en fin de journée (24:00).
  const endValue = (start, end) => { const s = String(end).trim(); return /^0?0[:h.]00$/.test(s) && String(start).trim() !== s ? '24:00' : s; };
  $('block-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const input = { title: f.title.value, start: f.start.value, end: endValue(f.start.value, f.end.value), cat: f.cat.value };
    guard('form-status', () => {
      if (!editId && blocks().length >= C.MAX.blocks) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX.blocks })}`);
      const b = C.makeBlock(input, editId || newId());
      const list = editId ? blocks().map((x) => (x.id === editId ? b : x)) : [...blocks(), b];
      if (!setBlocks(list)) return;
      const clash = C.overlaps(list).some((o) => o.a === b.id || o.b === b.id);
      const msg = t(editId ? 'form.saved' : 'form.added', { title: b.title, time: span(b.start, b.end) }) + (clash ? ' ' + t('form.clash') : '');
      stopEdit();
      f.title.value = ''; f.start.value = C.hhmm(Math.min(b.end, C.DAY - 60)); f.end.value = C.hhmm(Math.min(b.end + 60, C.DAY - 5));
      render(); say('form-status', msg, clash ? 'warn' : 'ok'); f.title.focus();
    });
  });
  $('cancel-edit').addEventListener('click', () => { stopEdit(); $('block-form').reset(); fillCats(); render(); say('form-status', ''); });
  $('delete-block').addEventListener('click', () => { if (editId) { const id = editId; stopEdit(); $('block-form').title.value = ''; removeBlock(id); } });

  // --- Bilan
  function renderSummary() {
    const list = blocks(), s = C.summary(list, state.settings);
    const kpi = (label, value) => { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    $('kpis').replaceChildren(kpi(t('sum.busy'), dur(s.busy)), kpi(t('sum.breaks'), dur(s.breaks)),
      kpi(t('sum.free', { range: span(state.settings.workStart, state.settings.workEnd) }), dur(Math.max(0, s.free))), kpi(t('sum.outside'), dur(s.outside)));
    const total = Object.values(s.byCat).reduce((a, b) => a + b, 0);
    $('bars').replaceChildren(...C.CATS.filter((c) => s.byCat[c]).map((c) => {
      const li = el('li', `cat-${c}`), bar = el('div', 'bar'), fill = el('i');
      fill.style.width = `${Math.max(3, Math.round(100 * s.byCat[c] / total))}%`; bar.append(fill);
      li.append(el('span', 'name', catName(c)), bar, el('span', 'num', dur(s.byCat[c]))); return li;
    }));
    $('run').textContent = list.length ? t('sum.run', { d: dur(s.longestRun) }) : t('sum.empty');
    const ov = C.overlaps(list), name = (id) => list.find((b) => b.id === id).title;
    $('clashes').hidden = !ov.length;
    $('clashes').replaceChildren(...(ov.length ? [el('strong', '', t('sum.clashes', { n: ov.length }))] : []),
      ...ov.map((o) => el('p', '', t('sum.clash', { a: name(o.a), b: name(o.b), d: dur(o.minutes) }))));
    const g = C.gaps(list, state.settings, 15);
    $('gaps').textContent = list.length ? (g.length ? t('sum.gaps', { list: g.map((x) => span(x.start, x.end)).join(', ') }) : t('sum.noGaps')) : '';
  }

  // --- Jour, réglages, modèles
  function renderDay() {
    $('day').value = current;
    $('day-label').textContent = L.date(current, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('work-start').value = C.hhmm(state.settings.workStart);
    $('work-end').value = state.settings.workEnd === C.DAY ? '00:00' : C.hhmm(state.settings.workEnd);
    $('step').value = String(state.settings.step);
  }
  function renderTemplates() {
    const sel = $('tpl-select'), keep = sel.value;
    const list = [...state.templates].sort((a, b) => a.name.localeCompare(b.name, L.locale));
    sel.replaceChildren(...(list.length ? list.map((x) => { const o = el('option', '', t('tpl.option', { name: x.name, n: x.blocks.length })); o.value = x.id; return o; }) : [el('option', '', t('tpl.none'))]));
    if (list.some((x) => x.id === keep)) sel.value = keep;
    for (const id of ['tpl-replace', 'tpl-merge', 'tpl-delete']) $(id).disabled = !list.length || readOnly;
    $('tpl-save').disabled = readOnly || !blocks().length;
  }
  function render() {
    renderDay(); renderTimeline(); renderSummary(); renderTemplates();
    for (const id of ['sample', 'submit']) $(id).disabled = readOnly;
  }
  function goTo(day) { if (!C.isDay(day)) return; current = day; stopEdit(); render(); say('day-status', ''); }
  $('prev-day').addEventListener('click', () => goTo(C.addDays(current, -1)));
  $('next-day').addEventListener('click', () => goTo(C.addDays(current, 1)));
  $('today').addEventListener('click', () => goTo(todayKey()));
  $('day').addEventListener('change', (e) => { if (C.isDay(e.target.value)) goTo(e.target.value); else e.target.value = current; });
  for (const id of ['work-start', 'work-end', 'step']) $(id).addEventListener('change', () => {
    guard('day-status', () => {
      const settings = C.makeSettings({ workStart: $('work-start').value, workEnd: endValue($('work-start').value, $('work-end').value), step: $('step').value });
      if (save({ ...state, settings })) { render(); say('day-status', t('set.saved', { range: span(settings.workStart, settings.workEnd), step: settings.step }), 'ok'); }
    });
    renderDay();
  });
  $('tpl-save').addEventListener('click', () => {
    if (!blocks().length) return;
    const name = prompt(t('tpl.prompt'), t('tpl.default', { n: state.templates.length + 1 }));
    if (name === null) return;
    guard('tpl-status', () => {
      if (state.templates.length >= C.MAX.templates) throw new Error(`err.tooManyTemplates|${JSON.stringify({ max: C.MAX.templates })}`);
      const tpl = C.makeTemplate(name, newId(), blocks().map((b, i) => ({ ...b, id: `tpl-${String(i + 1).padStart(3, '0')}` })));
      if (save({ ...state, templates: [...state.templates, tpl] })) { render(); $('tpl-select').value = tpl.id; say('tpl-status', t('tpl.saved', { name: tpl.name }), 'ok'); }
    });
  });
  function useTemplate(mode) {
    const tpl = state.templates.find((x) => x.id === $('tpl-select').value); if (!tpl) return;
    if (mode === 'replace' && blocks().length && !confirm(t('tpl.confirm', { n: blocks().length, name: tpl.name }))) return;
    guard('tpl-status', () => {
      const day = C.applyTemplate(C.makeDay(current, blocks()), tpl, mode, newId);
      if (setBlocks(day.blocks)) { stopEdit(); render(); say('tpl-status', t('tpl.applied', { name: tpl.name }), 'ok'); }
    });
  }
  $('tpl-replace').addEventListener('click', () => useTemplate('replace'));
  $('tpl-merge').addEventListener('click', () => useTemplate('merge'));
  $('tpl-delete').addEventListener('click', () => {
    const tpl = state.templates.find((x) => x.id === $('tpl-select').value); if (!tpl || !confirm(t('tpl.confirmDelete', { name: tpl.name }))) return;
    if (save({ ...state, templates: state.templates.filter((x) => x.id !== tpl.id) })) { render(); say('tpl-status', t('tpl.deleted'), 'ok'); }
  });

  // Exemple : une journée de travail type, intitulés dans la langue affichée.
  $('sample').addEventListener('click', () => {
    if (blocks().length && !confirm(t('sample.confirm', { n: blocks().length }))) return;
    guard('form-status', () => {
      const P = (title, start, end, cat) => C.makeBlock({ title: t('sample.' + title), start, end, cat }, newId());
      const list = [P('mail', '09:00', '09:30', 'admin'), P('deep', '09:30', '11:00', 'focus'), P('pause', '11:00', '11:15', 'break'),
        P('meeting', '11:15', '12:00', 'meeting'), P('lunch', '12:30', '13:30', 'break'), P('course', '14:00', '15:30', 'learning'),
        P('review', '15:45', '17:00', 'focus')];
      if (setBlocks(list)) { stopEdit(); render(); say('form-status', t('sample.added'), 'ok'); }
    });
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => guard('backup-status', () => {
    const days = $('ics-scope').value === 'all' ? state.days : state.days.filter((d) => d.date === current);
    const n = days.reduce((k, d) => k + d.blocks.length, 0);
    if (!n) throw new Error('err.nothing');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    download($('ics-scope').value === 'all' ? 'timeblocks.ics' : `timeblocks-${current}.ics`, C.toICS(days, stamp, catName), 'text/calendar');
    say('backup-status', t('export.icsDone', { n }), 'ok');
  }));
  $('print').addEventListener('click', () => window.print());
  $('export').addEventListener('click', () => guard('backup-status', () => { download('timeblocks-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > C.MAX.file) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      const count = (s) => s.days.reduce((k, d) => k + d.blocks.length, 0);
      if (!confirm(t('backup.confirm', { a: count(state), b: count(next) }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      stopEdit(); $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.days.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('timeblocks-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillCats();
  const f0 = $('block-form'); f0.start.value = C.hhmm(state.settings.workStart); f0.end.value = C.hhmm(Math.min(state.settings.workStart + 60, C.DAY - 5));
  L.onChange(() => { // nouvelle langue : on réaffiche sans toucher à la saisie
    for (const id of ['day-status', 'agenda-status', 'form-status', 'tpl-status', 'backup-status']) say(id, '');
    fillCats();
    if (editId) { $('h-block').textContent = t('block.edit'); $('submit').textContent = t('btn.save'); }
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
