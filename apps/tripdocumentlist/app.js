/* TripDocumentList — interface. Calculs dans core.js (DocCore) ; textes et dates dans LouvreI18n (appli sans argent). */
(() => {
  'use strict';
  const C = window.DocCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-tripdocumentlist-v1';
  const ACTIVE = 'louvre-tripdocumentlist-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = String(txt); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const STATUSES = ['trip-status', 'dates-status', 'traveler-status', 'doc-status', 'check-status', 'backup-status'];
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let trips = [], activeId = null, readOnly = false, editingId = null;

  function say(id, txt, kind = '') { const n = $(id); n.textContent = txt; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return trips.find((x) => x.id === activeId) || null; }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); trips = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function update(fn) { const cur = active(); return save(trips.map((x) => (x.id === cur.id ? fn(x) : x))); }
  function guard(statusId, fn) { try { fn(); } catch (e) { say(statusId, e instanceof SyntaxError ? t('err.backup') : L.error(e), 'error'); } }
  const tooMany = (key, max) => new Error(`${key}|${JSON.stringify({ max })}`);
  function ensureTrip() {
    if (active()) return true;
    if (trips.length) { activeId = trips[0].id; return true; }
    const first = C.makeTrip(t('trip.defaultName'), newId());
    if (!save([first])) return false;
    activeId = first.id; return true;
  }
  const day = (s) => L.date(s);
  const typeName = (type) => t('type.' + type);

  // --- Affichage
  function renderTrips() {
    const sel = $('trip-select');
    sel.replaceChildren(...trips.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    if (!trips.length) { const o = el('option', '', t('trip.none')); o.value = ''; sel.append(o); }
    if (activeId) sel.value = activeId;
    $('rename-trip').disabled = $('delete-trip').disabled = !active();
  }
  function renderDates() {
    const f = $('dates-form'), tr = active();
    f.start.value = tr && tr.start ? tr.start : ''; f.end.value = tr && tr.end ? tr.end : '';
    f.margin.value = tr && tr.start ? String(tr.margin) : ''; f.marginUnit.value = tr ? tr.marginUnit : 'd';
  }
  function renderSelects() { // titulaire et type (options traduites, sélection conservée)
    const tr = active(), who = $('doc-traveler'), keep = who.value, type = $('doc-type'), keepType = type.value || 'passport';
    who.replaceChildren(...(tr ? tr.travelers : []).map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    if ([...who.options].some((o) => o.value === keep)) who.value = keep;
    type.replaceChildren(...C.TYPES.map((k) => { const o = el('option', '', typeName(k)); o.value = k; return o; }));
    type.value = keepType;
    $('add-doc').disabled = !(tr && tr.travelers.length);
  }
  function renderTravelers() {
    const tr = active();
    $('traveler-list').replaceChildren(...(tr ? tr.travelers : []).map((p) => {
      const li = el('li'), x = el('button', '', '✕'); x.type = 'button'; x.title = t('btn.remove'); x.setAttribute('aria-label', t('aria.removeTraveler', { name: p.name }));
      x.addEventListener('click', () => {
        const n = tr.docs.filter((d) => d.travelerId === p.id).length;
        if (!confirm(t('confirm.traveler', { name: p.name, n }))) return;
        if (editingId && tr.docs.some((d) => d.id === editingId && d.travelerId === p.id)) stopEdit();
        if (update((x2) => ({ ...x2, travelers: x2.travelers.filter((k) => k.id !== p.id), docs: x2.docs.filter((d) => d.travelerId !== p.id) }))) render(false);
      });
      li.append(el('span', '', p.name), x); return li;
    }));
  }
  function validityText(d) {
    switch (d.validity) {
      case 'noExpiry': return t('val.noExpiry');
      case 'expired': return t('val.expired', { date: day(d.expires) });
      case 'noDates': return t('val.noDates', { date: day(d.expires) });
      case 'beforeTrip': return t('val.beforeTrip', { date: day(d.expires) });
      case 'duringTrip': return t('val.duringTrip', { date: day(d.expires) });
      case 'margin': return t('val.margin', { date: day(d.expires), until: day(d.requiredUntil) });
      default: return t('val.ok', { date: day(d.expires), n: d.afterEnd });
    }
  }
  function docItem(d, tr, holder) {
    const li = el('li', 'doc ' + d.level), head = el('div', 'doc-head');
    head.append(el('b', '', typeName(d.type)), el('span', 'pill' + (d.ready ? ' ready' : ''), d.ready ? t('pill.ready') : t('pill.todo')));
    li.append(head, el('p', 'val', validityText(d)));
    if (!d.done) li.append(el('p', '', t('doc.notDone')));
    if (d.note) li.append(el('p', 'note', d.note));
    const acts = el('div', 'doc-acts');
    const lab = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = d.done;
    cb.setAttribute('aria-label', t('aria.done', { type: typeName(d.type), name: holder }));
    cb.addEventListener('change', () => guard('check-status', () => { if (update((x) => ({ ...x, docs: x.docs.map((k) => (k.id === d.id ? { ...k, done: cb.checked } : k)) }))) render(false); }));
    lab.append(cb, el('span', '', t('f.doneShort')));
    const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { type: typeName(d.type), name: holder }));
    edit.addEventListener('click', () => startEdit(d));
    const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.remove', { type: typeName(d.type), name: holder }));
    del.addEventListener('click', () => { if (editingId === d.id) stopEdit(); if (update((x) => ({ ...x, docs: x.docs.filter((k) => k.id !== d.id) }))) render(false); });
    acts.append(lab, edit, del); li.append(acts);
    return li;
  }
  function renderCheck() {
    const tr = active(), s = tr ? C.summary(tr, today()) : null, v = $('verdict');
    $('check-empty').hidden = !!(tr && tr.travelers.length);
    $('k-ready').textContent = s && s.total ? `${L.number(s.ready)} / ${L.number(s.total)}` : '—';
    $('k-problems').textContent = s && s.total ? L.number(s.bad + s.warn) : '—';
    $('k-until').textContent = s && s.requiredUntil ? day(s.requiredUntil) : '—';
    $('k-next').textContent = s && s.nextExpiry ? day(s.nextExpiry.expires) : '—';
    $('export-ics').disabled = !(tr && tr.docs.some((d) => d.expires)); $('print').disabled = !(tr && tr.docs.length);
    $('print-head').textContent = tr ? (tr.start ? t('print.head', { name: tr.name, start: day(tr.start), end: day(tr.end) }) : tr.name) : '';
    v.hidden = !(s && s.total);
    if (s && s.total) {
      if (s.allReady) { v.className = 'verdict'; v.textContent = t('verdict.ready'); }
      else if (s.bad) { v.className = 'verdict bad'; v.textContent = t('verdict.bad', { n: s.bad }); }
      else if (s.warn) { v.className = 'verdict warn'; v.textContent = t('verdict.warn', { n: s.warn }); }
      else if (!tr.start) { v.className = 'verdict warn'; v.textContent = t('verdict.noDates'); }
      else { v.className = 'verdict warn'; v.textContent = t('verdict.todo', { n: s.todo }); }
    }
    $('groups').replaceChildren(...(s ? s.byTraveler : []).map((g) => {
      const box = el('section', 'group'), h = el('h3', '', g.name);
      h.append(el('span', '', g.total ? t('group.count', { n: g.ready, total: g.total }) : t('group.empty')));
      box.append(h);
      // Problèmes d'abord, puis par échéance la plus proche, puis par type.
      const order = { bad: 0, warn: 1, ok: 2 };
      const docs = [...g.docs].sort((a, b) => order[a.level] - order[b.level] || (a.expires || '9999').localeCompare(b.expires || '9999') || typeName(a.type).localeCompare(typeName(b.type), L.locale));
      if (docs.length) { const ul = el('ul', 'docs'); ul.append(...docs.map((d) => docItem(d, tr, g.name))); box.append(ul); }
      return box;
    }));
  }
  // withForms = false : on ne touche pas aux saisies en cours.
  function render(withForms = true) { renderTrips(); if (withForms) renderDates(); renderSelects(); renderTravelers(); renderCheck(); }

  // --- Formulaires
  $('dates-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('dates-status', () => {
      const s = C.makeSettings({ start: f.start.value, end: f.end.value, margin: f.margin.value, marginUnit: f.marginUnit.value });
      if (!ensureTrip()) return;
      if (update((x) => ({ ...x, ...s }))) { say('dates-status', t('dates.saved', { until: day(C.requiredUntil(s)) }), 'ok'); render(); }
    });
  });
  $('traveler-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('traveler-status', () => {
      const p = C.makeTraveler(f.name.value, newId());
      if (!ensureTrip()) return;
      const tr = active();
      if (tr.travelers.length >= C.MAX.travelers) throw tooMany('err.tooManyTravelers', C.MAX.travelers);
      if (tr.travelers.some((x) => x.name.toLocaleLowerCase(L.locale) === p.name.toLocaleLowerCase(L.locale))) throw new Error('err.duplicateTraveler');
      if (update((x) => ({ ...x, travelers: [...x.travelers, p] }))) { say('traveler-status', t('traveler.added', { name: p.name }), 'ok'); f.name.value = ''; render(false); $('doc-traveler').value = p.id; }
    });
  });
  const docForm = $('doc-form');
  function startEdit(d) {
    editingId = d.id;
    docForm.travelerId.value = d.travelerId; docForm.type.value = d.type; docForm.expires.value = d.expires || ''; docForm.note.value = d.note; docForm.done.checked = d.done;
    $('add-doc').dataset.i18n = 'btn.saveDoc'; $('add-doc').textContent = t('btn.saveDoc'); $('cancel-edit').hidden = false;
    say('doc-status', ''); docForm.type.focus();
  }
  function stopEdit() { editingId = null; $('add-doc').dataset.i18n = 'btn.addDoc'; $('add-doc').textContent = t('btn.addDoc'); $('cancel-edit').hidden = true; }
  function clearDoc() { docForm.expires.value = ''; docForm.note.value = ''; docForm.done.checked = false; }
  $('cancel-edit').addEventListener('click', () => { stopEdit(); clearDoc(); say('doc-status', ''); });
  docForm.addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('doc-status', () => {
      const tr = active(); if (!tr || !tr.travelers.length) throw new Error('err.traveler');
      const d = C.makeDoc({ travelerId: f.travelerId.value, type: f.type.value, expires: f.expires.value, note: f.note.value, done: f.done.checked }, editingId || newId(), tr.travelers);
      const name = t('doc.label', { type: typeName(d.type), name: tr.travelers.find((x) => x.id === d.travelerId).name });
      if (editingId) {
        if (!tr.docs.some((k) => k.id === editingId)) throw new Error('err.id');
        if (!update((x) => ({ ...x, docs: x.docs.map((k) => (k.id === editingId ? d : k)) }))) return;
        stopEdit(); say('doc-status', t('doc.updated', { name }), 'ok');
      } else {
        if (tr.docs.length >= C.MAX.docs) throw tooMany('err.tooManyDocs', C.MAX.docs);
        if (!update((x) => ({ ...x, docs: [...x.docs, d] }))) return;
        say('doc-status', t('doc.added', { name }), 'ok');
      }
      clearDoc(); render(false);
    });
  });

  // Exemple généré dans la langue affichée (dates relatives à aujourd'hui) : une échéance pendant le voyage, une sous la marge.
  $('sample').addEventListener('click', () => guard('trip-status', () => {
    if (trips.length >= C.MAX.trips) throw tooMany('err.tooManyTrips', C.MAX.trips);
    const d0 = today(), at = (n) => C.addDays(d0, n);
    const tr = { ...C.makeTrip(t('sample.trip'), newId()), ...C.makeSettings({ start: at(40), end: at(54), margin: '3', marginUnit: 'm' }) };
    tr.travelers = [C.makeTraveler(t('sample.t1'), newId()), C.makeTraveler(t('sample.t2'), newId())];
    const [a, b] = tr.travelers.map((x) => x.id);
    const doc = (travelerId, type, expires, done, note = '') => C.makeDoc({ travelerId, type, expires, done, note }, newId(), tr.travelers);
    tr.docs = [doc(a, 'passport', at(900), true), doc(a, 'insurance', at(47), true, t('sample.note1')), doc(a, 'booking', '', false, t('sample.note2')),
      doc(b, 'passport', at(110), true), doc(b, 'ticket', '', true), doc(b, 'visa', at(200), false, t('sample.note3'))];
    if (save([...trips, tr])) { activeId = tr.id; stopEdit(); render(); say('trip-status', t('sample.added'), 'ok'); }
  }));

  // --- Voyages
  $('trip-select').addEventListener('change', (e) => { activeId = e.target.value || null; stopEdit(); try { localStorage.setItem(ACTIVE, activeId || ''); } catch (_) { /* confort */ } render(); });
  $('new-trip').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('trip.newDefault', { n: trips.length + 1 })); if (name === null) return;
    guard('trip-status', () => { if (trips.length >= C.MAX.trips) throw tooMany('err.tooManyTrips', C.MAX.trips); const x = C.makeTrip(name, newId()); if (save([...trips, x])) { activeId = x.id; stopEdit(); render(); } });
  });
  $('rename-trip').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name); if (name === null) return;
    guard('trip-status', () => { const fixed = C.makeTrip(name, cur.id); if (update((x) => ({ ...x, name: fixed.name }))) render(false); });
  });
  $('delete-trip').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.docs.length }))) return;
    if (save(trips.filter((x) => x.id !== cur.id))) { activeId = trips[0] ? trips[0].id : null; stopEdit(); render(); }
  });

  // --- Exports
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => guard('check-status', () => {
    const tr = active(); if (!tr) return;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = C.toICS(tr, stamp, {
      summary: (d, who) => t('ics.summary', { type: typeName(d.type), name: who.name }),
      describe: (d) => [t('ics.describe', { trip: tr.name }), d.note].filter(Boolean).join('\n'),
    });
    download('tripdocumentlist.ics', ics, 'text/calendar;charset=utf-8');
    say('check-status', t('ics.done'), 'ok');
  }));
  $('print').addEventListener('click', () => window.print());
  $('export').addEventListener('click', () => guard('backup-status', () => { download('tripdocumentlist-backup.json', C.backup(trips), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: trips.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : on garde la protection
      activeId = next[0] ? next[0].id : null; stopEdit();
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: e instanceof SyntaxError ? t('err.backup') : L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('tripdocumentlist-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) trips = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = trips.some((x) => x.id === last) ? last : (trips[0] ? trips[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const s of STATUSES) say(s, ''); render(false); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
