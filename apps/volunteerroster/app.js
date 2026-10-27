/* VolunteerRoster — interface. Calculs dans core.js (RosterCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.RosterCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-volunteerroster-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let state = { title: '', volunteers: [], shifts: [], assignments: [] };
  let readOnly = false; // stockage illisible : aucune écriture
  let pending = []; // disponibilités en cours de saisie pour le bénévole du formulaire
  let editVol = null, editShift = null; // identifiants en cours de modification
  let who = ''; // personne affichée dans « Planning par personne » ('' = tout le monde)

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cmp = (a, b) => a.localeCompare(b, L.locale, { sensitivity: 'base' });
  const time = (min) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' });
  const span = (s) => t('fmt.span', { start: time(s.start), end: time(s.end) });
  const dayLong = (d) => L.date(d, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayShort = (d) => L.date(d, { weekday: 'short', day: 'numeric', month: 'short' });
  const hours = (min) => t('fmt.hours', { n: L.number(min / 60, { maximumFractionDigits: 2 }) });
  const vol = (id) => state.volunteers.find((v) => v.id === id);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { const text = C.backup(next); localStorage.setItem(KEY, text); state = C.validateBackup(JSON.parse(text)); return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Enregistre après une modification et retire les affectations devenues impossibles.
  function saveAndPrune(next, statusId, okText) {
    const { state: clean, removed } = C.prune(next);
    if (!save(clean)) return false;
    say(statusId, okText + (removed ? ' ' + t('pruned', { n: removed }) : ''), 'ok');
    return true;
  }
  const iconBtn = (symbol, label, action) => { const b = el('button', 'btn icon', symbol); b.type = 'button'; b.dataset.action = action; b.setAttribute('aria-label', label); b.title = label; return b; };

  // --- Événement
  $('ev-title').addEventListener('change', () => {
    try { const next = { ...state, title: $('ev-title').value }; C.validateBackup({ app: 'volunteerroster', version: C.VERSION, ...next }); if (save(next)) { $('ev-title').removeAttribute('aria-invalid'); say('sample-status', t('title.saved'), 'ok'); renderPerson(); } }
    catch (e) { $('ev-title').setAttribute('aria-invalid', 'true'); say('sample-status', L.error(e), 'error'); }
  });

  // --- Bénévoles : formulaire avec disponibilités en attente.
  function renderPending() {
    const box = $('pending-windows');
    if (!pending.length) { box.replaceChildren(el('li', 'chip empty', t('avail.none'))); return; }
    box.replaceChildren(...pending.map((w, i) => {
      const li = el('li', 'chip'); li.append(el('span', '', `${dayShort(w.day)} · ${span(w)}`));
      const b = iconBtn('✕', t('aria.removeWindow', { when: `${dayShort(w.day)} ${span(w)}` }), 'remove'); b.dataset.i = String(i); li.append(b); return li;
    }));
  }
  $('pending-windows').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; pending.splice(Number(b.dataset.i), 1); renderPending(); $('a-day').focus(); });
  $('add-window').addEventListener('click', () => {
    try {
      const w = C.makeWindow({ day: $('a-day').value, start: $('a-start').value, end: $('a-end').value });
      pending = C.mergeWindows([...pending, w]);
      say('vol-status', t('avail.added', { when: `${dayShort(w.day)} ${span(w)}` }), 'ok'); renderPending();
    } catch (err) { say('vol-status', L.error(err), 'error'); }
  });
  function resetVolForm() {
    editVol = null; pending = [];
    for (const id of ['v-name', 'v-skills', 'v-hours']) $(id).value = '';
    $('save-vol').textContent = t('btn.addVol'); $('save-vol').dataset.i18n = 'btn.addVol'; $('cancel-vol').hidden = true; renderPending();
  }
  $('cancel-vol').addEventListener('click', () => { resetVolForm(); say('vol-status', ''); });
  $('vol-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (!editVol && state.volunteers.length >= C.LIMITS.volunteers) throw new Error(`err.volunteersMany|${JSON.stringify({ max: C.LIMITS.volunteers })}`);
      if (!pending.length) throw new Error('err.noAvail');
      const id = editVol || newId();
      const v = C.makeVolunteer({ name: $('v-name').value, skills: $('v-skills').value, maxHours: $('v-hours').value, availability: pending }, id);
      if (state.volunteers.some((x) => x.id !== id && cmp(x.name, v.name) === 0)) throw new Error('err.duplicate');
      const list = editVol ? state.volunteers.map((x) => (x.id === id ? v : x)) : [...state.volunteers, v];
      if (!saveAndPrune({ ...state, volunteers: list }, 'vol-status', editVol ? t('vol.updated', { name: v.name }) : t('vol.added', { name: v.name }))) return;
      resetVolForm(); $('v-name').focus(); render();
    } catch (err) { say('vol-status', L.error(err), 'error'); }
  });
  function renderVolunteers() {
    const box = $('volunteers');
    if (!state.volunteers.length) { box.replaceChildren(el('li', 'empty', t('vol.empty'))); return; }
    box.replaceChildren(...state.volunteers.slice().sort((a, b) => cmp(a.name, b.name)).map((v) => {
      const li = el('li'); li.dataset.id = v.id;
      const txt = el('div', 'txt'), used = C.minutesOf(state, v.id);
      txt.append(el('b', '', v.name), el('span', '', t('vol.load', { used: hours(used), max: hours(v.maxMinutes) })),
        el('span', '', v.availability.map((w) => `${dayShort(w.day)} ${span(w)}`).join(' · ')));
      if (v.skills.length) { const tags = el('span', 'tags'); for (const s of v.skills) tags.append(el('i', 'tag', s)); txt.append(tags); }
      const acts = el('div', 'acts'); acts.append(iconBtn('✎', t('aria.editVol', { name: v.name }), 'edit'), iconBtn('✕', t('aria.removeVol', { name: v.name }), 'remove'));
      li.append(txt, acts); return li;
    }));
  }
  $('volunteers').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const v = vol(b.closest('li').dataset.id); if (!v) return;
    if (b.dataset.action === 'edit') {
      editVol = v.id; pending = v.availability.map((w) => ({ ...w }));
      $('v-name').value = v.name; $('v-skills').value = v.skills.join(', '); $('v-hours').value = L.number(v.maxMinutes / 60, { maximumFractionDigits: 2, useGrouping: false });
      $('save-vol').textContent = t('btn.saveVol'); $('save-vol').dataset.i18n = 'btn.saveVol'; $('cancel-vol').hidden = false; renderPending();
      say('vol-status', t('vol.editing', { name: v.name })); $('v-name').focus(); return;
    }
    if (!confirm(t('confirm.removeVol', { name: v.name }))) return;
    if (save({ ...state, volunteers: state.volunteers.filter((x) => x.id !== v.id), assignments: state.assignments.filter((a) => a.volunteerId !== v.id) })) {
      if (editVol === v.id) resetVolForm();
      say('vol-status', t('vol.removed', { name: v.name })); render();
    }
  });

  // --- Créneaux
  function resetShiftForm(keepDay = true) {
    editShift = null;
    for (const id of ['s-post', 's-skill', 's-start', 's-end']) $(id).value = '';
    if (!keepDay) $('s-day').value = '';
    $('s-need').value = '1';
    $('save-shift').textContent = t('btn.addShift'); $('save-shift').dataset.i18n = 'btn.addShift'; $('cancel-shift').hidden = true;
  }
  $('cancel-shift').addEventListener('click', () => { resetShiftForm(); say('shift-status', ''); });
  $('shift-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (!editShift && state.shifts.length >= C.LIMITS.shifts) throw new Error(`err.shiftsMany|${JSON.stringify({ max: C.LIMITS.shifts })}`);
      const id = editShift || newId();
      const s = C.makeShift({ post: $('s-post').value, skill: $('s-skill').value, day: $('s-day').value, start: $('s-start').value, end: $('s-end').value, need: $('s-need').value }, id);
      const list = editShift ? state.shifts.map((x) => (x.id === id ? s : x)) : [...state.shifts, s];
      const msg = editShift ? t('shift.updated', { post: s.post }) : t('shift.added', { post: s.post, when: `${dayShort(s.day)} ${span(s)}` });
      if (!saveAndPrune({ ...state, shifts: list }, 'shift-status', msg)) return;
      resetShiftForm(); $('s-post').focus(); render();
    } catch (err) { say('shift-status', L.error(err), 'error'); }
  });

  // --- Planning : créneaux par jour, affectés, places manquantes, ajout manuel.
  function renderRoster() {
    const rows = C.coverage(state), box = $('roster'), g = C.gaps(state);
    $('auto').disabled = !state.shifts.length || !state.volunteers.length; $('export-csv').disabled = !state.shifts.length;
    $('gaps').textContent = !state.shifts.length ? '' : g.places ? t('gaps.some', { n: g.places, shifts: g.shifts }) : t('gaps.none');
    $('gaps').className = 'gaps' + (!state.shifts.length ? '' : g.places ? ' bad' : ' good');
    if (!rows.length) { box.replaceChildren(el('p', 'empty', t('roster.empty'))); return; }
    const days = [...new Set(rows.map((r) => r.shift.day))];
    box.replaceChildren(...days.map((d) => {
      const sec = el('div', 'day'); sec.append(el('h3', '', dayLong(d)));
      for (const r of rows.filter((x) => x.shift.day === d)) {
        const s = r.shift, card = el('article', 'shift' + (r.missing ? ' gap' : '')); card.dataset.id = s.id;
        const head = el('div', 'shift-head'), info = el('div', 'txt');
        info.append(el('b', '', s.post), el('span', '', span(s) + (s.skill ? ' · ' + t('shift.skill', { skill: s.skill }) : '')));
        const count = el('span', r.missing ? 'tag bad' : 'tag ok', r.missing ? t('shift.missing', { n: r.missing, need: s.need }) : t('shift.full', { need: s.need }));
        info.append(count);
        if (r.cause) info.append(el('span', 'cause', t('cause.' + r.cause)));
        const acts = el('div', 'acts'); acts.append(iconBtn('✎', t('aria.editShift', { post: s.post }), 'edit-shift'), iconBtn('✕', t('aria.removeShift', { post: s.post }), 'remove-shift'));
        head.append(info, acts); card.append(head);
        const chips = el('ul', 'chips');
        for (const a of r.assigned) {
          const v = vol(a.volunteerId), li = el('li', 'chip' + (a.locked ? ' locked' : '')); li.dataset.vol = v.id;
          li.append(el('span', '', v.name));
          const lock = iconBtn(a.locked ? '🔒' : '🔓', a.locked ? t('aria.unlock', { name: v.name }) : t('aria.lock', { name: v.name }), 'lock');
          lock.setAttribute('aria-pressed', String(a.locked));
          li.append(lock, iconBtn('✕', t('aria.unassign', { name: v.name, post: s.post }), 'unassign')); chips.append(li);
        }
        card.append(chips);
        if (r.missing) {
          const add = el('div', 'add-row'), sel = el('select'); sel.setAttribute('aria-label', t('aria.addTo', { post: s.post, when: span(s) }));
          const opts = state.volunteers.filter((v) => !r.assigned.some((a) => a.volunteerId === v.id)).sort((a, b) => cmp(a.name, b.name)).map((v) => ({ v, reason: C.blocker(state, v.id, s.id) }));
          opts.sort((a, b) => Number(!!a.reason) - Number(!!b.reason));
          sel.append(Object.assign(el('option', '', t('assign.choose')), { value: '' }));
          for (const { v, reason } of opts) { const o = el('option', '', reason ? `${v.name} — ${t('why.' + reason)}` : v.name); o.value = v.id; o.disabled = !!reason; sel.append(o); }
          const btn = el('button', 'btn small', t('btn.assign')); btn.type = 'button'; btn.dataset.action = 'assign';
          add.append(sel, btn); card.append(add);
        }
        sec.append(card);
      }
      return sec;
    }));
  }
  $('roster').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const card = b.closest('article'), s = state.shifts.find((x) => x.id === card.dataset.id); if (!s) return;
    const chip = b.closest('li[data-vol]'), v = chip ? vol(chip.dataset.vol) : null;
    try {
      switch (b.dataset.action) {
        case 'assign': {
          const id = card.querySelector('select').value;
          if (!id) { say('roster-status', t('assign.pick'), 'error'); return; }
          if (save({ ...state, assignments: C.assign(state, id, s.id, true) })) { say('roster-status', t('assign.done', { name: vol(id).name, post: s.post }), 'ok'); render(); }
          return;
        }
        case 'unassign':
          if (save({ ...state, assignments: C.unassign(state, v.id, s.id) })) { say('roster-status', t('assign.removed', { name: v.name, post: s.post })); render(); }
          return;
        case 'lock': {
          const locked = !state.assignments.find((a) => a.shiftId === s.id && a.volunteerId === v.id).locked;
          if (save({ ...state, assignments: C.setLock(state, v.id, s.id, locked) })) { say('roster-status', locked ? t('assign.locked', { name: v.name }) : t('assign.unlocked', { name: v.name })); render(); }
          return;
        }
        case 'edit-shift':
          editShift = s.id; $('s-post').value = s.post; $('s-skill').value = s.skill; $('s-day').value = s.day; $('s-start').value = C.hhmm(s.start); $('s-end').value = C.hhmm(s.end); $('s-need').value = String(s.need);
          $('save-shift').textContent = t('btn.saveShift'); $('save-shift').dataset.i18n = 'btn.saveShift'; $('cancel-shift').hidden = false;
          say('shift-status', t('shift.editing', { post: s.post })); $('s-post').focus(); return;
        case 'remove-shift':
          if (!confirm(t('confirm.removeShift', { post: s.post, when: `${dayShort(s.day)} ${span(s)}` }))) return;
          if (save({ ...state, shifts: state.shifts.filter((x) => x.id !== s.id), assignments: state.assignments.filter((a) => a.shiftId !== s.id) })) { if (editShift === s.id) resetShiftForm(); say('roster-status', t('shift.removed', { post: s.post })); render(); }
          return;
        default:
      }
    } catch (err) { say('roster-status', L.error(err), 'error'); }
  });
  $('auto').addEventListener('click', () => {
    const before = state.assignments.length;
    if (!save({ ...state, assignments: C.autoAssign(state) })) return;
    const g = C.gaps(state);
    say('roster-status', t('auto.done', { n: state.assignments.length, before }) + ' ' + (g.places ? t('gaps.some', { n: g.places, shifts: g.shifts }) : t('gaps.none')), g.places ? '' : 'ok');
    render();
  });

  // --- Planning par personne (écran) et impression.
  function personBlock(v, tag = 'h3') {
    const p = C.personSchedule(state, v.id), wrap = el('section', 'person');
    wrap.append(el(tag, '', v.name), el('p', 'hint', t('person.total', { n: p.shifts.length, hours: hours(p.minutes), max: hours(v.maxMinutes) })));
    if (!p.shifts.length) { wrap.append(el('p', 'empty', t('person.none'))); return wrap; }
    const table = el('table', 'sched'), head = el('tr');
    for (const h of [t('th.day'), t('th.time'), t('th.post')]) head.append(el('th', '', h));
    const thead = el('thead'); thead.append(head);
    const tb = el('tbody');
    for (const s of p.shifts) { const tr = el('tr'); tr.append(el('td', '', dayShort(s.day)), el('td', '', span(s)), el('td', '', s.post)); tb.append(tr); }
    table.append(thead, tb); wrap.append(table); return wrap;
  }
  function renderPerson() {
    const sel = $('who');
    sel.replaceChildren(Object.assign(el('option', '', t('who.all')), { value: '' }), ...state.volunteers.slice().sort((a, b) => cmp(a.name, b.name)).map((v) => Object.assign(el('option', '', v.name), { value: v.id })));
    if (!vol(who)) who = '';
    sel.value = who;
    const list = who ? [vol(who)] : state.volunteers.slice().sort((a, b) => cmp(a.name, b.name));
    $('person-view').replaceChildren(...(list.length ? list.map((v) => personBlock(v)) : [el('p', 'empty', t('vol.empty'))]));
    $('print').disabled = !list.length;
  }
  $('who').addEventListener('change', () => { who = $('who').value; renderPerson(); });
  $('print').addEventListener('click', () => {
    const list = who ? [vol(who)] : state.volunteers.slice().sort((a, b) => cmp(a.name, b.name));
    const area = $('print-area');
    area.replaceChildren(...list.map((v) => { const s = personBlock(v, 'h2'); s.prepend(el('p', 'print-title', state.title || t('print.title'))); return s; }));
    window.print();
  });

  // --- Export CSV
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    const texts = { head: [t('th.day'), t('csv.start'), t('csv.end'), t('th.post'), t('csv.skill'), t('csv.need'), t('csv.assigned'), t('csv.missing'), t('csv.volunteers')],
      delimiter: L.lang === 'en' ? ',' : ';', locked: ` (${t('csv.manual')})` };
    download('volunteerroster.csv', C.csv(state, texts), 'text/csv;charset=utf-8');
    say('roster-status', t('csv.done'), 'ok');
  });

  // --- Exemple dans la langue affichée : samedi prochain, 6 bénévoles, 7 créneaux.
  $('sample').addEventListener('click', () => {
    if ((state.volunteers.length || state.shifts.length) && !confirm(t('confirm.sample'))) return;
    try {
      const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const aid = t('sample.skillAid'), names = t('sample.names').split(/[,،]/).map((x) => x.trim());
      const vols = [[aid, '6', '09:00', '18:00'], ['', '5', '09:00', '15:00'], ['', '6', '11:00', '20:00'], [aid, '5', '13:00', '20:00'], ['', '3', '09:00', '13:00'], ['', '4', '14:00', '20:00']]
        .map(([skills, maxHours, start, end], i) => C.makeVolunteer({ name: names[i], skills, maxHours, availability: [{ day, start, end }] }, newId()));
      const p = (n) => t('sample.post' + n);
      const shifts = [[p(1), '09:00', '12:00', 2, ''], [p(1), '12:00', '15:00', 2, ''], [p(2), '11:00', '14:00', 2, ''], [p(2), '14:00', '18:00', 2, ''], [p(3), '09:00', '13:00', 1, aid], [p(3), '13:00', '18:00', 1, aid], [p(4), '18:00', '20:00', 3, '']]
        .map(([post, start, end, need, skill]) => C.makeShift({ post, day, start, end, need, skill }, newId()));
      const next = { title: t('sample.title'), volunteers: vols, shifts, assignments: [] };
      if (!save({ ...next, assignments: C.autoAssign(next) })) return;
      resetVolForm(); resetShiftForm(false); $('ev-title').value = state.title; $('a-day').value = day; $('s-day').value = day; who = '';
      say('sample-status', t('sample.added'), 'ok'); render();
    } catch (err) { say('sample-status', L.error(err), 'error'); }
  });

  function render() {
    $('skill-list').replaceChildren(...[...new Set(state.volunteers.flatMap((v) => v.skills))].map((s) => Object.assign(el('option'), { value: s })));
    renderPending(); renderVolunteers(); renderRoster(); renderPerson();
  }

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('volunteerroster-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: state.volunteers.length, b: next.volunteers.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; $('ev-title').value = state.title; resetVolForm(); resetShiftForm(); render();
      say('backup-status', t('backup.restored', { n: next.volunteers.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien */ } download('volunteerroster-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  $('ev-title').value = state.title;
  if (!$('a-day').value) $('a-day').value = today();
  if (!$('s-day').value) $('s-day').value = today();
  L.onChange(() => {
    for (const id of ['sample-status', 'vol-status', 'shift-status', 'roster-status', 'backup-status']) say(id, '');
    $('save-vol').textContent = t($('save-vol').dataset.i18n); $('save-shift').textContent = t($('save-shift').dataset.i18n);
    render();
  });
  render();
  // Fermeture de la page pendant la saisie du titre : « change » ne part pas, on enregistre quand même.
  window.addEventListener('pagehide', () => { if (!readOnly && $('ev-title').value.trim().replace(/\s+/g, ' ') !== state.title) $('ev-title').dispatchEvent(new Event('change')); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
