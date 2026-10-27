/* MeetingMinutes — interface. Calculs dans core.js (MeetCore) ; textes et formats dans LouvreI18n (appli sans argent).
   Saisies libres (intitulé, notes) enregistrées en différé, forcées avant tout changement, export ou fermeture. */
(() => {
  'use strict';
  const C = window.MeetCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-meetingminutes-v1';
  const ACTIVE = 'louvre-meetingminutes-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  let meetings = [], activeId = null, itemId = null, readOnly = false;
  let metaDirty = false, notesDirty = false, timer = null;
  let running = null; // chronomètre : { itemId, since (ms), base (s) }
  let ticker = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cur = () => meetings.find((m) => m.id === activeId) || null;
  const curItem = () => { const m = cur(); return m ? m.items.find((i) => i.id === itemId) || null : null; };
  const errText = (e) => (e instanceof SyntaxError ? t('err.backup') : L.error(e));
  const fmtSec = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
  const mins = (n) => t('dur.min', { n: L.number(n) });
  const day = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); meetings = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function updateMeeting(mutator) { const m = cur(); if (!m) return false; return save(meetings.map((x) => (x.id === m.id ? mutator(x) : x))); }
  function guard(max, list, key) { if (list.length >= max) throw new Error(`${key}|${JSON.stringify({ max })}`); }

  // --- Enregistrement différé (intitulé, date, durée, notes) et chronomètre
  function flushMeta() {
    if (!metaDirty) return true;
    const m = cur(); if (!m) { metaDirty = false; return true; }
    try {
      const next = C.makeMeeting({ ...m, title: $('m-title').value, date: $('m-date').value, start: $('m-start').value, duration: $('m-duration').value }, m.id);
      if (save(meetings.map((x) => (x.id === m.id ? next : x)))) { metaDirty = false; say('meeting-status', ''); }
    } catch (e) { say('meeting-status', errText(e), 'error'); }
    return !metaDirty;
  }
  function flushNotes() {
    if (!notesDirty) return true;
    const it = curItem(); if (!it) { notesDirty = false; return true; }
    try {
      const fixed = C.makeItem({ ...it, notes: $('notes').value }, it.id);
      if (updateMeeting((m) => ({ ...m, items: m.items.map((x) => (x.id === it.id ? fixed : x)) }))) notesDirty = false;
    } catch (e) { say('notes-status', errText(e), 'error'); }
    stateText();
    return !notesDirty;
  }
  function stopTimer() {
    if (!running) return;
    const r = running; running = null; clearInterval(ticker); ticker = null;
    const spentSec = Math.min(86400, r.base + Math.max(0, Math.round((Date.now() - r.since) / 1000)));
    updateMeeting((m) => ({ ...m, items: m.items.map((x) => (x.id === r.itemId ? { ...x, spentSec } : x)) }));
  }
  // À appeler avant tout changement de réunion ou de point, création, suppression, export et à la fermeture.
  function commit() { clearTimeout(timer); timer = null; stopTimer(); flushMeta(); flushNotes(); renderAll(); }
  function later() { clearTimeout(timer); timer = setTimeout(() => { flushMeta(); flushNotes(); renderLight(); }, 500); }
  // Après une saisie ou une sortie de champ, les listes ne sont pas reconstruites tout de suite :
  // un clic en cours sur un bouton de liste (qui a provoqué la sortie du champ) doit arriver à son bouton.
  let soon = null;
  function renderSoon() { renderLight(); clearTimeout(soon); soon = setTimeout(renderAll, 300); }
  function stateText() { $('save-state').textContent = readOnly ? t('save.readonly') : notesDirty ? t('save.pending') : t('save.done'); }

  // Réunion avec le temps du chronomètre en cours ajouté (affichage seulement).
  function live() {
    const m = cur(); if (!m || !running) return m;
    const extra = Math.max(0, Math.round((Date.now() - running.since) / 1000));
    return { ...m, items: m.items.map((x) => (x.id === running.itemId ? { ...x, spentSec: Math.min(86400, running.base + extra) } : x)) };
  }

  // --- Affichage
  function keepFocus(box, build) { // reconstruit une liste sans perdre le bouton actif au clavier
    const key = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    build();
    if (!key) return;
    const again = box.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!again) return;
    if (!again.disabled) { again.focus(); return; }
    // Bouton devenu inactif (point arrivé en tête ou en fin) : focus sur le premier bouton actif de la même ligne.
    const other = again.closest('li') && again.closest('li').querySelector('button:not(:disabled)');
    if (other) other.focus();
  }
  function button(text, key, onClick, cls = 'btn small') { const b = el('button', cls, text); b.type = 'button'; b.dataset.key = key; b.addEventListener('click', onClick); return b; }

  function renderMeetings() {
    const sel = $('meeting-select');
    const sorted = [...meetings].sort((a, b) => `${b.date}T${b.start}`.localeCompare(`${a.date}T${a.start}`) || a.title.localeCompare(b.title, L.locale));
    sel.replaceChildren(...sorted.map((m) => { const o = el('option', '', `${day(m.date)} — ${m.title}`); o.value = m.id; return o; }));
    if (activeId) sel.value = activeId;
    const none = !cur();
    for (const id of ['next-meeting', 'delete-meeting', 'export-md', 'export-ics']) $(id).disabled = none;
  }
  function loadMeeting() { // remplit les champs depuis les données (pas lors d'un changement de langue)
    const m = cur();
    $('m-title').value = m ? m.title : ''; $('m-date').value = m ? m.date : ''; $('m-start').value = m ? m.start : ''; $('m-duration').value = m ? String(m.duration) : '';
    for (const id of ['m-title', 'm-date', 'm-start', 'm-duration', 'item-title', 'item-minutes', 'person-name', 'decision-text', 'action-text', 'action-owner', 'action-due']) $(id).disabled = !m || readOnly;
    metaDirty = false;
    if (!m || !m.items.some((i) => i.id === itemId)) itemId = m && m.items[0] ? m.items[0].id : null;
    loadNotes();
  }
  function loadNotes() {
    const it = curItem();
    $('notes').value = it ? it.notes : ''; $('spent').value = it ? String(Math.round(it.spentSec / 60)) : '';
    $('notes').disabled = $('spent').disabled = !it || readOnly;
    notesDirty = false; stateText();
  }

  function renderAgenda(full = true) {
    const m = live(), box = $('agenda');
    if (!m) { box.replaceChildren(); for (const k of ['k-planned', 'k-spent', 'k-end', 'k-margin']) $(k).textContent = '—'; $('agenda-alert').hidden = true; return; }
    const s = C.schedule(m);
    $('k-planned').textContent = t('k.plannedVal', { a: L.number(s.plannedMin), b: L.number(m.duration) });
    $('k-spent').textContent = fmtSec(s.spentSec);
    $('k-end').textContent = s.forecastEnd.time + (s.forecastEnd.dayOffset ? ` ${t('k.nextDay')}` : '');
    const margin = $('k-margin');
    margin.textContent = s.planOverMin ? `−${mins(s.planOverMin)}` : `+${mins(s.slackMin)}`;
    margin.className = s.planOverMin ? 'bad' : '';
    const alert = $('agenda-alert');
    alert.hidden = !(s.planOverMin || s.forecastOverMin);
    alert.textContent = s.planOverMin ? t('alert.plan', { n: L.number(s.planOverMin) }) : s.forecastOverMin ? t('alert.forecast', { n: L.number(s.forecastOverMin), end: s.forecastEnd.time }) : '';
    if (!full) return;
    keepFocus(box, () => box.replaceChildren(...(m.items.length ? s.rows.map((r, i) => {
      const li = el('li', r.id === itemId ? 'sel' : ''), txt = el('div', 'txt');
      txt.append(el('b', '', `${i + 1}. ${r.title}`));
      txt.append(el('span', '', `${C.clock(m.start, r.startMin).time}–${C.clock(m.start, r.endMin).time} · ${mins(r.plannedMin)}`));
      const time = el('span', 'time'); time.dataset.time = r.id;
      const isRun = running && running.itemId === r.id;
      fillTime(time, r, isRun);
      txt.append(time);
      const acts = el('div', 'acts');
      const up = button('↑', `up-${r.id}`, () => move(r.id, -1)); up.setAttribute('aria-label', t('aria.up', { name: r.title })); up.disabled = i === 0 || readOnly;
      const down = button('↓', `down-${r.id}`, () => move(r.id, 1)); down.setAttribute('aria-label', t('aria.down', { name: r.title })); down.disabled = i === m.items.length - 1 || readOnly;
      const run = button(isRun ? t('btn.stop') : t('btn.start'), `run-${r.id}`, () => toggleTimer(r.id), isRun ? 'btn small primary' : 'btn small');
      run.setAttribute('aria-pressed', String(!!isRun)); run.setAttribute('aria-label', t(isRun ? 'aria.stop' : 'aria.start', { name: r.title })); run.disabled = readOnly;
      const notes = button(t('btn.notes'), `notes-${r.id}`, () => selectItem(r.id)); notes.setAttribute('aria-pressed', String(r.id === itemId)); notes.setAttribute('aria-label', t('aria.notes', { name: r.title }));
      const del = button('✕', `del-${r.id}`, () => removeItem(r.id)); del.setAttribute('aria-label', t('aria.remove', { name: r.title })); del.title = t('btn.remove'); del.disabled = readOnly;
      acts.append(up, down, run, notes, del); li.append(txt, acts); return li;
    }) : [el('li', 'empty', t('agenda.empty'))])));
  }
  function renderNotesHead() {
    const it = curItem();
    $('notes-for').textContent = it ? t('notes.for', { name: it.title }) : t('notes.none');
    if (it && document.activeElement !== $('spent')) $('spent').value = String(Math.round(it.spentSec / 60)); // suit le chronomètre
  }
  function renderPeople() {
    const m = cur(), box = $('people');
    $('owners').replaceChildren(...(m ? m.participants.map((p) => { const o = el('option'); o.value = p.name; return o; }) : []));
    keepFocus(box, () => box.replaceChildren(...(m && m.participants.length ? [...m.participants].sort((a, b) => a.name.localeCompare(b.name, L.locale)).map((p) => {
      const li = el('li'), txt = el('div', 'txt'); txt.append(el('b', '', p.name));
      const sel = el('select', 'presence'); sel.dataset.key = `pres-${p.id}`; sel.setAttribute('aria-label', t('aria.presence', { name: p.name })); sel.disabled = readOnly;
      for (const k of C.PRESENCE) { const o = el('option', '', t('presence.' + k)); o.value = k; sel.append(o); }
      sel.value = p.presence;
      sel.addEventListener('change', () => { commit(); if (updateMeeting((x) => ({ ...x, participants: x.participants.map((q) => (q.id === p.id ? { ...q, presence: sel.value } : q)) }))) renderAll(); });
      const acts = el('div', 'acts');
      const del = button('✕', `pdel-${p.id}`, () => { commit(); if (updateMeeting((x) => ({ ...x, participants: x.participants.filter((q) => q.id !== p.id) }))) renderAll(); });
      del.setAttribute('aria-label', t('aria.remove', { name: p.name })); del.disabled = readOnly;
      acts.append(sel, del); li.append(txt, acts); return li;
    }) : [el('li', 'empty', t('people.empty'))])));
  }
  function itemTitle(m, id) { const it = m.items.find((x) => x.id === id); return it ? it.title : ''; }
  function actionLine(a, extra) {
    const bits = [a.owner || t('owner.none'), a.due ? t('action.due', { date: day(a.due) }) : t('action.noDue')];
    if (extra) bits.push(extra);
    return bits.join(' · ');
  }
  function check(a, key, label, onToggle) {
    const box = el('input'); box.type = 'checkbox'; box.checked = a.done; box.dataset.key = key; box.disabled = readOnly;
    box.setAttribute('aria-label', label); box.addEventListener('change', () => onToggle(box.checked)); return box;
  }
  function renderActions() {
    const m = cur();
    const dBox = $('decisions'), aBox = $('actions'), pBox = $('pending');
    if (!m) { dBox.replaceChildren(); aBox.replaceChildren(); pBox.replaceChildren(); return; }
    keepFocus(dBox, () => dBox.replaceChildren(...(m.decisions.length ? m.decisions.map((d) => {
      const li = el('li'), txt = el('div', 'txt'); txt.append(el('b', '', d.text));
      txt.append(el('span', '', d.itemId ? itemTitle(m, d.itemId) : t('scope.general')));
      const acts = el('div', 'acts');
      const del = button('✕', `ddel-${d.id}`, () => { commit(); if (updateMeeting((x) => ({ ...x, decisions: x.decisions.filter((q) => q.id !== d.id) }))) renderAll(); });
      del.setAttribute('aria-label', t('aria.remove', { name: d.text })); del.disabled = readOnly;
      acts.append(del); li.append(txt, acts); return li;
    }) : [el('li', 'empty', t('decisions.empty'))])));
    keepFocus(aBox, () => aBox.replaceChildren(...(m.actions.length ? m.actions.map((a) => {
      const li = el('li', 'check' + (a.done ? ' done' : '')), txt = el('div', 'txt');
      const box = check(a, `adone-${a.id}`, t('aria.done', { name: a.text }), (done) => { commit(); if (updateMeeting((x) => ({ ...x, actions: x.actions.map((q) => (q.id === a.id ? { ...q, done } : q)) }))) renderAll(); });
      txt.append(el('b', '', a.text), el('span', '', actionLine(a, a.itemId ? itemTitle(m, a.itemId) : '')));
      const acts = el('div', 'acts');
      const del = button('✕', `adel-${a.id}`, () => { commit(); if (updateMeeting((x) => ({ ...x, actions: x.actions.filter((q) => q.id !== a.id) }))) renderAll(); });
      del.setAttribute('aria-label', t('aria.remove', { name: a.text })); del.disabled = readOnly;
      acts.append(del); li.append(box, txt, acts); return li;
    }) : [el('li', 'empty', t('actions.empty'))])));
    const pending = C.pendingActions(meetings, m.id);
    keepFocus(pBox, () => pBox.replaceChildren(...(pending.length ? pending.map((p) => {
      const a = p.action, li = el('li', 'check'), txt = el('div', 'txt');
      const box = check(a, `pdone-${a.id}`, t('aria.done', { name: a.text }), (done) => {
        commit();
        if (save(meetings.map((x) => (x.id === p.meetingId ? { ...x, actions: x.actions.map((q) => (q.id === a.id ? { ...q, done } : q)) } : x)))) { renderAll(); say('export-status', done ? t('pending.closed', { name: a.text }) : ''); }
      });
      txt.append(el('b', '', a.text), el('span', '', actionLine(a, `${p.meetingTitle} (${day(p.meetingDate)})`)));
      if (p.overdue) { const tag = el('span', 'tag bad', t('tag.overdue')); const s = el('span'); s.append(tag); txt.append(s); }
      li.append(box, txt); return li;
    }) : [el('li', 'empty', t('pending.empty'))])));
  }
  function labels() {
    return {
      minutes: t('md.minutes'), date: (d) => L.date(d), time: t('md.time'), participants: t('people.title'),
      present: t('md.present'), excused: t('md.excused'), absent: t('md.absent'),
      agenda: t('md.agenda'), planned: t('md.planned'), spent: t('md.spent'), notes: t('f.notes'), decisions: t('decisions.list'),
      actions: t('md.actions'), action: t('md.action'), owner: t('f.owner'), due: t('f.due'), status: t('md.status'),
      open: t('md.open'), done: t('md.done'), none: '—', pending: t('pending.title'), from: t('md.from'), overdue: t('tag.overdue'),
      dur: (sec) => mins(Math.round(sec / 60)), min: (n) => mins(n),
    };
  }
  function markdown() { const m = cur(); return m ? C.toMarkdown(m, C.pendingActions(meetings, m.id), labels()) : ''; }
  function fillTime(span, r, isRun) {
    span.replaceChildren(r.started || isRun ? `${isRun ? '● ' : ''}${t('item.spent', { d: fmtSec(r.spentSec) })}` : t('item.notStarted'));
    if (r.overSec) span.append(' ', el('span', 'tag bad', t('tag.over', { d: fmtSec(r.overSec) })));
  }
  function tick() { // chronomètre : seuls les chiffres changent, les boutons restent en place
    renderAgenda(false);
    const m = live(); if (!m || !running) return;
    const r = C.schedule(m).rows.find((x) => x.id === running.itemId);
    const span = document.querySelector(`[data-time="${CSS.escape(running.itemId)}"]`);
    if (r && span) fillTime(span, r, true);
  }
  function renderLight() { renderMeetings(); renderAgenda(false); renderNotesHead(); $('md-preview').textContent = markdown(); stateText(); }
  function renderAll() { renderMeetings(); renderAgenda(); renderNotesHead(); renderPeople(); renderActions(); $('md-preview').textContent = markdown(); stateText(); }

  // --- Réunions
  function addMeeting(m, msg) {
    if (meetings.length >= C.MAX.meetings) throw new Error(`err.tooManyMeetings|${JSON.stringify({ max: C.MAX.meetings })}`);
    if (!save([...meetings, m])) return false;
    activeId = m.id; try { localStorage.setItem(ACTIVE, m.id); } catch (_) { /* confort */ }
    loadMeeting(); renderAll(); if (msg) say('meeting-status', msg, 'ok'); return true;
  }
  $('meeting-select').addEventListener('change', (e) => { commit(); activeId = e.target.value; try { localStorage.setItem(ACTIVE, activeId); } catch (_) { /* confort */ } loadMeeting(); renderAll(); });
  $('new-meeting').addEventListener('click', () => {
    commit();
    try { if (addMeeting(C.makeMeeting({ title: t('meeting.newDefault'), date: today(), start: '09:00', duration: '60' }, newId()), t('meeting.created'))) $('m-title').select(); }
    catch (e) { say('meeting-status', errText(e), 'error'); }
  });
  $('next-meeting').addEventListener('click', () => {
    commit(); const m = cur(); if (!m) return;
    try { addMeeting(C.nextMeeting(m, C.addDays(m.date, 7), newId), t('meeting.nextCreated', { date: day(C.addDays(m.date, 7)) })); }
    catch (e) { say('meeting-status', errText(e), 'error'); }
  });
  $('delete-meeting').addEventListener('click', () => {
    const m = cur(); if (!m) return;
    commit();
    if (!confirm(t('confirm.delete', { name: m.title }))) return;
    if (save(meetings.filter((x) => x.id !== m.id))) { activeId = meetings[0] ? meetings[0].id : null; loadMeeting(); renderAll(); say('meeting-status', t('meeting.deleted'), 'ok'); }
  });
  for (const id of ['m-title', 'm-date', 'm-start', 'm-duration']) {
    $(id).addEventListener('input', () => { metaDirty = true; later(); });
    $(id).addEventListener('change', () => { metaDirty = true; flushMeta(); renderSoon(); });
  }

  // --- Ordre du jour
  function move(id, delta) { commit(); if (updateMeeting((m) => ({ ...m, items: C.moveItem(m.items, id, delta) }))) renderAll(); }
  function selectItem(id) { commit(); itemId = id; loadNotes(); renderAll(); $('notes').focus(); }
  function removeItem(id) {
    const m = cur(), it = m && m.items.find((x) => x.id === id); if (!it) return;
    commit();
    const linked = m.decisions.filter((d) => d.itemId === id).length + m.actions.filter((a) => a.itemId === id).length;
    if ((it.notes.trim() || linked) && !confirm(t('confirm.item', { name: it.title }))) return;
    // Les décisions et actions rattachées restent, sans rattachement (rien n'est perdu).
    const ok = updateMeeting((x) => ({ ...x, items: x.items.filter((q) => q.id !== id),
      decisions: x.decisions.map((d) => (d.itemId === id ? { ...d, itemId: null } : d)), actions: x.actions.map((a) => (a.itemId === id ? { ...a, itemId: null } : a)) }));
    if (ok) { if (itemId === id) itemId = null; loadMeeting(); renderAll(); say('agenda-status', t('item.removed', { name: it.title }), 'ok'); }
  }
  function toggleTimer(id) {
    const was = running && running.itemId;
    commit(); // arrête et enregistre le chronomètre en cours
    if (was === id) { renderAll(); say('agenda-status', t('timer.stopped'), 'ok'); return; }
    const it = cur().items.find((x) => x.id === id); if (!it) return;
    running = { itemId: id, since: Date.now(), base: it.spentSec };
    if (itemId !== id) { itemId = id; loadNotes(); }
    ticker = setInterval(tick, 1000);
    renderAll(); say('agenda-status', t('timer.started', { name: it.title }), 'ok');
  }
  $('item-form').addEventListener('submit', (event) => {
    event.preventDefault(); commit();
    const m = cur(); if (!m) return;
    try {
      guard(C.MAX.items, m.items, 'err.tooMany');
      const it = C.makeItem({ title: $('item-title').value, minutes: $('item-minutes').value }, newId());
      if (!updateMeeting((x) => ({ ...x, items: [...x.items, it] }))) return;
      if (!itemId) { itemId = it.id; loadNotes(); }
      $('item-title').value = ''; $('item-title').focus();
      renderAll(); say('agenda-status', t('item.added', { name: it.title, n: L.number(it.minutes) }), 'ok');
    } catch (e) { say('agenda-status', errText(e), 'error'); }
  });

  // --- Notes, temps passé, décisions et actions du point sélectionné
  $('notes').addEventListener('input', () => { notesDirty = true; stateText(); later(); });
  $('notes').addEventListener('blur', () => { flushNotes(); renderSoon(); });
  $('spent').addEventListener('change', () => {
    const it = curItem(); if (!it) return;
    try {
      const spentSec = C.parseSpent($('spent').value);
      commit();
      if (updateMeeting((m) => ({ ...m, items: m.items.map((x) => (x.id === it.id ? { ...x, spentSec } : x)) }))) { renderAll(); say('notes-status', t('spent.saved'), 'ok'); }
    } catch (e) { say('notes-status', errText(e), 'error'); }
  });
  $('decision-form').addEventListener('submit', (event) => {
    event.preventDefault(); commit();
    const m = cur(); if (!m) return;
    try {
      guard(C.MAX.decisions, m.decisions, 'err.tooMany');
      const d = C.makeDecision({ text: $('decision-text').value, itemId: itemId || '' }, newId());
      if (updateMeeting((x) => ({ ...x, decisions: [...x.decisions, d] }))) { $('decision-text').value = ''; renderAll(); say('notes-status', t('decision.added'), 'ok'); }
    } catch (e) { say('notes-status', errText(e), 'error'); }
  });
  $('action-form').addEventListener('submit', (event) => {
    event.preventDefault(); commit();
    const m = cur(); if (!m) return;
    try {
      guard(C.MAX.actions, m.actions, 'err.tooMany');
      const a = C.makeAction({ text: $('action-text').value, owner: $('action-owner').value, due: $('action-due').value, itemId: itemId || '' }, newId());
      if (updateMeeting((x) => ({ ...x, actions: [...x.actions, a] }))) { $('action-text').value = ''; $('action-due').value = ''; renderAll(); say('notes-status', t('action.added', { name: a.text }), 'ok'); }
    } catch (e) { say('notes-status', errText(e), 'error'); }
  });
  $('person-form').addEventListener('submit', (event) => {
    event.preventDefault(); commit();
    const m = cur(); if (!m) return;
    try {
      guard(C.MAX.participants, m.participants, 'err.tooMany');
      const p = C.makeParticipant({ name: $('person-name').value }, newId());
      if (m.participants.some((q) => q.name.toLocaleLowerCase(L.locale) === p.name.toLocaleLowerCase(L.locale))) throw new Error('err.duplicate');
      if (updateMeeting((x) => ({ ...x, participants: [...x.participants, p] }))) { $('person-name').value = ''; $('person-name').focus(); renderAll(); say('people-status', t('person.added', { name: p.name }), 'ok'); }
    } catch (e) { say('people-status', errText(e), 'error'); }
  });

  // --- Exemple dans la langue affichée : une réunion précédente (action en retard) et la réunion du jour.
  $('sample').addEventListener('click', () => {
    commit();
    try {
      if (meetings.length + 2 > C.MAX.meetings) throw new Error(`err.tooManyMeetings|${JSON.stringify({ max: C.MAX.meetings })}`);
      const d = today(), prevDay = C.addDays(d, -7);
      const people = ['Ana', 'Karim', 'Lena', 'Marco'];
      const prev = C.makeMeeting({ title: t('sample.title'), date: prevDay, start: '09:30', duration: '45' }, newId());
      prev.participants = people.map((name) => C.makeParticipant({ name }, newId()));
      prev.items = [C.makeItem({ title: t('sample.i1'), minutes: '10', spentSec: 600 }, newId())];
      prev.actions = [C.makeAction({ text: t('sample.prevAction'), owner: 'Karim', due: C.addDays(prevDay, 3) }, newId()),
        C.makeAction({ text: t('sample.prevDone'), owner: 'Lena', due: C.addDays(prevDay, 2), done: true }, newId())];
      const m = C.makeMeeting({ title: t('sample.title'), date: d, start: '09:30', duration: '45' }, newId());
      m.participants = people.map((name, i) => C.makeParticipant({ name, presence: i === 3 ? 'excused' : 'present' }, newId()));
      m.items = [
        C.makeItem({ title: t('sample.i1'), minutes: '10', spentSec: 540, notes: t('sample.n1') }, newId()),
        C.makeItem({ title: t('sample.i2'), minutes: '15', spentSec: 1260, notes: t('sample.n2') }, newId()),
        C.makeItem({ title: t('sample.i3'), minutes: '15' }, newId()),
        C.makeItem({ title: t('sample.i4'), minutes: '10' }, newId()),
      ];
      m.decisions = [C.makeDecision({ text: t('sample.d1'), itemId: m.items[1].id }, newId())];
      m.actions = [C.makeAction({ text: t('sample.a1'), owner: 'Ana', due: C.addDays(d, 5), itemId: m.items[1].id }, newId()),
        C.makeAction({ text: t('sample.a2'), owner: 'Marco', due: C.addDays(d, 10) }, newId())];
      if (!save([...meetings, prev])) return;
      itemId = m.items[0].id;
      addMeeting(m, t('sample.added'));
    } catch (e) { say('meeting-status', errText(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-md').addEventListener('click', () => {
    commit(); const m = cur(); if (!m) return;
    download(`${t('file.minutes')}-${m.date}.md`, markdown(), 'text/markdown;charset=utf-8');
    say('export-status', t('export.mdDone'), 'ok');
  });
  $('export-ics').addEventListener('click', () => {
    commit(); const m = cur(); if (!m) return;
    try {
      const entries = m.actions.map((action) => ({ action, meeting: m }))
        .concat(C.pendingActions(meetings, m.id).map((p) => ({ action: p.action, meeting: meetings.find((x) => x.id === p.meetingId) })));
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const ics = C.toICS(entries, stamp, {
        summary: (a) => (a.owner ? t('ics.summaryOwner', { name: a.text, owner: a.owner }) : a.text),
        describe: (x) => t('ics.desc', { title: x.title, date: L.date(x.date) }),
      });
      download(`${t('file.due')}-${m.date}.ics`, ics, 'text/calendar;charset=utf-8');
      say('export-status', t('export.icsDone', { n: (ics.match(/BEGIN:VEVENT/g) || []).length }), 'ok');
    } catch (e) { say('export-status', errText(e), 'error'); }
  });
  $('export').addEventListener('click', () => { commit(); try { download('meetingminutes-backup.json', C.backup(meetings), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: meetings.length, b: next.length }))) return;
      clearTimeout(timer); running = null; clearInterval(ticker); metaDirty = notesDirty = false;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      activeId = next[0] ? next[0].id : null; itemId = null;
      $('warning').hidden = true; $('export-raw').hidden = true; loadMeeting(); renderAll();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('meetingminutes-raw-storage.txt', raw, 'text/plain'); });

  window.addEventListener('pagehide', () => { clearTimeout(timer); stopTimer(); flushMeta(); flushNotes(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); flushMeta(); flushNotes(); } });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) meetings = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = meetings.some((m) => m.id === last) ? last : (meetings[0] ? meetings[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  if (!readOnly && !meetings.length) {
    try { const m = C.makeMeeting({ title: t('meeting.newDefault'), date: today(), start: '09:00', duration: '60' }, newId()); if (save([m])) activeId = m.id; } catch (_) { /* stockage bloqué */ }
  }
  // Changement de langue : les champs gardent leur saisie, le reste est réaffiché.
  L.onChange(() => { for (const id of ['meeting-status', 'agenda-status', 'notes-status', 'people-status', 'export-status', 'backup-status']) say(id, ''); renderAll(); });
  loadMeeting(); renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
