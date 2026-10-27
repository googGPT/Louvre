/* CommuteCarbon — interface. Calculs dans core.js (CommuteCore) ; textes et formats dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.CommuteCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-commutecarbon-v1'; // clé de stockage local
  const ACTIVE = 'louvre-commutecarbon-active'; // scénario affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let data = C.emptyData();
  let readOnly = false; // stockage illisible : aucune écriture
  let activeId = null, refId = null; // scénario affiché, scénario de référence de la comparaison
  let editFactor = null, editTrip = null; // éléments en cours de modification

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { const text = C.backup(next); localStorage.setItem(KEY, text); data = C.validateBackup(JSON.parse(text)); return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const active = () => data.scenarios.find((s) => s.id === activeId) || null;
  const factor = (id) => data.factors.find((f) => f.id === id);
  function setActive(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort seulement */ } }

  // --- Formats : masses en kg ou en t de CO2e, distances en km ou en miles, dans la langue affichée.
  function mass(mg) {
    const kg = mg / 1e6, abs = Math.abs(kg);
    if (abs >= 1000) return t('fmt.t', { n: L.number(kg / 1000, { maximumFractionDigits: 2 }) });
    return t('fmt.kg', { n: L.number(kg, { maximumFractionDigits: abs < 10 ? 2 : 1 }) });
  }
  const signed = (mg) => (mg > 0 ? '+' : mg < 0 ? '−' : '') + mass(Math.abs(mg));
  const dist = (meters, unit) => `${L.number(meters / C.UNITS[unit], { maximumFractionDigits: unit === 'km' ? 1 : 2 })} ${t('unit.' + unit + 'Short')}`;
  const factorText = (f) => `${t('fmt.factor', { n: L.number(f.mgPerKm / 1000, { maximumFractionDigits: 3 }) })} · ${t('basis.' + f.basis)}`;

  // --- Facteurs
  function resetFactorForm() {
    editFactor = null; $('fa-name').value = ''; $('fa-value').value = ''; $('fa-basis').value = 'vehicle';
    $('save-factor').dataset.i18n = 'btn.addFactor'; $('save-factor').textContent = t('btn.addFactor'); $('cancel-factor').hidden = true;
  }
  function renderFactors() {
    const box = $('factors');
    if (!data.factors.length) { box.replaceChildren(el('li', 'empty', t('factors.empty'))); return; }
    box.replaceChildren(...data.factors.map((f) => {
      const li = el('li'); li.dataset.id = f.id;
      const txt = el('div', 'txt'); txt.append(el('b', '', f.name), el('span', '', factorText(f)));
      const uses = C.factorUses(data, f.id);
      if (uses) txt.append(el('span', '', t('factors.uses', { n: uses })));
      const acts = el('div', 'acts');
      const ed = el('button', 'btn small', t('btn.edit')); ed.type = 'button'; ed.dataset.action = 'edit'; ed.setAttribute('aria-label', t('aria.editFactor', { name: f.name }));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.dataset.action = 'delete'; del.setAttribute('aria-label', t('aria.deleteFactor', { name: f.name }));
      acts.append(ed, del); li.append(txt, acts); return li;
    }));
  }
  $('factors').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const f = factor(b.closest('li').dataset.id); if (!f) return;
    if (b.dataset.action === 'edit') {
      editFactor = f.id; $('fa-name').value = f.name; $('fa-value').value = L.number(f.mgPerKm / 1000, { maximumFractionDigits: 3, useGrouping: false }); $('fa-basis').value = f.basis;
      $('save-factor').dataset.i18n = 'btn.saveFactor'; $('save-factor').textContent = t('btn.saveFactor'); $('cancel-factor').hidden = false;
      say('factor-status', t('factors.editing', { name: f.name })); $('fa-name').focus(); return;
    }
    const uses = C.factorUses(data, f.id);
    if (uses) { say('factor-status', t('err.factorUsed', { name: f.name, n: uses }), 'error'); return; }
    if (!confirm(t('confirm.deleteFactor', { name: f.name }))) return;
    if (save({ ...data, factors: data.factors.filter((x) => x.id !== f.id) })) { if (editFactor === f.id) resetFactorForm(); say('factor-status', t('factors.deleted', { name: f.name })); render(); }
  });
  $('cancel-factor').addEventListener('click', () => { resetFactorForm(); say('factor-status', ''); });
  $('factor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (!editFactor && data.factors.length >= C.LIMITS.factors) throw new Error(`err.factorsMany|${JSON.stringify({ max: C.LIMITS.factors })}`);
      const f = C.makeFactor({ name: $('fa-name').value, gPerKm: $('fa-value').value, basis: $('fa-basis').value }, editFactor || newId());
      if (data.factors.some((x) => x.id !== f.id && x.name.localeCompare(f.name, L.locale, { sensitivity: 'base' }) === 0)) throw new Error('err.duplicate');
      const list = editFactor ? data.factors.map((x) => (x.id === f.id ? f : x)) : [...data.factors, f];
      const wasEdit = !!editFactor;
      if (!save({ ...data, factors: list })) return;
      resetFactorForm(); render(); $('fa-name').focus();
      say('factor-status', t(wasEdit ? 'factors.updated' : 'factors.added', { name: f.name }), 'ok');
    } catch (err) { say('factor-status', L.error(err), 'error'); }
  });

  // --- Scénarios
  function ensureScenario() { // crée un premier scénario si besoin
    if (active()) return true;
    if (data.scenarios.length) { setActive(data.scenarios[0].id); return true; }
    const s = C.makeScenario({ name: t('scenario.default'), weeksPerYear: '52' }, newId());
    if (!save({ ...data, scenarios: [s] })) return false;
    setActive(s.id); return true;
  }
  function updateActive(mutator) { const cur = active(); return save({ ...data, scenarios: data.scenarios.map((s) => (s.id === cur.id ? mutator(s) : s)) }); }
  function renderScenarios() {
    const sel = $('scenario-select');
    sel.replaceChildren(...data.scenarios.map((s) => { const o = el('option', '', `${s.name} (${s.trips.length})`); o.value = s.id; return o; }));
    if (activeId) sel.value = activeId;
    sel.disabled = !data.scenarios.length;
    $('rename-scenario').disabled = $('delete-scenario').disabled = $('dup-scenario').disabled = !active();
    const cur = active();
    if (document.activeElement !== $('weeks')) $('weeks').value = cur ? String(cur.weeksPerYear) : '52';
  }
  $('scenario-select').addEventListener('change', (e) => { setActive(e.target.value); resetTripForm(); say('trip-status', ''); render(); });
  function askName(promptKey, def) {
    const name = prompt(t(promptKey), def);
    return name === null ? null : name;
  }
  $('new-scenario').addEventListener('click', () => {
    if (data.scenarios.length >= C.LIMITS.scenarios) { say('trip-status', t('err.scenariosMany', { max: C.LIMITS.scenarios }), 'error'); return; }
    const name = askName('prompt.new', t('scenario.newDefault', { n: data.scenarios.length + 1 })); if (name === null) return;
    try { const s = C.makeScenario({ name, weeksPerYear: active() ? String(active().weeksPerYear) : '52' }, newId()); if (save({ ...data, scenarios: [...data.scenarios, s] })) { setActive(s.id); resetTripForm(); render(); say('trip-status', t('scenario.created', { name: s.name }), 'ok'); } }
    catch (e) { say('trip-status', L.error(e), 'error'); }
  });
  $('dup-scenario').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    if (data.scenarios.length >= C.LIMITS.scenarios) { say('trip-status', t('err.scenariosMany', { max: C.LIMITS.scenarios }), 'error'); return; }
    const name = askName('prompt.new', t('scenario.copyOf', { name: cur.name }).slice(0, C.LIMITS.name)); if (name === null) return;
    try {
      const s = C.makeScenario({ name, weeksPerYear: String(cur.weeksPerYear), trips: cur.trips.map((tr) => ({ ...tr, id: newId() })) }, newId());
      if (save({ ...data, scenarios: [...data.scenarios, s] })) { setActive(s.id); resetTripForm(); render(); say('trip-status', t('scenario.created', { name: s.name }), 'ok'); }
    } catch (e) { say('trip-status', L.error(e), 'error'); }
  });
  $('rename-scenario').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = askName('prompt.rename', cur.name); if (name === null) return;
    try { const s = C.makeScenario({ ...cur, name }, cur.id); if (updateActive(() => s)) { render(); say('trip-status', t('scenario.renamed', { name: s.name }), 'ok'); } }
    catch (e) { say('trip-status', L.error(e), 'error'); }
  });
  $('delete-scenario').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.deleteScenario', { name: cur.name, n: cur.trips.length }))) return;
    if (save({ ...data, scenarios: data.scenarios.filter((s) => s.id !== cur.id) })) { setActive(data.scenarios[0] ? data.scenarios[0].id : null); resetTripForm(); render(); say('trip-status', t('scenario.deleted', { name: cur.name })); }
  });
  // Semaines par an : enregistrées à chaque saisie valide.
  $('weeks').addEventListener('input', () => {
    try {
      const weeksPerYear = C.parseWeeks($('weeks').value);
      if (!ensureScenario()) return;
      if (updateActive((s) => ({ ...s, weeksPerYear }))) { $('weeks').removeAttribute('aria-invalid'); say('trip-status', t('weeks.saved'), 'ok'); renderTotals(); renderScenarios(); renderCompare(); }
    } catch (e) { $('weeks').setAttribute('aria-invalid', 'true'); say('trip-status', L.error(e), 'error'); }
  });

  // --- Trajets
  function renderModeSelect() {
    const sel = $('trip-form').factor, keep = sel.value;
    sel.replaceChildren(...(data.factors.length ? data.factors.map((f) => { const o = el('option', '', f.name); o.value = f.id; return o; }) : [Object.assign(el('option', '', t('mode.none')), { value: '' })]));
    if (data.factors.some((f) => f.id === keep)) sel.value = keep;
    updatePassengerField();
  }
  function updatePassengerField() {
    const f = factor($('trip-form').factor.value), perPassenger = !!f && f.basis === 'passenger';
    $('trip-form').passengers.disabled = perPassenger; $('passenger-hint').hidden = !perPassenger;
  }
  $('trip-form').factor.addEventListener('change', updatePassengerField);
  function resetTripForm() {
    editTrip = null; const f = $('trip-form');
    f.name.value = ''; f.distance.value = ''; f.passengers.value = '1'; f.days.value = '5'; f.roundTrip.checked = true;
    $('save-trip').dataset.i18n = 'btn.addTrip'; $('save-trip').textContent = t('btn.addTrip');
    $('trip-form-title').dataset.i18n = 'trip.add'; $('trip-form-title').textContent = t('trip.add'); $('cancel-trip').hidden = true; updatePassengerField();
  }
  $('cancel-trip').addEventListener('click', () => { resetTripForm(); say('trip-status', ''); });
  function tripLine(tr, f) {
    const how = tr.roundTrip ? t('trip.roundTrip', { d: dist(tr.distanceM, tr.unit) }) : t('trip.oneWay', { d: dist(tr.distanceM, tr.unit) });
    const who = f.basis === 'vehicle' && tr.passengers > 1 ? ' · ' + t('trip.shared', { n: tr.passengers }) : '';
    return `${how} × ${t('trip.days', { n: tr.daysPerWeek })} · ${f.name}${who}`;
  }
  function renderTrips() {
    const cur = active(), box = $('trips');
    if (!cur || !cur.trips.length) { box.replaceChildren(el('li', 'empty', t(data.factors.length ? 'trips.empty' : 'trips.noFactor'))); return; }
    const tot = C.scenarioTotals(cur, data.factors);
    box.replaceChildren(...tot.trips.map((r) => {
      const li = el('li'); li.dataset.id = r.trip.id;
      const txt = el('div', 'txt'); txt.append(el('b', '', r.trip.name), el('span', '', tripLine(r.trip, r.factor)), el('span', 'em', t('trip.result', { w: mass(r.weekMg), y: mass(r.yearMg) })));
      const acts = el('div', 'acts');
      const ed = el('button', 'btn small', t('btn.edit')); ed.type = 'button'; ed.dataset.action = 'edit'; ed.setAttribute('aria-label', t('aria.editTrip', { name: r.trip.name }));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.dataset.action = 'delete'; del.setAttribute('aria-label', t('aria.deleteTrip', { name: r.trip.name }));
      acts.append(ed, del); li.append(txt, acts); return li;
    }));
  }
  $('trips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const cur = active(), tr = cur && cur.trips.find((x) => x.id === b.closest('li').dataset.id); if (!tr) return;
    if (b.dataset.action === 'edit') {
      const f = $('trip-form'); editTrip = tr.id;
      f.name.value = tr.name; f.distance.value = L.number(C.distanceIn(tr.distanceM, tr.unit), { maximumFractionDigits: 2, useGrouping: false }); f.unit.value = tr.unit;
      f.factor.value = tr.factorId; f.passengers.value = String(tr.passengers); f.days.value = String(tr.daysPerWeek); f.roundTrip.checked = tr.roundTrip;
      $('save-trip').dataset.i18n = 'btn.saveTrip'; $('save-trip').textContent = t('btn.saveTrip');
      $('trip-form-title').dataset.i18n = 'trip.edit'; $('trip-form-title').textContent = t('trip.edit'); $('cancel-trip').hidden = false;
      updatePassengerField(); say('trip-status', t('trips.editing', { name: tr.name })); f.name.focus(); return;
    }
    if (!confirm(t('confirm.deleteTrip', { name: tr.name }))) return;
    if (updateActive((s) => ({ ...s, trips: s.trips.filter((x) => x.id !== tr.id) }))) { if (editTrip === tr.id) resetTripForm(); render(); say('trip-status', t('trips.deleted', { name: tr.name })); }
  });
  $('trip-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      if (!data.factors.length) throw new Error('err.noFactor');
      const input = { name: f.name.value, distance: f.distance.value, unit: f.unit.value, factorId: f.factor.value, passengers: f.passengers.disabled ? '1' : f.passengers.value, roundTrip: f.roundTrip.checked, daysPerWeek: f.days.value };
      if (f.passengers.disabled) { const cur = active(), old = cur && editTrip ? cur.trips.find((x) => x.id === editTrip) : null; input.passengers = old ? String(old.passengers) : '1'; }
      const tr = C.makeTrip(input, editTrip || newId(), data.factors);
      if (!ensureScenario()) return;
      const cur = active();
      if (!editTrip && cur.trips.length >= C.LIMITS.trips) throw new Error(`err.tripsMany|${JSON.stringify({ max: C.LIMITS.trips })}`);
      const wasEdit = !!editTrip;
      if (!updateActive((s) => ({ ...s, trips: wasEdit ? s.trips.map((x) => (x.id === tr.id ? tr : x)) : [...s.trips, tr] }))) return;
      const r = C.tripEmissions(tr, factor(tr.factorId), active().weeksPerYear);
      resetTripForm(); render(); f.name.focus();
      say('trip-status', t(wasEdit ? 'trips.updated' : 'trips.added', { name: tr.name, w: mass(r.weekMg) }), 'ok');
    } catch (err) { say('trip-status', L.error(err), 'error'); }
  });

  // --- Totaux du scénario affiché
  function renderTotals() {
    const cur = active();
    if (!cur) { for (const id of ['k-week', 'k-month', 'k-year', 'k-dist']) $(id).textContent = '—'; return; }
    const tot = C.scenarioTotals(cur, data.factors);
    $('k-week').textContent = mass(tot.weekMg); $('k-month').textContent = mass(tot.monthMg); $('k-year').textContent = mass(tot.yearMg);
    const unit = cur.trips.length && cur.trips.every((x) => x.unit === 'mi') ? 'mi' : 'km';
    $('k-dist').textContent = dist(tot.metersWeek, unit);
  }

  // --- Comparaison
  function renderCompare() {
    const ref = $('ref-select');
    if (!data.scenarios.some((s) => s.id === refId)) refId = data.scenarios[0] ? data.scenarios[0].id : null;
    ref.replaceChildren(...data.scenarios.map((s) => { const o = el('option', '', s.name); o.value = s.id; return o; }));
    ref.disabled = !data.scenarios.length; if (refId) ref.value = refId;
    $('export-csv').disabled = !data.scenarios.length;
    const table = $('compare'), verdict = $('verdict');
    verdict.hidden = true;
    if (!data.scenarios.length) { table.replaceChildren(); table.hidden = true; return; }
    table.hidden = false;
    const cmp = C.compare(data.scenarios, data.factors, refId);
    const head = el('tr');
    for (const [txt, cls] of [[t('th.scenario'), ''], [t('kpi.week'), 'num hide-s'], [t('kpi.month'), 'num hide-s'], [t('kpi.year'), 'num'], ['', 'hide-s'], [t('th.diff'), 'num']]) head.append(el('th', cls, txt));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const r of cmp.rows) {
      const isRef = r.id === cmp.refId, tr = el('tr', isRef ? 'ref' : r.diffYearMg < 0 ? 'lower' : '');
      const name = el('td'); name.append(el('span', '', r.name + ' '));
      if (isRef) name.append(el('span', 'pill', t('pill.ref')));
      const bar = el('td', 'hide-s'), b = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(2, Math.round(100 * r.ratio)) + '%'; b.append(fill); bar.append(b);
      const diff = isRef ? '—' : signed(r.diffYearMg) + (r.diffPct === null ? '' : ` (${r.diffPct > 0 ? '+' : r.diffPct < 0 ? '−' : ''}${L.number(Math.abs(r.diffPct))} %)`);
      tr.append(name, el('td', 'num hide-s', mass(r.weekMg)), el('td', 'num hide-s', mass(r.monthMg)), el('td', 'num strong', mass(r.yearMg)), bar, el('td', 'num', diff));
      tbody.append(tr);
    }
    table.replaceChildren(thead, tbody);
    if (cmp.rows.length > 1) {
      const best = cmp.rows.slice().sort((a, b) => a.yearMg - b.yearMg)[0], refRow = cmp.rows.find((r) => r.id === cmp.refId);
      verdict.hidden = false;
      verdict.textContent = best.id === refRow.id || best.yearMg === refRow.yearMg ? t('verdict.refBest', { name: refRow.name })
        : t('verdict.best', { name: best.name, d: mass(refRow.yearMg - best.yearMg), ref: refRow.name });
    }
  }
  $('ref-select').addEventListener('change', (e) => { refId = e.target.value; renderCompare(); });

  // --- Export CSV (en-têtes traduits ; décimale de la langue affichée)
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      const decimal = (1.5).toLocaleString(L.locale).includes(',') ? ',' : '.';
      const texts = { head: ['scenario', 'trip', 'mode', 'factor', 'basis', 'distance', 'unit', 'roundTrip', 'days', 'passengers', 'weeks', 'week', 'month', 'year'].map((k) => t('csv.' + k)),
        basis: { vehicle: t('basis.vehicle'), passenger: t('basis.passenger') }, yes: t('csv.yes'), no: t('csv.no'), total: t('csv.total'), decimal };
      download('commutecarbon.csv', C.csv(data, texts), 'text/csv;charset=utf-8');
      say('compare-status', t('csv.done'), 'ok');
    } catch (e) { say('compare-status', L.error(e), 'error'); }
  });

  // --- Exemple dans la langue affichée : facteurs d'exemple (arbitraires, à remplacer) et deux scénarios.
  $('sample').addEventListener('click', () => {
    if ((data.factors.length || data.scenarios.length) && !confirm(t('confirm.sample'))) return;
    try {
      const mkF = (key, g, basis) => C.makeFactor({ name: t('sample.example', { name: t(key) }), gPerKm: g, basis }, newId());
      const car = mkF('sample.car', '200', 'vehicle'), ev = mkF('sample.ev', '60', 'vehicle'), bus = mkF('sample.bus', '100', 'passenger'), train = mkF('sample.train', '30', 'passenger'), bike = mkF('sample.bike', '0', 'passenger');
      const factors = [car, ev, bus, train, bike];
      const work = t('sample.work');
      const mkT = (name, f, days, passengers = '1') => C.makeTrip({ name, distance: '18', unit: 'km', factorId: f.id, passengers, roundTrip: true, daysPerWeek: days }, newId(), factors);
      const today = C.makeScenario({ name: t('sample.today'), weeksPerYear: '46', trips: [mkT(work, car, '5')] }, newId());
      const plan = C.makeScenario({ name: t('sample.plan'), weeksPerYear: '46', trips: [mkT(`${work} — ${t('sample.train')}`, train, '3'), mkT(`${work} — ${t('sample.carpool')}`, car, '2', '3')] }, newId());
      if (!save({ factors, scenarios: [today, plan] })) return;
      setActive(today.id); refId = today.id; resetFactorForm(); resetTripForm(); render();
      say('sample-status', t('sample.added'), 'ok');
    } catch (e) { say('sample-status', L.error(e), 'error'); }
  });

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('commutecarbon-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (_) { throw new Error('err.json'); }
      const next = C.validateBackup(parsed);
      if (!confirm(t('backup.confirm', { a: data.scenarios.length, b: next.scenarios.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true;
      setActive(next.scenarios[0] ? next.scenarios[0].id : null); refId = activeId; resetFactorForm(); resetTripForm(); render();
      say('backup-status', t('backup.restored', { n: next.scenarios.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('commutecarbon-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderFactors(); renderModeSelect(); renderScenarios(); renderTrips(); renderTotals(); renderCompare(); }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateBackup(JSON.parse(raw));
    let last = null; try { last = localStorage.getItem(ACTIVE); } catch (_) { /* confort */ }
    activeId = data.scenarios.some((s) => s.id === last) ? last : (data.scenarios[0] ? data.scenarios[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue : tout est réaffiché ; les saisies en cours des formulaires restent en place.
  L.onChange(() => {
    for (const id of ['sample-status', 'factor-status', 'trip-status', 'compare-status', 'backup-status']) say(id, '');
    for (const id of ['save-factor', 'save-trip', 'trip-form-title']) $(id).textContent = t($(id).dataset.i18n);
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
