/* BankFeeLens — interface. Calculs dans core.js (BankFeeCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.BankFeeCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-bankfeelens-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pf = $('profile-form'), of = $('offer-form');

  let state = C.emptyState(); // { profile, offers }
  let readOnly = false; // stockage illisible : aucune écriture
  let editId = null; // offre en cours de modification

  const lastErr = {}; // dernière erreur affichée par zone : retraduite au changement de langue
  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); delete lastErr[id]; }
  function sayErr(id, e) { say(id, errText(e), 'error'); lastErr[id] = e; }
  // Erreur du moteur : nom du champ et bornes traduits ici.
  function errText(e) {
    const [key, json] = String(e && e.message ? e.message : e).split('|');
    if (!json) return L.error(e);
    let p; try { p = JSON.parse(json); } catch (_) { return L.error(e); }
    if (p.field) p.field = t('f.' + p.field);
    if (typeof p.max === 'number') p.max = L.number(p.max);
    return t(key, p);
  }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  const read = (form, spec) => Object.fromEntries(Object.keys(spec).map((k) => [k, form.elements[k].value]));
  const short = (v) => { const s = v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); return s === '0' ? '' : s; };
  function fill(form, obj, spec) { const v = C.toInputs(obj, spec); for (const k of Object.keys(spec)) form.elements[k].value = short(v[k]); }
  const rows = () => (state.profile && state.offers.length ? C.rank(state.profile, state.offers, L.locale) : null);

  // --- Offres saisies
  function renderOffers() {
    const list = $('offer-list');
    if (!state.offers.length) { list.replaceChildren(el('li', 'empty', t('offer.empty'))); return; }
    list.replaceChildren(...[...state.offers].sort((a, b) => a.name.localeCompare(b.name, L.locale)).map((o) => {
      const li = el('li', o.id === editId ? 'editing' : ''), txt = el('div', 'txt');
      txt.append(el('b', '', o.name), el('span', '', t('offer.line', { account: L.money(o.accountCents), card: L.money(o.cardCents) })));
      const acts = el('div', 'acts');
      const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: o.name }));
      edit.addEventListener('click', () => startEdit(o.id));
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { name: o.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('confirm.remove', { name: o.name }))) return;
        if (save({ ...state, offers: state.offers.filter((x) => x.id !== o.id) })) { if (editId === o.id) stopEdit(); render(); say('offer-status', t('offer.removed', { name: o.name }), 'ok'); }
      });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }
  function startEdit(id) {
    const o = state.offers.find((x) => x.id === id); if (!o) return;
    editId = id; of.elements.name.value = o.name; fill(of, o, C.OFFER);
    $('offer-submit').textContent = t('btn.saveOffer'); $('offer-submit').dataset.i18n = 'btn.saveOffer'; $('offer-cancel').hidden = false;
    say('offer-status', t('offer.editing', { name: o.name })); renderOffers(); of.elements.name.focus();
  }
  function stopEdit() {
    editId = null; of.reset();
    $('offer-submit').textContent = t('btn.addOffer'); $('offer-submit').dataset.i18n = 'btn.addOffer'; $('offer-cancel').hidden = true;
  }

  // --- Classement et détail
  function renderRanking(rs) {
    const box = $('ranking');
    if (!state.profile) { box.replaceChildren(el('p', 'empty', t('rank.noProfile'))); return; }
    if (!rs) { box.replaceChildren(el('p', 'empty', t('rank.noOffer'))); return; }
    const out = [];
    if (rs.length > 1) {
      const best = rs[0], second = rs[1];
      out.push(el('p', 'verdict', best.total === second.total ? t('verdict.tie', { amount: L.money(best.total) }) : t('verdict.best', { name: best.name, amount: L.money(best.total), gap: L.money(second.total - best.total) })));
    }
    const scroll = el('div', 'scroll'), table = el('table', 'rank'), head = el('tr');
    for (const [txt, cls] of [['#', ''], [t('th.offer'), ''], [t('th.year'), 'num'], [t('th.month'), 'num hide-s'], [t('th.gap'), 'num']]) head.append(el('th', cls, txt));
    const thead = el('thead'), tbody = el('tbody'); thead.append(head);
    const worst = Math.max(1, rs[rs.length - 1].total);
    for (const r of rs) {
      const isBest = r.rank === 1 && rs.length > 1;
      const tr = el('tr', isBest ? 'best' : ''), name = el('td', 'name');
      name.append(el('span', '', r.name + ' '));
      if (isBest) name.append(el('span', 'pill', t('pill.best')));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(3, Math.round(100 * r.total / worst)) + '%'; bar.append(fill); name.append(bar);
      tr.append(el('td', '', L.number(r.rank)), name, el('td', 'num strong', L.money(r.total)), el('td', 'num hide-s', L.money(r.monthly)), el('td', 'num', r.gap ? '+' + L.money(r.gap) : '—'));
      tbody.append(tr);
    }
    table.append(thead, tbody); scroll.append(table); out.push(scroll);
    box.replaceChildren(...out);
  }
  function renderDetail(rs) {
    const box = $('detail');
    if (!rs) { box.replaceChildren(el('p', 'empty', t('detail.empty'))); return; }
    box.replaceChildren(...[el('div', 'cards')].map((cards) => {
      for (const r of rs) {
        const c = el('article', 'card' + (r.rank === 1 && rs.length > 1 ? ' best' : ''));
        c.append(el('h3', '', `${L.number(r.rank)}. ${r.name}`));
        const dl = el('dl');
        for (const k of C.LINES) { const d = el('div', r.lines[k] ? '' : 'zero'); d.append(el('dt', '', t('line.' + k)), el('dd', '', L.money(r.lines[k]))); dl.append(d); }
        const tot = el('div', 'total'); tot.append(el('dt', '', t('line.total')), el('dd', '', L.money(r.total))); dl.append(tot);
        c.append(dl); cards.append(c);
      }
      return cards;
    }));
  }
  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    renderOffers();
    const rs = rows();
    renderRanking(rs); renderDetail(rs);
    $('csv').disabled = !rs;
  }

  // --- Profil : recalcul et enregistrement immédiats à chaque frappe valide (aucun délai, rien à perdre).
  function saveProfile() {
    try {
      const profile = C.makeProfile(read(pf, C.PROFILE));
      if (!save({ ...state, profile })) return;
      say('profile-status', t('profile.saved'), 'ok'); render();
    } catch (e) { say('profile-status', errText(e), 'error'); }
  }
  pf.addEventListener('input', saveProfile);
  pf.addEventListener('submit', (e) => { e.preventDefault(); saveProfile(); });

  // --- Offre : ajout ou modification
  of.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!editId && state.offers.length >= C.MAX_OFFERS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_OFFERS })}`);
      const o = C.makeOffer({ name: of.elements.name.value, ...read(of, C.OFFER) }, editId || newId());
      const offers = editId ? state.offers.map((x) => (x.id === editId ? o : x)) : [...state.offers, o];
      if (!save({ ...state, offers })) return;
      say('offer-status', t(editId ? 'offer.updated' : 'offer.added', { name: o.name }), 'ok');
      stopEdit(); render(); of.elements.name.focus();
    } catch (e) { sayErr('offer-status', e); }
  });
  $('offer-cancel').addEventListener('click', () => { stopEdit(); renderOffers(); say('offer-status', ''); });

  // --- Exemple (dans la langue affichée ; tarifs purement illustratifs)
  $('sample').addEventListener('click', () => {
    if ((state.profile || state.offers.length) && !confirm(t('confirm.sample'))) return;
    try {
      const profile = C.makeProfile({ withdrawals: '4', transfers: '1', foreignOps: '3', foreignAmount: '60', overdraftDays: '20', overdraftAmount: '250' });
      const offers = [
        [t('sample.online'), { account: '0', card: '0', withdrawalFee: '1.50', freeWithdrawals: '3', transferFee: '0', overdraftRate: '7', foreignFixed: '0', foreignPct: '1.5' }],
        [t('sample.branch'), { account: '2.50', card: '45', withdrawalFee: '1', freeWithdrawals: '4', transferFee: '0', overdraftRate: '16', foreignFixed: '1', foreignPct: '2.5' }],
        [t('sample.package'), { account: '9', card: '0', withdrawalFee: '0', freeWithdrawals: '0', transferFee: '0', overdraftRate: '12', foreignFixed: '0', foreignPct: '0' }],
      ].map(([name, o]) => C.makeOffer({ name, ...o }, newId()));
      if (!save({ profile, offers })) return;
      stopEdit(); fill(pf, profile, C.PROFILE); render();
      say('offer-status', t('sample.added'), 'ok'); say('profile-status', '');
    } catch (e) { sayErr('offer-status', e); }
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
      const labels = { rank: t('th.rank'), name: t('th.offer'), total: t('line.total') + cur, gap: t('th.gap') + cur };
      for (const k of C.LINES) labels[k] = t('line.' + k) + cur;
      download('bankfeelens-ranking.csv', C.rankingCsv(rs, labels), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('bankfeelens-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.offers.length, b: next.offers.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true;
      stopEdit(); pf.reset(); if (next.profile) fill(pf, next.profile, C.PROFILE); render();
      say('backup-status', t('backup.restored', { n: next.offers.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('bankfeelens-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue ou devise : on réaffiche sans toucher aux saisies en cours.
  L.onChange(() => {
    say('backup-status', '');
    if ($('profile-status').classList.contains('error')) saveProfile(); else say('profile-status', '');
    if (lastErr['offer-status']) sayErr('offer-status', lastErr['offer-status']); else say('offer-status', '');
    render();
  });
  if (state.profile) fill(pf, state.profile, C.PROFILE);
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
