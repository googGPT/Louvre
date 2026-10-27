/* RepairLedger — interface. Calculs dans core.js (RepairCore) ; textes, montants et dates dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.RepairCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-repairledger-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const today = () => C.dayKey();

  let data = { settings: { reminderDays: 30 }, objects: [], repairs: [] };
  let readOnly = false;
  let editingObject = null, editingRepair = null;
  const of = $('object-form'), rf = $('repair-form');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const money = (c) => L.money(c);
  const day = (d) => L.date(d);
  const catName = (c) => t('cat.' + c);
  const objName = (id) => (data.objects.find((o) => o.id === id) || { name: '?' }).name;
  const sortedObjects = () => data.objects.slice().sort((a, b) => a.name.localeCompare(b.name, L.locale));
  function fillSelect(sel, options) {
    const value = sel.value;
    sel.replaceChildren(...options.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    if (options.some((o) => o[0] === value)) sel.value = value;
  }
  function fillSelects() {
    fillSelect(of.category, C.CATEGORIES.map((c) => [c, catName(c)]));
    fillSelect(rf.objectId, sortedObjects().map((o) => [o.id, o.name]));
    fillSelect($('filter'), [['all', t('filter.all')], ...sortedObjects().map((o) => [o.id, o.name])]);
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
  }

  // ---------- Objets
  function resetObject() { editingObject = null; of.name.value = ''; of.purchaseDate.value = ''; of.price.value = ''; of.threshold.value = ''; $('save-object').textContent = t('btn.addObject'); $('cancel-object').hidden = true; }
  of.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!editingObject && data.objects.length >= C.MAX_OBJECTS) throw new Error(`err.tooManyObjects|${JSON.stringify({ max: C.MAX_OBJECTS })}`);
      const obj = C.makeObject({ name: of.name.value, category: of.category.value, purchaseDate: of.purchaseDate.value, price: of.price.value, threshold: of.threshold.value }, editingObject || newId());
      // Une date d'achat postérieure à une réparation déjà notée est refusée.
      if (obj.purchaseDate && data.repairs.some((r) => r.objectId === obj.id && r.date < obj.purchaseDate)) throw new Error('err.purchaseAfterRepair');
      const was = editingObject;
      if (!save({ ...data, objects: was ? data.objects.map((o) => (o.id === obj.id ? obj : o)) : [...data.objects, obj] })) return;
      resetObject(); fillSelects(); if (!was) rf.objectId.value = obj.id; render();
      say('object-status', t(was ? 'obj.updated' : 'obj.added', { name: obj.name }), 'ok');
    } catch (e) { say('object-status', L.error(e), 'error'); }
  });
  $('cancel-object').addEventListener('click', () => { resetObject(); say('object-status', ''); });
  function editObject(o) {
    editingObject = o.id; of.name.value = o.name; of.category.value = o.category; of.purchaseDate.value = o.purchaseDate || '';
    of.price.value = o.priceCents === null ? '' : (o.priceCents / 100).toFixed(2); of.threshold.value = o.thresholdPct === null ? '' : String(o.thresholdPct);
    $('save-object').textContent = t('btn.updateObject'); $('cancel-object').hidden = false;
    say('object-status', t('obj.editing', { name: o.name })); of.scrollIntoView({ block: 'start' }); of.name.focus();
  }
  function renderObjects() {
    const list = sortedObjects();
    if (!list.length) { $('objects').replaceChildren(el('li', 'empty', t('obj.empty'))); return; }
    $('objects').replaceChildren(...list.map((o) => {
      const s = C.objectSummary(o, data.repairs), li = el('li', 'obj st-' + s.status), txt = el('div', 'txt');
      txt.append(el('b', '', o.name));
      const meta = [catName(o.category)];
      if (o.purchaseDate) meta.push(t('obj.bought', { date: day(o.purchaseDate) }));
      if (o.priceCents !== null) meta.push(t('obj.price', { price: money(o.priceCents) }));
      txt.append(el('span', 'meta', meta.join(' · ')));
      txt.append(el('span', 'sum', t('obj.repairs', { n: s.count, total: money(s.totalCents) }) + (s.ratioPct !== null ? ' ' + t('obj.ratio', { pct: L.number(s.ratioPct) }) : '')));
      if (s.thresholdCents !== null) {
        const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.min(100, Math.round(100 * s.totalCents / s.thresholdCents)) + '%'; bar.append(fill); txt.append(bar);
        txt.append(el('span', 'verdict', s.status === 'reached'
          ? t('obj.reached', { pct: L.number(o.thresholdPct), amount: money(s.thresholdCents) })
          : t('obj.below', { remaining: money(s.remainingCents), pct: L.number(o.thresholdPct), amount: money(s.thresholdCents) })));
      } else txt.append(el('span', 'verdict muted', t(o.priceCents === null ? 'obj.noPrice' : 'obj.noThreshold')));
      const acts = el('div', 'acts');
      const hist = el('button', 'btn', t('btn.history')); hist.type = 'button'; hist.setAttribute('aria-label', t('aria.history', { name: o.name }));
      hist.addEventListener('click', () => { $('filter').value = o.id; renderRepairs(); $('h-history').scrollIntoView({ block: 'start' }); });
      const rep = el('button', 'btn', t('btn.repair')); rep.type = 'button'; rep.setAttribute('aria-label', t('aria.repair', { name: o.name }));
      rep.addEventListener('click', () => { resetRepair(); rf.objectId.value = o.id; rf.scrollIntoView({ block: 'start' }); rf.cost.focus(); });
      const ed = el('button', 'btn', t('btn.edit')); ed.type = 'button'; ed.setAttribute('aria-label', t('aria.editObject', { name: o.name })); ed.addEventListener('click', () => editObject(o));
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.deleteObject', { name: o.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('obj.confirmDelete', { name: o.name, n: s.count }))) return;
        if (save({ ...data, objects: data.objects.filter((x) => x.id !== o.id), repairs: data.repairs.filter((r) => r.objectId !== o.id) })) {
          if (editingObject === o.id) resetObject(); fillSelects(); render(); say('object-status', t('obj.deleted', { name: o.name }), 'ok');
        }
      });
      acts.append(rep, hist, ed, del); li.append(txt, acts); return li;
    }));
  }

  // ---------- Réparations
  function resetRepair() {
    editingRepair = null; rf.date.value = today(); rf.cost.value = ''; rf.provider.value = ''; rf.description.value = ''; rf.warrantyMonths.value = ''; rf.warrantyDate.value = '';
    $('save-repair').textContent = t('btn.addRepair'); $('cancel-repair').hidden = true;
  }
  rf.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!data.objects.length) throw new Error('err.noObject');
      if (!editingRepair && data.repairs.length >= C.MAX_REPAIRS) throw new Error(`err.tooManyRepairs|${JSON.stringify({ max: C.MAX_REPAIRS })}`);
      const r = C.makeRepair({ objectId: rf.objectId.value, date: rf.date.value, cost: rf.cost.value, provider: rf.provider.value, description: rf.description.value,
        warrantyMonths: rf.warrantyMonths.value, warrantyDate: rf.warrantyDate.value }, editingRepair || newId(), data.objects);
      const was = editingRepair;
      const repairs = was ? data.repairs.map((x) => (x.id === r.id ? r : x)) : [...data.repairs, r];
      if (!save({ ...data, repairs })) return;
      const cov = C.coveredBy(r, repairs);
      resetRepair(); rf.objectId.value = r.objectId; render();
      say('repair-status', t(was ? 'rep.updated' : 'rep.added', { name: objName(r.objectId), cost: money(r.costCents) }) + (cov ? ' ' + t('rep.coveredNow', { date: day(cov.date), end: day(cov.warrantyEnd) }) : ''), cov ? 'warn' : 'ok');
    } catch (e) { say('repair-status', L.error(e), 'error'); }
  });
  $('cancel-repair').addEventListener('click', () => { resetRepair(); say('repair-status', ''); });
  function editRepair(r) {
    editingRepair = r.id; rf.objectId.value = r.objectId; rf.date.value = r.date; rf.cost.value = (r.costCents / 100).toFixed(2);
    rf.provider.value = r.provider; rf.description.value = r.description; rf.warrantyMonths.value = ''; rf.warrantyDate.value = r.warrantyEnd || '';
    $('save-repair').textContent = t('btn.updateRepair'); $('cancel-repair').hidden = false;
    say('repair-status', t('rep.editing', { name: objName(r.objectId), date: day(r.date) })); rf.scrollIntoView({ block: 'start' }); rf.cost.focus();
  }
  function warrantyText(r) {
    const w = C.warrantyState(r, today());
    if (w.state === 'none') return [t('rep.noWarranty'), 'w-none'];
    if (w.state === 'expired') return [t('rep.expired', { date: day(r.warrantyEnd) }), 'w-expired'];
    return [t('rep.active', { date: day(r.warrantyEnd), n: w.days }), 'w-active'];
  }
  function renderRepairs() {
    const f = $('filter').value || 'all';
    const list = data.repairs.filter((r) => f === 'all' || r.objectId === f).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (!list.length) { $('repairs').replaceChildren(el('li', 'empty', t(data.repairs.length ? 'rep.noneFiltered' : 'rep.empty'))); return; }
    $('repairs').replaceChildren(...list.map((r) => {
      const li = el('li', 'rep'), head = el('div', 'rep-head');
      head.append(el('b', '', objName(r.objectId)), el('span', 'cost', money(r.costCents)));
      li.append(head, el('p', 'meta', [day(r.date), r.provider, r.description].filter(Boolean).join(' · ')));
      const [wt, wc] = warrantyText(r); li.append(el('p', 'warranty ' + wc, wt));
      const cov = C.coveredBy(r, data.repairs);
      if (cov) li.append(el('p', 'covered', t('rep.covered', { date: day(cov.date), end: day(cov.warrantyEnd), provider: cov.provider || '—' })));
      const acts = el('div', 'acts');
      const ed = el('button', 'btn', t('btn.edit')); ed.type = 'button'; ed.setAttribute('aria-label', t('aria.editRepair', { name: objName(r.objectId), date: day(r.date) })); ed.addEventListener('click', () => editRepair(r));
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.deleteRepair', { name: objName(r.objectId), date: day(r.date) }));
      del.addEventListener('click', () => {
        if (!confirm(t('rep.confirmDelete', { name: objName(r.objectId), date: day(r.date) }))) return;
        if (save({ ...data, repairs: data.repairs.filter((x) => x.id !== r.id) })) { if (editingRepair === r.id) resetRepair(); render(); say('history-status', t('rep.deleted'), 'ok'); }
      });
      acts.append(ed, del); li.append(acts); return li;
    }));
  }
  $('filter').addEventListener('change', renderRepairs);

  // ---------- Rappels et indicateurs
  function kpi(label, value) { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; }
  function renderReminders() {
    const tt = C.totals(data.objects, data.repairs, today());
    $('kpis').replaceChildren(kpi(t('kpi.total'), money(tt.totalCents)), kpi(t('kpi.year'), money(tt.yearCents)), kpi(t('kpi.active'), L.number(tt.active)), kpi(t('kpi.reached'), L.number(tt.reached)));
    const list = C.reminders(data.repairs, today(), data.settings.reminderDays);
    $('reminders').replaceChildren(...(list.length ? list.map(({ repair: r, days }) => el('li', days <= 7 ? 'soon' : '',
      days === 0 ? t('remind.today', { name: objName(r.objectId), provider: r.provider || '—' }) : t('remind.item', { name: objName(r.objectId), provider: r.provider || '—', date: day(r.warrantyEnd), n: days })))
      : [el('li', 'empty', t('remind.none', { n: data.settings.reminderDays }))]));
  }
  $('reminder-days').addEventListener('change', () => {
    try {
      const settings = C.makeSettings({ reminderDays: $('reminder-days').value });
      if (save({ ...data, settings })) { say('remind-status', t('remind.saved', { n: settings.reminderDays }), 'ok'); renderReminders(); }
    } catch (e) { say('remind-status', L.error(e), 'error'); }
  });

  // ---------- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    if (!data.repairs.length) { say('backup-status', t('csv.none'), 'error'); return; }
    try {
      const csv = C.toCSV(data.objects, data.repairs, { headers: [t('csv.date'), t('csv.object'), t('csv.category'), t('csv.provider'), t('csv.description'), t('csv.cost', { cur: L.currency }), t('csv.warranty')],
        categoryLabel: catName, decimal: L.number(1.5).includes(',') ? 'comma' : 'dot' });
      download('repairledger-repairs.csv', csv, 'text/csv;charset=utf-8'); say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export-ics').addEventListener('click', () => {
    if (!data.repairs.some((r) => r.warrantyEnd && r.warrantyEnd >= today())) { say('backup-status', t('ics.none'), 'error'); return; }
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const ics = C.toICS(data.objects, data.repairs, today(), stamp, {
        summary: (o, r) => t('ics.summary', { name: o.name }),
        describe: (o, r) => t('ics.describe', { date: day(r.date), provider: r.provider || '—', cost: money(r.costCents), work: r.description || '—' }),
      }, data.settings.reminderDays);
      download('repairledger-warranties.ics', ics, 'text/calendar'); say('backup-status', t('ics.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('repairledger-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.repairs.length, b: next.repairs.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; resetObject(); resetRepair(); fillSelects(); $('reminder-days').value = String(next.settings.reminderDays); render();
      say('backup-status', t('backup.restored', { n: next.repairs.length, objects: next.objects.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('repairledger-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Exemple (dates relatives à aujourd'hui, textes dans la langue affichée)
  $('sample').addEventListener('click', () => {
    if ((data.objects.length || data.repairs.length) && !confirm(t('sample.confirm'))) return;
    try {
      const d0 = today(), ago = (n) => C.addDays(d0, -n);
      const objects = [
        C.makeObject({ name: t('sample.phone'), category: 'electronics', purchaseDate: ago(700), price: '499', threshold: '50' }, newId()),
        C.makeObject({ name: t('sample.coffee'), category: 'appliance', purchaseDate: ago(900), price: '120', threshold: '50' }, newId()),
        C.makeObject({ name: t('sample.bike'), category: 'bike', purchaseDate: ago(1200), price: '650', threshold: '60' }, newId()),
        C.makeObject({ name: t('sample.boots'), category: 'clothing', purchaseDate: '', price: '180', threshold: '70' }, newId()),
      ];
      const [phone, coffee, bike, boots] = objects.map((o) => o.id);
      const plan = [
        [phone, 400, '129', 'prov.phone', 'work.screen', '6', ''], [phone, 20, '79', 'prov.phone', 'work.battery', '12', ''],
        [coffee, 300, '45', 'prov.sav', 'work.descale', '3', ''], [coffee, 250, '60', 'prov.sav', 'work.pump', '', ''],
        [bike, 60, '85', 'prov.bike', 'work.brakes', '', C.addDays(d0, 10)], [bike, 30, '120', 'prov.bike', 'work.wheel', '', ''],
        [boots, 100, '65', 'prov.cobbler', 'work.soles', '', ''],
      ];
      const repairs = plan.map(([objectId, n, cost, prov, work, months, end]) => C.makeRepair({ objectId, date: ago(n), cost, provider: t('sample.' + prov), description: t('sample.' + work), warrantyMonths: months, warrantyDate: end }, newId(), objects));
      if (!save({ settings: { reminderDays: 30 }, objects, repairs })) return;
      resetObject(); resetRepair(); $('filter').value = 'all'; $('reminder-days').value = '30'; fillSelects(); render();
      say('remind-status', t('sample.done'), 'ok');
    } catch (e) { say('remind-status', L.error(e), 'error'); }
  });

  function render() { renderReminders(); renderObjects(); renderRepairs(); }

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillSelects(); resetObject(); resetRepair(); $('reminder-days').value = String(data.settings.reminderDays);
  L.onChange(() => { // saisies en cours conservées ; montants et dates reformatés
    for (const id of ['remind-status', 'object-status', 'repair-status', 'history-status', 'backup-status']) say(id, '');
    fillSelects();
    $('save-object').textContent = t(editingObject ? 'btn.updateObject' : 'btn.addObject');
    $('save-repair').textContent = t(editingRepair ? 'btn.updateRepair' : 'btn.addRepair');
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
