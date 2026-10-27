/* FreelanceRate — interface. Calculs dans core.js (FreelanceCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.FreelanceCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-freelancerate-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const fixed = (v) => (v / 100).toFixed(2).replace(/\.00$/, ''); // 2250 -> « 22.5 », 700 -> « 7 »
  const pct = (bp) => L.number(bp / 10000, { style: 'percent', maximumFractionDigits: 2 });

  let state = C.emptyState(); // { profile, charges }
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function fillProfile() {
    const p = state.profile, f = $('profile-form');
    if (!p) return;
    f.targetNet.value = (p.targetNetCents / 100).toFixed(2);
    f.contrib.value = p.contribBp ? fixed(p.contribBp) : ''; f.tax.value = p.taxBp ? fixed(p.taxBp) : '';
    f.daysPerWeek.value = String(p.daysPerWeek); f.weeksOff.value = String(p.weeksOff); f.daysOff.value = String(p.daysOff);
    f.billablePct.value = String(p.billablePct); f.hours.value = fixed(p.hoursX100);
  }
  const result = () => (state.profile ? C.compute(state.profile, state.charges) : null);

  function renderCharges() {
    const list = $('charge-list');
    if (!state.charges.length) list.replaceChildren(el('li', 'empty', t('charges.empty')));
    else list.replaceChildren(...state.charges.map((c) => {
      const li = el('li'), txt = el('div', 'txt'), acts = el('div', 'acts');
      txt.append(el('b', '', c.name), el('span', '', t('charge.' + c.period, { amount: L.money(c.amountCents) })));
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { name: c.name }));
      del.addEventListener('click', () => { if (save({ ...state, charges: state.charges.filter((x) => x.id !== c.id) })) render(); });
      acts.append(del); li.append(txt, acts); return li;
    }));
    $('charge-total').textContent = t('charges.total', { amount: L.money(C.annualCharges(state.charges)) });
  }

  function renderResult() {
    const box = $('result'), r = result();
    $('csv').disabled = !r;
    if (!r) { box.replaceChildren(el('p', 'empty', t('result.empty'))); return; }
    const rates = el('div', 'rates');
    for (const [k, v] of [['rate.day', r.dayRateCents], ['rate.hour', r.hourRateCents]]) { const d = el('div', 'rate'); d.append(el('span', '', t(k)), el('strong', '', L.money(v))); rates.append(d); }
    const facts = el('dl', 'facts');
    for (const [k, v] of [['fact.turnover', L.money(r.turnoverCents)], ['fact.monthly', L.money(r.monthlyTurnoverCents)], ['fact.workingDays', L.number(r.workingDays)],
      ['fact.billableDays', L.number(r.billableDays)], ['fact.billableHours', L.number(r.billableHours)]]) {
      const d = el('div'); d.append(el('dt', '', t(k)), el('dd', '', v)); facts.append(d);
    }
    const p = state.profile, table = el('table', 'bd'), tb = el('tbody');
    const row = (label, cents, cls) => { const tr = el('tr', cls || ''); tr.append(el('td', '', label), el('td', 'num', L.money(cents))); tb.append(tr); };
    row(t('bd.turnover'), r.turnoverCents, 'sum');
    row(t('bd.contrib', { rate: pct(p.contribBp) }), -r.contribCents);
    row(t('bd.charges'), -r.chargesCents);
    row(t('bd.profit'), r.profitCents, 'sum');
    row(t('bd.tax', { rate: pct(p.taxBp) }), -r.taxCents);
    row(t('bd.net'), r.netCents, 'net');
    table.setAttribute('aria-label', t('bd.title')); table.append(tb);
    box.replaceChildren(rates, facts, el('h3', 'visually-hidden', t('bd.title')), table, el('p', 'note', t('result.note')));
  }

  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    renderCharges(); renderResult();
  }

  // --- Profil
  $('profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const profile = C.makeProfile({ targetNet: f.targetNet.value, contrib: f.contrib.value, tax: f.tax.value, daysPerWeek: f.daysPerWeek.value, weeksOff: f.weeksOff.value, daysOff: f.daysOff.value, billablePct: f.billablePct.value, hours: f.hours.value });
      if (!save({ ...state, profile })) return;
      render();
      say('profile-status', t('profile.saved', { rate: L.money(result().dayRateCents) }), 'ok');
    } catch (e) { say('profile-status', L.error(e), 'error'); }
  });

  // --- Charges
  $('charge-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (state.charges.length >= C.MAX_CHARGES) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_CHARGES })}`);
      const c = C.makeCharge({ name: f.name.value, amount: f.amount.value, period: f.period.value }, newId());
      if (!save({ ...state, charges: [...state.charges, c] })) return;
      say('charge-status', t('charge.added', { name: c.name }), 'ok');
      f.name.value = ''; f.amount.value = ''; f.name.focus();
      render();
    } catch (e) { say('charge-status', L.error(e), 'error'); }
  });

  // --- Tester un tarif
  $('test-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!state.profile) throw new Error('err.noProfile');
      const cents = C.parseCents(event.currentTarget.rate.value, 'err.testRate');
      const r = C.checkDayRate(state.profile, state.charges, cents);
      const base = t('test.result', { rate: L.money(cents), net: L.money(r.netCents) });
      say('test-status', `${base} ${r.gapCents >= 0 ? t('test.above', { amount: L.money(r.gapCents) }) : t('test.below', { amount: L.money(-r.gapCents) })}`, r.gapCents >= 0 ? 'ok' : 'error');
    } catch (e) { say('test-status', L.error(e), 'error'); }
  });

  // --- Exemple (dans la langue affichée ; valeurs purement illustratives)
  $('sample').addEventListener('click', () => {
    if ((state.profile || state.charges.length) && !confirm(t('confirm.sample'))) return;
    try {
      const profile = C.makeProfile({ targetNet: '36000', contrib: '22', tax: '10', daysPerWeek: '5', weeksOff: '5', daysOff: '10', billablePct: '70', hours: '7' });
      const charges = [['sample.software', '40', 'month'], ['sample.coworking', '200', 'month'], ['sample.insurance', '600', 'year'], ['sample.accounting', '1200', 'year'], ['sample.equipment', '1500', 'year']]
        .map(([k, amount, period]) => C.makeCharge({ name: t(k), amount, period }, newId()));
      if (!save({ profile, charges })) return;
      fillProfile(); render();
      say('profile-status', t('sample.added'), 'ok');
    } catch (e) { say('profile-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv').addEventListener('click', () => {
    try {
      const r = result(); if (!r) throw new Error('err.noProfile');
      const p = state.profile, cur = L.currency;
      const labels = {
        head: [t('csv.item'), t('csv.amount', { cur })], turnover: t('bd.turnover'), contrib: t('bd.contrib', { rate: pct(p.contribBp) }), charges: t('bd.charges'),
        profit: t('bd.profit'), tax: t('bd.tax', { rate: pct(p.taxBp) }), net: t('bd.net'), dayRate: t('rate.day'), hourRate: t('rate.hour'), billableDays: t('fact.billableDays'),
      };
      download('freelancerate.csv', C.resultCsv(r, state.charges, labels), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('freelancerate-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.charges.length, b: next.charges.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true;
      fillProfile(); render();
      say('backup-status', t('backup.restored', { n: next.charges.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('freelancerate-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { ['profile-status', 'charge-status', 'test-status', 'backup-status'].forEach((id) => say(id, '')); render(); }); // nouvelle langue ou devise
  fillProfile(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
