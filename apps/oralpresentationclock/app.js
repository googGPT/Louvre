/* OralPresentationClock — interface. Calculs dans core.js (OralClockCore) ; textes et formats dans LouvreI18n.
   L'affichage est rafraîchi 4 fois par seconde, mais le temps affiché vient toujours des horodatages enregistrés. */
(() => {
  'use strict';
  const C = window.OralClockCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-oralpresentationclock-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let state = { settings: { ...C.DEFAULT_SETTINGS, presentAlerts: [...C.DEFAULT_SETTINGS.presentAlerts], questionsAlerts: [...C.DEFAULT_SETTINGS.questionsAlerts] }, passages: [], run: null };
  let readOnly = false; // stockage illisible : aucune écriture
  let lastElapsed = null; // dernier temps affiché de la phase en cours (détection des seuils franchis)
  let audio = null; // contexte Web Audio, créé au premier geste de l'utilisateur

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const timeOf = (ms) => new Date(ms).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dur = (sec) => C.mmss(sec);
  const current = () => (state.run ? state.passages.find((p) => p.id === state.run.passageId) || null : null);
  const nextPending = () => state.passages.find((p) => !p.record) || null;

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { const text = C.backup(next); localStorage.setItem(KEY, text); state = C.validateBackup(JSON.parse(text)); return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // --- Son généré localement (Web Audio) : aucun fichier audio, aucune ressource externe.
  function ensureAudio() {
    try { if (!audio && (window.AudioContext || window.webkitAudioContext)) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio && audio.state === 'suspended') audio.resume(); }
    catch (_) { audio = null; }
  }
  function beep(kind) {
    if (!audio) return;
    const tones = kind === 'end' ? [[440, 0, 0.6]] : kind === 'test' ? [[660, 0, 0.18], [880, 0.25, 0.18]] : [[880, 0, 0.15], [880, 0.22, 0.15]];
    for (const [freq, at, len] of tones) {
      const o = audio.createOscillator(), g = audio.createGain(), s = audio.currentTime + at;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + len);
      o.connect(g); g.connect(audio.destination); o.start(s); o.stop(s + len + 0.05);
    }
  }
  function signal(kind, sec) {
    const stage = $('stage');
    stage.dataset.signals = String(Number(stage.dataset.signals || 0) + 1);
    stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash'); // relance l'animation
    say('stage-status', kind === 'end' ? t('signal.end') : t('signal.alert', { time: dur(sec) }), kind === 'end' ? 'error' : '');
    if (state.settings.sound) beep(kind);
  }

  // --- Chronomètre
  function renderClock() {
    const stage = $('stage'), run = state.run, p = current();
    const toggle = $('toggle');
    if (!run || !p) {
      const nxt = nextPending();
      stage.dataset.level = 'idle';
      $('st-phase').textContent = nxt ? t('stage.next') : t('stage.none');
      $('st-name').textContent = nxt ? nxt.name : (state.settings.title || t('stage.noneName'));
      $('st-members').textContent = nxt ? nxt.members : '';
      $('st-time').textContent = dur(state.settings.presentSec);
      $('st-sub').textContent = t('stage.plan', { present: dur(state.settings.presentSec), questions: dur(state.settings.questionsSec) });
      $('st-bar').style.width = '0%';
      $('st-alerts').textContent = '';
      toggle.textContent = t('btn.start'); toggle.disabled = !nxt;
      $('next').hidden = true; $('finish').disabled = true;
      lastElapsed = null; return;
    }
    const now = Date.now(), st = C.clockState(run, state.settings, now);
    if (lastElapsed !== null) for (const c of C.crossings(lastElapsed, st.elapsedMs, st.plannedSec, run.phase === 'present' ? state.settings.presentAlerts : state.settings.questionsAlerts)) signal(c.kind, c.sec);
    lastElapsed = st.elapsedMs;
    stage.dataset.level = st.level === 'warn' ? 'warn' + Math.min(st.crossed, 3) : st.level;
    $('st-phase').textContent = (run.phase === 'present' ? t('phase.present') : t('phase.questions')) + (st.running ? '' : ' · ' + t('phase.paused'));
    $('st-name').textContent = p.name;
    $('st-members').textContent = p.members;
    $('st-time').textContent = st.remainingSec >= 0 ? dur(st.remainingSec) : '+' + dur(-st.remainingSec);
    $('st-sub').textContent = st.level === 'over' ? t('stage.over', { over: dur(st.overSec), planned: dur(st.plannedSec) }) : t('stage.elapsed', { elapsed: dur(st.elapsedSec), planned: dur(st.plannedSec) });
    $('st-bar').style.width = Math.round(st.progress * 100) + '%';
    $('st-alerts').textContent = st.alertsTotal ? t('stage.alerts', { n: st.crossed, total: st.alertsTotal }) : '';
    toggle.textContent = st.running ? t('btn.pause') : t('btn.resume'); toggle.disabled = false;
    $('next').hidden = run.phase !== 'present' || state.settings.questionsSec === 0; $('finish').disabled = false;
  }

  function startPassage(id) {
    if (state.run) { say('stage-status', t('stage.busy'), 'error'); return; }
    const p = state.passages.find((x) => x.id === id);
    if (!p || p.record) return;
    ensureAudio();
    if (save({ ...state, run: C.start(p.id, Date.now()) })) { lastElapsed = 0; say('stage-status', t('stage.started', { name: p.name })); render(); }
  }
  function toggleRun() {
    if (!state.run) { const nxt = nextPending(); if (nxt) startPassage(nxt.id); return; }
    ensureAudio();
    const now = Date.now(), paused = state.run.since === null;
    if (save({ ...state, run: paused ? C.resume(state.run, now) : C.pause(state.run, now) })) { say('stage-status', paused ? t('stage.resumed') : t('stage.paused')); render(); }
  }
  function toQuestions() {
    if (!state.run || state.run.phase !== 'present' || state.settings.questionsSec === 0) return;
    if (save({ ...state, run: C.toQuestions(state.run, Date.now()) })) { lastElapsed = 0; say('stage-status', t('stage.toQuestions')); render(); $('toggle').focus(); }
  }
  function finishRun() {
    const run = state.run; if (!run) return;
    const record = C.finish(run, Date.now()), o = C.overrun(record, state.settings), p = current();
    const passages = state.passages.map((x) => (x.id === run.passageId ? { ...x, record } : x));
    if (save({ ...state, passages, run: null })) {
      say('stage-status', o.totalSec ? t('stage.finishedOver', { name: p.name, over: dur(o.totalSec) }) : t('stage.finished', { name: p.name }), o.totalSec ? 'error' : 'ok');
      render();
    }
  }

  // --- Plein écran : API du navigateur si disponible, sinon simple affichage agrandi (classe CSS).
  function setFull(on) {
    const stage = $('stage');
    stage.classList.toggle('full', on); document.body.classList.toggle('has-full', on);
    $('full').setAttribute('aria-pressed', String(on)); $('full').textContent = on ? t('btn.exitFull') : t('btn.full');
    try {
      if (on && stage.requestFullscreen && !document.fullscreenElement) stage.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (_) { /* agrandissement CSS seulement */ }
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && $('stage').classList.contains('full')) setFull(false); });

  // --- Liste des passages
  function renderPassages() {
    const box = $('passages'), plan = C.schedule(state.passages, state.settings);
    if (!state.passages.length) { box.replaceChildren(el('li', 'empty', t('passages.empty'))); return; }
    box.replaceChildren(...state.passages.map((p, i) => {
      const li = el('li', p.record ? 'done' : ''); li.dataset.id = p.id;
      const isRun = state.run && state.run.passageId === p.id;
      if (isRun) li.classList.add('running');
      const txt = el('div', 'txt');
      txt.append(el('b', '', `${i + 1}. ${p.name}`));
      if (p.members) txt.append(el('span', '', p.members));
      const meta = [];
      if (plan[i].startSec !== null) meta.push(t('passage.planned', { time: C.secOfDay(plan[i].startSec) }));
      if (p.record) {
        const o = C.overrun(p.record, state.settings);
        meta.push(t('passage.used', { start: timeOf(p.record.startedAt), present: dur(Math.floor(p.record.presentMs / 1000)), questions: dur(Math.floor(p.record.questionsMs / 1000)) }));
        txt.append(el('span', '', meta.join(' · ')));
        txt.append(el('span', o.totalSec ? 'tag over' : 'tag ok', o.totalSec ? t('passage.over', { over: dur(o.totalSec) }) : t('passage.onTime')));
      } else {
        if (meta.length) txt.append(el('span', '', meta.join(' · ')));
        if (isRun) txt.append(el('span', 'tag', t('passage.running')));
      }
      const acts = el('div', 'acts');
      const btn = (label, action, aria, disabled = false) => { const b = el('button', 'btn', label); b.type = 'button'; b.dataset.action = action; b.setAttribute('aria-label', aria); b.title = aria; b.disabled = disabled; return b; };
      if (!p.record) acts.append(btn(t('btn.run'), 'run', t('aria.run', { name: p.name }), !!state.run));
      else acts.append(btn('↺', 'reset', t('aria.reset', { name: p.name }), !!isRun));
      acts.append(btn('↑', 'up', t('aria.up', { name: p.name }), i === 0), btn('↓', 'down', t('aria.down', { name: p.name }), i === state.passages.length - 1), btn('✕', 'remove', t('aria.remove', { name: p.name }), !!isRun));
      li.append(txt, acts); return li;
    }));
  }
  $('passages').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const id = b.closest('li').dataset.id, i = state.passages.findIndex((p) => p.id === id), p = state.passages[i];
    if (!p) return;
    const list = state.passages.slice();
    switch (b.dataset.action) {
      case 'run': startPassage(id); return;
      case 'up': case 'down': {
        const j = b.dataset.action === 'up' ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        if (save({ ...state, passages: list })) { render(); const again = $('passages').querySelector(`li[data-id="${id}"] [data-action="${b.dataset.action}"]`); if (again && !again.disabled) again.focus(); }
        return;
      }
      case 'reset':
        if (!confirm(t('confirm.reset', { name: p.name }))) return;
        if (save({ ...state, passages: list.map((x) => (x.id === id ? { ...x, record: null } : x)) })) render();
        return;
      case 'remove':
        if (!confirm(t('confirm.remove', { name: p.name }))) return;
        if (save({ ...state, passages: list.filter((x) => x.id !== id) })) { say('form-status', t('passage.removed', { name: p.name })); render(); }
        return;
      default:
    }
  });
  $('passage-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (state.passages.length >= C.LIMITS.passages) throw new Error(`err.tooMany|${JSON.stringify({ max: C.LIMITS.passages })}`);
      const p = C.makePassage({ name: $('p-name').value, members: $('p-members').value }, newId());
      if (!save({ ...state, passages: [...state.passages, p] })) return;
      $('p-name').value = ''; $('p-members').value = ''; $('p-name').focus();
      say('form-status', t('passage.added', { name: p.name, n: state.passages.length }), 'ok'); render();
    } catch (err) { say('form-status', L.error(err), 'error'); }
  });
  $('sample').addEventListener('click', () => {
    if (state.run) { say('form-status', t('stage.busy'), 'error'); return; }
    try {
      const names = [1, 2, 3, 4, 5].map((n) => C.makePassage({ name: t('sample.group', { n }), members: t('sample.members' + n) }, newId()));
      const settings = C.makeSettings({ ...state.settings, title: t('sample.title'), presentSec: 600, questionsSec: 300, changeoverSec: 120, startMin: 8 * 60 + 30, presentAlerts: [120, 60], questionsAlerts: [60] });
      if (!save({ settings, passages: [...state.passages, ...names].slice(0, C.LIMITS.passages), run: null })) return;
      fillSettings(); say('form-status', t('sample.added'), 'ok'); render();
    } catch (err) { say('form-status', L.error(err), 'error'); }
  });

  // --- Réglages : chaque champ est validé et enregistré quand on le quitte (événement « change »).
  function fillSettings() {
    const s = state.settings;
    $('s-title').value = s.title; $('s-present').value = dur(s.presentSec); $('s-questions').value = dur(s.questionsSec); $('s-changeover').value = dur(s.changeoverSec);
    $('s-present-alerts').value = s.presentAlerts.map(dur).join(', '); $('s-questions-alerts').value = s.questionsAlerts.map(dur).join(', ');
    $('s-start').value = s.startMin === null ? '' : C.clock(s.startMin); $('s-sound').checked = s.sound;
    for (const id of ['s-title', 's-present', 's-questions', 's-changeover', 's-present-alerts', 's-questions-alerts', 's-start']) $(id).removeAttribute('aria-invalid');
  }
  function readSettings() {
    const presentSec = C.parseDuration($('s-present').value);
    const questionsSec = C.parseDuration($('s-questions').value);
    return C.makeSettings({
      title: $('s-title').value, presentSec, questionsSec, changeoverSec: C.parseDuration($('s-changeover').value, C.LIMITS.changeoverSec),
      startMin: C.parseClock($('s-start').value), presentAlerts: C.parseAlerts($('s-present-alerts').value, presentSec),
      questionsAlerts: questionsSec ? C.parseAlerts($('s-questions-alerts').value, questionsSec) : [], sound: $('s-sound').checked,
    });
  }
  for (const id of ['s-title', 's-present', 's-questions', 's-changeover', 's-present-alerts', 's-questions-alerts', 's-start', 's-sound']) {
    $(id).addEventListener('change', () => {
      try {
        const settings = readSettings();
        for (const f of ['s-title', 's-present', 's-questions', 's-changeover', 's-present-alerts', 's-questions-alerts', 's-start']) $(f).removeAttribute('aria-invalid');
        if (!save({ ...state, settings })) return;
        if (id === 's-sound' && settings.sound) ensureAudio();
        say('settings-status', t('settings.saved'), 'ok'); render();
      } catch (err) { $(id).setAttribute('aria-invalid', 'true'); say('settings-status', L.error(err), 'error'); }
    });
  }
  $('test-sound').addEventListener('click', () => { ensureAudio(); if (audio) { beep('test'); say('settings-status', t('sound.tested')); } else say('settings-status', t('sound.unavailable'), 'error'); });

  // --- Déroulé
  function renderSummary() {
    const s = C.summary(state.passages, state.settings), box = $('kpis');
    const kpi = (label, value) => { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    box.replaceChildren(kpi(t('kpi.done'), `${L.number(s.done)} / ${L.number(s.total)}`), kpi(t('kpi.over'), L.number(s.overCount)),
      kpi(t('kpi.overTotal'), dur(s.overTotalSec)), kpi(t('kpi.mean'), s.meanUsedSec === null ? '—' : dur(s.meanUsedSec)), kpi(t('kpi.planned'), dur(s.plannedTotalSec)));
    $('export-csv').disabled = !state.passages.length;
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    const texts = { head: ['#', t('csv.passage'), t('csv.members'), t('csv.planned'), t('csv.actual'), t('phase.present'), t('phase.questions'), t('csv.overPresent'), t('csv.overQuestions'), t('csv.status')],
      done: t('csv.done'), over: t('csv.over'), pending: t('csv.pending'), delimiter: L.lang === 'en' ? ',' : ';', time: timeOf };
    download('oralpresentationclock.csv', C.csv(state.passages, state.settings, texts), 'text/csv;charset=utf-8');
    say('summary-status', t('csv.exported'), 'ok');
  });

  function render() { renderClock(); renderPassages(); renderSummary(); }

  // --- Raccourcis clavier (hors des champs de saisie).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('stage').classList.contains('full')) { setFull(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (e.key === ' ' && !e.target.closest('button, a, label')) { e.preventDefault(); toggleRun(); }
    else if (k === 'q') toQuestions();
    else if (k === 't') finishRun();
    else if (k === 'f') setFull(!$('stage').classList.contains('full'));
  });
  $('toggle').addEventListener('click', toggleRun);
  $('next').addEventListener('click', toQuestions);
  $('finish').addEventListener('click', finishRun);
  $('full').addEventListener('click', () => setFull(!$('stage').classList.contains('full')));

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('oralpresentationclock-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: state.passages.length, b: next.passages.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; lastElapsed = null; fillSettings(); render();
      say('backup-status', t('backup.restored', { n: next.passages.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ } download('oralpresentationclock-raw-storage.txt', raw, 'text/plain'); });
  $('clear-records').addEventListener('click', () => {
    if (!state.passages.some((p) => p.record) && !state.run) return;
    if (!confirm(t('confirm.clear'))) return;
    if (save({ ...state, passages: state.passages.map((p) => ({ ...p, record: null })), run: null })) { say('backup-status', t('backup.cleared'), 'ok'); render(); }
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillSettings();
  L.onChange(() => { for (const id of ['form-status', 'settings-status', 'summary-status', 'backup-status']) say(id, ''); $('full').textContent = $('stage').classList.contains('full') ? t('btn.exitFull') : t('btn.full'); render(); });
  render();
  setInterval(renderClock, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderClock(); }); // retour au premier plan : affichage immédiat
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
