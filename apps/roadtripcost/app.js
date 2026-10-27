/* RoadTripCost — interface. Calculs dans core.js (RoadCore) ; textes, montants et nombres dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.RoadCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-roadtripcost-v1';
  const ACTIVE = 'louvre-roadtripcost-active';
  const UNIT_KEY = 'louvre-roadtripcost-unit'; // unité d'affichage des distances (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = String(txt); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const STATUSES = ['trip-status', 'car-status', 'people-status', 'stage-status', 'res-status', 'backup-status'];
  const CAT_KEYS = { fuelCents: 'cat.fuel', tollsCents: 'cat.tolls', lodgingCents: 'cat.lodging', mealsCents: 'cat.meals', otherCents: 'cat.other' };

  let trips = [], activeId = null, readOnly = false, editingId = null;
  let unit = 'km';
  try { if (localStorage.getItem(UNIT_KEY) === 'mi') unit = 'mi'; } catch (_) { /* confort */ }

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

  // --- Formats
  const dist = (m) => `${L.number(m / C.DIST[unit], { maximumFractionDigits: 1 })} ${unit}`;
  const litres = (ml) => t('unit.litres', { v: L.number(ml / 1000, { maximumFractionDigits: 1 }) });
  const perUnit = (cents) => `${L.money(cents)}/${unit}`;
  const plain = (cents) => (cents ? String(cents / 100) : ''); // valeur remise dans un champ

  // --- Affichage
  function renderTrips() {
    const sel = $('trip-select');
    sel.replaceChildren(...trips.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    if (!trips.length) { const o = el('option', '', t('trip.none')); o.value = ''; sel.append(o); }
    if (activeId) sel.value = activeId;
    $('rename-trip').disabled = $('delete-trip').disabled = !active();
    $('display-unit').value = unit;
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
  }
  function renderCar() { // remplit le formulaire voiture depuis le voyage (unités de base)
    const f = $('car-form'), tr = active();
    f.consUnit.value = 'l100'; f.priceUnit.value = 'l';
    f.consumption.value = tr && tr.consMl ? String(tr.consMl / 1000) : '';
    f.price.value = tr && tr.priceMillis ? String(tr.priceMillis / 1000) : '';
  }
  function renderPeople() {
    const tr = active(), list = $('people-list'), people = tr ? tr.passengers : [];
    list.replaceChildren(...people.map((p) => {
      const li = el('li'), x = el('button', '', '✕'); x.type = 'button'; x.title = t('btn.remove'); x.setAttribute('aria-label', t('aria.removePerson', { name: p.name }));
      x.addEventListener('click', () => {
        if (!confirm(t('confirm.person', { name: p.name }))) return;
        // Retirer un passager : il quitte les étapes ; une étape qui n'a plus personne redevient « tous ».
        if (update((tt) => ({ ...tt, passengers: tt.passengers.filter((k) => k.id !== p.id), stages: tt.stages.map((s) => { if (s.riders === null) return s; const r = s.riders.filter((k) => k !== p.id); return { ...s, riders: r.length ? r : null }; }) }))) render(false);
      });
      li.append(el('span', '', p.name), x); return li;
    }));
  }
  function renderRiders(checked) { // cases « partagée entre » ; garde les cases cochées en cours
    const tr = active(), box = $('riders'), people = tr ? tr.passengers : [];
    const was = checked || new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
    const known = new Set([...box.querySelectorAll('input')].map((i) => i.value));
    box.replaceChildren(...people.map((p) => {
      const lab = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.name = 'rider'; cb.value = p.id;
      cb.checked = known.has(p.id) ? was.has(p.id) : true; // un nouveau passager est coché par défaut
      lab.append(cb, el('span', '', p.name)); return lab;
    }));
    $('riders-empty').hidden = people.length > 0;
  }
  function renderResult() {
    const tr = active(), s = tr ? C.summary(tr) : null;
    $('not-ready').hidden = !tr || !tr.stages.length || s.ready;
    const has = !!(s && tr.stages.length);
    $('stages-empty').hidden = has; $('export-csv').disabled = !has; $('print').disabled = !has;
    $('k-total').textContent = has ? L.money(s.totalCents) : '—';
    $('k-distance').textContent = has ? dist(s.distanceM) : '—';
    $('k-fuel').textContent = has ? `${L.money(s.byCat.fuelCents)} · ${litres(s.fuelMl)}` : '—';
    $('k-perkm').textContent = has ? perUnit(Math.round(s.totalCents * C.DIST[unit] / s.distanceM)) : '—';
    const names = new Map((tr ? tr.passengers : []).map((p) => [p.id, p.name]));
    $('stage-list').replaceChildren(...(has ? s.stages : []).map((c, i) => {
      const st = tr.stages[i], li = el('li', 'stage'), head = el('div', 'stage-head');
      head.append(el('b', '', `${i + 1}. ${st.name}`), el('span', 'stage-total', L.money(c.totalCents)));
      const parts = [dist(c.distanceM), t('stage.fuel', { fuel: L.money(c.fuelCents), litres: litres(c.fuelMl) })];
      for (const k of C.COSTS) if (st[k]) parts.push(`${t(CAT_KEYS[k])} ${L.money(st[k])}`);
      li.append(head, el('p', 'stage-meta', parts.join(' · ')));
      if (st.priceMillis !== null) li.append(el('p', 'stage-meta', t('stage.ownPrice', { price: L.money(st.priceMillis / 10, { maximumFractionDigits: 3, minimumFractionDigits: 3 }) })));
      let who;
      if (!c.riders.length) who = t('stage.noRider');
      else if (st.riders === null) who = t('stage.everyone', { n: c.riders.length, share: L.money(Math.floor(c.totalCents / c.riders.length)) });
      else who = t('stage.some', { names: c.riders.map((r) => names.get(r)).join(', '), share: L.money(Math.floor(c.totalCents / c.riders.length)) });
      li.append(el('p', 'stage-meta', who));
      const acts = el('div', 'stage-acts');
      const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: st.name }));
      edit.addEventListener('click', () => startEdit(st));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.remove', { name: st.name }));
      del.addEventListener('click', () => { if (editingId === st.id) stopEdit(); if (update((x) => ({ ...x, stages: x.stages.filter((k) => k.id !== st.id) }))) { render(false); say('res-status', t('stage.removed', { name: st.name }), 'ok'); } });
      acts.append(edit, del); li.append(acts);
      return li;
    }));
    const body = $('people-table').querySelector('tbody');
    body.replaceChildren(...(s ? [...s.people].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, L.locale)) : []).map((p) => {
      const tr2 = el('tr'); tr2.append(el('td', '', p.name), el('td', 'num', L.number(p.stages)), el('td', 'num', L.money(p.cents))); return tr2;
    }));
    if (s && !s.people.length) { const r = el('tr'), td = el('td', 'empty', t('people.none')); td.colSpan = 3; r.append(td); body.append(r); }
    $('unshared').hidden = !(s && s.unshared && s.people.length);
    if (s && s.unshared) $('unshared').textContent = t('res.unshared', { amount: L.money(s.unshared) });
    const cats = $('by-cat');
    cats.replaceChildren(...(has ? Object.keys(CAT_KEYS).filter((k) => s.byCat[k]) : []).map((k) => {
      const li = el('li'), bar = el('div', 'bar'), fill = el('i');
      fill.style.width = Math.max(2, Math.round(100 * s.byCat[k] / s.totalCents)) + '%'; bar.append(fill);
      li.append(el('span', '', `${t(CAT_KEYS[k])} · ${L.number(s.byCat[k] / s.totalCents, { style: 'percent', maximumFractionDigits: 1 })}`), el('b', '', L.money(s.byCat[k])), bar); return li;
    }));
  }
  // withForms = false : on ne touche pas aux saisies en cours (changement de langue, ajout d'un passager…).
  function render(withForms = true) { renderTrips(); if (withForms) renderCar(); renderPeople(); renderRiders(); renderResult(); }

  // --- Formulaires
  $('car-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('car-status', () => {
      const v = C.makeVehicle({ consumption: f.consumption.value, consUnit: f.consUnit.value, price: f.price.value, priceUnit: f.priceUnit.value });
      if (!ensureTrip()) return;
      if (update((x) => ({ ...x, ...v }))) {
        say('car-status', t('car.saved', { cons: L.number(v.consMl / 1000, { maximumFractionDigits: 2 }), price: L.money(v.priceMillis / 10, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }), 'ok');
        render();
      }
    });
  });
  $('people-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('people-status', () => {
      const p = C.makePassenger(f.name.value, newId());
      if (!ensureTrip()) return;
      if (active().passengers.length >= C.MAX.passengers) throw tooMany('err.tooManyPassengers', C.MAX.passengers);
      if (active().passengers.some((x) => x.name.toLocaleLowerCase(L.locale) === p.name.toLocaleLowerCase(L.locale))) throw new Error('err.duplicatePerson');
      if (update((x) => ({ ...x, passengers: [...x.passengers, p] }))) { say('people-status', t('people.added', { name: p.name }), 'ok'); f.name.value = ''; f.name.focus(); render(false); }
    });
  });
  const stageForm = $('stage-form');
  const FIELDS = ['name', 'distance', 'price', 'tolls', 'lodging', 'meals', 'other'];
  function startEdit(st) {
    editingId = st.id;
    const f = stageForm;
    f.name.value = st.name; f.distUnit.value = unit; f.distance.value = String(Math.round(st.distanceM / C.DIST[unit] * 10) / 10);
    f.priceUnit.value = 'l'; f.price.value = st.priceMillis === null ? '' : String(st.priceMillis / 1000);
    f.tolls.value = plain(st.tollsCents); f.lodging.value = plain(st.lodgingCents); f.meals.value = plain(st.mealsCents); f.other.value = plain(st.otherCents);
    const tr = active();
    renderRiders(new Set(st.riders === null ? tr.passengers.map((p) => p.id) : st.riders));
    $('add-stage').dataset.i18n = 'btn.saveStage'; $('add-stage').textContent = t('btn.saveStage'); $('cancel-edit').hidden = false;
    say('stage-status', ''); f.name.focus();
  }
  function stopEdit() { editingId = null; $('add-stage').dataset.i18n = 'btn.addStage'; $('add-stage').textContent = t('btn.addStage'); $('cancel-edit').hidden = true; }
  function clearStage() { for (const k of FIELDS) stageForm[k].value = ''; stageForm.querySelectorAll('[name=rider]').forEach((c) => { c.checked = true; }); }
  $('cancel-edit').addEventListener('click', () => { stopEdit(); clearStage(); say('stage-status', ''); });
  stageForm.addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('stage-status', () => {
      if (!ensureTrip()) return;
      const tr = active();
      const input = { distUnit: f.distUnit.value, priceUnit: f.priceUnit.value };
      for (const k of FIELDS) input[k] = f[k].value;
      if (tr.passengers.length) input.riders = [...f.querySelectorAll('[name=rider]:checked')].map((c) => c.value);
      const st = C.makeStage(input, editingId || newId(), tr.passengers);
      if (editingId) {
        if (!tr.stages.some((s) => s.id === editingId)) throw new Error('err.id');
        if (!update((x) => ({ ...x, stages: x.stages.map((s) => (s.id === editingId ? st : s)) }))) return;
        stopEdit(); say('stage-status', t('stage.updated', { name: st.name }), 'ok');
      } else {
        if (tr.stages.length >= C.MAX.stages) throw tooMany('err.tooManyStages', C.MAX.stages);
        if (!update((x) => ({ ...x, stages: [...x.stages, st] }))) return;
        say('stage-status', t('stage.added', { name: st.name, total: L.money(C.stageCost(active(), st).totalCents) }), 'ok');
      }
      clearStage(); f.name.focus(); render(false);
    });
  });
  $('display-unit').addEventListener('change', (e) => { unit = e.target.value === 'mi' ? 'mi' : 'km'; try { localStorage.setItem(UNIT_KEY, unit); } catch (_) { /* confort */ } render(false); });

  // Exemple généré dans la langue affichée : trois passagers, trois étapes, une nuit à deux.
  $('sample').addEventListener('click', () => guard('trip-status', () => {
    if (trips.length >= C.MAX.trips) throw tooMany('err.tooManyTrips', C.MAX.trips);
    const tr = { ...C.makeTrip(t('sample.trip'), newId()), ...C.makeVehicle({ consumption: '6.5', consUnit: 'l100', price: '1.859', priceUnit: 'l' }) };
    tr.passengers = [C.makePassenger(t('sample.p1'), newId()), C.makePassenger(t('sample.p2'), newId()), C.makePassenger(t('sample.p3'), newId())];
    const [a, b] = tr.passengers;
    tr.stages = [
      C.makeStage({ name: t('sample.s1'), distance: '245', distUnit: 'km', tolls: '21.30', meals: '48' }, newId(), tr.passengers),
      C.makeStage({ name: t('sample.s2'), distance: '380', distUnit: 'km', tolls: '32.10', lodging: '96', meals: '61.50' }, newId(), tr.passengers),
      C.makeStage({ name: t('sample.s3'), distance: '120', distUnit: 'km', price: '1.799', priceUnit: 'l', other: '12', riders: [a.id, b.id] }, newId(), tr.passengers),
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
    guard('trip-status', () => { const fixed = C.makeTrip(name, cur.id); if (update((x) => ({ ...x, name: fixed.name }))) render(false); });
  });
  $('delete-trip').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.stages.length }))) return;
    if (save(trips.filter((x) => x.id !== cur.id))) { activeId = trips[0] ? trips[0].id : null; stopEdit(); render(); }
  });

  // --- Exports
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const num = (cents) => L.number(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  $('export-csv').addEventListener('click', () => guard('res-status', () => {
    const tr = active(); if (!tr) return;
    const s = C.summary(tr), cur = L.currency, names = new Map(tr.passengers.map((p) => [p.id, p.name]));
    const km = (m) => L.number(m / 1000, { maximumFractionDigits: 1, useGrouping: false });
    const rows = [[t('csv.stage'), t('csv.distance'), t('csv.litres'), t('csv.money', { what: t('cat.fuel'), cur }), t('csv.money', { what: t('cat.tolls'), cur }), t('csv.money', { what: t('cat.lodging'), cur }),
      t('csv.money', { what: t('cat.meals'), cur }), t('csv.money', { what: t('cat.other'), cur }), t('csv.money', { what: t('csv.total'), cur }), t('csv.riders')]];
    s.stages.forEach((c, i) => {
      const st = tr.stages[i];
      rows.push([st.name, km(c.distanceM), L.number(c.fuelMl / 1000, { maximumFractionDigits: 2, useGrouping: false }), num(c.fuelCents), num(st.tollsCents), num(st.lodgingCents), num(st.mealsCents), num(st.otherCents), num(c.totalCents), c.riders.map((r) => names.get(r)).join(', ')]);
    });
    rows.push([t('csv.total'), km(s.distanceM), L.number(s.fuelMl / 1000, { maximumFractionDigits: 2, useGrouping: false }), num(s.byCat.fuelCents), num(s.byCat.tollsCents), num(s.byCat.lodgingCents), num(s.byCat.mealsCents), num(s.byCat.otherCents), num(s.totalCents), '']);
    rows.push([]);
    rows.push([t('th.person'), t('th.stages'), t('csv.money', { what: t('th.share'), cur })]);
    for (const p of s.people) rows.push([p.name, String(p.stages), num(p.cents)]);
    download('roadtripcost.csv', C.toCsv(rows), 'text/csv;charset=utf-8');
    say('res-status', t('csv.done'), 'ok');
  }));
  $('print').addEventListener('click', () => window.print());
  $('export').addEventListener('click', () => guard('backup-status', () => { download('roadtripcost-backup.json', C.backup(trips), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
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
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('roadtripcost-raw-storage.txt', raw, 'text/plain'); });

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
