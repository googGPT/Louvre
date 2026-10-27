/* FlightTimeMath — interface. Calculs dans core.js (FlightCore) ; textes, dates et nombres dans LouvreI18n (appli sans argent). */
(() => {
  'use strict';
  const C = window.FlightCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-flighttimemath-v1';
  const ACTIVE = 'louvre-flighttimemath-active'; // voyage affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = String(txt); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const STATUSES = ['trip-status', 'conn-status', 'seg-status', 'res-status', 'backup-status'];

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

  // --- Formats (langue affichée)
  function dur(min) {
    const { h, m } = C.splitMinutes(min);
    if (!h) return t('dur.m', { m });
    return m ? t('dur.hm', { h, m: String(m).padStart(2, '0') }) : t('dur.h', { h });
  }
  function utc(offset) { const { h, m, neg } = C.splitMinutes(offset); return `UTC${neg ? '−' : '+'}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`; }
  const dayLabel = (n) => (n > 0 ? t('day.plus', { n }) : t('day.minus', { n: -n }));
  const when = (p) => L.date(p.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  function shiftText(min) { if (!min) return t('zone.same'); const { h, m, neg } = C.splitMinutes(min); return t('zone.shift', { shift: `${neg ? '−' : '+'}${h}${m ? ':' + String(m).padStart(2, '0') : ''} h` }); }

  // --- Affichage
  function renderTrips() {
    const sel = $('trip-select');
    sel.replaceChildren(...trips.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    if (!trips.length) { const o = el('option', '', t('trip.none')); o.value = ''; sel.append(o); }
    if (activeId) sel.value = activeId;
    $('rename-trip').disabled = $('delete-trip').disabled = !active();
  }
  function renderConnForm() { const tr = active(); $('conn-form').min.value = tr && tr.minConnection !== null ? String(tr.minConnection) : ''; }

  function endPoint(cls, label, p, place, zone, shift) {
    const box = el('div', 'end-pt ' + cls);
    const clock = el('span', 'clock', p.time);
    if (shift) clock.append(el('span', 'day', dayLabel(shift)));
    box.append(el('span', 'meta', label), clock, el('span', 'place', place), el('span', 'meta', when(p)), el('span', 'meta', `${zone} · ${utc(p.offset)}`));
    return box;
  }
  function segCard(s, tr) {
    const li = el('li', 'seg'), head = el('div', 'seg-head');
    const name = s.flight ? t('seg.name', { flight: s.flight, from: s.from, to: s.to }) : t('seg.nameNoFlight', { from: s.from, to: s.to });
    const acts = el('div', 'seg-acts');
    const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name }));
    edit.addEventListener('click', () => startEdit(s));
    const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.remove', { name }));
    del.addEventListener('click', () => {
      if (editingId === s.id) stopEdit();
      if (update((x) => ({ ...x, segments: x.segments.filter((k) => k.id !== s.id) }))) { render(); say('res-status', t('seg.removed', { name }), 'ok'); }
    });
    acts.append(edit, del);
    head.append(el('b', '', name), acts);
    const ends = el('div', 'ends');
    ends.append(endPoint('from', t('f.departure'), s.dep, s.from, s.fromZone, 0), el('span', 'dur', dur(s.durationMin)), endPoint('to', t('f.arrival'), s.arr, s.to, s.toZone, s.dayShift));
    const notes = el('ul', 'notes');
    notes.append(el('li', '', shiftText(s.zoneShiftMin)));
    if (s.dstDuring) notes.append(el('li', 'warn', t('seg.dst')));
    if (s.ambiguous) notes.append(el('li', 'warn', t('seg.ambiguous')));
    li.append(head, ends, notes);
    li.dataset.id = s.id;
    return li;
  }
  function connCard(c, tr) {
    const li = el('li', 'conn ' + c.status);
    let main;
    if (c.status === 'overlap') main = t('conn.overlap', { place: c.place, d: dur(-c.minutes) });
    else if (c.status === 'short') main = t('conn.short', { place: c.place, d: dur(c.minutes), min: dur(tr.minConnection) });
    else main = t('conn.ok', { place: c.place, d: dur(c.minutes) });
    li.append(el('b', '', main));
    const notes = el('ul', 'notes');
    if (c.placeChange) { const next = active().segments.find((s) => s.id === c.before); notes.append(el('li', 'warn', t('conn.placeChange', { a: c.place, b: next ? next.from : '' }))); }
    if (c.overnight) notes.append(el('li', '', t('conn.overnight')));
    if (c.dstDuring) notes.append(el('li', 'warn', t('conn.dst')));
    if (notes.children.length) li.append(notes);
    return li;
  }
  function renderResult() {
    const tr = active(), box = $('timeline'), v = $('verdict');
    const r = tr ? C.analyze(tr) : null;
    const has = !!(r && r.segments.length);
    $('res-empty').hidden = has; v.hidden = true; $('export-ics').disabled = !has;
    for (const k of ['k-journey', 'k-air', 'k-ground', 'k-arrival']) $(k).textContent = '—';
    if (!has) { box.replaceChildren(); return; }
    const T = r.totals, last = r.segments[r.segments.length - 1];
    $('k-journey').textContent = dur(T.journeyMin);
    $('k-air').textContent = dur(T.airMin);
    $('k-ground').textContent = T.count > 1 ? dur(T.groundMin) : t('kpi.direct');
    $('k-arrival').textContent = last.arr.time + (T.dayShift ? ' ' + dayLabel(T.dayShift) : '');
    const items = [];
    r.segments.forEach((s, i) => { if (i) items.push(connCard(r.connections[i - 1], tr)); items.push(segCard(s, tr)); });
    box.replaceChildren(...items);
    if (T.count > 1) {
      v.hidden = false;
      const problems = T.short + T.overlap;
      if (problems) { v.className = 'verdict bad'; v.textContent = t('verdict.problems', { n: problems }); }
      else if (tr.minConnection === null) { v.className = 'verdict warn'; v.textContent = t('verdict.noThreshold'); }
      else { v.className = 'verdict'; v.textContent = t('verdict.ok', { min: dur(tr.minConnection) }); }
    }
  }
  // withForms = false : changement de langue, on ne touche pas aux saisies en cours.
  function render(withForms = true) { renderTrips(); if (withForms) renderConnForm(); renderResult(); }

  // --- Saisie et modification d'un vol
  const segForm = $('seg-form');
  function startEdit(s) {
    editingId = s.id;
    for (const k of ['flight', 'from', 'fromZone', 'depart', 'to', 'toZone', 'arrive']) segForm[k].value = s[k];
    $('add-seg').textContent = t('btn.saveSeg'); $('add-seg').dataset.i18n = 'btn.saveSeg'; $('cancel-edit').hidden = false;
    say('seg-status', ''); segForm.flight.focus();
  }
  function stopEdit() {
    editingId = null; $('add-seg').dataset.i18n = 'btn.addSeg'; $('add-seg').textContent = t('btn.addSeg'); $('cancel-edit').hidden = true;
  }
  $('cancel-edit').addEventListener('click', () => { stopEdit(); segForm.reset(); say('seg-status', ''); });
  segForm.addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('seg-status', () => {
      const input = {}; for (const k of ['flight', 'from', 'fromZone', 'depart', 'to', 'toZone', 'arrive']) input[k] = f[k].value;
      const seg = C.makeSegment(input, editingId || newId());
      if (!ensureTrip()) return;
      const name = seg.flight ? t('seg.name', { flight: seg.flight, from: seg.from, to: seg.to }) : t('seg.nameNoFlight', { from: seg.from, to: seg.to });
      if (editingId) {
        if (!active().segments.some((s) => s.id === editingId)) throw new Error('err.id');
        if (!update((x) => ({ ...x, segments: x.segments.map((s) => (s.id === editingId ? seg : s)) }))) return;
        stopEdit(); say('seg-status', t('seg.updated', { name }), 'ok');
      } else {
        if (active().segments.length >= C.MAX.segments) throw tooMany('err.tooManySegments', C.MAX.segments);
        if (!update((x) => ({ ...x, segments: [...x.segments, seg] }))) return;
        say('seg-status', t('seg.added', { name, d: dur(C.analyzeSegment(seg).durationMin) }), 'ok');
      }
      // Le vol suivant part souvent de l'aéroport d'arrivée : on prépare le formulaire.
      f.reset(); f.from.value = seg.to; f.fromZone.value = seg.toZone; f.flight.focus();
      render(false);
    });
  });
  $('conn-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('conn-status', () => {
      const min = C.parseConnection(f.min.value);
      if (!ensureTrip()) return;
      if (update((x) => ({ ...x, minConnection: min }))) { say('conn-status', min === null ? t('conn.cleared') : t('conn.saved', { d: dur(min) }), 'ok'); render(); }
    });
  });

  // Exemple généré dans la langue affichée : Paris -> Dubaï de nuit (J+1), correspondance courte vers Singapour.
  $('sample').addEventListener('click', () => guard('trip-status', () => {
    if (trips.length >= C.MAX.trips) throw tooMany('err.tooManyTrips', C.MAX.trips);
    const d = new Date(Date.now() + 21 * 86400000), day = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const tr = C.makeTrip(t('sample.trip'), newId(), 60);
    tr.segments = [
      C.makeSegment({ flight: 'XY 101', from: t('sample.paris'), fromZone: 'Europe/Paris', depart: `${day(0)}T21:30`, to: t('sample.dubai'), toZone: 'Asia/Dubai', arrive: `${day(1)}T06:35` }, newId()),
      C.makeSegment({ flight: 'XY 202', from: t('sample.dubai'), fromZone: 'Asia/Dubai', depart: `${day(1)}T07:20`, to: t('sample.singapore'), toZone: 'Asia/Singapore', arrive: `${day(1)}T18:40` }, newId()),
    ];
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
    guard('trip-status', () => { const fixed = C.makeTrip(name, cur.id); if (update((x) => ({ ...x, name: fixed.name }))) render(); });
  });
  $('delete-trip').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.segments.length }))) return;
    if (save(trips.filter((x) => x.id !== cur.id))) { activeId = trips[0] ? trips[0].id : null; stopEdit(); render(); }
  });

  // --- Exports
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => guard('res-status', () => {
    const tr = active(); if (!tr) return;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = C.toICS(tr, stamp, {
      summary: (s) => (s.flight ? t('seg.name', { flight: s.flight, from: s.from, to: s.to }) : t('seg.nameNoFlight', { from: s.from, to: s.to })),
      describe: (s) => t('ics.describe', { dep: `${when(s.dep)} ${s.dep.time}`, fromZone: s.fromZone, arr: `${when(s.arr)} ${s.arr.time}`, toZone: s.toZone, d: dur(s.durationMin) }),
    });
    download('flighttimemath.ics', ics, 'text/calendar;charset=utf-8');
    say('res-status', t('ics.done'), 'ok');
  }));
  $('export').addEventListener('click', () => guard('backup-status', () => { download('flighttimemath-backup.json', C.backup(trips), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
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
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('flighttimemath-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  const zones = $('zones'); // suggestions de fuseaux connus du navigateur
  try { const list = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; zones.replaceChildren(...list.map((z) => { const o = el('option'); o.value = z; return o; })); } catch (_) { /* saisie libre */ }
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
