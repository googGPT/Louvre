/* BillCalendar — interface. Les calculs sont dans core.js (BillCore). */
(() => {
  'use strict';
  const C = window.BillCore;
  const KEY = 'louvre-billcalendar-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let bills = [];
  let readOnly = false;
  let editing = null;
  const now = new Date();
  let view = { y: now.getFullYear(), m: now.getMonth() + 1 }; // mois affiché
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', 'Stockage illisible : restaurez une sauvegarde valide avant de modifier.', 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); bills = next; return true; }
    catch (e) { say('backup-status', 'Enregistrement impossible (stockage plein ou bloqué) : ' + e.message, 'error'); return false; }
  }
  const longDate = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); };

  function renderCalendar() {
    const { y, m } = view;
    $('h-month').textContent = new Date(y, m - 1, 1, 12).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const data = C.month(bills, y, m);
    const byDay = {};
    for (const it of data.items) (byDay[it.day] ||= []).push(it.bill);
    const cells = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => el('div', 'dow', d));
    const offset = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7; // lundi = 0
    for (let i = 0; i < offset; i += 1) cells.push(el('div', 'day out'));
    for (let d = 1; d <= C.lastDayOfMonth(y, m); d += 1) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cell = el('div', 'day' + (key === today() ? ' today' : ''));
      cell.append(el('b', '', d));
      for (const b of byDay[key] || []) { const chip = el('span', 'chip', b.name); chip.title = `${b.name} — ${C.eur(b.amountCents)}`; cell.append(chip); }
      cells.push(cell);
    }
    $('cal').replaceChildren(...cells);
    $('month-total').textContent = data.items.length ? `Total du mois : ${C.eur(data.totalCents)} (${data.items.length} échéance${data.items.length > 1 ? 's' : ''})` : 'Aucune échéance ce mois-ci.';
    $('month-list').replaceChildren(...data.items.map((it) => line(longDate(it.day), it.bill.name, C.eur(it.bill.amountCents))));
  }
  function line(a, b, money) {
    const li = el('li'), txt = el('div', 'txt');
    txt.append(el('b', '', b), el('span', '', a));
    li.append(txt, el('span', 'money', money)); return li;
  }
  function renderSummary() {
    const s = C.summary(bills, today());
    $('k-month').textContent = C.eur(s.monthlyCents);
    $('k-year').textContent = C.eur(s.yearlyCents);
    $('k-30').textContent = C.eur(s.next30Cents);
    $('k-count').textContent = `${s.active} / ${s.paused}`;
    const max = Math.max(1, ...s.byCategory.map((x) => x[1]));
    $('cats').replaceChildren(...(s.byCategory.length ? s.byCategory.map(([cat, cents]) => {
      const li = el('li'), bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.round(100 * cents / max) + '%'; bar.append(fill);
      li.append(el('span', '', cat), bar, el('span', 'money', C.eur(cents))); return li;
    }) : [el('li', 'empty', 'Aucune facture active.')]));
    const up = C.upcoming(bills, today(), 30).items.slice(0, 6);
    $('upcoming').replaceChildren(...(up.length ? up.map((it) => line(longDate(it.day), it.bill.name, C.eur(it.bill.amountCents))) : [el('li', 'empty', 'Rien dans les 30 prochains jours.')]));
  }
  function renderBills() {
    $('count').textContent = `(${bills.length})`;
    if (!bills.length) { $('bills').replaceChildren(el('li', 'empty', 'Aucune facture. Ajoutez-en une ou chargez les exemples.')); return; }
    const sorted = [...bills].sort((a, b) => (b.active - a.active) || ((C.nextDue(a, today()) || '9') .localeCompare(C.nextDue(b, today()) || '9')) || a.name.localeCompare(b.name, 'fr'));
    $('bills').replaceChildren(...sorted.map((b) => {
      const li = el('li', b.active ? '' : 'paused'), txt = el('div', 'txt'), next = C.nextDue(b, today());
      txt.append(el('b', '', `${b.name} · ${C.eur(b.amountCents)}`),
        el('span', '', `${C.FREQUENCIES[b.frequency].label} · soit ${C.eur(C.monthlyEquivalentCents(b))}/mois`),
        el('span', 'tag', b.active ? `${b.category} · prochaine : ${next ? longDate(next) : '—'}` : `${b.category} · en pause`));
      const acts = el('div', 'acts');
      const mk = (label, aria, fn) => { const x = el('button', 'btn', label); x.type = 'button'; x.setAttribute('aria-label', `${aria} : ${b.name}`); x.addEventListener('click', fn); acts.append(x); };
      mk('Modifier', 'Modifier', () => startEdit(b));
      mk(b.active ? 'Pause' : 'Reprendre', b.active ? 'Mettre en pause' : 'Reprendre', () => { if (save(bills.map((x) => (x.id === b.id ? { ...x, active: !x.active } : x)))) render(); });
      mk('Supprimer', 'Supprimer', () => { if (confirm(`Supprimer « ${b.name} » ?`) && save(bills.filter((x) => x.id !== b.id))) { if (editing === b.id) stopEdit(); render(); } });
      li.append(txt, acts); return li;
    }));
  }
  function render() { renderCalendar(); renderSummary(); renderBills(); }

  // --- Formulaire
  const form = $('bill-form');
  form.category.replaceChildren(...C.CATEGORIES.map((c) => { const o = el('option', '', c); o.value = c; return o; }));
  form.start.value = today();
  function startEdit(b) {
    editing = b.id; form.name.value = b.name; form.amount.value = (b.amountCents / 100).toFixed(2).replace('.', ',');
    form.frequency.value = b.frequency; form.start.value = b.start; form.category.value = b.category;
    $('h-form').textContent = 'Modifier la facture'; $('save').textContent = 'Enregistrer'; $('cancel').hidden = false; form.name.focus();
  }
  function stopEdit() { editing = null; form.reset(); form.start.value = today(); $('h-form').textContent = 'Nouvelle facture'; $('save').textContent = 'Ajouter'; $('cancel').hidden = true; }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const input = { name: form.name.value, amount: form.amount.value, frequency: form.frequency.value, start: form.start.value, category: form.category.value };
      let next;
      if (editing) { const old = bills.find((b) => b.id === editing); next = bills.map((b) => (b.id === editing ? C.makeBill({ ...input, active: old.active }, editing) : b)); }
      else { if (bills.length >= C.MAX_BILLS) throw new Error('Nombre maximal de factures atteint'); next = [...bills, C.makeBill(input, newId())]; }
      if (!save(next)) return;
      say('form-status', editing ? 'Facture modifiée.' : 'Facture ajoutée.', 'ok'); stopEdit(); render();
    } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('cancel').addEventListener('click', stopEdit);
  $('sample').addEventListener('click', () => {
    const t = today(), first = (d) => `${t.slice(0, 8)}${String(d).padStart(2, '0')}`;
    const samples = [
      { name: 'Loyer', amount: '780', frequency: 'monthly', start: first(5), category: 'Logement' },
      { name: 'Forfait mobile', amount: '12,99', frequency: 'monthly', start: first(12), category: 'Télécom' },
      { name: 'Assurance habitation', amount: '168', frequency: 'yearly', start: first(20), category: 'Assurance' },
      { name: 'Streaming', amount: '8,99', frequency: 'monthly', start: first(28), category: 'Abonnement' },
      { name: 'Électricité', amount: '210', frequency: 'quarterly', start: first(15), category: 'Énergie' },
    ];
    try { if (save([...bills, ...samples.map((s) => C.makeBill(s, newId()))])) { render(); say('form-status', '5 exemples ajoutés.', 'ok'); } }
    catch (e) { say('form-status', e.message, 'error'); }
  });

  // --- Navigation
  $('prev').addEventListener('click', () => { view = view.m === 1 ? { y: view.y - 1, m: 12 } : { y: view.y, m: view.m - 1 }; renderCalendar(); });
  $('next').addEventListener('click', () => { view = view.m === 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m: view.m + 1 }; renderCalendar(); });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => {
    if (!bills.some((b) => b.active)) { say('backup-status', 'Aucune facture active à exporter.', 'error'); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    download('billcalendar.ics', C.toICS(bills, stamp), 'text/calendar');
    say('backup-status', 'Fichier agenda téléchargé : ouvrez-le avec votre application de calendrier.', 'ok');
  });
  $('export').addEventListener('click', () => {
    try { download('billcalendar-sauvegarde.json', C.backup(bills), 'application/json'); say('backup-status', 'Sauvegarde téléchargée.', 'ok'); }
    catch (e) { say('backup-status', e.message, 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Fichier trop volumineux');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(`Remplacer les ${bills.length} facture(s) de cet appareil par les ${next.length} de la sauvegarde ?`)) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; stopEdit(); render();
      say('backup-status', `Sauvegarde restaurée : ${next.length} facture(s).`, 'ok');
    } catch (e) { say('backup-status', 'Restauration refusée : ' + e.message, 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('billcalendar-stockage-brut.txt', localStorage.getItem(KEY) || '', 'text/plain'));

  // --- Démarrage
  try { const raw = localStorage.getItem(KEY); if (raw) bills = C.validateBackup(JSON.parse(raw)); }
  catch (e) { readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false; }
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
