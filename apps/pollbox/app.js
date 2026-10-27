/* PollBox — interface. Règles du scrutin dans core.js (PollCore) ; textes dans LouvreI18n (appli sans argent).
   Le mode « isoloir » masque tout le reste de la page ; l'écran « Au suivant » efface le choix précédent. */
(() => {
  'use strict';
  const C = window.PollCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-pollbox-v1';
  const ACTIVE = 'louvre-pollbox-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let polls = [], activeId = null, readOnly = false;
  let dirty = false, saveTimer = null, inBooth = false;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return polls.find((p) => p.id === activeId) || null; }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function save(next, statusId = 'backup-status') {
    if (readOnly) { say(statusId, t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); polls = next; return true; }
    catch (e) { say(statusId, t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  const replace = (poll) => polls.map((p) => (p.id === poll.id ? poll : p));
  const pct = (tenths) => L.number(tenths / 1000, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // --- Brouillon : enregistrement différé, forcé avant tout changement de scrutin, ouverture, export et fermeture
  function readEditor() {
    return { question: $('f-question').value, options: $('f-options').value, mode: $('f-mode').value, maxChoices: $('f-max-choices').value, allowBlank: $('f-blank').checked, maxBallots: $('f-max-ballots').value, pin: $('f-pin').value };
  }
  function stateText() {
    const cur = active();
    $('save-state').textContent = readOnly ? t('save.readonly') : dirty ? t('save.pending') : (cur && cur.lock ? t('save.doneLocked') : t('save.done'));
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty) return true;
    const cur = active();
    if (!cur || cur.status !== 'draft') { dirty = false; return true; }
    try {
      const next = C.editPoll(cur, readEditor());
      if (save(replace(next), 'edit-status')) { dirty = false; say('edit-status', ''); renderSelect(); }
    } catch (e) { say('edit-status', errText(e), 'error'); }
    stateText();
    return !dirty;
  }
  function onEdit() {
    dirty = true; stateText(); syncModeFields();
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
  }
  function syncModeFields() { $('max-choices-field').hidden = $('f-mode').value !== 'multi'; }

  // --- Affichage organisateur
  const STATE_TAG = { draft: 'tag', open: 'tag warn', closed: 'tag good' };
  function renderSelect() {
    const sel = $('poll-select');
    sel.replaceChildren(...polls.map((p) => { const o = el('option', '', `${p.question} — ${t('state.' + p.status)}`); o.value = p.id; return o; }));
    if (activeId) sel.value = activeId;
    const cur = active();
    sel.hidden = !polls.length;
    $('dup-poll').disabled = $('delete-poll').disabled = !cur || readOnly;
    $('new-poll').disabled = $('sample').disabled = readOnly;
  }
  function loadEditor() {
    const cur = active();
    $('no-poll').hidden = !!cur;
    $('editor').hidden = !cur || cur.status !== 'draft';
    $('summary').hidden = !cur || cur.status === 'draft';
    dirty = false; clearTimeout(saveTimer);
    if (cur && cur.status === 'draft') {
      $('f-question').value = cur.question; $('f-options').value = cur.options.map((o) => o.label).join('\n');
      $('f-mode').value = cur.mode; $('f-max-choices').value = cur.mode === 'multi' ? String(cur.maxChoices) : '';
      $('f-blank').checked = cur.allowBlank; $('f-max-ballots').value = cur.maxBallots ? String(cur.maxBallots) : ''; $('f-pin').value = '';
      for (const id of ['f-question', 'f-options', 'f-mode', 'f-max-choices', 'f-blank', 'f-max-ballots', 'f-pin', 'open-poll']) $(id).disabled = readOnly;
      syncModeFields(); stateText(); say('edit-status', '');
    }
    renderSummary();
  }
  function describe(p) {
    const parts = [p.mode === 'single' ? t('mode.single') : t('sum.multi', { n: p.maxChoices })];
    parts.push(p.allowBlank ? t('sum.blankYes') : t('sum.blankNo'));
    if (p.maxBallots) parts.push(t('sum.expected', { n: p.maxBallots }));
    if (p.lock) parts.push(t('sum.locked'));
    return parts.join(' · ');
  }
  function renderSummary() {
    const p = active();
    if (!p || p.status === 'draft') return;
    $('state-tag').className = STATE_TAG[p.status]; $('state-tag').textContent = t('state.' + p.status);
    $('sum-question').textContent = p.question;
    $('sum-meta').textContent = describe(p);
    $('participation').textContent = p.maxBallots ? t('sum.ballotsOf', { n: p.ballots, count: L.number(p.ballots), max: L.number(p.maxBallots) }) : t('sum.ballots', { n: p.ballots, count: L.number(p.ballots) });
    $('open-actions').hidden = p.status !== 'open';
    $('start-booth').disabled = readOnly || (p.maxBallots > 0 && p.ballots >= p.maxBallots);
    $('close-poll').disabled = readOnly;
    $('hidden-note').hidden = p.status !== 'open';
    $('results').hidden = p.status !== 'closed';
    if (p.status === 'closed') renderResults(p);
  }
  function renderResults(p) {
    const r = C.results(p);
    const w = $('winner');
    if (!r.valid) { w.className = 'verdict neutral'; w.textContent = t('res.noVotes'); }
    else if (r.tie) { w.className = 'verdict warn'; w.textContent = t('res.tie', { labels: r.winners.map((x) => x.label).join(', '), n: r.winners[0].votes, count: L.number(r.winners[0].votes) }); }
    else { w.className = 'verdict'; w.textContent = t('res.winner', { label: r.winners[0].label, n: r.winners[0].votes, count: L.number(r.winners[0].votes), pct: pct(r.winners[0].pct) }); }
    const max = Math.max(1, ...r.rows.map((x) => x.votes));
    $('result-rows').replaceChildren(...r.rows.map((row) => {
      const li = el('li', row.winner ? 'win' : '');
      const head = el('div', 'bar-head');
      head.append(el('span', 'bar-label', `${L.number(row.rank)}. ${row.label}`), el('span', 'bar-num', `${t('res.votes', { n: row.votes, count: L.number(row.votes) })} · ${pct(row.pct)}`));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = `${Math.round((100 * row.votes) / max)}%`; bar.append(fill);
      li.append(head, bar); return li;
    }));
    const notes = [t('res.total', { n: r.ballots, count: L.number(r.ballots) })];
    if (p.allowBlank) notes.push(t('res.blank', { n: r.blank, count: L.number(r.blank), pct: pct(r.blankPct) }));
    notes.push(p.mode === 'single' ? t('res.baseSingle') : t('res.baseMulti'));
    $('results-note').textContent = notes.join(' ');
  }
  function render() { renderSelect(); loadEditor(); }

  // --- Événements organisateur
  for (const id of ['f-question', 'f-options', 'f-max-choices', 'f-max-ballots', 'f-pin']) { $(id).addEventListener('input', onEdit); $(id).addEventListener('blur', flush); }
  for (const id of ['f-mode', 'f-blank']) $(id).addEventListener('change', onEdit);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function select(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort */ } render(); }
  function add(poll) {
    if (polls.length >= C.LIMITS.polls) throw new Error(`err.tooManyPolls|${JSON.stringify({ max: C.LIMITS.polls })}`);
    if (save([...polls, poll], 'edit-status')) { select(poll.id); return true; }
    return false;
  }
  $('poll-select').addEventListener('change', (e) => { flush(); select(e.target.value); });
  $('new-poll').addEventListener('click', () => {
    flush();
    try {
      if (add(C.makePoll({ question: t('poll.newQuestion', { n: polls.length + 1 }), options: [t('poll.optYes'), t('poll.optNo')], mode: 'single', allowBlank: true }, newId()))) { $('f-question').select(); say('edit-status', t('poll.created'), 'ok'); }
    } catch (e) { say('edit-status', errText(e), 'error'); }
  });
  $('dup-poll').addEventListener('click', () => {
    flush(); const cur = active(); if (!cur) return;
    try { if (add(C.duplicatePoll(cur, newId()))) say('edit-status', t('poll.duplicated'), 'ok'); } catch (e) { say('sum-status', errText(e), 'error'); }
  });
  $('delete-poll').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.question }))) return;
    clearTimeout(saveTimer); dirty = false;
    if (save(polls.filter((p) => p.id !== cur.id))) { select(polls[0] ? polls[0].id : null); say('backup-status', t('poll.deleted'), 'ok'); }
  });
  $('sample').addEventListener('click', () => {
    flush();
    try {
      const p = C.makePoll({ question: t('sample.q'), options: [t('sample.o1'), t('sample.o2'), t('sample.o3'), t('sample.o4')], mode: 'single', allowBlank: true, maxBallots: '' }, newId());
      if (add(p)) say('edit-status', t('sample.added'), 'ok');
    } catch (e) { say('edit-status', errText(e), 'error'); }
  });
  $('editor').addEventListener('submit', (e) => {
    e.preventDefault();
    const cur = active(); if (!cur) return;
    dirty = true;
    if (!flush()) return; // brouillon invalide : on n'ouvre pas
    const fresh = active();
    if (!confirm(t('confirm.open', { name: fresh.question }))) return;
    try { if (save(replace(C.openPoll(fresh)), 'edit-status')) { render(); say('sum-status', t('poll.opened'), 'ok'); } } catch (err) { say('edit-status', errText(err), 'error'); }
  });
  $('close-poll').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    let pin = null;
    if (cur.lock) { pin = prompt(t('prompt.pin')); if (pin === null) return; }
    else if (!confirm(t('confirm.close', { n: cur.ballots }))) return;
    try { if (save(replace(C.closePoll(cur, pin)), 'sum-status')) { render(); say('sum-status', t('poll.closed'), 'ok'); } } catch (e) { say('sum-status', errText(e), 'error'); }
  });

  // --- Isoloir
  function buildBallot() {
    const p = active();
    $('booth-q').textContent = p.question;
    $('booth-hint').textContent = p.mode === 'single' ? t('booth.hintSingle') : t('booth.hintMulti', { n: p.maxChoices });
    const type = p.mode === 'single' ? 'radio' : 'checkbox';
    $('choices').replaceChildren(...p.options.map((o) => {
      const lab = el('label', 'choice'), input = el('input');
      input.type = type; input.name = 'choice'; input.value = o.id;
      lab.append(input, el('span', '', o.label)); return lab;
    }));
    $('cast-blank').hidden = !p.allowBlank;
  }
  function showBallot() {
    const p = active();
    const full = p.maxBallots > 0 && p.ballots >= p.maxBallots;
    $('booth-vote').hidden = full; $('booth-done').hidden = true; $('booth-full').hidden = !full;
    say('booth-status', '');
    if (!full) { buildBallot(); const first = $('choices').querySelector('input'); if (first) first.focus(); }
  }
  function enterBooth() {
    const p = active(); if (!p || p.status !== 'open') return;
    flush(); inBooth = true; document.body.classList.add('in-booth'); $('booth').hidden = false;
    window.scrollTo(0, 0); showBallot();
  }
  function leaveBooth() {
    inBooth = false; document.body.classList.remove('in-booth'); $('booth').hidden = true;
    $('choices').replaceChildren(); render();
  }
  function vote(ids) {
    const p = active();
    try {
      const next = C.castBallot(p, ids);
      if (!save(replace(next), 'booth-status')) return;
      $('choices').replaceChildren(); // le choix disparaît avant l'écran « Au suivant »
      $('booth-vote').hidden = true; $('booth-done').hidden = false;
      $('done-title').focus();
    } catch (e) { say('booth-status', errText(e), 'error'); }
  }
  $('start-booth').addEventListener('click', enterBooth);
  $('ballot').addEventListener('submit', (e) => {
    e.preventDefault();
    const ids = [...$('choices').querySelectorAll('input:checked')].map((i) => i.value);
    if (!ids.length) { say('booth-status', t('err.noChoice'), 'error'); return; }
    vote(ids);
  });
  $('cast-blank').addEventListener('click', () => { if (confirm(t('confirm.blank'))) vote([]); });
  $('next').addEventListener('click', showBallot);
  $('exit-booth').addEventListener('click', () => {
    const p = active();
    if (p && p.lock) {
      const pin = prompt(t('prompt.pinExit')); if (pin === null) return;
      let ok = false; try { ok = C.lockHash(pin, p.id) === p.lock; } catch (_) { ok = false; }
      if (!ok) { say('booth-status', t('err.badPin'), 'error'); if (!$('booth-done').hidden) { $('booth-done').hidden = true; $('booth-vote').hidden = false; buildBallot(); } return; }
    } else if (!confirm(t('confirm.exit'))) return;
    leaveBooth();
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    const p = active(); if (!p || p.status !== 'closed') return;
    const texts = { question: t('csv.question'), headers: [t('csv.option'), t('csv.votes'), t('csv.pct'), t('csv.rank')], blank: t('csv.blank'), total: t('csv.total'),
      pct: (tenths) => L.number(tenths / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }) };
    download('pollbox-results.csv', C.resultsCSV(p, texts), 'text/csv;charset=utf-8');
    say('sum-status', t('csv.done'), 'ok');
  });
  $('print').addEventListener('click', () => window.print());
  $('export').addEventListener('click', () => {
    flush();
    if (polls.some((p) => p.status === 'open') && !confirm(t('confirm.exportOpen'))) return;
    try { download('pollbox-backup.json', C.backup(polls), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: polls.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      $('warning').hidden = true; $('export-raw').hidden = true;
      select(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('pollbox-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) polls = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = polls.some((p) => p.id === last) ? last : (polls[0] ? polls[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Changement de langue : la saisie du brouillon reste ; l'isoloir garde le choix en cours.
  L.onChange(() => {
    say('edit-status', ''); say('backup-status', ''); say('sum-status', '');
    renderSelect(); stateText(); renderSummary();
    if (inBooth && !$('booth-vote').hidden) {
      const checked = [...$('choices').querySelectorAll('input:checked')].map((i) => i.value);
      buildBallot(); for (const i of $('choices').querySelectorAll('input')) i.checked = checked.includes(i.value);
    }
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
