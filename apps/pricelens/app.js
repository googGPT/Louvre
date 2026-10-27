/* PriceLens — interface. Les calculs sont dans core.js (PriceCore). */
(() => {
  'use strict';
  const C = window.PriceCore;
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

  function save(next) {
    if (readOnly) { say('backup-status', 'Stockage illisible : restaurez une sauvegarde valide avant de modifier.', 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); lists = next; return true; }
    catch (e) { say('backup-status', 'Enregistrement impossible (stockage plein ou bloqué) : ' + e.message, 'error'); return false; }
  }
  function updateActive(mutator) { // applique une modification à la comparaison affichée
    const cur = active();
    return save(lists.map((l) => (l.id === cur.id ? mutator(l) : l)));
  }
  function ensureList() { // crée une première comparaison si besoin
    if (active()) return true;
    if (lists.length) { activeId = lists[0].id; return true; }
    const first = C.makeList('Mes courses', newId());
    if (!save([first])) return false;
    activeId = first.id; return true;
  }

  function format(item) {
    const unit = C.UNITS[item.unit].label;
    const one = `${item.qty.toLocaleString('fr-FR')} ${unit}`;
    return item.count > 1 ? `${item.count} × ${one}` : one;
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
    if (!items.length) { box.replaceChildren(el('p', 'empty', 'Ajoutez au moins deux produits pour les comparer.')); return; }
    const { groups, mixed } = C.compare(items);
    $('mixed').hidden = !mixed;
    const main = groups.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    if (main.rows.length > 1) {
      const best = main.rows[0];
      $('verdict').hidden = false;
      $('verdict').textContent = `Le moins cher : ${best.name}, à ${C.eur(best.unitPriceCents)}${main.per.replace('€', '')}. ` +
        (main.savingPct > 0 ? `Soit ${main.savingPct.toLocaleString('fr-FR')} % de moins que l'offre la plus chère.` : 'Toutes les offres se valent.');
    }
    box.replaceChildren(...groups.map((g) => {
      const wrap = el('div', 'group');
      if (mixed) wrap.append(el('h3', '', g.dim.charAt(0).toUpperCase() + g.dim.slice(1)));
      const scroll = el('div', 'scroll'), table = el('table', 'rank'), head = el('tr');
      for (const [t, cls] of [['#', ''], ['Produit', ''], ['Format', 'hide-s'], ['Prix', 'num hide-s'], [g.per, 'num'], ['', 'hide-s'], ['Écart', 'num'], ['', '']]) { const th = el('th', cls, t); head.append(th); }
      const thead = el('thead'); thead.append(head);
      const tbody = el('tbody');
      for (const r of g.rows) {
        const tr = el('tr', r.rank === 1 && g.rows.length > 1 ? 'best' : '');
        const name = el('td'); name.append(el('span', '', r.name + ' '));
        if (r.rank === 1 && g.rows.length > 1) name.append(el('span', 'pill', 'meilleur prix'));
        const bar = el('td', 'hide-s'), b = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(4, Math.round(100 * r.ratio)) + '%'; b.append(fill); bar.append(b);
        const del = el('button', 'btn del', 'Retirer'); del.type = 'button'; del.setAttribute('aria-label', 'Retirer ' + r.name);
        del.addEventListener('click', () => { if (updateActive((l) => ({ ...l, items: l.items.filter((i) => i.id !== r.id) }))) render(); });
        const delTd = el('td'); delTd.append(del);
        tr.append(el('td', '', r.rank), name, el('td', 'hide-s', format(r)), el('td', 'num hide-s', C.eur(r.priceCents)),
          el('td', 'num up', C.eur(r.unitPriceCents)), bar, el('td', 'num', r.rank === 1 ? '—' : '+' + r.vsBest.toLocaleString('fr-FR') + ' %'), delTd);
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
      if (active().items.length >= C.MAX_ITEMS) throw new Error(`${C.MAX_ITEMS} produits au plus par comparaison`);
      const item = C.makeItem({ name: f.name.value, price: f.price.value, qty: f.qty.value, unit: f.unit.value, count: f.count.value }, newId());
      if (!updateActive((l) => ({ ...l, items: [...l.items, item] }))) return;
      say('form-status', `Ajouté : ${item.name}, ${C.eur(C.unitPriceCents(item))}${C.PER[C.UNITS[item.unit].dim].label.replace('€', '')}.`, 'ok');
      f.name.value = ''; f.price.value = ''; f.qty.value = ''; f.count.value = '1'; f.name.focus();
      render();
    } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('sample').addEventListener('click', () => {
    try {
      if (!ensureList()) return;
      const samples = [
        { name: 'Riz 500 g', price: '1,29', qty: '500', unit: 'g', count: '1' },
        { name: 'Riz 1 kg', price: '2,19', qty: '1', unit: 'kg', count: '1' },
        { name: 'Riz 4 × 125 g (sachets cuisson)', price: '1,89', qty: '125', unit: 'g', count: '4' },
        { name: 'Riz 5 kg', price: '9,90', qty: '5', unit: 'kg', count: '1' },
      ].map((s) => C.makeItem(s, newId()));
      if (updateActive((l) => ({ ...l, items: [...l.items, ...samples].slice(0, C.MAX_ITEMS) }))) { render(); say('form-status', 'Exemple ajouté.', 'ok'); }
    } catch (e) { say('form-status', e.message, 'error'); }
  });

  // --- Gestion des comparaisons
  $('list-select').addEventListener('change', (e) => { activeId = e.target.value; try { localStorage.setItem(ACTIVE, activeId); } catch (_) { /* confort seulement */ } render(); });
  $('new-list').addEventListener('click', () => {
    const name = prompt('Nom de la nouvelle comparaison :', 'Comparaison ' + (lists.length + 1));
    if (name === null) return;
    try { const l = C.makeList(name, newId()); if (save([...lists, l])) { activeId = l.id; render(); } } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('rename-list').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt('Nouveau nom :', cur.name);
    if (name === null) return;
    try { const fixed = C.makeList(name, cur.id, cur.items); if (save(lists.map((l) => (l.id === cur.id ? fixed : l)))) render(); } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('delete-list').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(`Supprimer « ${cur.name} » et ses ${cur.items.length} produit(s) ?`)) return;
    if (save(lists.filter((l) => l.id !== cur.id))) { activeId = lists[0] ? lists[0].id : null; render(); }
  });

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('pricelens-sauvegarde.json', C.backup(lists), 'application/json'); say('backup-status', 'Sauvegarde téléchargée.', 'ok'); }
    catch (e) { say('backup-status', e.message, 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Fichier trop volumineux');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(`Remplacer les ${lists.length} comparaison(s) de cet appareil par les ${next.length} de la sauvegarde ?`)) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      activeId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', `Sauvegarde restaurée : ${next.length} comparaison(s).`, 'ok');
    } catch (e) { say('backup-status', 'Restauration refusée : ' + e.message, 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('pricelens-stockage-brut.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) lists = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = lists.some((l) => l.id === last) ? last : (lists[0] ? lists[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
