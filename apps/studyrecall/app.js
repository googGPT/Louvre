/* StudyRecall — interface. La logique de révision est dans core.js (StudyCore). */
(() => {
  'use strict';
  const C = window.StudyCore;
  const KEY = 'louvre-studyrecall-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };

  let cards = []; // toutes les fiches
  let readOnly = false; // vrai si le stockage est illisible : on n'écrit plus rien
  let editing = null; // identifiant de la fiche en cours de modification
  let current = null; // fiche affichée en révision
  const today = () => C.dayKey();

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function newId() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)); }

  // Enregistre seulement si le stockage est sain ; renvoie vrai en cas de succès.
  function save(next) {
    if (readOnly) { say('backup-status', 'Stockage illisible : restaurez une sauvegarde valide avant de modifier.', 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); cards = next; return true; }
    catch (e) { say('backup-status', 'Enregistrement impossible (stockage plein ou bloqué) : ' + e.message, 'error'); return false; }
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
      $('flash-empty').textContent = cards.length ? 'Bravo, plus rien à réviser aujourd\'hui.' : 'Ajoutez vos premières fiches pour commencer.';
      return;
    }
    $('flash-meta').textContent = `${current.deck} · boîte ${current.box} · ${q.length} à réviser`;
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
      say('session-status', known ? `Bien ! Prochaine révision le ${formatDay(updated.due)}.` : 'Elle revient demain, en boîte 1.', known ? 'ok' : '');
      render();
    } catch (e) { say('session-status', e.message, 'error'); }
  }

  // --- Affichage
  function formatDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function renderStats() {
    const s = C.stats(cards, today());
    $('k-due').textContent = s.due; $('k-today').textContent = s.reviewedToday; $('k-mastered').textContent = s.mastered;
    $('k-retention').textContent = s.retention === null ? '—' : s.retention.toLocaleString('fr-FR') + ' %';
    const max = Math.max(1, ...s.perBox);
    $('boxes').replaceChildren(...s.perBox.map((n, i) => { const bar = el('div'); bar.style.height = Math.max(6, Math.round(100 * n / max)) + '%'; bar.title = `Boîte ${i + 1} : ${n} fiche(s)`; bar.append(el('b', '', n)); return bar; }));
    $('forecast').replaceChildren(...C.forecast(cards, today(), 7).map((f, i) => { const li = el('li'); li.append(el('strong', '', f.count), i === 0 ? 'auj.' : formatDay(f.day).split(' ')[0]); return li; }));
  }
  function renderDecks() {
    const list = C.decks(cards), filter = $('deck-filter'), chosen = filter.value;
    filter.replaceChildren(el('option', '', 'Tous les paquets'), ...list.map((d) => { const o = el('option', '', d); o.value = d; return o; }));
    filter.firstChild.value = '';
    filter.value = list.includes(chosen) ? chosen : '';
    $('deck-list').replaceChildren(...list.map((d) => { const o = el('option'); o.value = d; return o; }));
  }
  function renderList() {
    const q = $('search').value.trim().toLocaleLowerCase('fr');
    const shown = cards.filter((c) => !q || `${c.front} ${c.back} ${c.deck}`.toLocaleLowerCase('fr').includes(q))
      .sort((a, b) => a.due.localeCompare(b.due) || a.front.localeCompare(b.front, 'fr'));
    $('count').textContent = `(${cards.length})`;
    if (!shown.length) { $('cards').replaceChildren(el('li', 'empty', cards.length ? 'Aucune fiche ne correspond.' : 'Aucune fiche pour l\'instant.')); return; }
    $('cards').replaceChildren(...shown.map((c) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', c.front), el('span', '', c.back), el('span', 'tag', `${c.deck} · boîte ${c.box} · ${C.isDue(c, today()) ? 'à réviser' : 'le ' + formatDay(c.due)}`));
      const acts = el('div', 'acts'), edit = el('button', 'btn', 'Modifier'), del = el('button', 'btn', 'Supprimer');
      edit.type = del.type = 'button';
      edit.setAttribute('aria-label', 'Modifier : ' + c.front); del.setAttribute('aria-label', 'Supprimer : ' + c.front);
      edit.addEventListener('click', () => startEdit(c));
      del.addEventListener('click', () => { if (confirm('Supprimer cette fiche ?') && save(cards.filter((x) => x.id !== c.id))) { if (editing === c.id) stopEdit(); render(); } });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }
  function render() { renderDecks(); renderStats(); renderList(); nextCard(); }

  // --- Formulaire
  function startEdit(c) {
    editing = c.id; const f = $('card-form');
    f.front.value = c.front; f.back.value = c.back; f.deck.value = c.deck === 'Général' ? '' : c.deck;
    $('h-form').textContent = 'Modifier la fiche'; $('save').textContent = 'Enregistrer'; $('cancel').hidden = false; f.front.focus();
  }
  function stopEdit() { editing = null; $('card-form').reset(); $('h-form').textContent = 'Nouvelle fiche'; $('save').textContent = 'Ajouter la fiche'; $('cancel').hidden = true; }
  $('card-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget, input = { front: f.front.value, back: f.back.value, deck: f.deck.value };
    try {
      let next;
      if (editing) next = cards.map((c) => (c.id === editing ? C.editCard(c, input) : c));
      else { if (cards.length >= C.MAX_CARDS) throw new Error('Nombre maximal de fiches atteint'); next = [...cards, C.createCard(input, today(), newId())]; }
      if (!save(next)) return;
      say('form-status', editing ? 'Fiche modifiée.' : 'Fiche ajoutée : à réviser dès aujourd\'hui.', 'ok');
      stopEdit(); render(); f.front.focus();
    } catch (e) { say('form-status', e.message, 'error'); }
  });
  $('cancel').addEventListener('click', stopEdit);

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download(`studyrecall-${today()}.json`, C.backup(cards), 'application/json'); say('backup-status', 'Sauvegarde téléchargée.', 'ok'); }
    catch (e) { say('backup-status', e.message, 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('Fichier trop volumineux');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(`Remplacer les ${cards.length} fiches de cet appareil par les ${next.length} fiches de la sauvegarde ?`)) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; stopEdit(); render();
      say('backup-status', `Sauvegarde restaurée : ${next.length} fiche(s).`, 'ok');
    } catch (e) { say('backup-status', 'Restauration refusée : ' + e.message, 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('studyrecall-stockage-brut.txt', localStorage.getItem(KEY) || '', 'text/plain'));
  $('sample').addEventListener('click', () => {
    const samples = [
      { front: 'Capitale de l\'Australie ?', back: 'Canberra', deck: 'Géographie' },
      { front: 'Formule de la valeur actuelle d\'un flux F dans n ans au taux r ?', back: 'VA = F / (1 + r)^n', deck: 'Finance' },
      { front: '« To overlook » signifie…', back: 'Négliger, ne pas remarquer (et non « surveiller »).', deck: 'Anglais' },
    ];
    try { if (save([...cards, ...samples.map((s) => C.createCard(s, today(), newId()))])) { render(); say('backup-status', '3 fiches d\'exemple ajoutées.', 'ok'); } }
    catch (e) { say('backup-status', e.message, 'error'); }
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
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
