/* MoveBox — interface. Calculs dans core.js (MoveCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.MoveCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-movebox-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const PALETTE = ['#1864ab', '#a8390b', '#237032', '#862e9c', '#a61e4d', '#0b5f6e', '#5f3dc4', '#7a5200']; // une couleur par pièce (étiquettes)

  let data = { settings: { maxWeightG: null }, boxes: [] };
  let readOnly = false;
  let editing = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const kg = (g) => t('weight.kg', { v: L.number(g / 1000, { maximumFractionDigits: 3 }) });
  const statusName = (s) => t('status.' + s);
  function roomColors() {
    const names = [...new Set(data.boxes.map((b) => C.norm(b.room)))].sort();
    return (room) => PALETTE[names.indexOf(C.norm(room)) % PALETTE.length] || PALETTE[0];
  }

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // ---------- Formulaire
  function resetForm() {
    editing = null;
    const f = $('box-form');
    f.number.value = String(C.nextNumber(data.boxes)); f.weight.value = ''; f.fragile.checked = false; f.items.value = ''; f.notes.value = '';
    $('save').textContent = t('btn.add'); $('save').dataset.i18n = 'btn.add'; $('cancel').hidden = true;
  }
  $('box-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (!editing && data.boxes.length >= C.MAX_BOXES) throw new Error(`err.tooManyBoxes|${JSON.stringify({ max: C.MAX_BOXES })}`);
      const old = data.boxes.find((b) => b.id === editing);
      const box = C.makeBox({ number: f.number.value, room: C.matchRoom(f.room.value, data.boxes), items: f.items.value, fragile: f.fragile.checked,
        weight: f.weight.value, notes: f.notes.value, status: old ? old.status : 'packed' }, editing || newId(), data.boxes);
      const boxes = old ? data.boxes.map((b) => (b.id === box.id ? box : b)) : [...data.boxes, box];
      if (!save({ ...data, boxes: boxes.sort((a, b) => a.number - b.number) })) return;
      say('box-status', t(old ? 'box.updated' : 'box.added', { n: box.number, room: box.room }), 'ok');
      const room = box.room; resetForm(); f.room.value = room; // on enchaîne souvent plusieurs cartons de la même pièce
      render(); f.items.focus();
    } catch (e) { say('box-status', L.error(e), 'error'); }
  });
  $('cancel').addEventListener('click', () => { resetForm(); $('box-form').room.value = ''; say('box-status', ''); });
  function edit(b) {
    editing = b.id; const f = $('box-form');
    f.number.value = String(b.number); f.room.value = b.room; f.weight.value = b.weightG === null ? '' : String(b.weightG / 1000);
    f.fragile.checked = b.fragile; f.items.value = b.items.join('\n'); f.notes.value = b.notes;
    $('save').textContent = t('btn.update'); $('save').dataset.i18n = 'btn.update'; $('cancel').hidden = false;
    say('box-status', t('box.editing', { n: b.number }));
    f.scrollIntoView({ block: 'start' }); f.items.focus();
  }

  // ---------- Recherche
  function renderSearch() {
    const q = $('search').value;
    if (!q.trim()) { $('results').replaceChildren(); say('search-status', ''); return; }
    const res = C.search(data.boxes, q);
    say('search-status', res.length ? t('search.found', { n: res.length }) : t('search.none'), res.length ? 'ok' : '');
    const color = roomColors();
    $('results').replaceChildren(...res.slice(0, 50).map(({ box, hits }) => {
      const li = el('li'), head = el('div', 'res-head');
      head.append(el('b', 'num', `#${box.number}`), roomTag(box.room, color), el('span', 'pill st-' + box.status, statusName(box.status)));
      li.append(head);
      const shown = hits.length ? hits.map((k) => box.items[k]) : box.items.slice(0, 4);
      if (shown.length) li.append(el('p', 'items', shown.join(' · ')));
      return li;
    }));
  }
  $('search').addEventListener('input', renderSearch);

  // ---------- Liste, filtres, suivi
  function roomTag(room, color) { const s = el('span', 'room'); s.style.setProperty('--room', color(room)); s.textContent = room; return s; }
  function filtered() {
    const st = $('f-status').value, room = $('f-room').value;
    return data.boxes.filter((b) => (st === 'all' || b.status === st) && (room === 'all' || C.norm(b.room) === room));
  }
  function fillSelect(id, options, keep) {
    const sel = $(id), value = keep !== undefined ? keep : sel.value;
    sel.replaceChildren(...options.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    sel.value = options.some((o) => o[0] === value) ? value : options[0][0];
  }
  function kpi(label, value, cls = '') { const d = el('div', 'kpi ' + cls); d.append(el('span', '', label), el('strong', '', value)); return d; }
  function renderList() {
    const s = C.stats(data.boxes, data.settings.maxWeightG);
    $('kpis').replaceChildren(kpi(t('kpi.boxes'), L.number(s.count)), kpi(t('kpi.loaded'), L.number(s.byStatus.loaded)),
      kpi(t('kpi.arrived'), t('kpi.of', { a: L.number(s.arrived), b: L.number(s.count) })), kpi(t('kpi.weight'), kg(s.weightG)));
    $('progress').replaceChildren(...C.STATUSES.map((st) => { const i = el('i', 'st-' + st); i.style.flexGrow = String(s.byStatus[st]); return i; }));
    $('progress').hidden = !s.count;
    const notes = [];
    if (s.unknownWeight) notes.push(t('weight.unknown', { n: s.unknownWeight }));
    if (s.fragile) notes.push(t('weight.fragile', { n: s.fragile }));
    if (s.heavy.length) notes.push(t('weight.heavy', { list: s.heavy.map((n) => '#' + n).join(', '), max: kg(data.settings.maxWeightG) }));
    $('weight-note').textContent = notes.join(' ');
    $('weight-note').className = 'hint' + (s.heavy.length ? ' alert' : '');
    // Filtres (valeurs conservées lors d'un changement de langue).
    fillSelect('f-status', [['all', t('filter.allStatus')], ...C.STATUSES.map((st) => [st, `${statusName(st)} (${s.byStatus[st]})`])]);
    fillSelect('f-room', [['all', t('filter.allRooms')], ...s.rooms.slice().sort((a, b) => a.room.localeCompare(b.room, L.locale)).map((r) => [C.norm(r.room), `${r.room} (${r.count})`])]);
    fillSelect('bulk-status', C.STATUSES.map((st) => [st, statusName(st)]));
    $('rooms').replaceChildren(...s.rooms.map((r) => { const o = el('option'); o.value = r.room; return o; }));
    const list = filtered(), color = roomColors(), heavy = new Set(s.heavy);
    $('bulk-apply').disabled = !list.length;
    $('print-labels').disabled = !list.length; $('export-csv').disabled = !data.boxes.length;
    if (!list.length) { $('boxes').replaceChildren(el('li', 'empty', t(data.boxes.length ? 'boxes.noneFiltered' : 'boxes.empty'))); }
    else $('boxes').replaceChildren(...list.map((b) => {
      const li = el('li', 'card st-' + b.status), head = el('div', 'card-head');
      head.append(el('b', 'num', `#${b.number}`), roomTag(b.room, color));
      if (b.fragile) head.append(el('span', 'pill fragile', t('tag.fragile')));
      if (heavy.has(b.number)) head.append(el('span', 'pill heavy', t('tag.heavy')));
      li.append(head);
      li.append(el('p', 'items', b.items.length ? b.items.join(' · ') : t('box.noItems')));
      const meta = [b.weightG === null ? t('box.noWeight') : kg(b.weightG)];
      if (b.notes) meta.push(b.notes);
      li.append(el('p', 'meta', meta.join(' · ')));
      const acts = el('div', 'acts');
      const sel = el('select'); sel.setAttribute('aria-label', t('aria.status', { n: b.number }));
      for (const st of C.STATUSES) { const o = el('option', '', statusName(st)); o.value = st; sel.append(o); }
      sel.value = b.status;
      sel.addEventListener('change', () => { if (save({ ...data, boxes: C.setStatus(data.boxes, [b.id], sel.value) })) { say('list-status', t('status.changed', { n: b.number, status: statusName(sel.value) }), 'ok'); render(); } });
      acts.append(sel);
      if (b.status !== 'opened') {
        const nx = C.nextStatus(b.status), go = el('button', 'btn', t('btn.next', { status: statusName(nx) })); go.type = 'button';
        go.setAttribute('aria-label', t('aria.next', { n: b.number, status: statusName(nx) }));
        go.addEventListener('click', () => { if (save({ ...data, boxes: C.setStatus(data.boxes, [b.id], nx) })) { say('list-status', t('status.changed', { n: b.number, status: statusName(nx) }), 'ok'); render(); } });
        acts.append(go);
      }
      const ed = el('button', 'btn', t('btn.edit')); ed.type = 'button'; ed.setAttribute('aria-label', t('aria.edit', { n: b.number })); ed.addEventListener('click', () => edit(b));
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { n: b.number }));
      del.addEventListener('click', () => {
        if (!confirm(t('box.confirmDelete', { n: b.number }))) return;
        if (save({ ...data, boxes: data.boxes.filter((x) => x.id !== b.id) })) { if (editing === b.id) resetForm(); render(); say('list-status', t('box.deleted', { n: b.number }), 'ok'); }
      });
      acts.append(ed, del); li.append(acts); return li;
    }));
    // Tableau par pièce
    const thead = el('thead'), hr = el('tr');
    for (const [txt, cls] of [[t('th.room')], [t('th.boxes'), 'num'], [t('th.weight'), 'num'], [t('th.arrived'), 'num']]) hr.append(el('th', cls || '', txt));
    thead.append(hr);
    const tbody = el('tbody');
    for (const r of s.rooms.slice().sort((a, b) => a.room.localeCompare(b.room, L.locale))) {
      const tr = el('tr'), td = el('td'); td.append(roomTag(r.room, color));
      tr.append(td, el('td', 'num', L.number(r.count)), el('td', 'num', kg(r.weightG)), el('td', 'num', t('kpi.of', { a: L.number(r.arrived), b: L.number(r.count) })));
      tbody.append(tr);
    }
    $('rooms-table').replaceChildren(thead, tbody);
    if (!s.rooms.length) $('rooms-table').replaceChildren(el('caption', 'empty', t('boxes.empty')));
  }
  $('f-status').addEventListener('change', renderList);
  $('f-room').addEventListener('change', renderList);
  $('bulk-apply').addEventListener('click', () => {
    const list = filtered(), st = $('bulk-status').value;
    if (!list.length || !confirm(t('bulk.confirm', { n: list.length, status: statusName(st) }))) return;
    if (save({ ...data, boxes: C.setStatus(data.boxes, list.map((b) => b.id), st) })) { render(); say('list-status', t('bulk.done', { n: list.length, status: statusName(st) }), 'ok'); }
  });
  $('max-weight').addEventListener('change', () => {
    try {
      const g = C.parseWeightKg($('max-weight').value);
      if (g === data.settings.maxWeightG) return; // valeur inchangée : pas de réaffichage (un clic en cours ne serait pas perdu)
      if (save({ ...data, settings: { maxWeightG: g } })) { say('list-status', g ? t('max.set', { max: kg(g) }) : t('max.cleared'), 'ok'); render(); }
    } catch (e) { say('list-status', L.error(e), 'error'); }
  });

  // ---------- Étiquettes (impression)
  function renderLabels(list) {
    const color = roomColors();
    $('labels').replaceChildren(...list.map((b) => {
      const d = el('div', 'label'); d.style.setProperty('--room', color(b.room));
      const top = el('div', 'l-top'); top.append(el('span', 'l-num', `#${b.number}`), el('span', 'l-up', t('label.up')));
      d.append(top, el('div', 'l-room', b.room));
      if (b.fragile) d.append(el('div', 'l-fragile', t('label.fragile')));
      d.append(el('p', 'l-items', b.items.slice(0, 8).join(' · ') + (b.items.length > 8 ? ' …' : '')));
      if (b.weightG !== null) d.append(el('p', 'l-weight', kg(b.weightG)));
      return d;
    }));
  }
  $('print-labels').addEventListener('click', () => {
    const list = filtered(); if (!list.length) return;
    renderLabels(list); document.body.classList.add('print-labels');
    say('backup-status', t('labels.ready', { n: list.length }), 'ok');
    window.print();
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('print-labels'));

  // ---------- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      const csv = C.toCSV(data.boxes, { headers: ['csv.number', 'csv.room', 'csv.items', 'csv.fragile', 'csv.weight', 'csv.status', 'csv.notes'].map((k) => t(k)),
        statusLabel: statusName, yes: t('csv.yes'), no: t('csv.no'), decimal: L.number(1.5).includes(',') ? 'comma' : 'dot' });
      download('movebox-inventory.csv', csv, 'text/csv;charset=utf-8'); say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('movebox-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.boxes.length, b: next.boxes.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; resetForm(); render();
      say('backup-status', t('backup.restored', { n: next.boxes.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('movebox-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Exemple dans la langue affichée
  $('sample').addEventListener('click', () => {
    if (data.boxes.length && !confirm(t('sample.confirm'))) return;
    try {
      const boxes = [];
      const plan = [
        ['kitchen', ['plates', 'glasses', 'kettle'], true, '14.2', 'delivered'], ['kitchen', ['pans', 'cutlery'], false, '18', 'loaded'],
        ['living', ['books', 'remote'], false, '23.5', 'loaded'], ['bedroom', ['sheets', 'pillows'], false, '6.8', 'opened'],
        ['office', ['cables', 'documents'], false, '', 'packed'], ['bathroom', ['towels', 'mirror'], true, '9.4', 'packed'],
      ];
      plan.forEach(([room, items, fragile, weight, status], k) => {
        boxes.push(C.makeBox({ number: String(k + 1), room: t('sample.room.' + room), items: items.map((i) => t('sample.item.' + i)), fragile, weight, status, notes: k === 3 ? t('sample.note') : '' }, newId(), boxes));
      });
      if (!save({ settings: { maxWeightG: 20000 }, boxes })) return;
      $('f-status').value = 'all'; $('f-room').value = 'all';
      resetForm(); render(); say('box-status', t('sample.done'), 'ok');
    } catch (e) { say('box-status', L.error(e), 'error'); }
  });

  function render() {
    $('max-weight').value = data.settings.maxWeightG ? String(data.settings.maxWeightG / 1000) : '';
    renderList(); renderSearch();
  }

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  resetForm();
  L.onChange(() => { // la saisie du formulaire et de la recherche est conservée
    for (const id of ['box-status', 'list-status', 'backup-status']) say(id, '');
    $('save').textContent = t(editing ? 'btn.update' : 'btn.add');
    renderList(); renderSearch(); // sans réécrire le champ « poids maximal » en cours de saisie
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
