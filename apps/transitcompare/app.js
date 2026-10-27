/* TransitCompare — interface. Calculs dans core.js (TransitCore) ; textes, nombres et montants dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.TransitCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-transitcompare-v1'; // clé de stockage local
  const ACTIVE = 'louvre-transitcompare-active'; // trajet affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let data = C.emptyData();
  let activeId = null;
  let readOnly = false;
  let lastResult = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { prefs: next.prefs, trips: next.trips }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const active = () => data.trips.find((x) => x.id === activeId) || null;
  function setActive(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (e) { /* confort seulement */ } }
  function updateTrip(mutator) { const cur = active(); return save({ ...data, trips: data.trips.map((x) => (x.id === cur.id ? mutator(x) : x)) }); }
  function updateRoute(routeId, mutator) { return updateTrip((tr) => ({ ...tr, routes: tr.routes.map((r) => (r.id === routeId ? mutator(r) : r)) })); }
  function ensureTrip() { // crée un premier trajet si besoin
    if (active()) return true;
    if (data.trips.length) { setActive(data.trips[0].id); return true; }
    const first = C.makeTrip(t('trip.defaultName'), newId());
    if (!save({ ...data, trips: [first] })) return false;
    setActive(first.id); return true;
  }

  // --- Formats
  const mins = (n) => t('fmt.min', { n: L.number(n) });
  const signedMin = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + mins(Math.abs(n));
  const signedMoney = (c) => (c > 0 ? '+' : c < 0 ? '−' : '±') + L.money(Math.abs(c));
  const transfersText = (n) => t('fmt.transfers', { n });
  const decimal = () => (L.number(1.5).includes(',') ? 'comma' : 'dot');
  const weightText = (w) => `${Math.floor(w / 10)}${decimal() === 'comma' ? ',' : '.'}${w % 10}`; // toujours relisible par parseWeight
  function segText(s) {
    const parts = [s.label ? `${t('mode.' + s.mode)} ${s.label}` : t('mode.' + s.mode), mins(s.minutes)];
    if (s.waitMinutes) parts.push(t('fmt.wait', { min: mins(s.waitMinutes) }));
    if (s.costCents) parts.push(L.money(s.costCents));
    return parts.join(' · ');
  }

  // --- Menus traduits (valeur choisie conservée)
  function fillSelect(sel, items) {
    const cur = sel.value;
    sel.replaceChildren(...items.map(([v, label]) => { const o = el('option', '', label); o.value = v; return o; }));
    if (items.some(([v]) => v === cur)) sel.value = cur;
  }
  function buildSelects() {
    fillSelect($('seg-mode'), C.MODES.map((m) => [m, t('mode.' + m)]));
    const cur = active();
    fillSelect($('seg-route'), cur ? cur.routes.map((r) => [r.id, r.name]) : []);
    $('add-seg').disabled = !(cur && cur.routes.length);
    for (const c of document.querySelectorAll('.cur')) c.textContent = L.currencySymbol();
  }

  // --- Trajets
  function renderTrips() {
    const sel = $('trip-select');
    const trips = [...data.trips].sort((a, b) => a.name.localeCompare(b.name, L.locale));
    sel.replaceChildren(...trips.map((x) => { const o = el('option', '', t('trip.option', { name: x.name, n: x.routes.length })); o.value = x.id; return o; }));
    if (!trips.length) { const o = el('option', '', t('trip.none')); o.value = ''; sel.append(o); }
    sel.value = activeId || '';
    $('rename-trip').disabled = $('delete-trip').disabled = !active();
  }

  // --- Itinéraires et segments
  function renderRoutes() {
    const cur = active(), box = $('routes');
    if (!cur || !cur.routes.length) { box.replaceChildren(el('li', 'empty', t('routes.empty'))); return; }
    box.replaceChildren(...cur.routes.map((r) => {
      const li = el('li', 'route'), head = el('div', 'route-head');
      const tot = C.totals(r);
      const title = el('div', 'txt'); title.append(el('b', '', r.name));
      title.append(el('span', '', r.segments.length ? `${mins(tot.totalMinutes)} · ${L.money(tot.costCents)} · ${transfersText(tot.transfers)}` : t('routes.noSeg')));
      const acts = el('div', 'acts');
      const pick = el('button', 'btn small', t('btn.addHere')); pick.type = 'button'; pick.setAttribute('aria-label', t('aria.addHere', { name: r.name }));
      pick.addEventListener('click', () => { $('seg-add').open = true; $('seg-route').value = r.id; $('seg-mode').focus(); });
      const del = el('button', 'btn small danger', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.deleteRoute', { name: r.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('confirm.deleteRoute', { name: r.name }))) return;
        if (updateTrip((tr) => ({ ...tr, routes: tr.routes.filter((x) => x.id !== r.id) }))) { render(); say('route-status', t('route.deleted', { name: r.name }), 'ok'); }
      });
      acts.append(pick, del); head.append(title, acts); li.append(head);
      if (r.segments.length) {
        const ol = el('ol', 'segs');
        r.segments.forEach((s, i) => {
          const sli = el('li', 'seg mode-' + s.mode), txt = el('span', 'seg-txt', segText(s)), sa = el('span', 'seg-acts');
          const mk = (label, aria, fn, disabled) => { const b = el('button', 'btn tiny', label); b.type = 'button'; b.setAttribute('aria-label', aria); b.disabled = !!disabled; b.addEventListener('click', fn); return b; };
          const name = t('mode.' + s.mode);
          sa.append(
            mk('↑', t('aria.segUp', { n: i + 1, mode: name }), () => { if (updateRoute(r.id, (x) => C.moveSegment(x, i, -1))) render(); }, i === 0),
            mk('↓', t('aria.segDown', { n: i + 1, mode: name }), () => { if (updateRoute(r.id, (x) => C.moveSegment(x, i, 1))) render(); }, i === r.segments.length - 1),
            mk('✕', t('aria.segRemove', { n: i + 1, mode: name }), () => { if (updateRoute(r.id, (x) => C.removeSegment(x, i))) { render(); say('route-status', t('seg.removed'), 'ok'); } }));
          sli.append(txt, sa); ol.append(sli);
        });
        li.append(ol);
      }
      return li;
    }));
  }

  // --- Préférences : formulaire rempli depuis les données, enregistré à chaque frappe valide.
  function fillPrefs() {
    const f = $('prefs-form'), p = data.prefs;
    f.vot.value = C.centsText(p.votCents, decimal()).replace(/[.,]00$/, '');
    f.walkWeight.value = weightText(p.walkWeight); f.waitWeight.value = weightText(p.waitWeight);
    f.transferMinutes.value = String(p.transferMinutes);
  }
  $('prefs-form').addEventListener('input', () => {
    const f = $('prefs-form');
    try {
      const prefs = C.makePrefs({ vot: f.vot.value, walkWeight: f.walkWeight.value, waitWeight: f.waitWeight.value, transferMinutes: f.transferMinutes.value });
      if (save({ ...data, prefs })) { say('prefs-status', t('prefs.saved'), 'ok'); renderRanking(); }
    } catch (e) { say('prefs-status', L.error(e), 'error'); }
  });
  $('prefs-form').addEventListener('submit', (e) => e.preventDefault());

  // --- Classement expliqué
  function renderRanking() {
    const cur = active(), box = $('ranking');
    $('verdict').hidden = true; $('pivot').hidden = true;
    lastResult = null;
    if (!cur) { box.replaceChildren(el('li', 'empty', t('rank.empty'))); $('export-csv').disabled = true; return; }
    const res = C.rank(cur.routes, data.prefs, L.locale);
    lastResult = res;
    $('export-csv').disabled = !res.rows.length;
    if (!res.rows.length) { box.replaceChildren(el('li', 'empty', t('rank.empty'))); return; }
    const maxScore = Math.max(...res.rows.map((r) => r.scoreCents), 1);
    box.replaceChildren(...res.rows.map((r) => {
      const li = el('li', r.rank === 1 && res.rows.length > 1 ? 'best' : '');
      const head = el('div', 'rank-head');
      head.append(el('span', 'rank-n', L.number(r.rank)));
      const name = el('div', 'txt'); name.append(el('b', '', r.name));
      name.append(el('span', '', `${mins(r.totalMinutes)} · ${L.money(r.costCents)} · ${transfersText(r.transfers)}`));
      name.append(el('span', '', t('rank.detail', { ride: mins(r.rideMinutes), walk: mins(r.walkMinutes), wait: mins(r.waitMinutes) })));
      const sc = el('div', 'score'); sc.append(el('strong', '', L.money(r.scoreCents))); sc.append(el('small', '', t('rank.scoreLabel')));
      head.append(name, sc); li.append(head);
      // Barre empilée : prix / temps / correspondances (parts du coût généralisé).
      const bar = el('div', 'stack'); bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', t('rank.parts', { money: L.money(r.moneyCents), time: L.money(r.timeCents), transfer: L.money(r.transferCents) }));
      for (const [cls, v] of [['p-money', r.moneyCents], ['p-time', r.timeCents], ['p-transfer', r.transferCents]]) {
        if (v > 0) { const i = el('i', cls); i.style.width = (100 * v / maxScore).toFixed(2) + '%'; bar.append(i); }
      }
      li.append(bar);
      li.append(el('p', 'parts', t('rank.parts', { money: L.money(r.moneyCents), time: L.money(r.timeCents), transfer: L.money(r.transferCents) })));
      if (r.rank > 1) li.append(el('p', 'delta', t('rank.delta', { score: signedMoney(r.deltaScoreCents), min: signedMin(r.deltaMinutes), cost: signedMoney(r.deltaCostCents), tr: (r.deltaTransfers > 0 ? '+' : r.deltaTransfers < 0 ? '−' : '±') + L.number(Math.abs(r.deltaTransfers)) })));
      return li;
    }));
    const best = res.rows[0];
    if (res.rows.length > 1) {
      const second = res.rows[1];
      $('verdict').hidden = false;
      const why = [];
      if (second.costCents > best.costCents) why.push(t('why.cheaper', { v: L.money(second.costCents - best.costCents) }));
      if (second.totalMinutes > best.totalMinutes) why.push(t('why.faster', { v: mins(second.totalMinutes - best.totalMinutes) }));
      if (second.transfers > best.transfers) why.push(t('why.fewer', { n: second.transfers - best.transfers }));
      if (second.costCents < best.costCents) why.push(t('why.dearer', { v: L.money(best.costCents - second.costCents) }));
      if (second.totalMinutes < best.totalMinutes) why.push(t('why.slower', { v: mins(best.totalMinutes - second.totalMinutes) }));
      const gap = second.scoreCents - best.scoreCents;
      $('verdict').textContent = (gap > 0 ? t('verdict.lead', { name: best.name, other: second.name, gap: L.money(gap) }) : t('verdict.tie', { name: best.name, other: second.name }))
        + (why.length ? ' ' + t('verdict.why', { list: why.join(t('list.sep')) }) : '');
      const pv = res.pivot;
      $('pivot').hidden = false;
      if (pv.kind === 'above') $('pivot').textContent = t('pivot.above', { other: second.name, vot: L.money(pv.votCents) });
      else if (pv.kind === 'below') $('pivot').textContent = t('pivot.below', { other: second.name, vot: L.money(pv.votCents) });
      else if (pv.kind === 'dominant') $('pivot').textContent = t('pivot.dominant', { name: best.name, other: second.name });
      else $('pivot').textContent = t('pivot.equal');
    } else {
      $('verdict').hidden = false; $('verdict').textContent = t('verdict.single', { name: best.name });
    }
    if (res.empty) say('rank-status', t('rank.skipped', { n: res.empty }));
    else say('rank-status', '');
  }

  function render() { renderTrips(); buildSelects(); renderRoutes(); renderRanking(); }

  // --- Saisie
  $('route-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (!ensureTrip()) return;
      if (active().routes.length >= C.MAX_ROUTES) throw new Error(`err.tooManyRoutes|${JSON.stringify({ max: C.MAX_ROUTES })}`);
      const route = C.makeRoute(f.name.value, newId());
      if (active().routes.some((r) => r.name.toLocaleLowerCase(L.locale) === route.name.toLocaleLowerCase(L.locale))) throw new Error('err.routeExists');
      if (!updateTrip((tr) => ({ ...tr, routes: [...tr.routes, route] }))) return;
      f.name.value = '';
      render();
      $('seg-route').value = route.id; $('seg-add').open = true;
      say('route-status', t('route.added', { name: route.name }), 'ok');
    } catch (e) { say('route-status', L.error(e), 'error'); }
  });
  $('seg-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const cur = active();
      if (!cur || !cur.routes.length) throw new Error('err.noRoute');
      const routeId = f.route.value;
      const route = cur.routes.find((r) => r.id === routeId);
      if (!route) throw new Error('err.noRoute');
      const next = C.addSegment(route, { mode: f.mode.value, minutesText: f.minutes.value, waitText: f.wait.value, costText: f.cost.value, label: f.label.value });
      if (!updateRoute(routeId, () => next)) return;
      f.minutes.value = ''; f.wait.value = ''; f.cost.value = ''; f.label.value = '';
      render(); f.route.value = routeId; f.minutes.focus();
      say('route-status', t('seg.added', { mode: t('mode.' + f.mode.value), name: route.name }), 'ok');
    } catch (e) { say('route-status', L.error(e), 'error'); }
  });

  // --- Exemple (dans la langue affichée) ; pondérations d'exemple seulement si les vôtres sont restées neutres.
  $('sample').addEventListener('click', () => {
    try {
      if (data.trips.length >= C.MAX_TRIPS) throw new Error(`err.tooManyTrips|${JSON.stringify({ max: C.MAX_TRIPS })}`);
      const seg = (mode, minutes, wait, cost, label = '') => ({ mode, minutesText: String(minutes), waitText: String(wait), costText: cost, label });
      const routes = [
        C.makeRoute(t('sample.busMetro'), newId(), [seg('walk', 6, 0, '0'), seg('bus', 18, 6, '1.90', '12'), seg('metro', 9, 3, '0', 'B'), seg('walk', 4, 0, '0')]),
        C.makeRoute(t('sample.car'), newId(), [seg('car', 24, 0, '4.80'), seg('walk', 3, 0, '0')]),
        C.makeRoute(t('sample.bike'), newId(), [seg('bike', 32, 0, '0')]),
        C.makeRoute(t('sample.train'), newId(), [seg('walk', 10, 0, '0'), seg('train', 20, 8, '3.10'), seg('walk', 7, 0, '0')]),
      ];
      const trip = C.makeTrip(t('sample.trip'), newId(), routes);
      const neutral = JSON.stringify(data.prefs) === JSON.stringify(C.defaultPrefs());
      const prefs = neutral ? C.makePrefs({ vot: '12', walkWeight: '1.5', waitWeight: '1.5', transferMinutes: '5' }) : data.prefs;
      if (!save({ prefs, trips: [...data.trips, trip] })) return;
      setActive(trip.id); fillPrefs(); render();
      say('trip-status', t(neutral ? 'sample.loadedPrefs' : 'sample.loaded'), 'ok');
    } catch (e) { say('trip-status', L.error(e), 'error'); }
  });

  // --- Gestion des trajets
  $('trip-select').addEventListener('change', (e) => { setActive(e.target.value || null); render(); });
  $('new-trip').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('trip.newDefault', { n: data.trips.length + 1 }));
    if (name === null) return;
    try {
      if (data.trips.length >= C.MAX_TRIPS) throw new Error(`err.tooManyTrips|${JSON.stringify({ max: C.MAX_TRIPS })}`);
      const tr = C.makeTrip(name, newId());
      if (save({ ...data, trips: [...data.trips, tr] })) { setActive(tr.id); render(); say('trip-status', t('trip.created', { name: tr.name }), 'ok'); }
    } catch (e) { say('trip-status', L.error(e), 'error'); }
  });
  $('rename-trip').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name);
    if (name === null) return;
    try { const fixed = C.makeTrip(name, cur.id, cur.routes); if (save({ ...data, trips: data.trips.map((x) => (x.id === cur.id ? fixed : x)) })) render(); }
    catch (e) { say('trip-status', L.error(e), 'error'); }
  });
  $('delete-trip').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.deleteTrip', { name: cur.name, n: cur.routes.length }))) return;
    if (save({ ...data, trips: data.trips.filter((x) => x.id !== cur.id) })) { setActive(data.trips[0] ? data.trips[0].id : null); render(); say('trip-status', t('trip.deleted', { name: cur.name }), 'ok'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      if (!lastResult || !lastResult.rows.length) throw new Error('err.nothing');
      const cur = L.currency;
      const csv = C.rankingCSV(lastResult, { decimal: decimal(), headers: [t('csv.rank'), t('csv.route'), t('csv.total'), t('csv.ride'), t('csv.walk'), t('csv.wait'), t('csv.transfers'), t('csv.cost', { cur }), t('csv.time', { cur }), t('csv.score', { cur })] });
      download('transitcompare.csv', csv, 'text/csv;charset=utf-8'); say('rank-status', t('csv.done'), 'ok');
    } catch (e) { say('rank-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('transitcompare-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (_) { throw new Error('err.json'); }
      const next = C.validateData(parsed);
      if (!confirm(t('backup.confirm', { a: data.trips.length, b: next.trips.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true;
      setActive(next.trips[0] ? next.trips[0].id : null); fillPrefs(); render();
      say('backup-status', t('backup.restored', { n: next.trips.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('transitcompare-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = data.trips.some((x) => x.id === last) ? last : (data.trips[0] ? data.trips[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue ou devise : tout est réaffiché, les saisies en cours restent dans les champs.
  L.onChange(() => { for (const id of ['trip-status', 'route-status', 'prefs-status', 'rank-status', 'backup-status']) say(id, ''); render(); });
  fillPrefs();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
