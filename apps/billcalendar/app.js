/* BillCalendar — interface. Les calculs sont dans core.js (BillCore). */
(() => {
  'use strict';
  const C = window.BillCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise et traductions
  const t = L.t;
  // Les catégories sont enregistrées sous leur nom français ; on les traduit à l'affichage.
  const CAT_KEYS = { 'Logement': 'housing', 'Énergie': 'energy', 'Télécom': 'telecom', 'Assurance': 'insurance', 'Abonnement': 'subscription', 'Transport': 'transport', 'Santé': 'health', 'Impôts': 'taxes', 'Autre': 'other' };
  const catName = (c) => t('cat.' + (CAT_KEYS[c] || 'other'));
  const freqName = (f) => t('freq.' + f);
  const KEY = 'louvre-billcalendar-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let bills = [];
  let readOnly = false;
  let editing = null;
  const now = new Date();
  let view = { y: now.getFullYear(), m: now.getMonth() + 1 }; // mois affiché
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); bills = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const longDate = (day) => L.date(day, { weekday: 'short', day: 'numeric', month: 'short' });

  function renderCalendar() {
    const { y, m } = view;
    $('h-month').textContent = L.date(`${y}-${String(m).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' });
    const data = C.month(bills, y, m);
    const byDay = {};
    for (const it of data.items) (byDay[it.day] ||= []).push(it.bill);
    const cells = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map((d) => el('div', 'dow', L.date(d, { weekday: 'short' }))) /* un lundi -> dimanche, nommés dans la langue choisie */;
    const offset = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7; // lundi = 0
    for (let i = 0; i < offset; i += 1) cells.push(el('div', 'day out'));
    for (let d = 1; d <= C.lastDayOfMonth(y, m); d += 1) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cell = el('div', 'day' + (key === today() ? ' today' : ''));
      cell.append(el('b', '', d));
      for (const b of byDay[key] || []) { const chip = el('span', 'chip', b.name); chip.title = `${b.name} — ${L.money(b.amountCents)}`; cell.append(chip); }
      cells.push(cell);
    }
    $('cal').replaceChildren(...cells);
    $('month-total').textContent = data.items.length ? t('month.total', { total: L.money(data.totalCents), n: data.items.length }) : t('month.none');
    $('month-list').replaceChildren(...data.items.map((it) => line(longDate(it.day), it.bill.name, L.money(it.bill.amountCents))));
  }
  function line(a, b, money) {
    const li = el('li'), txt = el('div', 'txt');
    txt.append(el('b', '', b), el('span', '', a));
    li.append(txt, el('span', 'money', money)); return li;
  }
  function renderSummary() {
    const s = C.summary(bills, today());
    $('k-month').textContent = L.money(s.monthlyCents);
    $('k-year').textContent = L.money(s.yearlyCents);
    $('k-30').textContent = L.money(s.next30Cents);
    $('k-count').textContent = `${s.active} / ${s.paused}`;
    const max = Math.max(1, ...s.byCategory.map((x) => x[1]));
    $('cats').replaceChildren(...(s.byCategory.length ? s.byCategory.map(([cat, cents]) => {
      const li = el('li'), bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.round(100 * cents / max) + '%'; bar.append(fill);
      li.append(el('span', '', catName(cat)), bar, el('span', 'money', L.money(cents))); return li;
    }) : [el('li', 'empty', t('cats.none'))]));
    const up = C.upcoming(bills, today(), 30).items.slice(0, 6);
    $('upcoming').replaceChildren(...(up.length ? up.map((it) => line(longDate(it.day), it.bill.name, L.money(it.bill.amountCents))) : [el('li', 'empty', t('up.none'))]));
  }
  function renderBills() {
    $('count').textContent = `(${bills.length})`;
    if (!bills.length) { $('bills').replaceChildren(el('li', 'empty', t('bills.none'))); return; }
    const sorted = [...bills].sort((a, b) => (b.active - a.active) || ((C.nextDue(a, today()) || '9') .localeCompare(C.nextDue(b, today()) || '9')) || a.name.localeCompare(b.name, L.locale));
    $('bills').replaceChildren(...sorted.map((b) => {
      const li = el('li', b.active ? '' : 'paused'), txt = el('div', 'txt'), next = C.nextDue(b, today());
      txt.append(el('b', '', `${b.name} · ${L.money(b.amountCents)}`),
        el('span', '', t('bill.perMonth', { freq: freqName(b.frequency), amount: L.money(C.monthlyEquivalentCents(b)) })),
        el('span', 'tag', b.active ? t('bill.next', { cat: catName(b.category), date: next ? longDate(next) : '—' }) : t('bill.paused', { cat: catName(b.category) })));
      const acts = el('div', 'acts');
      const mk = (label, aria, fn) => { const x = el('button', 'btn', label); x.type = 'button'; x.setAttribute('aria-label', t(aria, { name: b.name })); x.addEventListener('click', fn); acts.append(x); };
      mk(t('btn.edit'), 'aria.edit', () => startEdit(b));
      mk(b.active ? t('btn.pause') : t('btn.resume'), b.active ? 'aria.pause' : 'aria.resume', () => { if (save(bills.map((x) => (x.id === b.id ? { ...x, active: !x.active } : x)))) render(); });
      mk(t('btn.delete'), 'aria.delete', () => { if (confirm(t('confirm.delete', { name: b.name })) && save(bills.filter((x) => x.id !== b.id))) { if (editing === b.id) stopEdit(); render(); } });
      li.append(txt, acts); return li;
    }));
  }
  function render() { renderCalendar(); renderSummary(); renderBills(); }

  // --- Formulaire
  const form = $('bill-form');
  function fillCategories() { const keep = form.category.value; form.category.replaceChildren(...C.CATEGORIES.map((c) => { const o = el('option', '', catName(c)); o.value = c; return o; })); if (keep) form.category.value = keep; }
  fillCategories();
  form.start.value = today();
  function startEdit(b) {
    editing = b.id; form.name.value = b.name; form.amount.value = (b.amountCents / 100).toFixed(2).replace('.', ',');
    form.frequency.value = b.frequency; form.start.value = b.start; form.category.value = b.category;
    $('h-form').textContent = t('form.edit'); $('save').textContent = t('btn.save'); $('cancel').hidden = false; form.name.focus();
  }
  function stopEdit() { editing = null; form.reset(); form.start.value = today(); $('h-form').textContent = t('form.new'); $('save').textContent = t('btn.add'); $('cancel').hidden = true; }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const input = { name: form.name.value, amount: form.amount.value, frequency: form.frequency.value, start: form.start.value, category: form.category.value };
      let next;
      if (editing) { const old = bills.find((b) => b.id === editing); next = bills.map((b) => (b.id === editing ? C.makeBill({ ...input, active: old.active }, editing) : b)); }
      else { if (bills.length >= C.MAX_BILLS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_BILLS })}`); next = [...bills, C.makeBill(input, newId())]; }
      if (!save(next)) return;
      say('form-status', editing ? t('form.edited') : t('form.added'), 'ok'); stopEdit(); render();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('cancel').addEventListener('click', stopEdit);
  $('sample').addEventListener('click', () => {
    const day0 = today(), first = (d) => `${day0.slice(0, 8)}${String(d).padStart(2, '0')}`;
    const samples = [
      { name: t('sample.rent'), amount: '780', frequency: 'monthly', start: first(5), category: 'Logement' },
      { name: t('sample.mobile'), amount: '12.99', frequency: 'monthly', start: first(12), category: 'Télécom' },
      { name: t('sample.home'), amount: '168', frequency: 'yearly', start: first(20), category: 'Assurance' },
      { name: t('sample.streaming'), amount: '8.99', frequency: 'monthly', start: first(28), category: 'Abonnement' },
      { name: t('sample.power'), amount: '210', frequency: 'quarterly', start: first(15), category: 'Énergie' },
    ];
    try { if (save([...bills, ...samples.map((s) => C.makeBill(s, newId()))])) { render(); say('form-status', t('sample.added'), 'ok'); } }
    catch (e) { say('form-status', L.error(e), 'error'); }
  });

  // --- Navigation
  $('prev').addEventListener('click', () => { view = view.m === 1 ? { y: view.y - 1, m: 12 } : { y: view.y, m: view.m - 1 }; renderCalendar(); });
  $('next').addEventListener('click', () => { view = view.m === 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m: view.m + 1 }; renderCalendar(); });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => {
    if (!bills.some((b) => b.active)) { say('backup-status', t('ics.none'), 'error'); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    download('billcalendar.ics', C.toICS(bills, stamp, { money: (c) => L.money(c), describe: (b) => `${catName(b.category)} · ${freqName(b.frequency)}` }), 'text/calendar');
    say('backup-status', t('ics.done'), 'ok');
  });
  $('export').addEventListener('click', () => {
    try { download('billcalendar-backup.json', C.backup(bills), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: bills.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; stopEdit(); render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('billcalendar-raw-storage.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage
  try { const raw = localStorage.getItem(KEY); if (raw) bills = C.validateBackup(JSON.parse(raw)); }
  catch (e) { readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false; }
  L.onChange(() => { fillCategories(); $('h-form').textContent = editing ? t('form.edit') : t('form.new'); $('save').textContent = editing ? t('btn.save') : t('btn.add'); $('cur-symbol').textContent = L.currencySymbol(); render(); });
  $('cur-symbol').textContent = L.currencySymbol();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
