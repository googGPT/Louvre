/* GiftNest — interface. Les calculs sont dans core.js (GiftCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.GiftCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  // Les statuts restent enregistrés en français (compatibilité des sauvegardes) et sont traduits à l'affichage.
  const STATUS_KEYS = { 'idée': 'idea', 'acheté': 'bought', 'offert': 'given' };
  const statusName = (s) => t('status.' + (STATUS_KEYS[s] || 'idea'));
  const byName = (a, b) => a.name.localeCompare(b.name, L.locale);
  const KEY = 'louvre-giftnest-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const opt = (value, label) => { const o = el('option', '', label); o.value = value; return o; };

  let data = C.empty();
  let readOnly = false;
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const fmtDay = (day) => L.date(day, { weekday: 'short', day: 'numeric', month: 'long' });
  const nameOf = (list, id, fallback) => (list.find((x) => x.id === id) || {}).name || fallback;

  function renderKpis() {
    const s = C.summary(data);
    $('k-spent').textContent = L.money(s.spent); $('k-planned').textContent = L.money(s.planned);
    document.querySelectorAll('.cur-symbol').forEach((n) => { n.textContent = L.currencySymbol(); });
    $('k-wrap').textContent = s.toWrap; $('k-given').textContent = s.given;
  }
  function renderOccasions() {
    const list = C.upcoming(data, today(), 366, L.locale);
    if (!list.length) { $('occasions').replaceChildren(el('p', 'empty', t('occ.empty'))); return; }
    $('occasions').replaceChildren(...list.map((x) => {
      const a = el('article'), days = el('div', 'days');
      if (x.days === 0) days.append(t('occ.today'));
      else days.append(L.number(x.days), ' ', el('small', '', t('occ.dayUnit', { n: x.days })));
      a.append(days, el('strong', '', x.occasion.name), el('span', '', fmtDay(x.date) + (x.occasion.yearly ? ' · ' + t('occ.yearly') : '')),
        el('span', '', x.gifts.length ? `${t('occ.ready', { n: x.ready })} · ${t('occ.ideas', { n: x.ideas })}` : t('occ.noGift')));
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.style.cssText = 'min-height:32px;padding:4px 10px;font-size:12px;margin-top:8px';
      del.setAttribute('aria-label', t('aria.deleteOcc', { name: x.occasion.name }));
      del.addEventListener('click', () => { if (confirm(t('confirm.deleteOcc', { name: x.occasion.name })) && save(C.removeOccasion(data, x.occasion.id))) render(); });
      a.append(del); return a;
    }));
  }
  function renderPeople() {
    if (!data.people.length) { $('people').replaceChildren(el('li', 'empty', t('people.empty'))); return; }
    $('people').replaceChildren(...[...data.people].sort(byName).map((p) => {
      const tot = C.personTotals(data, p.id), li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', p.name));
      if (tot.budget) {
        const line = el('span', tot.over ? 'over-text' : '', t('person.spentOf', { spent: L.money(tot.spent), budget: L.money(tot.budget) }) +
          (tot.over ? ' — ' + t('person.over') : ' · ' + t('person.left', { amount: L.money(tot.remaining) })));
        const bar = el('div', 'budget' + (tot.over ? ' over' : '')), fill = el('i'); fill.style.width = Math.min(100, Math.round(100 * tot.spent / tot.budget)) + '%'; bar.append(fill);
        txt.append(line, bar);
        if (!tot.over && tot.overIfAll) txt.append(el('span', '', t('person.overIfAll', { planned: L.money(tot.planned) })));
      } else txt.append(el('span', '', t('person.noBudget', { spent: L.money(tot.spent) })));
      txt.append(el('span', '', t('person.count', { n: tot.count })));
      const acts = el('div', 'acts'), del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: p.name }));
      del.addEventListener('click', () => { if (confirm(t('confirm.deletePerson', { name: p.name, n: tot.count })) && save(C.removePerson(data, p.id))) render(); });
      acts.append(del); li.append(txt, acts); return li;
    }));
  }
  function renderSelects() {
    const form = $('gift-form'), keepP = form.person.value, keepO = form.occasion.value, keepF = $('filter').value;
    const people = [...data.people].sort(byName);
    const arrow = L.dir === 'rtl' ? '←' : '→'; // le formulaire « personne » est à côté (à gauche en arabe)
    form.person.replaceChildren(...(people.length ? people.map((p) => opt(p.id, p.name)) : [opt('', `${t('sel.addPerson')} ${arrow}`)]));
    form.occasion.replaceChildren(opt('', t('sel.noOccasion')), ...C.upcoming(data, today(), 366, L.locale).map((x) => opt(x.occasion.id, x.occasion.name)));
    $('filter').replaceChildren(opt('', t('sel.everyone')), ...people.map((p) => opt(p.id, p.name)));
    if (people.some((p) => p.id === keepP)) form.person.value = keepP;
    if ([...form.occasion.options].some((o) => o.value === keepO)) form.occasion.value = keepO;
    if (people.some((p) => p.id === keepF)) $('filter').value = keepF;
  }
  function renderGifts() {
    const who = $('filter').value;
    const order = { 'idée': 0, 'acheté': 1, 'offert': 2 };
    const gifts = data.gifts.filter((g) => !who || g.personId === who).sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title, L.locale));
    if (!gifts.length) { $('gifts').replaceChildren(el('li', 'empty', data.gifts.length ? t('gifts.noneFor') : t('gifts.empty'))); return; }
    $('gifts').replaceChildren(...gifts.map((g) => {
      const li = el('li'), txt = el('div', 'txt');
      const meta = t('gift.for', { name: nameOf(data.people, g.personId, '?') }) + ' · ' + (g.occasionId ? nameOf(data.occasions, g.occasionId, '?') : t('gift.noOccasion'));
      txt.append(el('b', '', g.title), el('span', '', meta + (g.priceCents ? ' · ' + L.money(g.priceCents) : '')));
      const acts = el('div', 'acts');
      const st = el('button', 'btn status-btn', statusName(g.status)); st.type = 'button'; st.dataset.s = g.status;
      st.setAttribute('aria-label', t('aria.status', { title: g.title, status: statusName(g.status) }));
      st.addEventListener('click', () => { if (save({ ...data, gifts: data.gifts.map((x) => (x.id === g.id ? C.advance(x) : x)) })) render(); });
      const del = el('button', 'btn', '×'); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: g.title }));
      del.addEventListener('click', () => { if (confirm(t('confirm.deleteGift', { title: g.title })) && save({ ...data, gifts: data.gifts.filter((x) => x.id !== g.id) })) render(); });
      acts.append(st, del); li.append(txt, acts); return li;
    }));
  }
  function render() { renderKpis(); renderOccasions(); renderPeople(); renderSelects(); renderGifts(); }

  // --- Formulaires
  $('person-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try {
      if (data.people.length >= C.LIMITS.people) throw new Error('err.maxPeople');
      const p = C.makePerson({ name: f.name.value, budget: f.budget.value }, newId());
      if (!save({ ...data, people: [...data.people, p] })) return;
      f.reset(); say('person-status', t('person.added', { name: p.name }), 'ok'); render(); $('gift-form').person.value = p.id;
    } catch (err) { say('person-status', L.error(err), 'error'); }
  });
  $('occ-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try {
      if (data.occasions.length >= C.LIMITS.occasions) throw new Error('err.maxOccasions');
      const o = C.makeOccasion({ name: f.name.value, date: f.date.value, yearly: f.yearly.checked }, newId());
      if (!save({ ...data, occasions: [...data.occasions, o] })) return;
      f.name.value = ''; say('occ-status', t('occ.added', { name: o.name, n: C.daysUntil(o, today()) }), 'ok'); render();
    } catch (err) { say('occ-status', L.error(err), 'error'); }
  });
  $('gift-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try {
      if (data.gifts.length >= C.LIMITS.gifts) throw new Error('err.maxGifts');
      const g = C.makeGift({ title: f.title.value, price: f.price.value, personId: f.person.value, occasionId: f.occasion.value || null, status: f.status.value }, newId(), data);
      if (!save({ ...data, gifts: [...data.gifts, g] })) return;
      f.title.value = ''; f.price.value = ''; say('gift-status', t('gift.added', { title: g.title }), 'ok'); render(); f.title.focus();
    } catch (err) { say('gift-status', L.error(err), 'error'); }
  });
  $('filter').addEventListener('change', renderGifts);
  $('sample').addEventListener('click', () => {
    try {
      const now = today(), y = Number(now.slice(0, 4)), inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return C.dayKey(d); };
      const lea = C.makePerson({ name: 'Léa', budget: '50' }, newId()), tom = C.makePerson({ name: 'Tom', budget: '30' }, newId());
      const bday = C.makeOccasion({ name: t('sample.birthday', { name: 'Léa' }), date: inDays(12), yearly: true }, newId());
      const xmas = C.makeOccasion({ name: t('sample.christmas'), date: `${y}-12-25` >= now ? `${y}-12-25` : `${y + 1}-12-25`, yearly: true }, newId());
      const base = { ...data, people: [...data.people, lea, tom], occasions: [...data.occasions, bday, xmas] };
      const gifts = [
        C.makeGift({ title: t('sample.pottery'), price: '45', personId: lea.id, occasionId: bday.id, status: 'idée' }, newId(), base),
        C.makeGift({ title: t('sample.novel'), price: '19,90', personId: lea.id, occasionId: xmas.id, status: 'acheté' }, newId(), base),
        C.makeGift({ title: t('sample.game'), price: '29', personId: tom.id, occasionId: xmas.id, status: 'idée' }, newId(), base),
      ];
      if (save({ ...base, gifts: [...base.gifts, ...gifts] })) { render(); say('gift-status', t('sample.added'), 'ok'); }
    } catch (err) { say('gift-status', L.error(err), 'error'); }
  });

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('giftnest-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { people: next.people.length, gifts: next.gifts.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.gifts.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: e instanceof SyntaxError ? t('err.backup') : L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('giftnest-raw-storage.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage
  $('occ-form').date.value = today();
  try { const raw = localStorage.getItem(KEY); if (raw) data = C.validateBackup(JSON.parse(raw)); }
  catch (e) { readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false; }
  // Nouvelle langue ou devise : on réaffiche (les saisies en cours et les choix des listes sont conservés).
  L.onChange(() => { for (const id of ['occ-status', 'gift-status', 'person-status', 'backup-status']) say(id, ''); render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
