/* StudyRecall — interface. La logique de révision est dans core.js (StudyCore). */
(() => {
  'use strict';
  const C = window.StudyCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const deckName = (d) => (d === 'Général' ? t('deck.general') : d); // paquet par défaut traduit à l'affichage
  const KEY = 'louvre-studyrecall-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };

  let cards = []; // toutes les fiches
  let readOnly = false; // vrai si le stockage est illisible : on n'écrit plus rien
  let editing = null; // identifiant de la fiche en cours de modification
  let current = null; // fiche affichée en révision
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  // Identifiants croissants (horodatage + compteur) : à date égale, les cartes restent dans l'ordre d'ajout.
  let idSeq = 0;
  function newId() { return `${Date.now().toString(36)}-${(idSeq++ % 1679616).toString(36).padStart(4, '0')}-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`; }

  // Enregistre seulement si le stockage est sain ; renvoie vrai en cas de succès.
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); cards = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // --- Révision
  function nextCard() {
    const q = C.queue(cards, today(), $('deck-filter').value);
    current = q[0] || null;
    $('flash-empty').hidden = !!current;
    $('flash-card').hidden = !current;
    $('reveal').disabled = !current;
    $('reveal').hidden = false; $('known').hidden = true; $('forgot').hidden = true; $('flash-a').hidden = true;
    if (!current) {
      $('flash-empty').textContent = cards.length ? t('flash.done') : t('flash.start');
      return;
    }
    $('flash-meta').textContent = t('flash.meta', { deck: deckName(current.deck), box: current.box, n: q.length });
    $('flash-q').textContent = current.front;
    $('flash-a').textContent = current.back;
  }
  function reveal() {
    if (!current) return;
    $('flash-a').hidden = false; $('reveal').hidden = true; $('known').hidden = false; $('forgot').hidden = false;
    $('known').focus();
  }
  function answer(known) {
    if (!current) return;
    try {
      const updated = C.review(current, known, today());
      if (!save(cards.map((c) => (c.id === updated.id ? updated : c)))) return;
      say('session-status', known ? t('session.known', { date: formatDay(updated.due) }) : t('session.forgot'), known ? 'ok' : '');
      render();
    } catch (e) { say('session-status', L.error(e), 'error'); }
  }

  // --- Affichage
  function formatDay(day) {
    return L.date(day, { weekday: 'short', day: 'numeric', month: 'short' }); // selon la langue choisie
  }
  function renderStats() {
    const s = C.stats(cards, today());
    $('k-due').textContent = s.due; $('k-today').textContent = s.reviewedToday; $('k-mastered').textContent = s.mastered;
    $('k-retention').textContent = s.retention === null ? '—' : L.number(s.retention / 100, { style: 'percent', maximumFractionDigits: 1 });
    const max = Math.max(1, ...s.perBox);
    $('boxes').replaceChildren(...s.perBox.map((n, i) => { const bar = el('div'); bar.style.height = Math.max(6, Math.round(100 * n / max)) + '%'; bar.title = t('box.tip', { box: i + 1, n }); bar.append(el('b', '', n)); return bar; }));
    $('forecast').replaceChildren(...C.forecast(cards, today(), 7).map((f, i) => { const li = el('li'); li.append(el('strong', '', f.count), i === 0 ? t('forecast.today') : L.date(f.day, { weekday: 'short' })); return li; }));
  }
  function renderDecks() {
    const list = C.decks(cards), filter = $('deck-filter'), chosen = filter.value;
    filter.replaceChildren(el('option', '', t('deck.all')), ...list.map((d) => { const o = el('option', '', deckName(d)); o.value = d; return o; }));
    filter.firstChild.value = '';
    filter.value = list.includes(chosen) ? chosen : '';
    $('deck-list').replaceChildren(...list.map((d) => { const o = el('option'); o.value = d; return o; }));
  }
  function renderList() {
    const q = $('search').value.trim().toLocaleLowerCase();
    const shown = cards.filter((c) => !q || `${c.front} ${c.back} ${deckName(c.deck)}`.toLocaleLowerCase().includes(q))
      .sort((a, b) => a.due.localeCompare(b.due) || a.front.localeCompare(b.front, 'fr'));
    $('count').textContent = `(${cards.length})`;
    if (!shown.length) { $('cards').replaceChildren(el('li', 'empty', cards.length ? t('list.noMatch') : t('list.none'))); return; }
    $('cards').replaceChildren(...shown.map((c) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', c.front), el('span', '', c.back), el('span', 'tag', C.isDue(c, today()) ? t('tag.due', { deck: deckName(c.deck), box: c.box }) : t('tag.later', { deck: deckName(c.deck), box: c.box, date: formatDay(c.due) })));
      const acts = el('div', 'acts'), edit = el('button', 'btn', t('btn.edit')), del = el('button', 'btn', t('btn.delete'));
      edit.type = del.type = 'button';
      edit.setAttribute('aria-label', t('aria.edit', { q: c.front })); del.setAttribute('aria-label', t('aria.delete', { q: c.front }));
      edit.addEventListener('click', () => startEdit(c));
      del.addEventListener('click', () => { if (confirm(t('confirm.delete')) && save(cards.filter((x) => x.id !== c.id))) { if (editing === c.id) stopEdit(); render(); } });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }
  function render() { renderDecks(); renderStats(); renderList(); nextCard(); }

  // --- Formulaire
  function startEdit(c) {
    editing = c.id; const f = $('card-form');
    f.front.value = c.front; f.back.value = c.back; f.deck.value = c.deck === 'Général' ? '' : c.deck;
    $('h-form').textContent = t('form.edit'); $('save').textContent = t('btn.save'); $('cancel').hidden = false; f.front.focus();
  }
  function stopEdit() { editing = null; $('card-form').reset(); $('h-form').textContent = t('form.new'); $('save').textContent = t('btn.addCard'); $('cancel').hidden = true; }
  $('card-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget, input = { front: f.front.value, back: f.back.value, deck: f.deck.value };
    try {
      let next;
      if (editing) next = cards.map((c) => (c.id === editing ? C.editCard(c, input) : c));
      else { if (cards.length >= C.MAX_CARDS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_CARDS })}`); next = [...cards, C.createCard(input, today(), newId())]; }
      if (!save(next)) return;
      say('form-status', editing ? t('form.edited') : t('form.added'), 'ok');
      stopEdit(); render(); f.front.focus();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('cancel').addEventListener('click', stopEdit);

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download(`studyrecall-${today()}.json`, C.backup(cards), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: cards.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; stopEdit(); render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('studyrecall-stockage-brut.txt', localStorage.getItem(KEY) || '', 'text/plain'));
  $('sample').addEventListener('click', () => {
    const samples = [
      ...[1, 2, 3].map((i) => ({ front: t(`sample.q${i}`), back: t(`sample.a${i}`), deck: t(`sample.d${i}`) })), // exemples dans la langue choisie
    ];
    try { if (save([...cards, ...samples.map((s) => C.createCard(s, today(), newId()))])) { render(); say('backup-status', t('sample.added'), 'ok'); } }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });

  // --- Événements de révision
  $('reveal').addEventListener('click', reveal);
  $('known').addEventListener('click', () => answer(true));
  $('forgot').addEventListener('click', () => answer(false));
  $('deck-filter').addEventListener('change', nextCard);
  $('search').addEventListener('input', renderList);
  document.addEventListener('keydown', (event) => { // raccourcis : Espace = réponse, 1 = je savais, 2 = à revoir
    if (event.target.closest('input,textarea,select') || !current) return;
    if (event.key === ' ' && !$('reveal').hidden) { event.preventDefault(); reveal(); }
    else if (event.key === '1' && !$('known').hidden) answer(true);
    else if (event.key === '2' && !$('forgot').hidden) answer(false);
  });
  window.addEventListener('storage', (event) => { // autre onglet : on recharge
    if (event.key === KEY && !readOnly) { try { cards = C.validateBackup(JSON.parse(event.newValue || '{"app":"studyrecall","version":1,"cards":[]}')); render(); } catch (e) { /* on garde l'état affiché */ } }
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cards = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { if (editing) { $('h-form').textContent = t('form.edit'); $('save').textContent = t('btn.save'); } else { $('h-form').textContent = t('form.new'); $('save').textContent = t('btn.addCard'); } render(); }); // nouvelle langue : on réaffiche
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
