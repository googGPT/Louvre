/* SeatArrange — interface. Placement et contrôles dans core.js (SeatCore) ; textes dans LouvreI18n (appli sans argent).
   Ajustement manuel au clavier ou au toucher : choisir un invité, puis une place. */
(() => {
  'use strict';
  const C = window.SeatCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-seatarrange-v1';
  const ACTIVE = 'louvre-seatarrange-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let events = [], activeId = null, readOnly = false;
  let picked = null; // invité choisi pour un déplacement manuel

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return events.find((e) => e.id === activeId) || null; }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function save(next, statusId = 'backup-status') {
    if (readOnly) { say(statusId, t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); events = next; return true; }
    catch (e) { say(statusId, t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  // Applique une modification à l'événement affiché et l'enregistre.
  function update(fn, statusId) {
    const cur = active(); if (!cur) return false;
    try { const next = fn(cur); return save(events.map((e) => (e.id === cur.id ? next : e)), statusId); }
    catch (e) { say(statusId, errText(e), 'error'); return false; }
  }
  const guestName = (ev, gid) => { const g = ev.guests.find((x) => x.id === gid); return g ? g.name : '?'; };
  const zoneName = (ev, zid) => { const z = ev.zones.find((x) => x.id === zid); return z ? z.name : '?'; };
  const sortByName = (list) => list.slice().sort((a, b) => a.name.localeCompare(b.name, L.locale));

  // --- Événements (listes séparées : mariage, conférence…)
  function renderEvents() {
    const sel = $('event-select');
    sel.replaceChildren(...events.map((e) => { const o = el('option', '', e.name); o.value = e.id; return o; }));
    if (activeId) sel.value = activeId;
    sel.hidden = !events.length;
    $('rename-event').disabled = $('delete-event').disabled = !active() || readOnly;
    $('new-event').disabled = $('sample').disabled = readOnly;
    for (const id of ['guest-form', 'zone-form', 'cons-form']) for (const n of $(id).elements) n.disabled = readOnly;
    for (const id of ['auto', 'clear-plan', 'export-csv', 'print']) $(id).disabled = !active() || (readOnly && id !== 'print' && id !== 'export-csv');
  }
  function ensureEvent() {
    if (active()) return true;
    const ev = C.makeEvent(t('event.defaultName'), newId());
    if (!save([...events, ev], 'event-status')) return false;
    activeId = ev.id; return true;
  }

  // --- Invités
  function renderGuests() {
    const ev = active(), ul = $('guests');
    $('guest-count').textContent = ev ? L.number(ev.guests.length) : '0';
    if (!ev || !ev.guests.length) { ul.replaceChildren(el('li', 'none', t('guests.none'))); return; }
    ul.replaceChildren(...ev.guests.map((g) => {
      const li = el('li', 'chip'); li.append(el('span', '', g.name));
      if (g.group) li.append(el('small', '', g.group));
      const del = el('button', 'x', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeGuest', { name: g.name }));
      del.disabled = readOnly;
      del.addEventListener('click', () => { if (update((e) => C.removeGuest(e, g.id), 'guest-status')) { if (picked === g.id) picked = null; renderAll(); say('guest-status', t('guests.removed', { name: g.name }), 'ok'); } });
      li.append(del); return li;
    }));
  }
  $('guest-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const list = C.parseGuestList($('f-guests').value);
    if (!list.length) { say('guest-status', t('err.guestName'), 'error'); return; }
    if (!ensureEvent()) return;
    if (update((ev) => C.addGuests(ev, list, newId), 'guest-status')) { $('f-guests').value = ''; renderAll(); say('guest-status', t('guests.added', { n: list.length }), 'ok'); }
  });

  // --- Tables et rangées
  function renderZones() {
    const ev = active(), ul = $('zones');
    $('seat-count').textContent = ev ? t('zones.seats', { n: C.capacityOf(ev), count: L.number(C.capacityOf(ev)) }) : '';
    if (!ev || !ev.zones.length) { ul.replaceChildren(el('li', 'none', t('zones.none'))); return; }
    ul.replaceChildren(...ev.zones.map((z) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', z.name), el('span', '', `${t('kind.' + z.kind)} · ${t('zones.capacity', { n: z.capacity, count: L.number(z.capacity) })}`));
      const del = el('button', 'btn small danger', t('btn.delete')); del.type = 'button'; del.disabled = readOnly; del.setAttribute('aria-label', t('aria.removeZone', { name: z.name }));
      del.addEventListener('click', () => { if (!confirm(t('confirm.deleteZone', { name: z.name }))) return; if (update((e) => C.removeZone(e, z.id), 'zone-status')) renderAll(); });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  $('f-kind').addEventListener('change', suggestZoneName);
  function suggestZoneName() {
    const ev = active(), n = ev ? ev.zones.filter((z) => z.kind === $('f-kind').value).length + 1 : 1;
    $('f-zone-name').placeholder = t($('f-kind').value === 'table' ? 'zones.tableN' : 'zones.rowN', { n });
  }
  $('zone-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ensureEvent()) return;
    const kind = $('f-kind').value;
    const name = $('f-zone-name').value.trim() || $('f-zone-name').placeholder;
    if (update((ev) => C.addZone(ev, C.makeZone({ name, kind, capacity: $('f-capacity').value }, newId())), 'zone-status')) {
      $('f-zone-name').value = ''; renderAll(); say('zone-status', t('zones.added', { name }), 'ok');
    }
  });

  // --- Contraintes
  function describe(ev, c) {
    if (c.type === 'together') return t('cons.together', { a: guestName(ev, c.a), b: guestName(ev, c.b) });
    if (c.type === 'apart') return t('cons.apart', { a: guestName(ev, c.a), b: guestName(ev, c.b) });
    return c.seat ? t('cons.fixedSeat', { a: guestName(ev, c.a), zone: zoneName(ev, c.zone), seat: c.seat }) : t('cons.fixed', { a: guestName(ev, c.a), zone: zoneName(ev, c.zone) });
  }
  function fillSelect(sel, items, keep) {
    const prev = keep ? sel.value : '';
    sel.replaceChildren(...items.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    if (prev && items.some((x) => x.id === prev)) sel.value = prev;
  }
  function renderConsForm() {
    const ev = active(), guests = ev ? sortByName(ev.guests) : [], zones = ev ? ev.zones : [];
    fillSelect($('f-a'), guests, true); fillSelect($('f-b'), guests, true); fillSelect($('f-zone'), zones, true);
    const fixed = $('f-ctype').value === 'fixed';
    $('field-b').hidden = fixed; $('field-zone').hidden = $('field-seat').hidden = !fixed;
  }
  function renderConstraints() {
    const ev = active(), ul = $('constraints');
    if (!ev || !ev.constraints.length) { ul.replaceChildren(el('li', 'none', t('cons.none'))); return; }
    const issues = new Set(C.check(ev).issues.map((i) => i.id));
    const placed = Object.keys(ev.seating).length > 0;
    ul.replaceChildren(...ev.constraints.map((c) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', describe(ev, c)));
      if (placed) { const tag = el('span', issues.has(c.id) ? 'tag bad' : 'tag good', issues.has(c.id) ? t('cons.unmet') : t('cons.met')); txt.append(tag); }
      const del = el('button', 'btn small danger', t('btn.delete')); del.type = 'button'; del.disabled = readOnly; del.setAttribute('aria-label', t('aria.removeCons', { rule: describe(ev, c) }));
      del.addEventListener('click', () => { if (update((e) => C.removeConstraint(e, c.id), 'cons-status')) renderAll(); });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  $('f-ctype').addEventListener('change', renderConsForm);
  $('cons-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = { type: $('f-ctype').value, a: $('f-a').value, b: $('f-b').value, zone: $('f-zone').value, seat: $('f-seat').value };
    if (update((ev) => C.addConstraint(ev, C.makeConstraint(input, newId(), ev)), 'cons-status')) { $('f-seat').value = ''; renderAll(); say('cons-status', t('cons.added'), 'ok'); }
  });

  // --- Plan
  function issueText(ev, i) {
    const a = guestName(ev, i.a), b = i.b ? guestName(ev, i.b) : '';
    if (i.reason === 'unplaced') return t('issue.unplaced', { rule: describe(ev, ev.constraints.find((c) => c.id === i.id)) });
    if (i.type === 'together') return t('issue.together', { a, b });
    if (i.type === 'apart') return t('issue.apart', { a, b });
    const c = ev.constraints.find((x) => x.id === i.id);
    return i.reason === 'seat' ? t('issue.seat', { a, zone: zoneName(ev, c.zone), seat: c.seat }) : t('issue.zone', { a, zone: zoneName(ev, c.zone) });
  }
  function seatButton(ev, z, s, gid) {
    const b = el('button', 'seat' + (gid ? ' taken' : '') + (gid && gid === picked ? ' picked' : '')); b.type = 'button';
    b.append(el('span', 'n', L.number(s + 1)), el('span', 'who', gid ? guestName(ev, gid) : t('plan.free')));
    b.dataset.zone = z.id; b.dataset.seat = String(s);
    b.setAttribute('aria-label', gid ? t('aria.seatTaken', { zone: z.name, seat: s + 1, name: guestName(ev, gid) }) : t('aria.seatFree', { zone: z.name, seat: s + 1 }));
    if (gid) b.setAttribute('aria-pressed', String(gid === picked));
    b.disabled = readOnly;
    b.addEventListener('click', () => onSeat(z.id, s, gid));
    return b;
  }
  function renderPlan() {
    const ev = active(), box = $('plan'), rep = $('report'), issuesUl = $('issues');
    $('print-title').textContent = ev ? ev.name : '';
    if (!ev || !ev.zones.length) { box.replaceChildren(el('p', 'empty', t('plan.noZones'))); rep.textContent = ''; issuesUl.replaceChildren(); $('unplaced-box').hidden = true; $('pick-bar').hidden = true; return; }
    const chk = C.check(ev);
    const placedAny = chk.placed > 0;
    rep.className = 'verdict top-gap' + (!placedAny ? ' neutral' : chk.ok ? '' : ' warn');
    rep.textContent = !placedAny ? t('plan.empty', { guests: chk.guests, seats: chk.seats })
      : `${t('plan.summary', { n: chk.placed, count: L.number(chk.placed), total: L.number(chk.guests), seats: L.number(chk.seats) })} ${chk.ok ? t('plan.allMet') : t('plan.problems', { n: chk.issues.length + (chk.unplaced.length ? 1 : 0), count: L.number(chk.issues.length + (chk.unplaced.length ? 1 : 0)) })}`;
    const lines = placedAny ? chk.issues.map((i) => issueText(ev, i)) : [];
    if (placedAny && chk.unplaced.length) lines.push(t('issue.noSeat', { n: chk.unplaced.length, count: L.number(chk.unplaced.length) }));
    if (chk.shortage) lines.push(t('issue.shortage', { n: chk.shortage, count: L.number(chk.shortage) }));
    issuesUl.replaceChildren(...lines.map((x) => el('li', '', x)));
    // Invités sans place.
    $('unplaced-box').hidden = !chk.unplaced.length || !placedAny;
    $('unplaced').replaceChildren(...chk.unplaced.map((gid) => {
      const b = el('button', 'chip pickable' + (gid === picked ? ' picked' : ''), guestName(ev, gid)); b.type = 'button'; b.disabled = readOnly;
      b.setAttribute('aria-pressed', String(gid === picked));
      b.addEventListener('click', () => pick(gid === picked ? null : gid)); const li = el('li'); li.append(b); return li;
    }));
    // Tables et rangées.
    const at = new Map(Object.entries(ev.seating).map(([g, [z, s]]) => [`${z}#${s}`, g]));
    box.replaceChildren(...ev.zones.map((z) => {
      const card = el('article', 'zone ' + z.kind);
      const used = [...at.keys()].filter((k) => k.startsWith(z.id + '#')).length;
      const head = el('header'); head.append(el('h3', '', z.name), el('span', 'tag', `${t('kind.' + z.kind)} · ${L.number(used)}/${L.number(z.capacity)}`));
      const seats = el('div', 'seats');
      for (let s = 0; s < z.capacity; s++) seats.append(seatButton(ev, z, s, at.get(`${z.id}#${s}`)));
      card.append(head, seats); return card;
    }));
    $('pick-bar').hidden = !picked;
    if (picked) { $('pick-label').textContent = t('plan.picked', { name: guestName(ev, picked) }); $('unseat').disabled = !ev.seating[picked]; }
  }
  function pick(gid) { picked = gid; renderPlan(); if (gid) say('plan-status', t('plan.pickedSay', { name: guestName(active(), gid) })); }
  function onSeat(zid, s, gid) {
    const ev = active();
    if (!picked) { if (gid) pick(gid); return; }
    if (picked === gid) { pick(null); return; }
    const who = picked;
    if (update((e) => C.moveGuest(e, who, zid, s), 'plan-status')) {
      picked = null; renderAll();
      say('plan-status', gid ? t('plan.swapped', { a: guestName(ev, who), b: guestName(ev, gid) }) : t('plan.moved', { name: guestName(ev, who), zone: zoneName(ev, zid), seat: s + 1 }), 'ok');
      const btn = document.querySelector(`.seat[data-zone="${zid}"][data-seat="${s}"]`); if (btn) btn.focus();
    }
  }
  $('unseat').addEventListener('click', () => { const who = picked; if (!who) return; if (update((e) => C.unseat(e, who), 'plan-status')) { picked = null; renderAll(); say('plan-status', t('plan.unseated', { name: guestName(active(), who) }), 'ok'); } });
  $('cancel-pick').addEventListener('click', () => pick(null));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picked) pick(null); });
  $('auto').addEventListener('click', () => {
    const ev = active(); if (!ev) return;
    if (!ev.zones.length) { say('plan-status', t('plan.noZones'), 'error'); return; }
    if (Object.keys(ev.seating).length && !confirm(t('confirm.auto'))) return;
    let exact = true;
    if (update((e) => { const r = C.autoPlace(e); exact = r.exact; const { exact: _x, ...rest } = r; return rest; }, 'plan-status')) {
      picked = null; renderAll();
      const chk = C.check(active());
      say('plan-status', chk.ok ? t('plan.autoOk') : exact ? t('plan.autoPartial') : t('plan.autoBest'), chk.ok ? 'ok' : '');
    }
  });
  $('clear-plan').addEventListener('click', () => { if (!confirm(t('confirm.clear'))) return; if (update((e) => C.clearSeating(e), 'plan-status')) { picked = null; renderAll(); } });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    const ev = active(); if (!ev) return;
    const texts = { headers: [t('csv.zone'), t('csv.kind'), t('csv.seat'), t('csv.guest'), t('csv.group')], kind: { table: t('kind.table'), row: t('kind.row') }, unplaced: t('csv.unplaced') };
    download('seatarrange-plan.csv', C.planCSV(ev, texts), 'text/csv;charset=utf-8');
    say('plan-status', t('csv.done'), 'ok');
  });
  $('print').addEventListener('click', () => window.print());
  $('export').addEventListener('click', () => { try { download('seatarrange-backup.json', C.backup(events), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: events.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      activeId = next[0] ? next[0].id : null; picked = null;
      $('warning').hidden = true; $('export-raw').hidden = true; renderAll();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('seatarrange-raw-storage.txt', raw, 'text/plain'); });

  // --- Gestion des événements
  function selectEvent(id) { activeId = id; picked = null; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort */ } renderAll(); }
  $('event-select').addEventListener('change', (e) => selectEvent(e.target.value));
  $('new-event').addEventListener('click', () => {
    if (events.length >= C.LIMITS.events) { say('event-status', t('err.tooManyEvents', { max: C.LIMITS.events }), 'error'); return; }
    const name = prompt(t('prompt.event'), t('event.newDefault', { n: events.length + 1 })); if (name === null) return;
    try { const ev = C.makeEvent(name, newId()); if (save([...events, ev], 'event-status')) selectEvent(ev.id); } catch (e) { say('event-status', errText(e), 'error'); }
  });
  $('rename-event').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name); if (name === null) return;
    update((e) => ({ ...e, name: C.makeEvent(name, e.id).name }), 'event-status') && renderAll();
  });
  $('delete-event').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.deleteEvent', { name: cur.name }))) return;
    if (save(events.filter((e) => e.id !== cur.id), 'event-status')) selectEvent(events[0] ? events[0].id : null);
  });
  $('sample').addEventListener('click', () => {
    if (events.length >= C.LIMITS.events) { say('event-status', t('err.tooManyEvents', { max: C.LIMITS.events }), 'error'); return; }
    try {
      let ev = C.makeEvent(t('sample.event'), newId());
      const fam = t('sample.family'), fr = t('sample.friends'), col = t('sample.colleagues');
      ev = C.addGuests(ev, [['Amina', fam], ['Youssef', fam], ['Nadia', fam], ['Karim', fam], ['Léa', fr], ['Hugo', fr], ['Sofia', fr], ['Tomás', fr], ['Inès', col], ['Marc', col], ['Zoé', col], ['Paul', col]].map(([name, group]) => ({ name, group })), newId);
      for (let k = 1; k <= 3; k++) ev = C.addZone(ev, C.makeZone({ name: t('zones.tableN', { n: k }), kind: 'table', capacity: k === 3 ? '6' : '4' }, newId()));
      const g = (n) => ev.guests.find((x) => x.name === n).id;
      for (const c of [{ type: 'together', a: g('Amina'), b: g('Youssef') }, { type: 'together', a: g('Léa'), b: g('Hugo') }, { type: 'apart', a: g('Karim'), b: g('Marc') },
        { type: 'apart', a: g('Nadia'), b: g('Sofia') }, { type: 'fixed', a: g('Paul'), zone: ev.zones[0].id, seat: '1' }]) ev = C.addConstraint(ev, C.makeConstraint(c, newId(), ev));
      if (save([...events, ev], 'event-status')) { selectEvent(ev.id); say('event-status', t('sample.added'), 'ok'); }
    } catch (e) { say('event-status', errText(e), 'error'); }
  });

  function renderAll() { renderEvents(); renderGuests(); renderZones(); renderConsForm(); renderConstraints(); renderPlan(); suggestZoneName(); }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) events = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = events.some((e) => e.id === last) ? last : (events[0] ? events[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Changement de langue : les champs en cours de saisie ne sont pas touchés.
  L.onChange(() => { for (const id of ['event-status', 'guest-status', 'zone-status', 'cons-status', 'plan-status', 'backup-status']) say(id, ''); renderAll(); });
  renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
