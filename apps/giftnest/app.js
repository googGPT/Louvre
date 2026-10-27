/* GiftNest — interface. Les calculs sont dans core.js (GiftCore). */
(() => {
  'use strict';
  const C = window.GiftCore;
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
    if (readOnly) { say('backup-status', 'Stockage illisible : restaurez une sauvegarde valide avant de modifier.', 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', 'Enregistrement impossible (stockage plein ou bloqué) : ' + e.message, 'error'); return false; }
  }
  const fmtDay = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }); };
  const nameOf = (list, id, fallback) => (list.find((x) => x.id === id) || {}).name || fallback;

  function renderKpis() {
    const s = C.summary(data);
    $('k-spent').textContent = C.eur(s.spent); $('k-planned').textContent = C.eur(s.planned);
    $('k-wrap').textContent = s.toWrap; $('k-given').textContent = s.given;
  }
  function renderOccasions() {
    const list = C.upcoming(data, today(), 366);
    if (!list.length) { $('occasions').replaceChildren(el('p', 'empty', 'Aucune occasion à venir. Ajoutez un anniversaire ou une fête.')); return; }
    $('occasions').replaceChildren(...list.map((x) => {
      const a = el('article'), days = el('div', 'days');
      days.append(x.days === 0 ? 'Aujourd\'hui' : String(x.days), x.days === 0 ? '' : el('small', '', x.days === 1 ? ' jour' : ' jours'));
      a.append(days, el('strong', '', x.occasion.name), el('span', '', fmtDay(x.date) + (x.occasion.yearly ? ' · chaque année' : '')),
        el('span', '', x.gifts.length ? `${x.ready} prêt(s) · ${x.ideas} idée(s)` : 'Aucun cadeau prévu'));
      const del = el('button', 'btn', 'Supprimer'); del.type = 'button'; del.style.cssText = 'min-height:32px;padding:4px 10px;font-size:12px;margin-top:8px';
      del.setAttribute('aria-label', 'Supprimer l\'occasion ' + x.occasion.name);
      del.addEventListener('click', () => { if (confirm(`Supprimer « ${x.occasion.name} » ? Ses cadeaux sont conservés, sans occasion.`) && save(C.removeOccasion(data, x.occasion.id))) render(); });
      a.append(del); return a;
    }));
  }
  function renderPeople() {
    if (!data.people.length) { $('people').replaceChildren(el('li', 'empty', 'Ajoutez d\'abord une personne.')); return; }
    $('people').replaceChildren(...[...data.people].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((p) => {
      const t = C.personTotals(data, p.id), li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', p.name));
      if (t.budget) {
        const line = el('span', t.over ? 'over-text' : '', `${C.eur(t.spent)} dépensés sur ${C.eur(t.budget)}` + (t.over ? ' — budget dépassé' : ` · reste ${C.eur(t.remaining)}`));
        const bar = el('div', 'budget' + (t.over ? ' over' : '')), fill = el('i'); fill.style.width = Math.min(100, Math.round(100 * t.spent / t.budget)) + '%'; bar.append(fill);
        txt.append(line, bar);
        if (!t.over && t.overIfAll) txt.append(el('span', '', `Attention : avec les idées (${C.eur(t.planned)}), le budget serait dépassé.`));
      } else txt.append(el('span', '', `${C.eur(t.spent)} dépensés · pas de budget fixé`));
      txt.append(el('span', '', `${t.count} cadeau(x)`));
      const acts = el('div', 'acts'), del = el('button', 'btn', 'Supprimer'); del.type = 'button'; del.setAttribute('aria-label', 'Supprimer ' + p.name);
      del.addEventListener('click', () => { if (confirm(`Supprimer ${p.name} et ses ${t.count} cadeau(x) ?`) && save(C.removePerson(data, p.id))) render(); });
      acts.append(del); li.append(txt, acts); return li;
    }));
  }
  function renderSelects() {
    const form = $('gift-form'), keepP = form.person.value, keepO = form.occasion.value, keepF = $('filter').value;
    const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    form.person.replaceChildren(...(people.length ? people.map((p) => opt(p.id, p.name)) : [opt('', 'Ajoutez une personne →')]));
    form.occasion.replaceChildren(opt('', 'Sans occasion'), ...C.upcoming(data, today(), 366).map((x) => opt(x.occasion.id, x.occasion.name)));
    $('filter').replaceChildren(opt('', 'Tout le monde'), ...people.map((p) => opt(p.id, p.name)));
    if (people.some((p) => p.id === keepP)) form.person.value = keepP;
    if ([...form.occasion.options].some((o) => o.value === keepO)) form.occasion.value = keepO;
    if (people.some((p) => p.id === keepF)) $('filter').value = keepF;
  }
  function renderGifts() {
    const who = $('filter').value;
    const order = { 'idée': 0, 'acheté': 1, 'offert': 2 };
    const gifts = data.gifts.filter((g) => !who || g.personId === who).sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title, 'fr'));
    if (!gifts.length) { $('gifts').replaceChildren(el('li', 'empty', data.gifts.length ? 'Aucun cadeau pour cette personne.' : 'Aucune idée pour l\'instant.')); return; }
    $('gifts').replaceChildren(...gifts.map((g) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', g.title), el('span', '', `Pour ${nameOf(data.people, g.personId, '?')} · ${g.occasionId ? nameOf(data.occasions, g.occasionId, '?') : 'sans occasion'}${g.priceCents ? ' · ' + C.eur(g.priceCents) : ''}`));
      const acts = el('div', 'acts');
      const st = el('button', 'btn status-btn', g.status); st.type = 'button'; st.dataset.s = g.status;
      st.setAttribute('aria-label', `${g.title} : ${g.status}, passer à l'étape suivante`);
      st.addEventListener('click', () => { if (save({ ...data, gifts: data.gifts.map((x) => (x.id === g.id ? C.advance(x) : x)) })) render(); });
      const del = el('button', 'btn', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Supprimer ' + g.title);
      del.addEventListener('click', () => { if (confirm(`Supprimer « ${g.title} » ?`) && save({ ...data, gifts: data.gifts.filter((x) => x.id !== g.id) })) render(); });
      acts.append(st, del); li.append(txt, acts); return li;
    }));
  }
  function render() { renderKpis(); renderOccasions(); renderPeople(); renderSelects(); renderGifts(); }

  // --- Formulaires
  $('person-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try {
      if (data.people.length >= C.LIMITS.people) throw new Error('Nombre maximal de personnes atteint');
      const p = C.makePerson({ name: f.name.value, budget: f.budget.value }, newId());
      if (!save({ ...data, people: [...data.people, p] })) return;
      f.reset(); say('person-status', `${p.name} ajouté(e).`, 'ok'); render(); $('gift-form').person.value = p.id;
    } catch (err) { say('person-status', err.message, 'error'); }
  });
  $('occ-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try {
      if (data.occasions.length >= C.LIMITS.occasions) throw new Error('Nombre maximal d\'occasions atteint');
      const o = C.makeOccasion({ name: f.name.value, date: f.date.value, yearly: f.yearly.checked }, newId());
      if (!save({ ...data, occasions: [...data.occasions, o] })) return;
      f.name.value = ''; say('occ-status', `« ${o.name} » ajoutée : dans ${C.daysUntil(o, today())} jour(s).`, 'ok'); render();
    } catch (err) { say('occ-status', err.message, 'error'); }
  });
  $('gift-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.currentTarget;
    try {
      if (data.gifts.length >= C.LIMITS.gifts) throw new Error('Nombre maximal de cadeaux atteint');
      const g = C.makeGift({ title: f.title.value, price: f.price.value, personId: f.person.value, occasionId: f.occasion.value || null, status: f.status.value }, newId(), data);
      if (!save({ ...data, gifts: [...data.gifts, g] })) return;
      f.title.value = ''; f.price.value = ''; say('gift-status', `« ${g.title} » ajouté.`, 'ok'); render(); f.title.focus();
    } catch (err) { say('gift-status', err.message, 'error'); }
  });
  $('filter').addEventListener('change', renderGifts);
  $('sample').addEventListener('click', () => {
    try {
      const t = today(), y = Number(t.slice(0, 4)), inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return C.dayKey(d); };
      const lea = C.makePerson({ name: 'Léa', budget: '50' }, newId()), tom = C.makePerson({ name: 'Tom', budget: '30' }, newId());
      const bday = C.makeOccasion({ name: 'Anniversaire de Léa', date: inDays(12), yearly: true }, newId());
      const xmas = C.makeOccasion({ name: 'Noël', date: `${y}-12-25` >= t ? `${y}-12-25` : `${y + 1}-12-25`, yearly: true }, newId());
      const base = { ...data, people: [...data.people, lea, tom], occasions: [...data.occasions, bday, xmas] };
      const gifts = [
        C.makeGift({ title: 'Atelier poterie', price: '45', personId: lea.id, occasionId: bday.id, status: 'idée' }, newId(), base),
        C.makeGift({ title: 'Roman policier', price: '19,90', personId: lea.id, occasionId: xmas.id, status: 'acheté' }, newId(), base),
        C.makeGift({ title: 'Jeu de société', price: '29', personId: tom.id, occasionId: xmas.id, status: 'idée' }, newId(), base),
      ];
      if (save({ ...base, gifts: [...base.gifts, ...gifts] })) { render(); say('gift-status', 'Exemples ajoutés.', 'ok'); }
    } catch (err) { say('gift-status', err.message, 'error'); }
  });

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('giftnest-sauvegarde.json', C.backup(data), 'application/json'); say('backup-status', 'Sauvegarde téléchargée.', 'ok'); }
    catch (e) { say('backup-status', e.message, 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Fichier trop volumineux');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(`Remplacer les données de cet appareil par la sauvegarde (${next.people.length} personne(s), ${next.gifts.length} cadeau(x)) ?`)) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', `Sauvegarde restaurée : ${next.gifts.length} cadeau(x).`, 'ok');
    } catch (e) { say('backup-status', 'Restauration refusée : ' + e.message, 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('giftnest-stockage-brut.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage
  $('occ-form').date.value = today();
  try { const raw = localStorage.getItem(KEY); if (raw) data = C.validateBackup(JSON.parse(raw)); }
  catch (e) { readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false; }
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
