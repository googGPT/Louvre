/* HomeEnergyLog — interface. Calculs dans core.js (EnergyCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.EnergyCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-homeenergylog-v1';
  const ACTIVE = 'louvre-homeenergylog-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const UNIT_LABEL = { kWh: 'kWh', m3: 'm³', L: 'L' };

  let meters = [], activeId = null, readOnly = false;

  // --- Formats
  const unitOf = (m) => UNIT_LABEL[m.unit];
  const qty = (milli, m, digits = 3) => `${L.number(milli / 1000, { maximumFractionDigits: digits })} ${unitOf(m)}`;
  const perDay = (milli, m) => t('fmt.perDay', { v: qty(milli, m, 2) });
  const unitPrice = (m) => `${L.money(m.price1e4 / 100, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/${unitOf(m)}`;
  const money = (c) => (c === null || c === undefined ? '—' : L.money(c));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  // Erreurs du moteur, avec dates et index mis en forme dans la langue affichée.
  function errText(e) {
    const msg = e && e.message ? e.message : String(e);
    const [key, json] = msg.split('|');
    if ((key === 'err.decrease' || key === 'err.decreaseNext') && json) {
      const p = JSON.parse(json); const m = active();
      return t(key, { day: L.date(p.day), value: m ? `${L.number(p.value)} ${unitOf(m)}` : L.number(p.value) });
    }
    return e instanceof SyntaxError ? t('err.backup') : L.error(e);
  }

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return meters.find((m) => m.id === activeId) || null; }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); meters = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function update(fn) { const cur = active(); return save(meters.map((m) => (m.id === cur.id ? fn(m) : m))); }
  function guard(statusId, fn) { try { fn(); } catch (e) { say(statusId, errText(e), 'error'); } }

  // --- Affichage
  function fillUnits() { // unités possibles selon l'énergie choisie
    const kind = $('meter-kind').value, sel = $('meter-unit'), keep = sel.value;
    sel.replaceChildren(...C.KINDS[kind].map((u) => { const o = el('option', '', UNIT_LABEL[u]); o.value = u; return o; }));
    if (C.KINDS[kind].includes(keep)) sel.value = keep;
  }
  function renderMeters() {
    const sel = $('meter-select');
    sel.replaceChildren(...meters.map((m) => { const o = el('option', '', `${m.name} — ${t('kind.' + m.kind)}`); o.value = m.id; return o; }));
    if (!meters.length) { const o = el('option', '', t('meters.none')); o.value = ''; sel.append(o); }
    if (activeId) sel.value = activeId;
    const m = active();
    $('delete-meter').disabled = $('edit-price').disabled = $('add-reading').disabled = !m;
    $('unit-label').textContent = m ? unitOf(m) : '—';
    $('cur-symbol').textContent = L.currencySymbol();
  }
  function statusText(p) { return p.status === 'reset' ? t('status.reset') : p.status === 'decrease' ? t('status.decrease') : ''; }
  function renderHistory() {
    const m = active(), table = $('history');
    const rs = m ? m.readings : [];
    $('history-empty').hidden = rs.length > 0; table.hidden = !rs.length; $('export-csv').disabled = !rs.length;
    if (!rs.length) { table.replaceChildren(); return; }
    const byTo = new Map(C.periods(m).map((p) => [p.toId, p]));
    const head = el('tr');
    for (const [txt, cls] of [[t('th.date'), ''], [t('th.index'), 'num'], [t('th.used'), 'num'], [t('th.perDay'), 'num'], [t('th.cost'), 'num'], ['', '']]) head.append(el('th', cls, txt));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const r of [...rs].reverse()) {
      const p = byTo.get(r.id);
      const tr = el('tr', p && p.status !== 'ok' ? (p.status === 'decrease' ? 'anomaly' : 'reset') : '');
      const used = !p ? '—' : p.status === 'ok' ? `${qty(p.milli, m)} · ${t('fmt.days', { n: p.days })}` : statusText(p);
      const del = el('button', 'btn del', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.removeReading', { day: L.date(r.day) }));
      del.addEventListener('click', () => { if (confirm(t('confirm.reading', { day: L.date(r.day) })) && update((x) => ({ ...x, readings: x.readings.filter((k) => k.id !== r.id) }))) render(); });
      const tdDel = el('td'); tdDel.append(del);
      tr.append(el('td', '', L.date(r.day, { day: 'numeric', month: 'short', year: 'numeric' })), el('td', 'num', L.number(r.valueMilli / 1000, { maximumFractionDigits: 3 })),
        el('td', 'num', used), el('td', 'num', p && p.status === 'ok' ? perDay(p.perDayMilli, m) : '—'), el('td', 'num', p && p.status === 'ok' ? money(p.costCents) : '—'), tdDel);
      tbody.append(tr);
    }
    table.replaceChildren(thead, tbody);
  }
  function renderSummary() {
    const m = active();
    for (const k of ['k-total', 'k-day', 'k-last', 'k-cost']) $(k).textContent = '—';
    $('anomaly').hidden = true;
    if (!m) return;
    const s = C.summary(m);
    if (s.days) { $('k-total').textContent = qty(s.milli, m, 1); $('k-day').textContent = perDay(s.perDayMilli, m); }
    if (s.last) $('k-last').textContent = perDay(s.last.perDayMilli, m);
    $('k-cost').textContent = m.price1e4 ? money(s.costCents) : t('kpi.noPrice');
    if (s.anomalies) { $('anomaly').hidden = false; $('anomaly').textContent = t('anomaly', { n: s.anomalies }); }
  }
  function renderMonths() {
    const m = active(), list = m ? C.monthly(m) : [], bars = $('bars'), table = $('months');
    $('months-empty').hidden = list.length > 0; bars.hidden = table.hidden = !list.length;
    if (!list.length) { bars.replaceChildren(); table.replaceChildren(); return; }
    const recent = list.slice(-12), max = Math.max(...recent.map((x) => x.milli), 1);
    const label = (x) => L.date(x.month + '-01', { month: 'short' });
    bars.replaceChildren(...recent.map((x) => {
      const col = el('div'), bar = el('i', x.complete ? '' : 'partial'); bar.style.height = Math.max(2, Math.round(100 * x.milli / max)) + '%';
      col.title = `${label(x)} : ${qty(x.milli, m, 1)}`; col.append(bar, el('small', '', label(x))); return col;
    }));
    const head = el('tr');
    for (const [txt, cls] of [[t('th.month'), ''], [t('th.used'), 'num'], [t('th.perDay'), 'num'], [t('th.cost'), 'num']]) head.append(el('th', cls, txt));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const x of [...list].reverse()) {
      const tr = el('tr'), name = L.date(x.month + '-01', { month: 'long', year: 'numeric' });
      tr.append(el('td', '', x.complete ? name : `${name} (${t('fmt.covered', { n: x.coveredDays, total: x.days })})`), el('td', 'num', qty(x.milli, m, 1)), el('td', 'num', perDay(x.perDayMilli, m)), el('td', 'num', money(x.costCents)));
      tbody.append(tr);
    }
    table.replaceChildren(thead, tbody);
  }
  let lastCompare = null; // [a, b] saisis : réaffichés si la langue change
  function renderCompare() {
    const box = $('compare-result'), m = active();
    box.hidden = true; box.replaceChildren();
    if (!lastCompare || !m) return;
    let r;
    try { r = C.compare(m, lastCompare[0], lastCompare[1]); } catch (e) { say('compare-status', errText(e), 'error'); return; }
    const card = (name, x) => {
      const k = el('div', 'kpi'), last = C.numDay(C.dayNum(x.to) - 1);
      k.append(el('span', '', `${name} · ${L.date(x.from, { day: 'numeric', month: 'short', year: 'numeric' })} → ${L.date(last, { day: 'numeric', month: 'short', year: 'numeric' })}`), el('strong', '', qty(x.milli, m, 1)),
        el('span', '', `${perDay(x.perDayMilli, m)} · ${money(x.costCents)}`));
      if (!x.complete) k.append(el('span', '', t('fmt.covered', { n: x.coveredDays, total: x.days })));
      return k;
    };
    const verdict = el('p', 'verdict' + (r.diffPct > 0 ? ' bad' : ''));
    verdict.textContent = r.diffPct === null ? t('compare.na') : r.diffPct === 0 ? t('compare.same') : t(r.diffPct > 0 ? 'compare.more' : 'compare.less', { pct: L.number(Math.abs(r.diffPct)) });
    const grid = el('div', 'cmp'); grid.append(card(t('compare.a'), r.a), card(t('compare.b'), r.b));
    box.append(grid, verdict); box.hidden = false;
  }
  function render() { renderMeters(); renderHistory(); renderSummary(); renderMonths(); renderCompare(); }

  // --- Formulaires
  $('meter-kind').addEventListener('change', fillUnits);
  $('meter-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('meter-status', () => {
      if (meters.length >= C.MAX.meters) throw new Error(`err.tooManyMeters|${JSON.stringify({ max: C.MAX.meters })}`);
      const m = C.makeMeter({ name: f.name.value, kind: f.kind.value, unit: f.unit.value, price: f.price.value }, newId());
      if (save([...meters, m])) { activeId = m.id; lastCompare = null; f.name.value = ''; f.price.value = ''; say('meter-status', t('meters.added', { name: m.name }), 'ok'); render(); }
    });
  });
  $('reading-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('reading-status', () => {
      const m = active(); if (!m) throw new Error('err.noMeter');
      const r = C.makeReading({ day: f.day.value, value: f.value.value, reset: f.reset.checked }, newId());
      const next = C.addReading(m, r);
      if (update(() => next)) {
        const p = C.periods(next).find((x) => x.toId === r.id);
        say('reading-status', p && p.status === 'ok' ? t('reading.addedWith', { used: qty(p.milli, m), per: perDay(p.perDayMilli, m) }) : t('reading.added'), 'ok');
        f.value.value = ''; f.reset.checked = false; render();
      }
    });
  });
  $('compare-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget; say('compare-status', '');
    guard('compare-status', () => {
      if (!active()) throw new Error('err.noMeter');
      const pair = [{ from: f.aFrom.value, to: f.aTo.value }, { from: f.bFrom.value, to: f.bTo.value }];
      C.compare(active(), pair[0], pair[1]); // valide avant de mémoriser
      lastCompare = pair; renderCompare();
    });
  });

  // --- Compteurs
  $('meter-select').addEventListener('change', (e) => { activeId = e.target.value || null; lastCompare = null; try { localStorage.setItem(ACTIVE, activeId || ''); } catch (_) { /* confort */ } render(); });
  $('edit-price').addEventListener('click', () => {
    const m = active(); if (!m) return;
    const v = prompt(t('prompt.price', { unit: unitOf(m) }), m.price1e4 ? String(m.price1e4 / 1e4) : '');
    if (v === null) return;
    guard('meter-status', () => {
      const price1e4 = v.trim() === '' ? 0 : C.parsePrice(v);
      if (update((x) => ({ ...x, price1e4 }))) { say('meter-status', price1e4 ? t('meters.priceSet', { price: unitPrice({ ...m, price1e4 }) }) : t('meters.priceCleared'), 'ok'); render(); }
    });
  });
  $('delete-meter').addEventListener('click', () => {
    const m = active(); if (!m || !confirm(t('confirm.meter', { name: m.name, n: m.readings.length }))) return;
    if (save(meters.filter((x) => x.id !== m.id))) { activeId = meters[0] ? meters[0].id : null; lastCompare = null; render(); }
  });

  // Exemple généré dans la langue affichée : un compteur électrique sur 13 mois et un compteur d'eau.
  $('sample').addEventListener('click', () => guard('meter-status', () => {
    if (meters.length + 2 > C.MAX.meters) throw new Error(`err.tooManyMeters|${JSON.stringify({ max: C.MAX.meters })}`);
    const end = C.dayNum(today());
    const monthly = [420, 380, 350, 280, 210, 160, 140, 150, 190, 260, 330, 400, 410]; // kWh par période de 30 jours, plus en hiver
    let elec = C.makeMeter({ name: t('sample.elec'), kind: 'electricity', unit: 'kWh', price: '0.2516' }, newId());
    let water = C.makeMeter({ name: t('sample.water'), kind: 'water', unit: 'm3', price: '' }, newId());
    let idx = 18250, w = 731.2;
    for (let i = monthly.length; i >= 0; i--) {
      const day = C.numDay(end - i * 30);
      elec = C.addReading(elec, C.makeReading({ day, value: String(idx) }, newId()));
      water = C.addReading(water, C.makeReading({ day, value: w.toFixed(1) }, newId()));
      if (i > 0) { idx += monthly[monthly.length - i]; w += 6.5 + (i % 3); }
    }
    if (save([...meters, elec, water])) {
      activeId = elec.id;
      const f = $('compare-form');
      f.aFrom.value = C.numDay(end - 390); f.aTo.value = C.numDay(end - 300); f.bFrom.value = C.numDay(end - 90); f.bTo.value = C.numDay(end);
      lastCompare = [{ from: f.aFrom.value, to: f.aTo.value }, { from: f.bFrom.value, to: f.bTo.value }];
      say('meter-status', t('sample.added'), 'ok'); render();
    }
  }));

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const csvNum = (n, d) => L.number(n, { maximumFractionDigits: d, useGrouping: false });
  $('export-csv').addEventListener('click', () => guard('history-status', () => {
    const m = active(); if (!m) return;
    const u = unitOf(m);
    const rows = [[t('csv.meter'), t('csv.from'), t('csv.to'), t('csv.days'), t('csv.used', { unit: u }), t('csv.perDay', { unit: u }), t('csv.cost', { cur: L.currency }), t('csv.status')]];
    for (const p of C.periods(m)) {
      rows.push([m.name, p.from, p.to, String(p.days), p.status === 'ok' ? csvNum(p.milli / 1000, 3) : '', p.status === 'ok' ? csvNum(p.perDayMilli / 1000, 3) : '',
        p.status === 'ok' && p.costCents !== null ? csvNum(p.costCents / 100, 2) : '', p.status === 'ok' ? t('status.ok') : statusText(p)]);
    }
    download(`homeenergylog-${m.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.csv`, C.toCsv(rows), 'text/csv;charset=utf-8');
    say('history-status', t('csv.done'), 'ok');
  }));
  $('export').addEventListener('click', () => guard('backup-status', () => { download('homeenergylog-backup.json', C.backup(meters), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: meters.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; }
      activeId = next[0] ? next[0].id : null; lastCompare = null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('homeenergylog-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) meters = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = meters.some((m) => m.id === last) ? last : (meters[0] ? meters[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  $('reading-form').day.value = today();
  fillUnits();
  L.onChange(() => { for (const s of ['meter-status', 'reading-status', 'history-status', 'compare-status', 'backup-status']) say(s, ''); render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
