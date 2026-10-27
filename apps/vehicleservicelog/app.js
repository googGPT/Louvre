/* VehicleServiceLog — interface. Calculs dans core.js (VehicleCore) ; textes, dates, nombres et montants dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.VehicleCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-vehicleservicelog-v1';
  const ACTIVE = 'louvre-vehicleservicelog-active'; // véhicule affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let data = C.emptyData();
  let readOnly = false;
  let activeId = null;
  let editingVeh = false;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { settings: next.settings, vehicles: next.vehicles, schedules: next.schedules, services: next.services, readings: next.readings }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const active = () => data.vehicles.find((v) => v.id === activeId) || null;
  function setActive(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (e) { /* confort seulement */ } }
  const vehName = (id) => { const v = data.vehicles.find((x) => x.id === id); return v ? v.name : '?'; };
  const schName = (id) => { const s = data.schedules.find((x) => x.id === id); return s ? s.name : '?'; };
  const sortedVehicles = () => [...data.vehicles].sort((a, b) => a.name.localeCompare(b.name, L.locale));
  const km = (n) => t('fmt.km', { n: L.number(n) });
  const shortDate = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const decimal = () => (L.number(1.5).includes(',') ? 'comma' : 'dot');

  // ---------- Véhicules
  function renderVehicles() {
    const tabs = $('veh-tabs');
    if (!data.vehicles.length) tabs.replaceChildren(el('p', 'empty', t('veh.empty')));
    else tabs.replaceChildren(...sortedVehicles().map((v) => {
      const b = el('button', 'tab', v.note ? `${v.name} · ${v.note}` : v.name); b.type = 'button'; b.setAttribute('aria-pressed', String(v.id === activeId));
      b.addEventListener('click', () => { setActive(v.id); if (editingVeh) resetVehForm(); render(); });
      return b;
    }));
    $('veh-area').hidden = !active();
    $('edit-veh').disabled = $('delete-veh').disabled = !active();
    for (const id of ['who-odo', 'who-due', 'who-srv']) $(id).textContent = active() ? `— ${active().name}` : '';
  }
  function resetVehForm() { editingVeh = false; $('veh-form').reset(); $('save-veh').textContent = t('btn.addVeh'); $('cancel-veh').hidden = true; }
  $('veh-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const veh = C.makeVehicle({ name: f.name.value, note: f.note.value }, editingVeh ? activeId : newId());
      if (data.vehicles.some((v) => v.id !== veh.id && v.name.toLocaleLowerCase(L.locale) === veh.name.toLocaleLowerCase(L.locale))) throw new Error('err.vehicleExists');
      if (!save(C.upsert(data, 'vehicles', veh))) return;
      say('veh-status', t(editingVeh ? 'veh.updated' : 'veh.added', { name: veh.name }), 'ok');
      setActive(veh.id); resetVehForm(); render();
    } catch (e) { say('veh-status', L.error(e), 'error'); }
  });
  $('edit-veh').addEventListener('click', () => {
    const v = active(); if (!v) return;
    const f = $('veh-form'); f.name.value = v.name; f.note.value = v.note;
    editingVeh = true; $('save-veh').textContent = t('btn.updateVeh'); $('cancel-veh').hidden = false; f.name.focus();
  });
  $('cancel-veh').addEventListener('click', () => { resetVehForm(); say('veh-status', ''); });
  $('delete-veh').addEventListener('click', () => {
    const v = active(); if (!v) return;
    const n = ['schedules', 'services', 'readings'].reduce((a, k) => a + data[k].filter((x) => x.vehicleId === v.id).length, 0);
    if (!confirm(t('veh.confirmDelete', { name: v.name, n }))) return;
    if (!save(C.removeVehicle(data, v.id))) return;
    resetVehForm(); setActive(sortedVehicles()[0] ? sortedVehicles()[0].id : null); render();
    say('veh-status', t('veh.deleted', { name: v.name }), 'ok');
  });

  // ---------- Compteur
  function renderOdometer() {
    const v = active(); if (!v) return;
    const today = todayDay(), est = C.estimateKm(C.odometerPoints(data, v.id), today), cost = C.costSummary(data, v.id);
    const kpi = (label, value) => { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    $('kpis').replaceChildren(
      kpi(t('kpi.today'), est ? km(est.km) : '—'),
      kpi(t('kpi.pace'), est && est.pace ? t('fmt.perYear', { km: km(est.pace.perYear) }) : '—'),
      kpi(t('kpi.spent', { n: cost.count }), L.money(cost.total)),
      kpi(t('kpi.per100'), cost.per100KmCents === null ? '—' : L.money(cost.per100KmCents)));
    let note;
    if (!est) note = t('odo.none');
    else if (!est.pace) note = t('odo.needMore', { n: C.MIN_SPAN_DAYS });
    else if (est.estimated) note = t('odo.estimated', { km: km(est.lastKm), date: shortDate(est.lastDate), from: shortDate(est.pace.from), to: shortDate(est.pace.to) });
    else note = t('odo.exact', { date: shortDate(est.lastDate) });
    $('pace-note').textContent = note;
  }
  // Un compteur ne recule pas : contrôle avant tout enregistrement.
  function checkOdo(vehicleId, date, kmv) { C.checkOdometer(C.odometerPoints(data, vehicleId), date, kmv); }
  function kmErrorParams(e) { // l'erreur porte une date AAAA-MM-JJ et des km bruts : on les formate dans la langue affichée
    const [key, json] = String(e.message).split('|');
    if ((key === 'err.kmBelow' || key === 'err.kmAbove') && json) { const p = JSON.parse(json); return t(key, { km: km(p.km), date: shortDate(p.date) }); }
    return L.error(e);
  }
  $('read-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget, v = active(); if (!v) return;
    try {
      const r = C.makeReading({ vehicleId: v.id, date: f.date.value, kmText: f.km.value }, newId(), data.vehicles, todayDay());
      checkOdo(v.id, r.date, r.km);
      if (!save(C.upsert(data, 'readings', r))) return;
      f.km.value = ''; render();
      say('read-status', t('read.added', { km: km(r.km), date: shortDate(r.date) }), 'ok');
    } catch (e) { say('read-status', kmErrorParams(e), 'error'); }
  });

  // ---------- Échéances
  function dueText(r) {
    const s = r.schedule;
    let when;
    if (r.dueDate && r.dueKm !== null) when = t('due.both', { date: shortDate(r.dueDate), km: km(r.dueKm) });
    else if (r.dueDate) when = t('due.dateOnly', { date: shortDate(r.dueDate) });
    else when = t('due.kmOnly', { km: km(r.dueKm) });
    const rel = [];
    if (r.remainingDays !== null) rel.push(r.remainingDays < 0 ? t('rel.lateDays', { n: -r.remainingDays }) : r.remainingDays === 0 ? t('rel.today') : t('rel.inDays', { n: r.remainingDays }));
    if (r.remainingKm !== null) rel.push(r.remainingKm < 0 ? t('rel.lateKm', { km: km(-r.remainingKm) }) : t('rel.leftKm', { km: km(r.remainingKm) }));
    let every;
    if (s.everyKm && s.everyMonths) every = t('due.everyBoth', { km: km(s.everyKm), months: t('fmt.months', { n: s.everyMonths }) });
    else if (s.everyKm) every = t('due.everyKm', { km: km(s.everyKm) });
    else every = t('due.everyMonths', { months: t('fmt.months', { n: s.everyMonths }) });
    const proj = r.kmDate && r.dueKm !== null && r.remainingKm > 0 ? t('due.kmDate', { date: shortDate(r.kmDate) }) : '';
    return { when, rel: rel.join(' · '), every, proj, last: t('due.last', { date: shortDate(r.last.date), km: km(r.last.km) }) };
  }
  function renderDues() {
    const v = active(); if (!v) return;
    const list = C.reminders(data, todayDay(), data.settings, v.id);
    if (!list.length) { $('dues').replaceChildren(el('li', 'empty', t('due.empty'))); return; }
    $('dues').replaceChildren(...list.map((r) => {
      const d = dueText(r), li = el('li', 'state-' + r.state), txt = el('div', 'txt');
      const head = el('b'); head.append(el('span', '', r.schedule.name + ' '), el('span', 'tag tag-' + r.state, t('state.' + r.state)));
      txt.append(head, el('span', 'rel', `${d.when} · ${d.rel}`));
      if (d.proj) txt.append(el('span', '', d.proj));
      txt.append(el('span', '', `${d.every} · ${d.last}`));
      const acts = el('div', 'acts');
      const done = el('button', 'btn small good', t('btn.done')); done.type = 'button'; done.setAttribute('aria-label', t('aria.done', { name: r.schedule.name }));
      done.addEventListener('click', () => prefillService(r));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: r.schedule.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('due.confirmDelete', { name: r.schedule.name }))) return;
        if (save(C.removeItem(data, 'schedules', r.schedule.id))) { render(); say('due-status', t('due.deleted', { name: r.schedule.name }), 'ok'); }
      });
      acts.append(done, del); li.append(txt, acts); return li;
    }));
  }
  function prefillService(r) {
    const f = $('srv-form'), est = r.estimate;
    f.schedule.value = r.schedule.id; f.label.value = ''; f.date.value = todayDay();
    f.km.value = est ? String(est.km) : ''; f.km.focus();
    say('srv-status', t('srv.prefilled', { name: r.schedule.name }));
  }
  $('sch-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget, v = active(); if (!v) return;
    try {
      const s = C.makeSchedule({ vehicleId: v.id, name: f.name.value, everyKmText: f.everyKm.value, everyMonthsText: f.everyMonths.value, baseDate: f.baseDate.value, baseKmText: f.baseKm.value }, newId(), data.vehicles, todayDay());
      if (!save(C.upsert(data, 'schedules', s))) return;
      f.reset(); render();
      say('due-status', t('due.added', { name: s.name }), 'ok');
    } catch (e) { say('due-status', L.error(e), 'error'); }
  });

  // ---------- Interventions
  function buildScheduleSelect() {
    const sel = $('srv-schedule'), cur = sel.value, v = active();
    const opts = [['', t('srv.noSchedule')], ...(v ? data.schedules.filter((s) => s.vehicleId === v.id).map((s) => [s.id, s.name]) : [])];
    sel.replaceChildren(...opts.map(([val, label]) => { const o = el('option', '', label); o.value = val; return o; }));
    if (opts.some(([val]) => val === cur)) sel.value = cur;
  }
  function renderServices() {
    const v = active(); if (!v) return;
    const list = data.services.filter((s) => s.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.km - a.km));
    const cost = C.costSummary(data, v.id);
    $('srv-total').textContent = list.length ? t('srv.total', { total: L.money(cost.total), n: list.length }) : '';
    if (!list.length) { $('services').replaceChildren(el('li', 'empty', t('srv.empty'))); return; }
    $('services').replaceChildren(...list.map((s) => {
      const li = el('li'), txt = el('div', 'txt');
      const name = s.scheduleId ? (s.label ? `${schName(s.scheduleId)} · ${s.label}` : schName(s.scheduleId)) : s.label;
      txt.append(el('b', '', name));
      txt.append(el('span', '', [shortDate(s.date), km(s.km), s.cents ? L.money(s.cents) : t('srv.noCost'), s.note].filter(Boolean).join(' · ')));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name }));
      del.addEventListener('click', () => { if (confirm(t('srv.confirmDelete', { name })) && save(C.removeItem(data, 'services', s.id))) { render(); say('srv-status', t('srv.deleted'), 'ok'); } });
      li.append(txt, del); return li;
    }));
  }
  $('srv-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget, v = active(); if (!v) return;
    try {
      const s = C.makeService({ vehicleId: v.id, scheduleId: f.schedule.value, label: f.label.value, date: f.date.value, kmText: f.km.value, amount: f.amount.value, note: f.note.value }, newId(), data.vehicles, data.schedules, todayDay());
      checkOdo(v.id, s.date, s.km);
      if (!save(C.upsert(data, 'services', s))) return;
      f.label.value = ''; f.km.value = ''; f.amount.value = ''; f.note.value = ''; f.schedule.value = '';
      render();
      const msg = s.scheduleId ? t('srv.addedSchedule', { name: schName(s.scheduleId) }) : t('srv.added', { name: s.label });
      say('srv-status', msg, 'ok');
    } catch (e) { say('srv-status', kmErrorParams(e), 'error'); }
  });

  // ---------- Rappels (tous véhicules)
  function renderAlerts() {
    const all = C.reminders(data, todayDay(), data.settings);
    const late = all.filter((r) => r.state === 'late' || r.state === 'today').length, soon = all.filter((r) => r.state === 'soon').length;
    const parts = [];
    if (late) parts.push(t('alerts.late', { n: late }));
    if (soon) parts.push(t('alerts.soon', { n: soon }));
    $('alerts').hidden = !parts.length;
    $('alerts').textContent = parts.length ? `${t('alerts.title')} ${parts.join(' · ')}` : '';
    $('alerts').classList.toggle('bad', !!late);
  }
  function fillSettings() { const f = $('set-form'); f.soonDays.value = String(data.settings.soonDays); f.soonKm.value = String(data.settings.soonKm); }
  $('set-form').addEventListener('input', () => {
    const f = $('set-form');
    try {
      const settings = C.makeSettings({ soonDaysText: f.soonDays.value, soonKmText: f.soonKm.value });
      if (save({ ...data, settings })) { say('exp-status', t('set.saved'), 'ok'); renderDues(); renderAlerts(); }
    } catch (e) { say('exp-status', L.error(e), 'error'); }
  });
  $('set-form').addEventListener('submit', (e) => e.preventDefault());

  function render() { renderVehicles(); buildScheduleSelect(); renderAlerts(); renderOdometer(); renderDues(); renderServices(); for (const c of document.querySelectorAll('.cur')) c.textContent = L.currencySymbol(); }

  // ---------- Exemple (dans la langue affichée ; dates relatives à aujourd'hui)
  $('sample').addEventListener('click', () => {
    try {
      const today = todayDay(), d = (n) => C.addDays(today, n);
      const v = C.makeVehicle({ name: t('sample.car'), note: t('sample.carNote') }, newId());
      if (data.vehicles.some((x) => x.name === v.name)) throw new Error('err.vehicleExists');
      let next = C.upsert(data, 'vehicles', v);
      const V = next.vehicles;
      const oil = C.makeSchedule({ vehicleId: v.id, name: t('sample.oil'), everyKmText: '15000', everyMonthsText: '12', baseDate: d(-565), baseKmText: '20000' }, newId(), V, today);
      const tyres = C.makeSchedule({ vehicleId: v.id, name: t('sample.tyres'), everyKmText: '20000', everyMonthsText: '', baseDate: d(-330), baseKmText: '17000' }, newId(), V, today);
      const insp = C.makeSchedule({ vehicleId: v.id, name: t('sample.inspection'), everyKmText: '', everyMonthsText: '24', baseDate: C.addMonths(today, -26), baseKmText: '10000' }, newId(), V, today);
      for (const s of [oil, tyres, insp]) next = C.upsert(next, 'schedules', s);
      next = C.upsert(next, 'readings', C.makeReading({ vehicleId: v.id, date: d(-290), kmText: '30000' }, newId(), V, today));
      next = C.upsert(next, 'readings', C.makeReading({ vehicleId: v.id, date: d(-17), kmText: '36400' }, newId(), V, today));
      next = C.upsert(next, 'services', C.makeService({ vehicleId: v.id, scheduleId: oil.id, label: '', date: d(-200), kmText: '33000', amount: '89.90', note: t('sample.garage') }, newId(), V, next.schedules, today));
      next = C.upsert(next, 'services', C.makeService({ vehicleId: v.id, scheduleId: '', label: t('sample.brakes'), date: d(-100), kmText: '34000', amount: '145', note: '' }, newId(), V, next.schedules, today));
      if (!save(next)) return;
      setActive(v.id); render();
      say('veh-status', t('sample.loaded'), 'ok');
    } catch (e) { say('veh-status', L.error(e), 'error'); }
  });

  // ---------- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => {
    try {
      const today = todayDay(), list = C.reminders(data, today, data.settings);
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const out = C.toICS(list, today, stamp, data.settings.soonDays, {
        summary: (r) => t('ics.summary', { name: r.schedule.name, vehicle: vehName(r.schedule.vehicleId) }),
        description: (r) => { const d = dueText(r); return [d.when, d.every, d.last].join(' — '); },
      });
      if (!out.count) throw new Error('err.nothing');
      download('vehicleservicelog.ics', out.text, 'text/calendar;charset=utf-8');
      say('exp-status', t('ics.done', { n: out.count }), 'ok');
    } catch (e) { say('exp-status', L.error(e), 'error'); }
  });
  $('export-csv').addEventListener('click', () => {
    try {
      if (!data.services.length) throw new Error('err.nothing');
      const csv = C.servicesCSV(data, { decimal: decimal(), vehicleName: vehName, scheduleName: schName,
        headers: [t('csv.date'), t('csv.vehicle'), t('csv.km'), t('csv.label'), t('csv.schedule'), t('csv.cost', { cur: L.currency }), t('csv.note')] });
      download('vehicleservicelog.csv', csv, 'text/csv;charset=utf-8'); say('exp-status', t('csv.done'), 'ok');
    } catch (e) { say('exp-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('vehicleservicelog-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (_) { throw new Error('err.json'); }
      const next = C.validateData(parsed);
      if (!confirm(t('backup.confirm', { a: data.vehicles.length, b: next.vehicles.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true;
      setActive(sortedVehicles()[0] ? sortedVehicles()[0].id : null); resetVehForm(); fillSettings(); render();
      say('backup-status', t('backup.restored', { n: next.vehicles.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('vehicleservicelog-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = data.vehicles.some((v) => v.id === last) ? last : (sortedVehicles()[0] ? sortedVehicles()[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  $('read-form').date.value = todayDay(); $('srv-form').date.value = todayDay();
  // Nouvelle langue ou devise : tout est réaffiché ; les saisies en cours restent dans les champs.
  L.onChange(() => {
    for (const id of ['veh-status', 'read-status', 'due-status', 'srv-status', 'exp-status', 'backup-status']) say(id, '');
    $('save-veh').textContent = t(editingVeh ? 'btn.updateVeh' : 'btn.addVeh');
    render();
  });
  fillSettings();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
