/* TravelPackingWeight — interface. Calculs dans core.js (PackCore) ; textes dans LouvreI18n (appli sans argent). */
(() => {
  'use strict';
  const C = window.PackCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-travelpackingweight-v1';
  const ACTIVE = 'louvre-travelpackingweight-active';
  const UNIT_KEY = 'louvre-travelpackingweight-unit'; // unité d'affichage (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let trips = [], activeId = null, readOnly = false;
  let unit = 'kg';
  try { if (localStorage.getItem(UNIT_KEY) === 'lb') unit = 'lb'; } catch (_) { /* confort */ }

  // Poids affiché dans l'unité choisie (kg ou lb).
  const w = (g) => (unit === 'lb' ? `${L.number(g / C.UNITS.lb, { maximumFractionDigits: 1 })} lb` : `${L.number(g / 1000, { maximumFractionDigits: 2 })} kg`);
  const plainIn = (g, u) => (g ? String(Math.round(g / C.UNITS[u] * 1000) / 1000) : ''); // valeur remise dans un champ

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
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

  // --- Affichage
  function renderTrips() {
    const sel = $('trip-select');
    sel.replaceChildren(...trips.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    if (!trips.length) { const o = el('option', '', t('trip.none')); o.value = ''; sel.append(o); }
    if (activeId) sel.value = activeId;
    $('rename-trip').disabled = $('delete-trip').disabled = !active();
    $('display-unit').value = unit;
    document.querySelectorAll('.unit-label').forEach((n) => { n.textContent = unit; });
  }
  function renderLimits() { // remplit le formulaire depuis le voyage (seulement hors changement de langue)
    const f = $('limits-form'), tr = active(), u = f.unit.value;
    for (const k of C.TYPES) f[k].value = tr ? plainIn(tr.limits[k], u) : '';
  }
  function renderBagSelect() {
    const tr = active(), sel = $('item-bag'), keep = sel.value;
    const bags = tr ? tr.bags : [];
    sel.replaceChildren(...bags.map((b) => { const o = el('option', '', b.name); o.value = b.id; return o; }));
    if (bags.some((b) => b.id === keep)) sel.value = keep;
    $('add-item').disabled = !bags.length;
  }
  function limitText(b) {
    if (!b.limitG) return t('bag.noLimit', { type: t('type.' + b.type) });
    if (b.excessG) return t('bag.over', { limit: w(b.limitG), excess: w(b.excessG) });
    return t('bag.under', { limit: w(b.limitG), spare: w(b.spareG) });
  }
  function renderBags() {
    const tr = active(), box = $('bag-cards');
    const bags = tr ? tr.bags : [];
    $('bags-empty').hidden = bags.length > 0;
    if (!tr) { $('k-total').textContent = '—'; $('k-over').textContent = '—'; box.replaceChildren(); return; }
    const s = C.summary(tr);
    $('k-total').textContent = w(s.totalG);
    $('k-over').textContent = s.overweight ? t('kpi.overN', { n: s.overweight, excess: w(s.excessG) }) : t('kpi.none');
    box.replaceChildren(...s.bags.map((b) => {
      const bag = tr.bags.find((x) => x.id === b.bagId);
      const card = el('article', 'bag' + (b.excessG ? ' over' : '')), head = el('div', 'bag-head'), title = el('div');
      title.append(el('b', '', bag.name), el('span', '', t('bag.meta', { type: t('type.' + bag.type), tare: w(bag.tareG) })));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeBag', { name: bag.name }));
      del.addEventListener('click', () => {
        const n = tr.items.filter((i) => i.bagId === bag.id).length;
        if (!confirm(t('confirm.bag', { name: bag.name, n }))) return;
        if (update((x) => ({ ...x, bags: x.bags.filter((k) => k.id !== bag.id), items: x.items.filter((i) => i.bagId !== bag.id) }))) render();
      });
      const right = el('div', 'row tight'); right.append(el('span', 'bag-weight', w(b.totalG)), del);
      head.append(title, right);
      const gauge = el('div', 'gauge'), fill = el('i');
      fill.style.width = (b.limitG ? Math.min(100, Math.round(100 * b.totalG / b.limitG)) : 0) + '%';
      gauge.append(fill);
      if (b.limitG) gauge.setAttribute('role', 'presentation');
      card.append(head, gauge, el('p', 'gauge-text', limitText(b)));
      const items = tr.items.filter((i) => i.bagId === bag.id).sort((a, c) => c.weightG * c.qty - a.weightG * a.qty || a.name.localeCompare(c.name, L.locale));
      if (items.length) {
        const ul = el('ul', 'items');
        for (const it of items) {
          const li = el('li'), nm = el('span', 'nm', it.qty > 1 ? `${it.name} × ${it.qty}` : it.name);
          if (it.fixed) nm.append(el('span', 'lock', t('item.fixed')));
          const move = el('select'); move.setAttribute('aria-label', t('aria.moveItem', { name: it.name }));
          for (const other of tr.bags) { const o = el('option', '', other.name); o.value = other.id; move.append(o); }
          move.value = it.bagId;
          move.addEventListener('change', () => guard('item-status', () => { if (update((x) => ({ ...x, items: x.items.map((i) => (i.id === it.id ? { ...i, bagId: move.value } : i)) }))) render(); }));
          const x = el('button', 'btn', '✕'); x.type = 'button'; x.title = t('btn.remove'); x.setAttribute('aria-label', t('aria.removeItem', { name: it.name }));
          x.addEventListener('click', () => { if (update((tt) => ({ ...tt, items: tt.items.filter((i) => i.id !== it.id) }))) render(); });
          const acts = el('span', 'row tight'); acts.append(move, x);
          li.append(nm, el('span', 'w', it.qty > 1 ? t('item.weightQty', { unit: w(it.weightG), total: w(it.weightG * it.qty) }) : w(it.weightG)), acts);
          ul.append(li);
        }
        card.append(ul);
      } else card.append(el('p', 'gauge-text', t('bag.empty')));
      return card;
    }));
  }
  let lastMoves = null;
  function renderMoves() {
    const tr = active(), box = $('moves');
    $('apply-moves').hidden = true; lastMoves = null; $('export-csv').disabled = !tr || !tr.items.length;
    if (!tr || !tr.bags.length) { box.replaceChildren(el('p', 'empty', t('moves.empty'))); return; }
    const r = C.suggestMoves(tr), name = (id) => (tr.bags.find((b) => b.id === id) || {}).name;
    const parts = [];
    if (!r.moves.length && !r.unresolved.length) parts.push(el('p', 'verdict', C.summary(tr).overweight ? t('moves.none') : t('moves.ok')));
    if (r.moves.length) {
      parts.push(el('p', '', t('moves.intro')));
      const ol = el('ol', 'moves');
      for (const m of r.moves) ol.append(el('li', '', t('moves.line', { n: m.qty, name: m.name, weight: w(m.weightG * m.qty), from: name(m.from), to: name(m.to) })));
      parts.push(ol);
      lastMoves = r.moves; $('apply-moves').hidden = false;
    }
    for (const u of r.unresolved) parts.push(el('p', 'verdict bad', t('moves.unresolved', { name: u.name, excess: w(u.excessG) })));
    box.replaceChildren(...parts);
  }
  // withForms = false : changement de langue, on ne touche pas aux limites en cours de saisie.
  function render(withForms = true) { renderTrips(); if (withForms) renderLimits(); renderBagSelect(); renderBags(); renderMoves(); }

  // --- Formulaires
  $('limits-form').unit.addEventListener('change', () => renderLimits());
  $('limits-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('limits-status', () => {
      const limits = C.makeLimits({ cabin: f.cabin.value, checked: f.checked.value, personal: f.personal.value }, f.unit.value);
      if (!ensureTrip()) return;
      if (update((x) => ({ ...x, limits }))) { say('limits-status', t('limits.saved'), 'ok'); render(); }
    });
  });
  $('bag-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('bag-status', () => {
      const b = C.makeBag({ name: f.name.value, type: f.type.value, tare: f.tare.value }, newId(), unit);
      if (!ensureTrip()) return;
      if (active().bags.length >= C.MAX.bags) throw tooMany('err.tooManyBags', C.MAX.bags);
      if (update((x) => ({ ...x, bags: [...x.bags, b] }))) { say('bag-status', t('bags.added', { name: b.name }), 'ok'); f.name.value = ''; f.tare.value = ''; render(); $('item-bag').value = b.id; }
    });
  });
  $('item-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('item-status', () => {
      const tr = active(); if (!tr || !tr.bags.length) throw new Error('err.noBag');
      if (tr.items.length >= C.MAX.items) throw tooMany('err.tooManyItems', C.MAX.items);
      const it = C.makeItem({ name: f.name.value, weight: f.weight.value, qty: f.qty.value, bagId: f.bag.value, fixed: f.fixed.checked }, newId(), f.unit.value);
      if (!tr.bags.some((b) => b.id === it.bagId)) throw new Error('err.noBag');
      if (update((x) => ({ ...x, items: [...x.items, it] }))) {
        say('item-status', t('items.added', { name: it.name, weight: w(it.weightG * it.qty) }), 'ok');
        f.name.value = ''; f.weight.value = ''; f.qty.value = '1'; f.fixed.checked = false; f.name.focus(); render();
      }
    });
  });
  $('apply-moves').addEventListener('click', () => guard('moves-status', () => {
    if (!lastMoves) return;
    const n = lastMoves.reduce((s, m) => s + m.qty, 0);
    if (update((x) => C.applyMoves(x, lastMoves, newId))) { render(); say('moves-status', t('moves.applied', { n }), 'ok'); }
  }));
  $('display-unit').addEventListener('change', (e) => { unit = e.target.value === 'lb' ? 'lb' : 'kg'; try { localStorage.setItem(UNIT_KEY, unit); } catch (_) { /* confort */ } render(false); });

  // Exemple généré dans la langue affichée : une cabine trop lourde, une valise et un sac.
  $('sample').addEventListener('click', () => guard('trip-status', () => {
    if (trips.length >= C.MAX.trips) throw tooMany('err.tooManyTrips', C.MAX.trips);
    const tr = { ...C.makeTrip(t('sample.trip'), newId()), limits: C.makeLimits({ cabin: '8', checked: '23', personal: '4' }, 'kg') };
    const cabin = C.makeBag({ name: t('sample.cabin'), type: 'cabin', tare: '2.6' }, newId(), 'kg');
    const suitcase = C.makeBag({ name: t('sample.suitcase'), type: 'checked', tare: '4.1' }, newId(), 'kg');
    const backpack = C.makeBag({ name: t('sample.backpack'), type: 'personal', tare: '0.6' }, newId(), 'kg');
    const it = (key, kg, qty, bag, fixed = false) => C.makeItem({ name: t(key), weight: kg, qty, bagId: bag.id, fixed }, newId(), 'kg');
    tr.bags = [cabin, suitcase, backpack];
    tr.items = [it('sample.laptop', '1.9', '1', cabin, true), it('sample.shoes', '1.1', '1', cabin), it('sample.books', '0.45', '3', cabin), it('sample.toiletry', '0.9', '1', cabin),
      it('sample.camera', '1.2', '1', cabin), it('sample.jeans', '0.7', '3', suitcase), it('sample.shirts', '0.25', '6', suitcase), it('sample.jacket', '1.3', '1', suitcase), it('sample.charger', '0.35', '1', backpack)];
    if (save([...trips, tr])) { activeId = tr.id; render(); say('trip-status', t('sample.added'), 'ok'); }
  }));

  // --- Voyages
  $('trip-select').addEventListener('change', (e) => { activeId = e.target.value || null; try { localStorage.setItem(ACTIVE, activeId || ''); } catch (_) { /* confort */ } render(); });
  $('new-trip').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('trip.newDefault', { n: trips.length + 1 })); if (name === null) return;
    guard('trip-status', () => { if (trips.length >= C.MAX.trips) throw tooMany('err.tooManyTrips', C.MAX.trips); const x = C.makeTrip(name, newId()); if (save([...trips, x])) { activeId = x.id; render(); } });
  });
  $('rename-trip').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name); if (name === null) return;
    guard('trip-status', () => { const fixed = C.makeTrip(name, cur.id); if (update((x) => ({ ...x, name: fixed.name }))) render(); });
  });
  $('delete-trip').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.items.length }))) return;
    if (save(trips.filter((x) => x.id !== cur.id))) { activeId = trips[0] ? trips[0].id : null; render(); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => guard('moves-status', () => {
    const tr = active(); if (!tr) return;
    const rows = [[t('csv.bag'), t('csv.type'), t('csv.item'), t('csv.qty'), t('csv.unitG'), t('csv.totalG'), t('csv.fixed')]];
    for (const b of tr.bags) {
      rows.push([b.name, t('type.' + b.type), t('csv.tare'), '1', String(b.tareG), String(b.tareG), '']);
      for (const i of tr.items.filter((x) => x.bagId === b.id)) rows.push([b.name, t('type.' + b.type), i.name, String(i.qty), String(i.weightG), String(i.weightG * i.qty), i.fixed ? t('csv.yes') : '']);
    }
    for (const s of C.summary(tr).bags) rows.push([s.name, t('type.' + s.type), t('csv.total'), '', '', String(s.totalG), s.limitG ? t('csv.limit', { g: s.limitG }) : '']);
    download('travelpackingweight.csv', C.toCsv(rows), 'text/csv;charset=utf-8');
    say('moves-status', t('csv.done'), 'ok');
  }));
  $('export').addEventListener('click', () => guard('backup-status', () => { download('travelpackingweight-backup.json', C.backup(trips), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: trips.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; }
      activeId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: e instanceof SyntaxError ? t('err.backup') : L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('travelpackingweight-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) trips = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = trips.some((x) => x.id === last) ? last : (trips[0] ? trips[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const s of ['trip-status', 'limits-status', 'bag-status', 'item-status', 'moves-status', 'backup-status']) say(s, ''); render(false); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
