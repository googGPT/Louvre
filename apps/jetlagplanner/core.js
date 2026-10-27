/* JetLagPlanner — logique pure : horaires de sommeil décalés progressivement entre deux fuseaux IANA.
   Le décalage par jour, le sens et le nombre de jours sont saisis par l'utilisateur : c'est une visualisation
   arithmétique d'horaires, pas un conseil médical. Heures murales en minutes depuis minuit (0 à 1439) ;
   les instants (ms UTC) sont calculés fuseau par fuseau avec Intl, heure d'été comprise. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ plans: 30, name: 60, before: 7, after: 14, stepMin: 0, stepMax: 180 });
  const DIRECTIONS = Object.freeze(['auto', 'advance', 'delay']); // avancer = se coucher plus tôt ; retarder = plus tard
  const ID = /^[a-z0-9-]{6,64}$/i;
  const ZONE = /^(UTC|[A-Za-z][A-Za-z_]*(\/[A-Za-z0-9_+-]+){1,2})$/;
  const DAYM = 1440, MINMS = 60000;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim() || /[\u0000-\u001f]/.test(v)) fail('err.nameRequired');
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return v.trim();
  }
  const mod = (n, m) => ((n % m) + m) % m;

  // --- Fuseaux (Intl)
  function validZone(zone) {
    if (typeof zone !== 'string' || !ZONE.test(zone.trim())) fail('err.zone');
    try { return new Intl.DateTimeFormat('en-US', { timeZone: zone.trim() }).resolvedOptions().timeZone; } catch (e) { return fail('err.zone'); }
  }
  // Heure murale d'un instant dans un fuseau : { y, mo, d, h, mi }.
  function wallParts(ms, zone) {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: p.hour === '24' ? 0 : Number(p.hour), mi: Number(p.minute) };
  }
  // Décalage d'un fuseau par rapport à UTC (minutes) à un instant donné.
  function offsetAt(ms, zone) {
    const w = wallParts(ms, zone);
    return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(ms / MINMS) * MINMS) / MINMS);
  }
  // Heure murale d'un instant dans un fuseau, en minutes depuis minuit.
  function clockAt(ms, zone) { return mod(Math.floor(ms / MINMS) + offsetAt(ms, zone), DAYM); }
  // Jour civil d'un instant dans un fuseau, « AAAA-MM-JJ ».
  function dayAt(ms, zone) { const w = wallParts(ms, zone); return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`; }
  // Instant correspondant à l'heure murale (jour, minutes) dans un fuseau.
  // Heure inexistante (saut de printemps) : l'instant tombe juste après le saut.
  function wallToMs(day, minutes, zone) {
    if (!isDay(day)) fail('err.date');
    const [y, mo, d] = day.split('-').map(Number), wall = Date.UTC(y, mo - 1, d) + minutes * MINMS;
    let ms = wall - offsetAt(wall, zone) * MINMS;
    ms = wall - offsetAt(ms, zone) * MINMS; // seconde passe : bon décalage de part et d'autre d'un changement d'heure
    return ms;
  }

  // --- Jours et heures
  function isDay(s) {
    const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number), z = new Date(Date.UTC(y, mo - 1, d));
    return y >= 1970 && y <= 2100 && z.getUTCMonth() === mo - 1 && z.getUTCDate() === d;
  }
  function addDays(s, n) { if (!isDay(s)) fail('err.date'); return new Date(Date.parse(s + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  // « 23:00 » ou « 7:30 » -> minutes depuis minuit.
  function parseClock(v, key = 'err.clock') {
    const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(key);
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const clock = (min) => { const x = mod(Math.round(min), DAYM); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  function intIn(v, a, b, key, params) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < a || Number(s) > b) fail(key, params);
    return Number(s);
  }

  // --- Plan
  function makePlan(input, id) {
    const p = {
      id: checkId(id), name: cleanName(input.name), homeZone: validZone(input.homeZone), destZone: validZone(input.destZone),
      departure: isDay(input.departure) ? input.departure : fail('err.date'),
      bedtime: typeof input.bedtime === 'number' ? input.bedtime : parseClock(input.bedtime, 'err.bedtime'),
      wake: typeof input.wake === 'number' ? input.wake : parseClock(input.wake, 'err.wake'),
      stepMin: intIn(input.stepMin, MAX.stepMin, MAX.stepMax, 'err.step', { min: MAX.stepMin, max: MAX.stepMax }),
      before: intIn(input.before, 0, MAX.before, 'err.before', { max: MAX.before }),
      after: intIn(input.after, 0, MAX.after, 'err.after', { max: MAX.after }),
      direction: DIRECTIONS.includes(input.direction) ? input.direction : fail('err.direction'),
    };
    if (!Number.isInteger(p.bedtime) || p.bedtime < 0 || p.bedtime >= DAYM) fail('err.bedtime');
    if (!Number.isInteger(p.wake) || p.wake < 0 || p.wake >= DAYM) fail('err.wake');
    const sleep = mod(p.wake - p.bedtime, DAYM);
    if (sleep < 180 || sleep > 840) fail('err.sleepLength', { min: 3, max: 14 }); // nuit saisie entre 3 h et 14 h
    if (p.departure < '1971-01-01' || p.departure > '2099-12-01') fail('err.date');
    return p;
  }

  // Différence d'heure destination - départ (minutes), le jour du départ à midi UTC (heure d'été comprise).
  function zoneDiff(plan) { const ms = Date.parse(plan.departure + 'T12:00:00Z'); return offsetAt(ms, plan.destZone) - offsetAt(ms, plan.homeZone); }
  // Décalage total à appliquer : + = avancer l'horaire (se coucher plus tôt), - = le retarder.
  function totalShift(diff, direction) {
    const adv = mod(diff, DAYM); // avancer de adv minutes revient au même que retarder de 1440 - adv
    if (adv === 0) return 0;
    if (direction === 'advance') return adv;
    if (direction === 'delay') return -(DAYM - adv);
    return adv <= 720 ? adv : -(DAYM - adv); // auto : le plus court (12 h pile : on avance)
  }
  // Nuit « du jour d » : un coucher avant midi (ex. 00:30) tombe le lendemain sur le calendrier.
  const bedDay = (day, bedtime) => (bedtime < 720 ? addDays(day, 1) : day);

  // Programme jour par jour. Avant le départ et le jour du voyage, l'horaire est ancré à l'heure murale
  // du fuseau de départ ; après l'arrivée, à celle de la destination (chaque fuseau avec ses propres
  // changements d'heure). Le décalage cumulé augmente du pas saisi chaque jour jusqu'au total.
  function schedule(plan) {
    const diff = zoneDiff(plan), shift = totalShift(diff, plan.direction), need = Math.abs(shift), sign = Math.sign(shift);
    const sleep = mod(plan.wake - plan.bedtime, DAYM), days = [];
    // Écart (multiple de 24 h) entre « habitude au départ moins le décalage total » et « habitude à destination ».
    const dep = bedDay(plan.departure, plan.bedtime);
    const gap = (wallToMs(dep, plan.bedtime, plan.homeZone) - sign * need * MINMS - wallToMs(dep, plan.bedtime, plan.destZone)) / MINMS;
    const X = Math.round(gap / DAYM) * DAYM;
    let reachedOn = need === 0 ? -plan.before : null;
    for (let k = -plan.before; k <= plan.after; k += 1) {
      const n = k + plan.before + 1; // nombre de jours d'ajustement accomplis à la fin de ce jour
      const done = Math.min(need, plan.stepMin * n), remaining = need - done;
      if (reachedOn === null && remaining === 0) reachedOn = k;
      const date = addDays(plan.departure, k), night = bedDay(date, plan.bedtime);
      const bedMs = k <= 0
        ? wallToMs(night, plan.bedtime, plan.homeZone) - sign * done * MINMS
        : wallToMs(night, plan.bedtime, plan.destZone) + (X + sign * remaining) * MINMS;
      const wakeMs = bedMs + sleep * MINMS;
      days.push({
        k, date, phase: k < 0 ? 'before' : k === 0 ? 'travel' : 'after', where: k <= 0 ? 'home' : 'dest',
        done, remaining, bedMs, wakeMs,
        bedHome: clockAt(bedMs, plan.homeZone), wakeHome: clockAt(wakeMs, plan.homeZone),
        bedDest: clockAt(bedMs, plan.destZone), wakeDest: clockAt(wakeMs, plan.destZone),
      });
    }
    return {
      diff, shift, direction: shift > 0 ? 'advance' : shift < 0 ? 'delay' : 'none', sleep,
      days, reachedOn, remainingEnd: days.length ? days[days.length - 1].remaining : need,
      targetDest: { bed: plan.bedtime, wake: plan.wake }, // horaires habituels, à retrouver à destination
      neededDays: need === 0 ? 0 : plan.stepMin ? Math.ceil(need / plan.stepMin) : null, // null : pas nul, jamais atteint
    };
  }
  // Fenêtres de sommeil sur un axe 0-1440 : une plage qui passe minuit est coupée en deux.
  function segments(start, end) { return start < end ? [[start, end]] : [[start, DAYM], [0, end]].filter(([a, b]) => b > a); }

  // --- Export agenda (.ics, RFC 5545) : une nuit par jour du programme, en heure UTC.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { // lignes de 75 octets au plus
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // `text.summary(day)` et `text.description(day)` viennent de l'interface (langue affichée).
  function toICS(plan, sched, stamp, text) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//JetLagPlanner//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const d of sched.days) {
      lines.push('BEGIN:VEVENT', `UID:${plan.id}-${d.date}@jetlagplanner.louvre`, `DTSTAMP:${stamp}`,
        `DTSTART:${utcStamp(d.bedMs)}`, `DTEND:${utcStamp(d.wakeMs)}`,
        fold(`SUMMARY:${icsEscape(text.summary(d))}`), fold(`DESCRIPTION:${icsEscape(text.description(d))}`),
        'TRANSP:OPAQUE', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'jetlagplanner' || data.version !== VERSION || !Array.isArray(data.plans)) fail('err.notBackup');
    if (keys(data) !== 'app,plans,version') fail('err.backup');
    if (data.plans.length > MAX.plans) fail('err.tooManyPlans', { max: MAX.plans });
    const plans = data.plans.map((p) => {
      if (keys(p) !== 'after,bedtime,before,departure,destZone,direction,homeZone,id,name,stepMin,wake') fail('err.backup');
      if (![p.after, p.before, p.stepMin, p.bedtime, p.wake].every(Number.isSafeInteger)) fail('err.backup');
      if (typeof p.homeZone !== 'string' || typeof p.destZone !== 'string') fail('err.backup');
      return makePlan({ ...p, stepMin: String(p.stepMin), before: String(p.before), after: String(p.after) }, p.id);
    });
    if (new Set(plans.map((p) => p.id)).size !== plans.length) fail('err.backup');
    return plans;
  }
  function backup(plans) { return JSON.stringify({ app: 'jetlagplanner', version: VERSION, plans: validateBackup({ app: 'jetlagplanner', version: VERSION, plans }) }, null, 2); }

  root.JetCore = Object.freeze({ VERSION, MAX, DIRECTIONS, validZone, offsetAt, clockAt, dayAt, wallToMs, isDay, addDays, parseClock, clock, makePlan, zoneDiff, totalShift, schedule, segments, toICS, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JetCore;
})(typeof window === 'undefined' ? globalThis : window);
