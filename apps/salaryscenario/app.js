/* SalaryScenario — interface. Calculs dans core.js (SalaryCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.SalaryCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-salaryscenario-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const form = $('scen-form');

  let state = { scenarios: [] };
  let readOnly = false; // stockage illisible : aucune écriture
  let editId = null; // scénario en cours de modification
  const lastErr = {}; // dernière erreur affichée par zone : retraduite au changement de langue

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); delete lastErr[id]; }
  function sayErr(id, e) { say(id, L.error(e), 'error'); lastErr[id] = e; }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const rate = (bp) => L.number(bp / 10000, { style: 'percent', maximumFractionDigits: 2 });
  const short = (v) => { const s = String(v).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); return s; };

  // --- Lignes de retenue du formulaire (créées dynamiquement, traduites par data-i18n)
  function opt(value, key) { const o = el('option', '', t(key)); o.value = value; o.dataset.i18n = key; return o; }
  function addLineRow(line = { label: '', kind: 'rate', value: '', base: 'gross' }) {
    const box = $('lines');
    if (box.children.length >= C.MAX_LINES) { sayErr('scen-status', new Error(`err.tooManyLines|${JSON.stringify({ max: C.MAX_LINES })}`)); return null; }
    const row = el('div', 'line');
    const label = el('input', 'l-label'); label.maxLength = 40; label.autocomplete = 'off'; label.value = line.label;
    label.dataset.i18nAttr = 'placeholder:line.labelPh;aria-label:line.label'; label.placeholder = t('line.labelPh'); label.setAttribute('aria-label', t('line.label'));
    const kind = el('select', 'l-kind'); kind.append(opt('rate', 'kind.rate'), opt('fixed', 'kind.fixed')); kind.value = line.kind;
    kind.dataset.i18nAttr = 'aria-label:line.kind'; kind.setAttribute('aria-label', t('line.kind'));
    const value = el('input', 'l-value'); value.inputMode = 'decimal'; value.autocomplete = 'off'; value.value = line.value;
    value.dataset.i18nAttr = 'aria-label:line.value'; value.setAttribute('aria-label', t('line.value'));
    const base = el('select', 'l-base'); base.append(opt('gross', 'base.gross'), opt('net', 'base.net')); base.value = line.base;
    base.dataset.i18nAttr = 'aria-label:line.base'; base.setAttribute('aria-label', t('line.base'));
    const sync = () => { base.disabled = kind.value === 'fixed'; value.placeholder = kind.value === 'fixed' ? `${L.currencySymbol()} / ${t('per.month')}` : '%'; };
    kind.addEventListener('change', sync); sync();
    const del = el('button', 'btn small del', '✕'); del.type = 'button'; del.dataset.i18nAttr = 'aria-label:line.remove;title:line.remove';
    del.setAttribute('aria-label', t('line.remove')); del.title = t('line.remove');
    del.addEventListener('click', () => { row.remove(); });
    row.append(label, kind, value, base, del); box.append(row);
    return row;
  }
  function readLines() {
    return [...$('lines').children].map((row) => ({ label: row.querySelector('.l-label').value, kind: row.querySelector('.l-kind').value, value: row.querySelector('.l-value').value, base: row.querySelector('.l-base').value }));
  }
  function syncPeriod() { form.payments.disabled = form.period.value === 'year'; }
  form.period.addEventListener('change', syncPeriod);
  function fillForm(s) {
    const v = C.toInput(s);
    form.name.value = v.name; form.gross.value = short(v.gross); form.period.value = v.period; form.payments.value = v.payments;
    form.bonus.value = s.bonusCents ? short(v.bonus) : '';
    $('lines').replaceChildren();
    v.lines.forEach((l) => addLineRow({ ...l, value: short(l.value) }));
    syncPeriod();
  }
  function resetForm() { form.reset(); $('lines').replaceChildren(); syncPeriod(); }
  function setSubmit(key) { $('scen-submit').dataset.i18n = key; $('scen-submit').textContent = t(key); }
  function startEdit(id, copy = false) {
    const s = state.scenarios.find((x) => x.id === id); if (!s) return;
    fillForm(copy ? { ...s, name: t('list.copyName', { name: s.name }).slice(0, 40) } : s);
    editId = copy ? null : id;
    setSubmit(copy ? 'btn.addScen' : 'btn.saveScen'); $('scen-cancel').hidden = copy;
    say('scen-status', t(copy ? 'scen.copying' : 'scen.editing', { name: s.name })); renderList(); form.name.focus();
  }
  function stopEdit() { editId = null; resetForm(); setSubmit('btn.addScen'); $('scen-cancel').hidden = true; }

  // --- Liste des scénarios
  function renderList() {
    const list = $('scen-list');
    if (!state.scenarios.length) { list.replaceChildren(el('li', 'empty', t('list.empty'))); return; }
    list.replaceChildren(...state.scenarios.map((s) => {
      const li = el('li', s.id === editId ? 'editing' : ''), txt = el('div', 'txt');
      const gross = s.period === 'month' ? t('list.monthly', { amount: L.money(s.grossCents), n: s.payments }) : t('list.yearly', { amount: L.money(s.grossCents) });
      txt.append(el('b', '', s.name), el('span', '', `${gross} · ${t('list.lines', { n: s.lines.length })}`));
      const acts = el('div', 'acts');
      const mk = (label, aria, fn) => { const b = el('button', 'btn small', label); b.type = 'button'; b.setAttribute('aria-label', aria); b.addEventListener('click', fn); return b; };
      acts.append(
        mk(t('btn.edit'), t('aria.edit', { name: s.name }), () => startEdit(s.id)),
        mk(t('btn.copy'), t('aria.copy', { name: s.name }), () => startEdit(s.id, true)),
        mk('✕', t('aria.remove', { name: s.name }), () => {
          if (!confirm(t('confirm.remove', { name: s.name }))) return;
          if (save({ scenarios: state.scenarios.filter((x) => x.id !== s.id) })) { if (editId === s.id) stopEdit(); render(); say('scen-status', t('scen.removed', { name: s.name }), 'ok'); }
        }),
      );
      li.append(txt, acts); return li;
    }));
  }

  // --- Comparaison et décomposition
  function rows() { return state.scenarios.length ? C.compare(state.scenarios, L.locale) : null; }
  function renderCompare(rs) {
    const box = $('compare');
    if (!rs) { box.replaceChildren(el('p', 'empty', t('compare.empty'))); return; }
    const out = [];
    if (rs.length > 1) {
      out.push(el('p', 'verdict', rs[0].annualNet === rs[1].annualNet ? t('verdict.tie') : t('verdict.best', { name: rs[0].name, amount: L.money(rs[1].gapToBest) })));
    }
    const scroll = el('div', 'scroll'), table = el('table', 'cmp'), head = el('tr');
    for (const [txt, cls] of [[t('th.scenario'), ''], [t('th.gross'), 'num hide-s'], [t('th.deductions'), 'num hide-s'], [t('th.net'), 'num'], [t('th.monthly'), 'num'], [t('th.rate'), 'num hide-s']]) head.append(el('th', cls, txt));
    const thead = el('thead'), tbody = el('tbody'); thead.append(head);
    const max = Math.max(...rs.map((r) => r.annualGross), 1);
    for (const r of rs) {
      const tr = el('tr', r.rank === 1 && rs.length > 1 ? 'best' : ''), name = el('td', 'name');
      name.append(el('span', '', r.name));
      // Barre : part nette (pleine) et part retenue (claire), proportionnelle au brut.
      const bar = el('div', 'split'); bar.style.width = Math.max(8, Math.round(100 * r.annualGross / max)) + '%';
      const net = el('i', 'net'); net.style.width = (r.annualGross ? 100 * r.annualNet / r.annualGross : 0).toFixed(1) + '%';
      bar.append(net); name.append(bar);
      tr.append(name, el('td', 'num hide-s', L.money(r.annualGross)), el('td', 'num hide-s', L.money(r.deductions)), el('td', 'num strong', L.money(r.annualNet)), el('td', 'num', L.money(r.monthlyNet)), el('td', 'num hide-s', rate(r.effectiveBp)));
      tbody.append(tr);
    }
    table.append(thead, tbody); scroll.append(table); out.push(scroll);
    const legend = el('p', 'legend'); const a = el('span'), b = el('span');
    a.append(el('i', 'net'), document.createTextNode(t('legend.net'))); b.append(el('i', 'ded'), document.createTextNode(t('legend.deductions'))); legend.append(a, b); out.push(legend);
    box.replaceChildren(...out);
  }
  function renderDetail(rs) {
    const box = $('detail');
    if (!rs) { box.replaceChildren(el('p', 'empty', t('detail.empty'))); return; }
    const cards = el('div', 'cards');
    for (const r of rs) {
      const c = el('article', 'card'); c.append(el('h3', '', r.name));
      const table = el('table', 'dec'), head = el('tr');
      for (const [txt, cls] of [['', ''], [t('th.year'), 'num'], [t('th.month'), 'num']]) head.append(el('th', cls, txt));
      const thead = el('thead'), tbody = el('tbody'); thead.append(head);
      const line = (label, cents, cls = '', how = '') => {
        const tr = el('tr', cls), td = el('td', 'lbl', label);
        if (how) td.append(el('small', '', how));
        tr.append(td, el('td', 'num', L.money(cents)), el('td', 'num', L.money(Math.round(cents / 12)))); tbody.append(tr);
      };
      line(t('row.base'), r.baseGrossCents);
      if (r.bonusCents) line(t('row.bonus'), r.bonusCents);
      line(t('row.gross'), r.annualGross, 'sum');
      for (const l of r.lines) {
        const how = l.kind === 'fixed' ? t('row.fixed', { amount: L.money(l.value) }) : t(l.base === 'gross' ? 'row.rateGross' : 'row.rateNet', { rate: rate(l.value) });
        line(l.label, -l.annualCents, 'ded', how);
      }
      line(t('row.net'), r.annualNet, 'sum net');
      table.append(thead, tbody); c.append(table);
      if (r.perPaymentNet !== null) c.append(el('p', 'note', t('row.perPayment', { amount: L.money(r.perPaymentNet), n: state.scenarios.find((s) => s.id === r.id).payments })));
      cards.append(c);
    }
    box.replaceChildren(cards);
  }
  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    renderList();
    const rs = rows();
    renderCompare(rs); renderDetail(rs);
    $('csv').disabled = !rs;
  }

  // --- Ajout ou modification d'un scénario
  $('add-line').addEventListener('click', () => { const row = addLineRow(); if (row) row.querySelector('.l-label').focus(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!editId && state.scenarios.length >= C.MAX_SCENARIOS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_SCENARIOS })}`);
      const s = C.makeScenario({ name: form.name.value, gross: form.gross.value, period: form.period.value, payments: form.payments.value, bonus: form.bonus.value, lines: readLines() }, editId || newId());
      const scenarios = editId ? state.scenarios.map((x) => (x.id === editId ? s : x)) : [...state.scenarios, s];
      if (!save({ scenarios })) return;
      say('scen-status', t(editId ? 'scen.updated' : 'scen.added', { name: s.name }), 'ok');
      stopEdit(); render();
    } catch (e) { sayErr('scen-status', e); }
  });
  $('scen-cancel').addEventListener('click', () => { stopEdit(); renderList(); say('scen-status', ''); });

  // --- Exemple (dans la langue affichée ; taux purement illustratifs, aucun barème réel)
  $('sample').addEventListener('click', () => {
    if (state.scenarios.length && !confirm(t('confirm.sample'))) return;
    try {
      const lines = [
        { label: t('sample.contrib'), kind: 'rate', value: '22', base: 'gross' },
        { label: t('sample.tax'), kind: 'rate', value: '8', base: 'net' },
        { label: t('sample.fixed'), kind: 'fixed', value: '40', base: 'gross' },
      ];
      const scenarios = [
        C.makeScenario({ name: t('sample.current'), gross: '3000', period: 'month', payments: '12', bonus: '', lines }, newId()),
        C.makeScenario({ name: t('sample.offer'), gross: '3100', period: 'month', payments: '13', bonus: '1500', lines }, newId()),
        C.makeScenario({ name: t('sample.yearly'), gross: '42000', period: 'year', payments: '12', bonus: '', lines: lines.slice(0, 2) }, newId()),
      ];
      if (!save({ scenarios })) return;
      stopEdit(); render(); say('scen-status', t('sample.added'), 'ok');
    } catch (e) { sayErr('scen-status', e); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv').addEventListener('click', () => {
    try {
      const rs = rows(); if (!rs) throw new Error('err.csv');
      const cur = ` (${L.currency})`;
      const labels = { scenario: t('th.scenario'), item: t('csv.item'), annual: t('th.year') + cur, monthly: t('csv.monthly') + cur, gross: t('row.gross'), deductions: t('th.deductions'), net: t('row.net') };
      download('salaryscenario-breakdown.csv', C.breakdownCsv(rs, labels), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('salaryscenario-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.scenarios.length, b: next.scenarios.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; stopEdit(); render();
      say('backup-status', t('backup.restored', { n: next.scenarios.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('salaryscenario-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue ou devise : on réaffiche sans toucher à la saisie en cours (lignes de retenue comprises).
  L.onChange(() => {
    say('backup-status', '');
    if (lastErr['scen-status']) sayErr('scen-status', lastErr['scen-status']); else say('scen-status', '');
    $('lines').querySelectorAll('.l-kind').forEach((k) => k.dispatchEvent(new Event('change'))); // placeholders (devise)
    render();
  });
  syncPeriod();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
