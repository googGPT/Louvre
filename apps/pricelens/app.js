/* PriceLens — interface. Calculs dans core.js (PriceCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.PriceCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-pricelens-v1'; // clé de stockage local
  const ACTIVE = 'louvre-pricelens-active'; // comparaison affichée (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let lists = []; // comparaisons enregistrées
  let activeId = null; // comparaison affichée
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return lists.find((l) => l.id === activeId) || null; }
  // Prix unitaire affiché dans la devise choisie : « 2,19 €/kg », « $2.19/kg »…
  const perUnit = (cents, dimUnit) => `${L.money(cents)}/${t('per.' + dimUnit)}`;

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); lists = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function updateActive(mutator) { const cur = active(); return save(lists.map((l) => (l.id === cur.id ? mutator(l) : l))); }
  function ensureList() { // crée une première comparaison si besoin
    if (active()) return true;
    if (lists.length) { activeId = lists[0].id; return true; }
    const first = C.makeList(t('list.defaultName'), newId());
    if (!save([first])) return false;
    activeId = first.id; return true;
  }

  function format(item) {
    const unit = item.unit === 'piece' ? t('unit.piece') : C.UNITS[item.unit].label;
    const one = `${L.number(item.qty)} ${unit}`;
    return item.count > 1 ? t('format.pack', { count: item.count, qty: one }) : one;
  }

  function renderLists() {
    const sel = $('list-select');
    sel.replaceChildren(...lists.map((l) => { const o = el('option', '', `${l.name} (${l.items.length})`); o.value = l.id; return o; }));
    if (activeId) sel.value = activeId;
    $('rename-list').disabled = $('delete-list').disabled = !active();
  }

  function renderResults() {
    const cur = active();
    const items = cur ? cur.items : [];
    const box = $('groups');
    $('verdict').hidden = true; $('mixed').hidden = true;
    $('cur-symbol').textContent = L.currencySymbol();
    if (!items.length) { box.replaceChildren(el('p', 'empty', t('result.empty'))); return; }
    const { groups, mixed } = C.compare(items);
    $('mixed').hidden = !mixed;
    const main = groups.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    if (main.rows.length > 1) {
      const best = main.rows[0];
      $('verdict').hidden = false;
      $('verdict').textContent = `${t('verdict.best', { name: best.name, price: perUnit(best.unitPriceCents, main.per) })} ` +
        (main.savingPct > 0 ? t('verdict.saving', { pct: L.number(main.savingPct) }) : t('verdict.equal'));
    }
    box.replaceChildren(...groups.map((g) => {
      const wrap = el('div', 'group');
      if (mixed) wrap.append(el('h3', '', t('dim.' + (g.dim === 'pièce' ? 'piece' : g.dim))));
      const scroll = el('div', 'scroll'), table = el('table', 'rank'), head = el('tr');
      const perHead = `${L.currencySymbol()}/${t('per.' + g.per)}`;
      for (const [txt, cls] of [['#', ''], [t('th.product'), ''], [t('th.format'), 'hide-s'], [t('th.price'), 'num hide-s'], [perHead, 'num'], ['', 'hide-s'], [t('th.gap'), 'num'], ['', '']]) head.append(el('th', cls, txt));
      const thead = el('thead'); thead.append(head);
      const tbody = el('tbody');
      for (const r of g.rows) {
        const isBest = r.rank === 1 && g.rows.length > 1;
        const tr = el('tr', isBest ? 'best' : '');
        const name = el('td'); name.append(el('span', '', r.name + ' '));
        if (isBest) name.append(el('span', 'pill', t('pill.best')));
        const bar = el('td', 'hide-s'), b = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(4, Math.round(100 * r.ratio)) + '%'; b.append(fill); bar.append(b);
        const del = el('button', 'btn del', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('aria.remove', { name: r.name })); del.title = t('btn.remove');
        del.addEventListener('click', () => { if (updateActive((l) => ({ ...l, items: l.items.filter((i) => i.id !== r.id) }))) render(); });
        const delTd = el('td'); delTd.append(del);
        tr.append(el('td', '', r.rank), name, el('td', 'hide-s', format(r)), el('td', 'num hide-s', L.money(r.priceCents)),
          el('td', 'num up', L.money(r.unitPriceCents)), bar, el('td', 'num', r.rank === 1 ? '—' : `+${L.number(r.vsBest)} %`), delTd);
        tbody.append(tr);
      }
      table.append(thead, tbody); scroll.append(table); wrap.append(scroll); return wrap;
    }));
  }
  function render() { renderLists(); renderResults(); }

  // --- Ajout d'un produit
  $('item-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (!ensureList()) return;
      if (active().items.length >= C.MAX_ITEMS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_ITEMS })}`);
      const item = C.makeItem({ name: f.name.value, price: f.price.value, qty: f.qty.value, unit: f.unit.value, count: f.count.value }, newId());
      if (!updateActive((l) => ({ ...l, items: [...l.items, item] }))) return;
      say('form-status', t('form.added', { name: item.name, price: perUnit(C.unitPriceCents(item), C.PER[C.UNITS[item.unit].dim].unit) }), 'ok');
      f.name.value = ''; f.price.value = ''; f.qty.value = ''; f.count.value = '1'; f.name.focus();
      render();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('sample').addEventListener('click', () => {
    try {
      if (!ensureList()) return;
      const rice = t('sample.rice');
      const samples = [
        { name: `${rice} 500 g`, price: '1.29', qty: '500', unit: 'g', count: '1' },
        { name: `${rice} 1 kg`, price: '2.19', qty: '1', unit: 'kg', count: '1' },
        { name: `${rice} 4 × 125 g (${t('sample.pouches')})`, price: '1.89', qty: '125', unit: 'g', count: '4' },
        { name: `${rice} 5 kg`, price: '9.90', qty: '5', unit: 'kg', count: '1' },
      ].map((s) => C.makeItem(s, newId()));
      if (updateActive((l) => ({ ...l, items: [...l.items, ...samples].slice(0, C.MAX_ITEMS) }))) { render(); say('form-status', t('form.sampleAdded'), 'ok'); }
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  // --- Gestion des comparaisons
  $('list-select').addEventListener('change', (e) => { activeId = e.target.value; try { localStorage.setItem(ACTIVE, activeId); } catch (_) { /* confort seulement */ } render(); });
  $('new-list').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('list.newDefault', { n: lists.length + 1 }));
    if (name === null) return;
    try { const l = C.makeList(name, newId()); if (save([...lists, l])) { activeId = l.id; render(); } } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('rename-list').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name);
    if (name === null) return;
    try { const fixed = C.makeList(name, cur.id, cur.items); if (save(lists.map((l) => (l.id === cur.id ? fixed : l)))) render(); } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('delete-list').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name, n: cur.items.length }))) return;
    if (save(lists.filter((l) => l.id !== cur.id))) { activeId = lists[0] ? lists[0].id : null; render(); }
  });

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('pricelens-backup.json', C.backup(lists), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: lists.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      activeId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('pricelens-raw-storage.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) lists = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = lists.some((l) => l.id === last) ? last : (lists[0] ? lists[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { say('form-status', ''); say('backup-status', ''); render(); }); // nouvelle langue ou devise : on réaffiche
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
