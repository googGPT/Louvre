/* ParkingSpotMemory — interface. Calculs dans core.js (ParkingCore) ; textes et formats dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.ParkingCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-parkingspotmemory-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const now = () => Date.now();

  let data = C.emptyData();
  let readOnly = false;
  let editing = false; // le formulaire modifie l'emplacement en cours
  let draftPhoto = ''; // photo réduite en attente d'enregistrement
  let draftPos = null; // position GPS en attente d'enregistrement
  let guideMsg = null; // dernier guidage [clé, paramètres] (retraduit au changement de langue)
  let alarmMsg = null; // alerte affichée [clé, paramètres]
  const alerted = { warn: null, expired: null }; // fin (endMs) déjà signalée, pour ne pas répéter
  const baseTitle = () => t('meta.title');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { settings: next.settings, current: next.current, history: next.history }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // --- Formats (heures locales via Intl, dans la langue affichée)
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit' });
  const fmtDateTime = (ms) => new Date(ms).toLocaleString(L.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pad = (n) => String(n).padStart(2, '0');
  function fmtCountdown(ms) {
    const p = C.splitMs(ms), clock = `${p.h}:${pad(p.m)}:${pad(p.s)}`;
    return p.d ? `${t('fmt.days', { n: p.d })} ${clock}` : clock;
  }
  function fmtMinutes(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? t('fmt.hm', { h, m: pad(m) }) : t('fmt.h', { h })) : t('fmt.min', { n: m });
  }
  const meters = (m) => (m >= 1000 ? t('fmt.km', { n: L.number(m / 1000, { maximumFractionDigits: 1 }) }) : t('fmt.m', { n: L.number(m) }));
  function where(s) {
    const parts = [];
    if (s.level) parts.push(t('where.level', { v: s.level }));
    if (s.zone) parts.push(t('where.zone', { v: s.zone }));
    if (s.spot) parts.push(t('where.spot', { v: s.spot }));
    return parts.join(' · ');
  }

  // --- Emplacement en cours
  function renderCurrent() {
    const s = data.current;
    $('current').hidden = !s || editing;
    $('spot-form').hidden = !!s && !editing;
    $('cancel-edit').hidden = !editing;
    $('sample').hidden = !!s;
    $('save-spot').textContent = t(editing ? 'btn.update' : 'btn.save');
    if (!s) return;
    $('spot-main').textContent = s.place || where(s) || t('car.noPlace');
    $('spot-sub').textContent = [s.place ? where(s) : '', t('car.since', { when: fmtDateTime(s.startedMs) })].filter(Boolean).join(' · ');
    $('spot-landmarks').textContent = s.landmarks; $('spot-landmarks').hidden = !s.landmarks;
    $('spot-photo').hidden = !s.photo; if (s.photo) { $('spot-photo').src = s.photo; $('spot-photo').alt = t('photo.alt'); } else $('spot-photo').removeAttribute('src');
    const hasGps = s.lat !== null;
    $('spot-gps').textContent = hasGps ? t('gps.saved', { lat: s.lat.toFixed(5), lon: s.lon.toFixed(5), acc: s.accuracy === null ? '?' : L.number(s.accuracy) }) : t('gps.none');
    $('map-link').hidden = !hasGps; if (hasGps) $('map-link').href = C.mapLink(s.lat, s.lon); else $('map-link').removeAttribute('href');
    $('find').disabled = !hasGps;
    $('guide').textContent = guideMsg ? t(guideMsg[0], guideMsg[1]) : '';
    for (const id of ['plus15', 'plus60']) $(id).disabled = false;
    $('timer-clear').disabled = $('timer-ics').disabled = !s.endMs;
    tick();
  }
  // Compte à rebours et alertes : appelé chaque seconde.
  function tick() {
    const s = data.current;
    const st = C.timerState(s, now(), data.settings.warnMinutes);
    const box = $('timer-box');
    box.className = 'timer state-' + st.state;
    if (!s || st.state === 'none') {
      $('countdown').textContent = t('timer.none'); $('timer-end').textContent = '';
      document.title = baseTitle(); showAlarm(null); return;
    }
    $('countdown').textContent = st.state === 'expired' ? t('timer.over', { t: fmtCountdown(-st.remainingMs) }) : t('timer.left', { t: fmtCountdown(st.remainingMs) });
    $('timer-end').textContent = t('timer.end', { time: fmtTime(s.endMs) });
    document.title = (st.state === 'expired' ? '⏰ ' : st.state === 'warn' ? '⏳ ' : '') + baseTitle();
    if (st.state === 'expired' && alerted.expired !== s.endMs) { alerted.expired = s.endMs; ring(['alarm.expired', { time: fmtTime(s.endMs) }]); }
    else if (st.state === 'warn' && alerted.warn !== s.endMs) { alerted.warn = s.endMs; ring(['alarm.warn', { n: Math.ceil(st.remainingMs / 60000) }]); }
    else if (st.state === 'running') showAlarm(null);
  }
  function showAlarm(msg) { alarmMsg = msg; $('alarm').hidden = !msg; $('alarm').textContent = msg ? t(msg[0], msg[1]) : ''; }
  // Alerte : bannière (role=alert), vibration et bip court si le navigateur le permet.
  function ring(msg) {
    showAlarm(msg);
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { /* facultatif */ }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) { const ctx = new Ctx(), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4); setTimeout(() => ctx.close(), 800); }
    } catch (e) { /* son facultatif */ }
  }
  function updateCurrent(mutator, statusKey, params) {
    try {
      if (!save({ ...data, current: mutator(data.current) })) return;
      showAlarm(null); renderCurrent(); if (statusKey) say('car-status', t(statusKey, params), 'ok');
    } catch (e) { say('car-status', L.error(e), 'error'); }
  }
  $('timer-set').addEventListener('click', () => {
    const dur = $('timer-duration').value.trim(), clock = $('timer-clock').value;
    updateCurrent((s) => {
      if (!dur && !clock) throw new Error('err.timerInput');
      const end = dur ? now() + C.parseDuration(dur) * 60000 : C.endFromClock(now(), clock);
      $('timer-duration').value = ''; $('timer-clock').value = '';
      return C.setTimer(s, end, now());
    }, 'timer.setOk');
  });
  $('plus15').addEventListener('click', () => updateCurrent((s) => C.extend(s, 15, now()), 'timer.extended'));
  $('plus60').addEventListener('click', () => updateCurrent((s) => C.extend(s, 60, now()), 'timer.extended'));
  $('timer-clear').addEventListener('click', () => updateCurrent((s) => C.clearTimer(s), 'timer.cleared'));
  $('timer-ics').addEventListener('click', () => {
    try {
      const s = data.current;
      const desc = [s.place, where(s), s.landmarks].filter(Boolean).join(' — ');
      download('parkingspotmemory.ics', C.toICS(s, now(), data.settings.warnMinutes, t('ics.summary'), desc || t('ics.summary')), 'text/calendar;charset=utf-8');
      say('car-status', t('ics.done', { n: data.settings.warnMinutes }), 'ok');
    } catch (e) { say('car-status', L.error(e), 'error'); }
  });

  // --- Où est ma voiture ? (position actuelle demandée à la demande)
  $('find').addEventListener('click', () => {
    const s = data.current; if (!s || s.lat === null) return;
    if (!navigator.geolocation) { guideMsg = ['gps.unavailable']; renderCurrent(); return; }
    guideMsg = ['guide.locating']; $('guide').textContent = t('guide.locating');
    navigator.geolocation.getCurrentPosition((p) => {
      try {
        const g = C.guide(C.makePosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy), data.current);
        guideMsg = g.close ? ['guide.close', { d: meters(g.distanceM) }] : ['guide.far', { d: meters(g.distanceM), dir: t('dir.' + g.dir), deg: g.bearing, u: meters(g.uncertaintyM) }];
      } catch (e) { guideMsg = ['gps.fail']; }
      renderCurrent();
    }, (err) => { guideMsg = [err && err.code === 1 ? 'gps.denied' : 'gps.fail']; renderCurrent(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });

  $('leave').addEventListener('click', () => {
    const s = data.current; if (!s) return;
    try {
      const entry = C.endSession(s, now());
      if (!save({ ...data, current: null, history: C.addToHistory(data.history, entry) })) return;
      guideMsg = null; showAlarm(null); resetForm(); render();
      say('car-status', t('car.left', { d: fmtMinutes(C.durationMin(entry)) }), 'ok');
    } catch (e) { say('car-status', L.error(e), 'error'); }
  });
  $('edit').addEventListener('click', () => {
    const s = data.current; if (!s) return;
    const f = $('spot-form');
    f.place.value = s.place; f.level.value = s.level; f.zone.value = s.zone; f.spot.value = s.spot; f.landmarks.value = s.landmarks; f.duration.value = '';
    draftPhoto = s.photo; draftPos = s.lat === null ? null : { lat: s.lat, lon: s.lon, accuracy: s.accuracy };
    editing = true; renderDraft(); renderCurrent(); f.place.focus();
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); renderCurrent(); });

  // --- Formulaire : brouillon de photo et de position
  function resetForm() { $('spot-form').reset(); draftPhoto = ''; draftPos = null; editing = false; renderDraft(); $('habit').hidden = true; }
  function renderDraft() {
    $('photo-preview').hidden = !draftPhoto; if (draftPhoto) { $('photo-preview').src = draftPhoto; $('photo-preview').alt = t('photo.alt'); } else $('photo-preview').removeAttribute('src');
    $('drop-photo').hidden = !draftPhoto;
    $('drop-gps').hidden = !draftPos;
    $('gps-draft').textContent = draftPos ? t('gps.draft', { lat: draftPos.lat.toFixed(5), lon: draftPos.lon.toFixed(5), acc: draftPos.accuracy === null ? '?' : L.number(draftPos.accuracy) }) : '';
  }
  $('pick-photo').addEventListener('click', () => $('photo-input').click());
  $('drop-photo').addEventListener('click', () => { draftPhoto = ''; renderDraft(); });
  // Réduction locale : le plus grand côté passe à 640 px (puis 480 px si le fichier reste trop lourd), en JPEG.
  $('photo-input').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (!/^image\//.test(file.type) || file.size > 30000000) throw new Error('err.photo');
      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('err.photo')); i.src = url; });
      URL.revokeObjectURL(url);
      let out = '';
      for (const [max, q] of [[640, 0.72], [480, 0.6], [360, 0.5]]) {
        const { width, height } = C.fitSize(img.naturalWidth, img.naturalHeight, max);
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        out = c.toDataURL('image/jpeg', q);
        if (out.length <= C.MAX_PHOTO) break;
      }
      draftPhoto = C.checkPhoto(out); renderDraft();
      say('car-status', t('photo.ok', { kb: L.number(Math.round(out.length * 0.75 / 1024)) }), 'ok');
    } catch (e) { say('car-status', L.error(e), 'error'); }
  });
  $('gps').addEventListener('click', () => {
    if (!navigator.geolocation) { say('car-status', t('gps.unavailable'), 'error'); return; }
    say('car-status', t('guide.locating'));
    navigator.geolocation.getCurrentPosition((p) => {
      try { draftPos = C.makePosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy); renderDraft(); say('car-status', t('gps.ok'), 'ok'); }
      catch (e) { say('car-status', L.error(e), 'error'); }
    }, (err) => say('car-status', t(err && err.code === 1 ? 'gps.denied' : 'gps.fail'), 'error'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
  $('drop-gps').addEventListener('click', () => { draftPos = null; renderDraft(); });

  // Habitudes : la dernière fois dans ce parking.
  let habit = null;
  function renderHabit() {
    habit = C.lastAt(data.history, $('spot-form').place.value, L.locale);
    const show = !!habit && !!(habit.level || habit.zone || habit.spot || habit.landmarks);
    $('habit').hidden = !show;
    if (show) $('habit-text').textContent = t('habit.text', { when: fmtDateTime(habit.startedMs), where: where(habit) || habit.landmarks });
  }
  $('spot-form').place.addEventListener('input', renderHabit);
  $('habit-use').addEventListener('click', () => {
    if (!habit) return;
    const f = $('spot-form'); f.place.value = habit.place; f.level.value = habit.level; f.zone.value = habit.zone; f.spot.value = habit.spot; if (!f.landmarks.value) f.landmarks.value = habit.landmarks;
  });

  $('spot-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget, cur = data.current;
    try {
      const base = editing && cur ? { startedMs: cur.startedMs, endMs: cur.endMs } : {};
      const input = { place: f.place.value, level: f.level.value, zone: f.zone.value, spot: f.spot.value, landmarks: f.landmarks.value, photo: draftPhoto, ...(draftPos || {}), ...base };
      let s = C.makeSession(input, editing && cur ? cur.id : newId(), now());
      if (f.duration.value.trim()) s = C.setTimer(s, now() + C.parseDuration(f.duration.value) * 60000, now());
      if (!editing && cur) throw new Error('err.alreadyParked');
      const wasEditing = editing;
      if (!save({ ...data, current: s })) return;
      resetForm(); guideMsg = null; render();
      say('car-status', t(wasEditing ? 'car.updated' : 'car.saved'), 'ok');
    } catch (e) { say('car-status', L.error(e), 'error'); }
  });

  // --- Historique
  function renderHistory() {
    const st = C.historyStats(data.history, L.locale);
    $('hist-stats').textContent = st.count ? t('hist.stats', { n: st.count, avg: fmtMinutes(st.avgMinutes), top: st.places.length ? t('hist.top', { place: st.places[0].place, n: st.places[0].count }) : '' }) : '';
    $('clear-hist').disabled = !data.history.length;
    $('places').replaceChildren(...st.places.map((p) => { const o = el('option'); o.value = p.place; return o; }));
    if (!data.history.length) { $('history').replaceChildren(el('li', 'empty', t('hist.empty'))); return; }
    $('history').replaceChildren(...data.history.map((h) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', h.place || where(h) || t('car.noPlace')));
      txt.append(el('span', '', [h.place ? where(h) : '', h.landmarks].filter(Boolean).join(' · ')));
      txt.append(el('span', '', t('hist.when', { start: fmtDateTime(h.startedMs), d: fmtMinutes(C.durationMin(h)) })));
      const acts = el('div', 'acts');
      if (h.photo) { const im = el('img', 'thumb'); im.src = h.photo; im.alt = t('photo.alt'); acts.append(im); }
      if (h.lat !== null) { const a = el('a', 'btn small link', t('btn.mapShort')); a.href = C.mapLink(h.lat, h.lon); a.target = '_blank'; a.rel = 'noopener noreferrer'; acts.append(a); }
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { when: fmtDateTime(h.startedMs) }));
      del.addEventListener('click', () => { if (save({ ...data, history: data.history.filter((x) => x.id !== h.id) })) { renderHistory(); say('hist-status', t('hist.deleted'), 'ok'); } });
      acts.append(del); li.append(txt, acts); return li;
    }));
  }
  $('clear-hist').addEventListener('click', () => {
    if (!data.history.length || !confirm(t('hist.confirmClear', { n: data.history.length }))) return;
    if (save({ ...data, history: [] })) { renderHistory(); say('hist-status', t('hist.cleared'), 'ok'); }
  });

  // --- Exemple (dans la langue affichée) : un historique de démonstration, sans toucher au stationnement en cours.
  $('sample').addEventListener('click', () => {
    try {
      const day = 86400000, t0 = now();
      const mk = (ago, mins, place, level, zone, spot, landmarks) => C.endSession(C.makeSession({ place, level, zone, spot, landmarks, startedMs: t0 - ago }, newId(), t0), t0 - ago + mins * 60000);
      const entries = [
        mk(9 * day, 150, t('sample.mall'), '-2', t('sample.blue'), '214', t('sample.lift')),
        mk(5 * day, 95, t('sample.station'), '1', 'C', '37', ''),
        mk(2 * day, 130, t('sample.mall'), '-2', t('sample.blue'), '188', t('sample.lift')),
      ];
      let history = data.history;
      for (const e of entries) history = C.addToHistory(history, e);
      if (!save({ ...data, history })) return;
      render(); $('spot-form').place.value = t('sample.mall'); renderHabit();
      say('car-status', t('sample.loaded'), 'ok');
    } catch (e) { say('car-status', L.error(e), 'error'); }
  });

  // --- Réglages et sauvegardes
  function fillSettings() { $('set-form').warnMinutes.value = String(data.settings.warnMinutes); }
  $('set-form').addEventListener('input', () => {
    try { const settings = C.makeSettings({ warnMinutes: $('set-form').warnMinutes.value }); if (save({ ...data, settings })) { say('backup-status', t('set.saved'), 'ok'); alerted.warn = null; tick(); } }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('set-form').addEventListener('submit', (e) => e.preventDefault());
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('parkingspotmemory-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (_) { throw new Error('err.json'); }
      const next = C.validateData(parsed);
      if (!confirm(t('backup.confirm', { a: data.history.length, b: next.history.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true;
      resetForm(); guideMsg = null; fillSettings(); render();
      say('backup-status', t('backup.restored', { n: next.history.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('parkingspotmemory-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderCurrent(); renderHistory(); renderDraft(); tick(); }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue : tout est réaffiché ; saisies, photo et position en attente sont conservées.
  L.onChange(() => {
    for (const id of ['car-status', 'hist-status', 'backup-status']) say(id, '');
    render(); renderHabit(); if (alarmMsg) showAlarm(alarmMsg);
  });
  fillSettings();
  render();
  setInterval(tick, 1000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
