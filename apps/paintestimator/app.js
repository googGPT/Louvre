/* PaintEstimator — interface. Calculs dans core.js (PaintCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.PaintCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-paintestimator-v1'; // clé de stockage local
  const ACTIVE = 'louvre-paintestimator-active'; // projet affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let projects = []; // projets enregistrés
  let activeId = null;
  let readOnly = false; // stockage illisible : aucune écriture

  // --- Formats d'affichage (nombres selon la langue)
  const m2 = (cm2) => `${L.number(cm2 / 10000, { maximumFractionDigits: 2 })} m²`;
  const liters = (ml) => `${L.number(ml / 1000, { maximumFractionDigits: 2 })} L`;
  const meters = (cm) => L.number(cm / 100, { maximumFractionDigits: 2 });
  const plain = (n, d) => (n / 10 ** d).toFixed(d).replace(/\.?0+$/, ''); // valeur réinjectée dans un champ

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return projects.find((p) => p.id === activeId) || null; }

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); projects = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function update(mutator) { const cur = active(); return save(projects.map((p) => (p.id === cur.id ? mutator(p) : p))); }
  function ensureProject() { // crée un premier projet si besoin
    if (active()) return true;
    if (projects.length) { activeId = projects[0].id; return true; }
    if (projects.length >= C.MAX.projects) throw new Error(`err.tooManyProjects|${JSON.stringify({ max: C.MAX.projects })}`);
    const first = C.makeProject(t('project.defaultName'), newId());
    if (!save([first])) return false;
    activeId = first.id; return true;
  }

  // --- Affichage
  function renderProjects() {
    const sel = $('project-select');
    sel.replaceChildren(...projects.map((p) => { const o = el('option', '', p.name); o.value = p.id; return o; }));
    if (activeId) sel.value = activeId;
    $('rename-project').disabled = $('delete-project').disabled = !active();
  }
  function renderSettings() { // remplit le formulaire depuis le projet (sans écraser une saisie en cours)
    const p = active(), f = $('settings-form');
    if (document.activeElement && f.contains(document.activeElement)) return;
    f.coats.value = p ? String(p.coats) : '2';
    f.coverage.value = p && p.coverage10 ? plain(p.coverage10, 1) : '';
    f.margin.value = p ? String(p.marginPct) : '0';
  }
  function renderCans() {
    const p = active(), ul = $('can-list');
    $('cur-symbol').textContent = L.currencySymbol();
    const cans = p ? [...p.cans].sort((a, b) => a.volumeMl - b.volumeMl) : [];
    if (!cans.length) { ul.replaceChildren(el('li', 'empty', t('cans.empty'))); return; }
    ul.replaceChildren(...cans.map((c) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', `${liters(c.volumeMl)} — ${L.money(c.priceCents)}`), el('span', '', t('cans.perLiter', { price: L.money(Math.round(c.priceCents * 1000 / c.volumeMl)) })));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeCan', { size: liters(c.volumeMl) }));
      del.addEventListener('click', () => { if (update((x) => ({ ...x, cans: x.cans.filter((k) => k.id !== c.id) }))) render(); });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  function renderRooms() {
    const p = active(), ul = $('room-list'), sel = $('opening-room');
    const rooms = p ? p.rooms : [];
    const keep = sel.value;
    sel.replaceChildren(...rooms.map((r) => { const o = el('option', '', r.name); o.value = r.id; return o; }));
    if (rooms.some((r) => r.id === keep)) sel.value = keep;
    $('add-opening').disabled = !rooms.length;
    if (!rooms.length) { ul.replaceChildren(el('li', 'empty', t('rooms.empty'))); return; }
    ul.replaceChildren(...rooms.map((r) => {
      const li = el('li', 'room-card'), head = el('div', 'room-head'), txt = el('div', 'txt');
      let areaText;
      try { const a = C.roomAreas(r); areaText = t('rooms.area', { walls: m2(a.wallCm2), net: m2(a.totalCm2) }); } catch (e) { areaText = L.error(e); }
      txt.append(el('b', '', r.name), el('span', '', t('rooms.dims', { perimeter: meters(r.perimeterCm), height: meters(r.heightCm) }) + (r.ceilingCm2 ? ' · ' + t('rooms.ceiling', { area: m2(r.ceilingCm2) }) : '')), el('span', '', areaText));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeRoom', { name: r.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('confirm.room', { name: r.name }))) return;
        if (update((x) => ({ ...x, rooms: x.rooms.filter((k) => k.id !== r.id) }))) render();
      });
      head.append(txt, del); li.append(head);
      if (r.openings.length) {
        const ol = el('ul', 'openings');
        for (const o of r.openings) {
          const row = el('li'), label = t('opening.line', { kind: t('kind.' + o.kind), count: o.count, w: meters(o.widthCm), h: meters(o.heightCm), area: m2(o.widthCm * o.heightCm * o.count) });
          const x = el('button', 'btn small', '✕'); x.type = 'button'; x.title = t('btn.remove'); x.setAttribute('aria-label', t('aria.removeOpening', { label }));
          x.addEventListener('click', () => { if (update((pp) => ({ ...pp, rooms: pp.rooms.map((rr) => (rr.id === r.id ? { ...rr, openings: rr.openings.filter((k) => k.id !== o.id) } : rr)) }))) render(); });
          row.append(el('span', '', label), x); ol.append(row);
        }
        li.append(ol);
      }
      return li;
    }));
  }

  let last = null; // dernière estimation (pour l'export CSV)
  function renderResult() {
    const p = active();
    $('result').hidden = true; $('result-error').hidden = true; $('result-empty').hidden = false; last = null;
    if (!p || !p.rooms.length || !p.coverage10) return;
    let e;
    try { e = C.estimate(p); } catch (err) { $('result-empty').hidden = true; $('result-error').hidden = false; $('result-error').textContent = L.error(err); return; }
    last = e; $('result-empty').hidden = true; $('result').hidden = false;
    $('k-area').textContent = m2(e.totalCm2);
    $('k-liters').textContent = liters(e.needMl);
    $('liters-detail').textContent = t('result.detail', { area: m2(e.totalCm2), coats: p.coats, coverage: L.number(p.coverage10 / 10), raw: liters(e.rawMl), margin: p.marginPct, need: liters(e.needMl) });
    const combo = $('combo');
    combo.className = 'verdict';
    combo.replaceChildren();
    if (!e.combo) { combo.className = 'verdict bad'; combo.textContent = t('combo.noCans'); $('k-cans').textContent = '—'; $('k-cost').textContent = '—'; }
    else if (e.combo.tooBig) { combo.className = 'verdict bad'; combo.textContent = t('combo.tooBig', { max: L.number(C.MAX.needMl / 1000) }); $('k-cans').textContent = '—'; $('k-cost').textContent = '—'; }
    else {
      $('k-cans').textContent = L.number(e.combo.count);
      $('k-cost').textContent = L.money(e.combo.totalCents);
      combo.append(el('span', 'combo-line', t('combo.best')));
      for (const it of e.combo.items) combo.append(el('span', 'combo-line', t('combo.item', { n: it.qty, size: liters(it.volumeMl), price: L.money(it.priceCents), total: L.money(it.priceCents * it.qty) })));
      combo.append(el('span', 'combo-line', t('combo.total', { volume: liters(e.combo.totalMl), cost: L.money(e.combo.totalCents), left: liters(e.combo.leftoverMl) })));
    }
    $('singles').replaceChildren(...e.singles.map((s) => el('li', '', t('singles.line', { n: s.qty, size: liters(s.volumeMl), cost: L.money(s.totalCents), left: liters(s.leftoverMl) }))));
    const table = $('room-table'), head = el('tr');
    for (const [txt, cls] of [[t('th.room'), ''], [t('th.walls'), 'num'], [t('th.openings'), 'num'], [t('th.ceiling'), 'num'], [t('th.total'), 'num']]) head.append(el('th', cls, txt));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const r of e.rooms) { const tr = el('tr'); tr.append(el('td', '', r.name), el('td', 'num', m2(r.wallCm2)), el('td', 'num', '−' + m2(r.openingsCm2)), el('td', 'num', m2(r.ceilingCm2)), el('td', 'num', m2(r.totalCm2))); tbody.append(tr); }
    table.replaceChildren(thead, tbody);
  }
  // withSettings = false : changement de langue, on ne touche pas aux réglages en cours de saisie.
  function render(withSettings = true) { renderProjects(); if (withSettings) renderSettings(); renderCans(); renderRooms(); renderResult(); }

  // --- Formulaires
  function guard(statusId, fn) { try { fn(); } catch (e) { say(statusId, L.error(e), 'error'); } }
  $('settings-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('settings-status', () => {
      const s = C.makeSettings({ coats: f.coats.value, coverage: f.coverage.value, margin: f.margin.value });
      if (!ensureProject()) return;
      if (update((p) => ({ ...p, ...s }))) { say('settings-status', t('settings.saved'), 'ok'); document.activeElement.blur(); render(); }
    });
  });
  $('can-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('can-status', () => {
      const c = C.makeCan({ volume: f.volume.value, price: f.price.value }, newId());
      if (!ensureProject()) return;
      const p = active();
      if (p.cans.length >= C.MAX.cans) throw new Error(`err.tooManyCans|${JSON.stringify({ max: C.MAX.cans })}`);
      if (p.cans.some((k) => k.volumeMl === c.volumeMl)) throw new Error('err.duplicateCan');
      if (update((x) => ({ ...x, cans: [...x.cans, c] }))) { say('can-status', t('cans.added', { size: liters(c.volumeMl) }), 'ok'); f.volume.value = ''; f.price.value = ''; f.volume.focus(); render(); }
    });
  });
  $('room-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('room-status', () => {
      const r = C.makeRoom({ name: f.name.value, perimeter: f.perimeter.value, height: f.height.value, ceiling: f.ceiling.value }, newId());
      if (!ensureProject()) return;
      if (active().rooms.length >= C.MAX.rooms) throw new Error(`err.tooManyRooms|${JSON.stringify({ max: C.MAX.rooms })}`);
      if (update((x) => ({ ...x, rooms: [...x.rooms, r] }))) {
        say('room-status', t('rooms.added', { name: r.name }), 'ok');
        f.name.value = ''; f.perimeter.value = ''; f.ceiling.value = ''; f.name.focus();
        render(); $('opening-room').value = r.id;
      }
    });
  });
  $('opening-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('opening-status', () => {
      const p = active(); const room = p && p.rooms.find((r) => r.id === f.room.value);
      if (!room) throw new Error('err.noRoom');
      if (room.openings.length >= C.MAX.openings) throw new Error(`err.tooManyOpenings|${JSON.stringify({ max: C.MAX.openings })}`);
      const o = C.makeOpening({ kind: f.kind.value, width: f.width.value, height: f.height.value, count: f.count.value }, newId());
      const next = { ...room, openings: [...room.openings, o] };
      C.roomAreas(next); // refuse avant d'enregistrer si les ouvertures dépassent les murs
      if (update((x) => ({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? next : r)) }))) {
        say('opening-status', t('opening.added', { name: room.name }), 'ok'); f.width.value = ''; f.height.value = ''; f.count.value = '1'; render();
      }
    });
  });

  // Exemple généré dans la langue affichée : un nouveau projet complet.
  $('sample').addEventListener('click', () => guard('project-status', () => {
    if (projects.length >= C.MAX.projects) throw new Error(`err.tooManyProjects|${JSON.stringify({ max: C.MAX.projects })}`);
    const living = C.makeRoom({ name: t('sample.living'), perimeter: '18', height: '2.5', ceiling: '' }, newId(), [
      C.makeOpening({ kind: 'door', width: '0.83', height: '2.04', count: '1' }, newId()),
      C.makeOpening({ kind: 'window', width: '1.2', height: '1.35', count: '2' }, newId()),
    ]);
    const bedroom = C.makeRoom({ name: t('sample.bedroom'), perimeter: '13', height: '2.5', ceiling: '10.5' }, newId(), [
      C.makeOpening({ kind: 'door', width: '0.83', height: '2.04', count: '1' }, newId()),
      C.makeOpening({ kind: 'window', width: '1', height: '1.2', count: '1' }, newId()),
    ]);
    const p = { ...C.makeProject(t('sample.project'), newId()), ...C.makeSettings({ coats: '2', coverage: '10', margin: '5' }), rooms: [living, bedroom],
      cans: [C.makeCan({ volume: '0.5', price: '12.90' }, newId()), C.makeCan({ volume: '2.5', price: '39.90' }, newId()), C.makeCan({ volume: '10', price: '129' }, newId())] };
    if (save([...projects, p])) { activeId = p.id; render(); say('project-status', t('sample.added'), 'ok'); }
  }));

  // --- Projets
  $('project-select').addEventListener('change', (e) => { activeId = e.target.value; try { localStorage.setItem(ACTIVE, activeId); } catch (_) { /* confort */ } render(); });
  $('new-project').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('project.newDefault', { n: projects.length + 1 }));
    if (name === null) return;
    guard('project-status', () => {
      if (projects.length >= C.MAX.projects) throw new Error(`err.tooManyProjects|${JSON.stringify({ max: C.MAX.projects })}`);
      const p = C.makeProject(name, newId()); if (save([...projects, p])) { activeId = p.id; render(); }
    });
  });
  $('rename-project').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name); if (name === null) return;
    guard('project-status', () => { const fixed = C.makeProject(name, cur.id); if (update((p) => ({ ...p, name: fixed.name }))) render(); });
  });
  $('delete-project').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.rooms.length }))) return;
    if (save(projects.filter((p) => p.id !== cur.id))) { activeId = projects[0] ? projects[0].id : null; render(); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const csvNum = (n, d) => L.number(n, { minimumFractionDigits: 0, maximumFractionDigits: d, useGrouping: false });
  $('export-csv').addEventListener('click', () => guard('result-status', () => {
    if (!last) return;
    const rows = [[t('th.room'), t('csv.walls'), t('csv.openings'), t('csv.ceiling'), t('csv.total')]];
    for (const r of last.rooms) rows.push([r.name, csvNum(r.wallCm2 / 1e4, 4), csvNum(r.openingsCm2 / 1e4, 4), csvNum(r.ceilingCm2 / 1e4, 4), csvNum(r.totalCm2 / 1e4, 4)]);
    rows.push([], [t('csv.need'), csvNum(last.needMl / 1000, 3)]);
    if (last.combo && !last.combo.tooBig) {
      rows.push([t('csv.can', { cur: L.currency }), t('csv.qty'), t('csv.unitPrice', { cur: L.currency }), t('csv.subtotal', { cur: L.currency })]);
      for (const it of last.combo.items) rows.push([csvNum(it.volumeMl / 1000, 3), String(it.qty), csvNum(it.priceCents / 100, 2), csvNum(it.priceCents * it.qty / 100, 2)]);
      rows.push([t('csv.totalCost', { cur: L.currency }), '', '', csvNum(last.combo.totalCents / 100, 2)]);
    }
    download('paintestimator.csv', C.toCsv(rows), 'text/csv;charset=utf-8');
    say('result-status', t('csv.done'), 'ok');
  }));
  $('print').addEventListener('click', () => window.print());
  $('export').addEventListener('click', () => guard('backup-status', () => { download('paintestimator-backup.json', C.backup(projects), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: projects.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      activeId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: e instanceof SyntaxError ? t('err.backup') : L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('paintestimator-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) projects = C.validateBackup(JSON.parse(raw));
    const lastId = localStorage.getItem(ACTIVE);
    activeId = projects.some((p) => p.id === lastId) ? lastId : (projects[0] ? projects[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const s of ['project-status', 'settings-status', 'can-status', 'room-status', 'opening-status', 'result-status', 'backup-status']) say(s, ''); render(false); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
