/* OralPresentationClock — logique pure : réglages, passages, chronomètre calculé à partir des horodatages,
   seuils d'alerte, dépassements, déroulé prévu, export CSV et sauvegarde. Aucune dépendance au navigateur.
   Le temps écoulé n'est jamais compté « tick par tick » : il se déduit de l'heure de départ (Date.now()),
   donc un onglet mis en arrière-plan (minuteries ralenties) affiche toujours le bon temps. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ passages: 200, name: 80, members: 200, title: 80, alerts: 5, phaseSec: 4 * 3600, changeoverSec: 3600, recordMs: 24 * 3600 * 1000 });
  const PHASES = Object.freeze(['present', 'questions']);

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const isId = (v) => typeof v === 'string' && /^[a-z0-9-]{6,64}$/i.test(v);
  const isMs = (v) => Number.isSafeInteger(v) && v >= 0;

  // « 7 » (minutes), « 7:30 » (minutes:secondes) ou « 1:05:00 » (heures:minutes:secondes) -> secondes.
  function parseDuration(value, max = LIMITS.phaseSec, key = 'err.duration') {
    const s = String(value === undefined || value === null ? '' : value).trim();
    let m = /^(\d{1,3})$/.exec(s), sec;
    if (m) sec = Number(m[1]) * 60;
    else if ((m = /^(\d{1,3}):([0-5]\d)$/.exec(s))) sec = Number(m[1]) * 60 + Number(m[2]);
    else if ((m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(s))) sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    else fail(key, { max: mmss(max) });
    if (sec > max) fail(key, { max: mmss(max) });
    return sec;
  }
  // Secondes -> « 7:05 » ou « 1:02:03 » (chiffres latins, lisibles de loin dans toutes les langues).
  function mmss(sec) {
    const neg = sec < 0, a = Math.abs(Math.trunc(sec));
    const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
    const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    return (neg ? '-' : '') + body;
  }
  // Heure de début « 08:30 » -> minutes depuis minuit ; vide -> null (pas d'horaire prévu).
  function parseClock(value) {
    const s = String(value === undefined || value === null ? '' : value).trim();
    if (!s) return null;
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
    if (!m) fail('err.clock');
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const clock = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  // Seuils d'alerte = temps RESTANT (« 2, 1, 0:30 ») ; chacun strictement inférieur à la durée prévue.
  function parseAlerts(text, phaseSec) {
    const parts = String(text === undefined || text === null ? '' : text).split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > LIMITS.alerts) fail('err.alertsMany', { max: LIMITS.alerts });
    const list = parts.map((p) => parseDuration(p, LIMITS.phaseSec, 'err.alert'));
    return checkAlerts(list, phaseSec);
  }
  function checkAlerts(list, phaseSec) {
    if (!Array.isArray(list) || list.length > LIMITS.alerts) fail('err.alertsMany', { max: LIMITS.alerts });
    for (const a of list) {
      if (!Number.isSafeInteger(a) || a <= 0) fail('err.alert', { max: mmss(LIMITS.phaseSec) });
      if (a >= phaseSec) fail('err.alertRange', { max: mmss(phaseSec) });
    }
    if (new Set(list).size !== list.length) fail('err.alertDup');
    return list.slice().sort((a, b) => b - a); // du plus lointain au plus proche de la fin
  }

  function makeSettings(input) {
    if (!isObj(input)) fail('err.settings');
    const presentSec = input.presentSec, questionsSec = input.questionsSec, changeoverSec = input.changeoverSec;
    if (!Number.isSafeInteger(presentSec) || presentSec < 60 || presentSec > LIMITS.phaseSec) fail('err.presentRange');
    if (!Number.isSafeInteger(questionsSec) || questionsSec < 0 || questionsSec > LIMITS.phaseSec) fail('err.questionsRange');
    if (!Number.isSafeInteger(changeoverSec) || changeoverSec < 0 || changeoverSec > LIMITS.changeoverSec) fail('err.changeoverRange');
    const startMin = input.startMin === null ? null : input.startMin;
    if (startMin !== null && (!Number.isSafeInteger(startMin) || startMin < 0 || startMin >= 1440)) fail('err.clock');
    if (typeof input.sound !== 'boolean') fail('err.settings');
    const presentAlerts = checkAlerts(input.presentAlerts, presentSec);
    const questionsAlerts = questionsSec ? checkAlerts(input.questionsAlerts, questionsSec) : (input.questionsAlerts && input.questionsAlerts.length ? fail('err.alertRange', { max: mmss(0) }) : []);
    const title = cleanText(input.title === undefined ? '' : input.title, LIMITS.title, false, 'err.title');
    return { title, presentSec, questionsSec, changeoverSec, startMin, presentAlerts, questionsAlerts, sound: input.sound };
  }
  const DEFAULT_SETTINGS = Object.freeze({ title: '', presentSec: 600, questionsSec: 300, changeoverSec: 120, startMin: null, presentAlerts: [120, 60], questionsAlerts: [60], sound: false });

  function cleanText(v, max, required, key = 'err.name') {
    if (typeof v !== 'string') fail(key + 'Required');
    const s = v.trim();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) fail('err.control');
    if (required && !s) fail(key + 'Required');
    if (s.length > max) fail(key + 'Long', { max });
    return s;
  }
  // Un passage (groupe ou candidat) : nom, membres (texte libre), compte rendu une fois terminé.
  function makePassage(input, id) {
    if (!isId(id)) fail('err.id');
    if (!isObj(input)) fail('err.backup');
    const record = input.record === undefined ? null : input.record;
    if (record !== null) checkRecord(record);
    return { id, name: cleanText(input.name, LIMITS.name, true), members: cleanText(input.members === undefined ? '' : input.members, LIMITS.members, false, 'err.members'), record };
  }
  function checkRecord(r) {
    if (!isObj(r) || !keysAre(r, ['startedAt', 'presentMs', 'questionsMs'])) fail('err.backup');
    if (!isMs(r.startedAt) || !isMs(r.presentMs) || !isMs(r.questionsMs)) fail('err.backup');
    if (r.presentMs > LIMITS.recordMs || r.questionsMs > LIMITS.recordMs) fail('err.backup');
    return r;
  }

  // --- Chronomètre. `run` = passage en cours : phase, cumul de la phase, horodatage de reprise (null = en pause).
  function phaseElapsed(run, now) { return run.accMs + (run.since === null ? 0 : Math.max(0, now - run.since)); }
  function start(passageId, now) {
    if (!isId(passageId) || !isMs(now)) fail('err.id');
    return { passageId, phase: 'present', since: now, accMs: 0, startedAt: now, presentMs: 0 };
  }
  function pause(run, now) { return run.since === null ? run : { ...run, accMs: phaseElapsed(run, now), since: null }; }
  function resume(run, now) { return run.since !== null ? run : { ...run, since: now }; }
  // Passage aux questions : la présentation est figée ; le chronomètre des questions démarre (sauf si en pause).
  function toQuestions(run, now) {
    if (run.phase !== 'present') return run;
    return { ...run, phase: 'questions', presentMs: phaseElapsed(run, now), accMs: 0, since: run.since === null ? null : now };
  }
  function finish(run, now) {
    const used = phaseElapsed(run, now);
    return run.phase === 'present' ? { startedAt: run.startedAt, presentMs: used, questionsMs: 0 } : { startedAt: run.startedAt, presentMs: run.presentMs, questionsMs: used };
  }
  // État affichable : temps restant (négatif = dépassement), niveau d'alerte et nombre de seuils franchis.
  function clockState(run, settings, now) {
    const elapsedMs = phaseElapsed(run, now);
    const plannedSec = run.phase === 'present' ? settings.presentSec : settings.questionsSec;
    const alerts = run.phase === 'present' ? settings.presentAlerts : settings.questionsAlerts;
    const remainingMs = plannedSec * 1000 - elapsedMs;
    // Secondes restantes arrondies vers le haut : « 0:01 » s'affiche jusqu'à la dernière milliseconde.
    const remainingSec = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : -Math.floor(-remainingMs / 1000);
    const crossed = alerts.filter((a) => remainingMs <= a * 1000).length;
    const level = remainingMs <= 0 ? 'over' : crossed ? 'warn' : 'ok';
    return { phase: run.phase, running: run.since !== null, elapsedMs, elapsedSec: Math.floor(elapsedMs / 1000), plannedSec, remainingMs, remainingSec, overSec: remainingMs < 0 ? Math.floor(-remainingMs / 1000) : 0, crossed, alertsTotal: alerts.length, level, progress: plannedSec ? Math.min(1, elapsedMs / (plannedSec * 1000)) : 1 };
  }
  // Seuils franchis entre deux affichages (pour le signal sonore) : un onglet revenu au premier plan
  // après plusieurs seuils ne reçoit qu'un événement par seuil, sans rejouer le passé au rechargement.
  function crossings(prevMs, nextMs, plannedSec, alerts) {
    if (!(nextMs > prevMs)) return [];
    const marks = alerts.map((a) => ({ kind: 'alert', sec: a, at: (plannedSec - a) * 1000 }));
    if (plannedSec > 0) marks.push({ kind: 'end', sec: 0, at: plannedSec * 1000 });
    return marks.filter((m) => m.at > prevMs && m.at <= nextMs).sort((a, b) => a.at - b.at);
  }
  // Dépassement en secondes entières par phase (temps utilisé au-delà du temps prévu).
  function overrun(record, settings) {
    const p = Math.max(0, Math.floor(record.presentMs / 1000) - settings.presentSec);
    const q = Math.max(0, Math.floor(record.questionsMs / 1000) - settings.questionsSec);
    return { presentSec: p, questionsSec: q, totalSec: p + q };
  }

  // --- Déroulé prévu : chaque passage dure présentation + questions, suivi d'un temps de changement.
  function schedule(passages, settings) {
    const slot = settings.presentSec + settings.questionsSec;
    return passages.map((p, i) => {
      const offset = i * (slot + settings.changeoverSec);
      const startSec = settings.startMin === null ? null : settings.startMin * 60 + offset;
      return { id: p.id, order: i + 1, offsetSec: offset, startSec, endSec: startSec === null ? null : startSec + slot };
    });
  }
  function summary(passages, settings) {
    const done = passages.filter((p) => p.record);
    const overs = done.map((p) => overrun(p.record, settings));
    const used = done.map((p) => Math.floor((p.record.presentMs + p.record.questionsMs) / 1000));
    const slot = settings.presentSec + settings.questionsSec;
    return {
      total: passages.length, done: done.length, remaining: passages.length - done.length,
      overCount: overs.filter((o) => o.totalSec > 0).length, overTotalSec: overs.reduce((a, o) => a + o.totalSec, 0),
      meanUsedSec: used.length ? Math.round(used.reduce((a, b) => a + b, 0) / used.length) : null,
      plannedTotalSec: passages.length ? passages.length * slot + (passages.length - 1) * settings.changeoverSec : 0,
    };
  }
  const secOfDay = (sec) => clock(Math.floor(sec / 60));

  // --- Export CSV du déroulé. `texts` fournit les en-têtes traduits, l'heure réelle et les statuts.
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // un tableur n'exécutera pas une formule importée
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = {
    head: ['N°', 'Passage', 'Membres', 'Début prévu', 'Début réel', 'Présentation', 'Questions', 'Dépassement présentation', 'Dépassement questions', 'Statut'],
    done: 'terminé', over: 'dépassement', pending: 'à venir', delimiter: ';', time: (ms) => new Date(ms).toISOString().slice(11, 19),
  };
  function csv(passages, settings, texts = DEFAULT_TEXTS) {
    const d = texts.delimiter === ',' ? ',' : ';';
    const plan = schedule(passages, settings);
    const rows = passages.map((p, i) => {
      const s = plan[i], r = p.record, o = r ? overrun(r, settings) : null;
      return [i + 1, p.name, p.members, s.startSec === null ? '' : secOfDay(s.startSec), r ? texts.time(r.startedAt) : '',
        r ? mmss(Math.floor(r.presentMs / 1000)) : '', r ? mmss(Math.floor(r.questionsMs / 1000)) : '',
        o ? mmss(o.presentSec) : '', o ? mmss(o.questionsSec) : '', !r ? texts.pending : o.totalSec ? texts.over : texts.done];
    });
    return '﻿' + [texts.head, ...rows].map((row) => row.map(csvCell).join(d)).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function checkRun(run, passages) {
    if (run === null) return null;
    if (!isObj(run) || !keysAre(run, ['passageId', 'phase', 'since', 'accMs', 'startedAt', 'presentMs'])) fail('err.backup');
    if (!passages.some((p) => p.id === run.passageId && !p.record)) fail('err.backup');
    if (!PHASES.includes(run.phase) || !(run.since === null || isMs(run.since)) || !isMs(run.accMs) || !isMs(run.startedAt) || !isMs(run.presentMs)) fail('err.backup');
    if (run.accMs > LIMITS.recordMs || run.presentMs > LIMITS.recordMs) fail('err.backup');
    return { ...run };
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'oralpresentationclock' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'settings', 'passages', 'run'])) fail('err.backup');
    const st = data.settings;
    if (!isObj(st) || !keysAre(st, ['title', 'presentSec', 'questionsSec', 'changeoverSec', 'startMin', 'presentAlerts', 'questionsAlerts', 'sound'])) fail('err.backup');
    const settings = makeSettings(st);
    if (!Array.isArray(data.passages)) fail('err.backup');
    if (data.passages.length > LIMITS.passages) fail('err.tooMany', { max: LIMITS.passages });
    const passages = data.passages.map((p) => {
      if (!isObj(p) || !keysAre(p, ['id', 'name', 'members', 'record'])) fail('err.backup');
      return makePassage({ name: p.name, members: p.members, record: p.record === null ? null : { ...p.record } }, p.id);
    });
    if (new Set(passages.map((p) => p.id)).size !== passages.length) fail('err.backup');
    return { settings, passages, run: checkRun(data.run, passages) };
  }
  function backup(state) {
    const clean = validateBackup({ app: 'oralpresentationclock', version: VERSION, settings: state.settings, passages: state.passages, run: state.run });
    return JSON.stringify({ app: 'oralpresentationclock', version: VERSION, ...clean }, null, 2);
  }

  root.OralClockCore = Object.freeze({ VERSION, LIMITS, DEFAULT_SETTINGS, parseDuration, mmss, parseClock, clock, parseAlerts, makeSettings, makePassage,
    phaseElapsed, start, pause, resume, toQuestions, finish, clockState, crossings, overrun, schedule, summary, secOfDay, csv, csvCell, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OralClockCore;
})(typeof window === 'undefined' ? globalThis : window);
