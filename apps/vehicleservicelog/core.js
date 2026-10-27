/* VehicleServiceLog — logique pure : véhicules, interventions datées (kilométrage, coût), relevés du compteur,
   échéances d'entretien selon un intervalle en km ET/OU en mois saisi par l'utilisateur (le premier atteint compte),
   kilométrage estimé à la date du jour selon le rythme observé, rappels, exports CSV et .ics.
   Aucun intervalle constructeur n'est fourni : tout est saisi. Montants en centimes entiers ; distances en km entiers ;
   dates en jours civils « AAAA-MM-JJ » (calculs en UTC, sans piège d'heure d'été). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX_VEHICLES = 20, MAX_SCHEDULES = 200, MAX_SERVICES = 3000, MAX_READINGS = 3000;
  const MAX_NAME = 40, MAX_LABEL = 60, MAX_NOTE = 200, MAX_KM = 9999999, MAX_EVERY_KM = 500000, MAX_EVERY_MONTHS = 240, MAX_CENTS = 99999999;
  const MIN_SPAN_DAYS = 7; // en dessous, le rythme observé n'est pas jugé fiable
  const MAX_ICS_EVENTS = 500;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const str = (v) => (v === undefined || v === null ? '' : String(v)).trim();

  // --- Jours civils
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1950 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function toUTC(day) { if (!isDay(day)) fail('err.date'); const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
  function addDays(day, n) { return fromUTC(toUTC(day) + n * 86400000); }
  function dayDiff(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); }
  // Mois ancrés : le 31 janvier + 1 mois = 28 (ou 29) février.
  function addMonths(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    const idx = (y * 12 + (m - 1)) + n, ny = Math.floor(idx / 12), nm = idx % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return fromUTC(Date.UTC(ny, nm, Math.min(d, last)));
  }

  // --- Saisies
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function text(v, max, required, keyRequired, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    return s;
  }
  // Kilométrage : entier, espaces et séparateurs de milliers tolérés (« 45 200 », « 45.200 » refusé car ambigu).
  function parseKm(value, key = 'err.km') {
    const s = str(value).replace(/[\s\u00a0\u202f]/g, '');
    if (!/^\d{1,7}$/.test(s)) fail(key, { max: MAX_KM });
    return Number(s);
  }
  function parseOptionalInt(value, max, key) {
    const s = str(value).replace(/[\s\u00a0\u202f]/g, '');
    if (s === '' || s === '0') return 0;
    if (!/^\d{1,7}$/.test(s) || Number(s) > max) fail(key, { max });
    return Number(s);
  }
  // « 89,90 » -> 8990 centimes ; vide -> 0 (intervention gratuite ou coût inconnu).
  function parseCents(value) {
    const s = str(value).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (s === '') return 0;
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) fail('err.amount');
    const [a, b = ''] = s.split('.');
    return Number(a) * 100 + Number((b + '00').slice(0, 2));
  }
  function checkPast(day, today, keyFuture) {
    if (!isDay(day)) fail('err.date');
    if (isDay(today) && dayDiff(day, today) > 0) fail(keyFuture);
    return day;
  }
  const intIn = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;

  function makeVehicle(input, id) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    return { id, name: text(input.name, MAX_NAME, true, 'err.vehicleName', 'err.nameLong'), note: text(input.note, MAX_LABEL, false, '', 'err.labelLong') };
  }
  // Échéance : « tous les {everyKm} km et/ou tous les {everyMonths} mois », à partir d'une base (dernière fois faite).
  function makeSchedule(input, id, vehicles, today) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!vehicles.some((v) => v.id === input.vehicleId)) fail('err.vehicleUnknown');
    const name = text(input.name, MAX_LABEL, true, 'err.scheduleName', 'err.labelLong');
    const everyKm = intIn(input.everyKm, 0, MAX_EVERY_KM) ? input.everyKm : parseOptionalInt(input.everyKmText, MAX_EVERY_KM, 'err.everyKm');
    const everyMonths = intIn(input.everyMonths, 0, MAX_EVERY_MONTHS) ? input.everyMonths : parseOptionalInt(input.everyMonthsText, MAX_EVERY_MONTHS, 'err.everyMonths');
    if (!everyKm && !everyMonths) fail('err.everyNone');
    const baseDate = checkPast(input.baseDate, today, 'err.baseFuture');
    const baseKm = intIn(input.baseKm, 0, MAX_KM) ? input.baseKm : parseKm(input.baseKmText);
    return { id, vehicleId: input.vehicleId, name, everyKm, everyMonths, baseDate, baseKm };
  }
  function makeService(input, id, vehicles, schedules, today) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!vehicles.some((v) => v.id === input.vehicleId)) fail('err.vehicleUnknown');
    const scheduleId = input.scheduleId || '';
    if (scheduleId && !schedules.some((s) => s.id === scheduleId && s.vehicleId === input.vehicleId)) fail('err.scheduleUnknown');
    const label = text(input.label, MAX_LABEL, !scheduleId, 'err.serviceLabel', 'err.labelLong');
    const date = checkPast(input.date, today, 'err.dateFuture');
    const km = intIn(input.km, 0, MAX_KM) ? input.km : parseKm(input.kmText);
    const cents = intIn(input.cents, 0, MAX_CENTS) ? input.cents : parseCents(input.amount);
    if (!intIn(cents, 0, MAX_CENTS)) fail('err.amount');
    return { id, vehicleId: input.vehicleId, scheduleId, date, km, label, cents, note: text(input.note, MAX_NOTE, false, '', 'err.noteLong') };
  }
  function makeReading(input, id, vehicles, today) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    if (!vehicles.some((v) => v.id === input.vehicleId)) fail('err.vehicleUnknown');
    const date = checkPast(input.date, today, 'err.dateFuture');
    const km = intIn(input.km, 0, MAX_KM) ? input.km : parseKm(input.kmText);
    return { id, vehicleId: input.vehicleId, date, km };
  }

  // --- Compteur : points connus (interventions + relevés), cohérence et rythme observé
  function odometerPoints(data, vehicleId) {
    return [...data.services, ...data.readings].filter((x) => x.vehicleId === vehicleId)
      .map((x) => ({ date: x.date, km: x.km, id: x.id }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km));
  }
  // Un compteur ne recule pas : un relevé doit être ≥ tous ceux d'avant et ≤ tous ceux d'après.
  function checkOdometer(points, date, km, ignoreId) {
    for (const p of points) {
      if (p.id === ignoreId) continue;
      if (p.date < date && p.km > km) fail('err.kmBelow', { km: p.km, date: p.date });
      if (p.date > date && p.km < km) fail('err.kmAbove', { km: p.km, date: p.date });
    }
  }
  // Rythme = (km du dernier point − km du premier) / jours écoulés, si l'écart couvre au moins MIN_SPAN_DAYS.
  function pace(points) {
    if (points.length < 2) return null;
    const a = points[0], b = points[points.length - 1], days = dayDiff(b.date, a.date), km = b.km - a.km;
    if (days < MIN_SPAN_DAYS || km < 0) return null;
    return { km, days, perYear: Math.round(km * 365 / days), from: a.date, to: b.date };
  }
  // Kilométrage estimé à `today` : dernier point + rythme × jours écoulés (arrondi). Sans rythme : dernier point.
  function estimateKm(points, today) {
    if (!points.length) return null;
    const last = points[points.length - 1], p = pace(points);
    const since = Math.max(0, dayDiff(today, last.date));
    return { km: last.km + (p ? Math.round(p.km * since / p.days) : 0), lastKm: last.km, lastDate: last.date, since, pace: p, estimated: !!(p && since > 0) };
  }

  // --- Échéances : dernière exécution (intervention liée la plus récente, sinon la base), puis le premier seuil atteint.
  function lastDone(schedule, services) {
    let best = { date: schedule.baseDate, km: schedule.baseKm, fromService: false };
    for (const s of services) {
      if (s.scheduleId !== schedule.id) continue;
      if (s.date > best.date || (s.date === best.date && s.km > best.km)) best = { date: s.date, km: s.km, fromService: true };
    }
    return best;
  }
  function scheduleStatus(schedule, data, today, settings) {
    const points = odometerPoints(data, schedule.vehicleId), est = estimateKm(points, today);
    const last = lastDone(schedule, data.services);
    const dueDate = schedule.everyMonths ? addMonths(last.date, schedule.everyMonths) : null;
    const dueKm = schedule.everyKm ? last.km + schedule.everyKm : null;
    const refKm = Math.max(last.km, est ? est.km : 0);
    const remainingDays = dueDate ? dayDiff(dueDate, today) : null;
    const remainingKm = dueKm !== null ? dueKm - refKm : null;
    // Date à laquelle le seuil kilométrique sera atteint au rythme observé.
    let kmDate = null;
    if (dueKm !== null && est && est.pace && est.pace.km > 0) {
      const left = dueKm - est.lastKm;
      kmDate = left <= 0 ? est.lastDate : addDays(est.lastDate, Math.ceil(left * est.pace.days / est.pace.km));
    }
    if (dueKm !== null && remainingKm <= 0 && !kmDate) kmDate = today; // seuil déjà atteint, rythme inconnu
    // Le premier seuil atteint fixe la date effective (à égalité : le temps).
    let effectiveDate = dueDate, reason = dueDate ? 'time' : null;
    if (kmDate && (!effectiveDate || kmDate < effectiveDate)) { effectiveDate = kmDate; reason = 'km'; }
    let state = 'ok';
    if ((remainingDays !== null && remainingDays < 0) || (remainingKm !== null && remainingKm < 0)) state = 'late';
    else if (remainingDays === 0 || remainingKm === 0) state = 'today';
    else if ((remainingDays !== null && remainingDays <= settings.soonDays) || (remainingKm !== null && remainingKm <= settings.soonKm)
      || (effectiveDate && dayDiff(effectiveDate, today) <= settings.soonDays)) state = 'soon';
    return { last, dueDate, dueKm, refKm, remainingDays, remainingKm, kmDate, effectiveDate, reason, state, estimate: est };
  }
  const STATE_ORDER = { late: 0, today: 1, soon: 2, ok: 3 };
  // Rappels de tous les véhicules (ou d'un seul), les plus urgents d'abord.
  function reminders(data, today, settings, vehicleId) {
    return data.schedules.filter((s) => !vehicleId || s.vehicleId === vehicleId)
      .map((s) => ({ schedule: s, ...scheduleStatus(s, data, today, settings) }))
      .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
        || (a.effectiveDate || '9999').localeCompare(b.effectiveDate || '9999')
        || (a.remainingKm ?? Infinity) - (b.remainingKm ?? Infinity) || a.schedule.name.localeCompare(b.schedule.name));
  }

  // --- Dépenses
  function costSummary(data, vehicleId) {
    const list = data.services.filter((s) => s.vehicleId === vehicleId);
    const total = list.reduce((a, s) => a + s.cents, 0), byYear = {};
    for (const s of list) byYear[s.date.slice(0, 4)] = (byYear[s.date.slice(0, 4)] || 0) + s.cents;
    const pts = odometerPoints(data, vehicleId), span = pts.length > 1 ? pts[pts.length - 1].km - pts[0].km : 0;
    return { total, count: list.length, byYear, spanKm: span, per100KmCents: span > 0 ? Math.round(total * 100 / span) : null };
  }

  // --- CSV (séparateur « ; », BOM UTF-8, protection contre les formules)
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function centsText(cents, decimal) { return `${Math.floor(cents / 100)}${decimal === 'comma' ? ',' : '.'}${String(cents % 100).padStart(2, '0')}`; }
  function servicesCSV(data, opts) {
    const { headers, decimal, vehicleName, scheduleName } = opts;
    if (!Array.isArray(headers) || headers.length !== 7) fail('err.headers');
    const rows = [...data.services].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km));
    const lines = [headers.map(csvCell).join(';')];
    for (const s of rows) lines.push([s.date, csvCell(vehicleName(s.vehicleId)), s.km, csvCell(s.label), csvCell(s.scheduleId ? scheduleName(s.scheduleId) : ''), centsText(s.cents, decimal), csvCell(s.note)].join(';'));
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  // --- Agenda .ics : une journée par échéance (date effective ; aujourd'hui si déjà en retard), rappel N jours avant.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  function toICS(list, today, stamp, alarmDays, txt) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    if (!intIn(alarmDays, 0, 365)) fail('err.soonDays', { max: 365 });
    if (!txt || typeof txt.summary !== 'function' || typeof txt.description !== 'function') fail('err.icsText');
    const d8 = (d) => d.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//VehicleServiceLog//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    let count = 0;
    for (const r of list) {
      if (!r.effectiveDate) continue;
      const day = dayDiff(r.effectiveDate, today) < 0 ? today : r.effectiveDate;
      count += 1; if (count > MAX_ICS_EVENTS) fail('err.icsTooMany', { max: MAX_ICS_EVENTS });
      lines.push('BEGIN:VEVENT', `UID:${r.schedule.id}-${d8(r.last.date)}@vehicleservicelog.louvre`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(day)}`, `DTEND;VALUE=DATE:${d8(addDays(day, 1))}`,
        fold(`SUMMARY:${icsEscape(txt.summary(r))}`), fold(`DESCRIPTION:${icsEscape(txt.description(r))}`), 'TRANSP:TRANSPARENT');
      if (alarmDays > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEscape(txt.summary(r))}`), `TRIGGER:-P${alarmDays}D`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n') + '\r\n', count };
  }

  // --- Réglages des rappels (seuils « bientôt »), saisis par l'utilisateur
  function defaultSettings() { return { soonDays: 30, soonKm: 1000 }; }
  function makeSettings(input) {
    if (!isPlain(input)) fail('err.backup');
    const soonDays = Number.isSafeInteger(input.soonDays) ? input.soonDays : parseOptionalInt(input.soonDaysText, 365, 'err.soonDays');
    const soonKm = Number.isSafeInteger(input.soonKm) ? input.soonKm : parseOptionalInt(input.soonKmText, 50000, 'err.soonKm');
    if (!intIn(soonDays, 0, 365)) fail('err.soonDays', { max: 365 });
    if (!intIn(soonKm, 0, 50000)) fail('err.soonKm', { max: 50000 });
    return { soonDays, soonKm };
  }

  // --- Ensemble des données
  const LIMITS = { vehicles: MAX_VEHICLES, schedules: MAX_SCHEDULES, services: MAX_SERVICES, readings: MAX_READINGS };
  function emptyData() { return { settings: defaultSettings(), vehicles: [], schedules: [], services: [], readings: [] }; }
  function upsert(data, list, item) {
    const arr = data[list];
    if (!Array.isArray(arr) || !LIMITS[list]) fail('err.backup');
    const exists = arr.some((x) => x.id === item.id);
    if (!exists && arr.length >= LIMITS[list]) fail('err.tooMany', { max: LIMITS[list] });
    return { ...data, [list]: exists ? arr.map((x) => (x.id === item.id ? item : x)) : [...arr, item] };
  }
  function removeItem(data, list, id) {
    const next = { ...data, [list]: data[list].filter((x) => x.id !== id) };
    // Supprimer une échéance détache ses interventions (elles restent dans l'historique).
    if (list === 'schedules') next.services = data.services.map((s) => (s.scheduleId === id ? { ...s, scheduleId: '', label: s.label || data.schedules.find((x) => x.id === id).name } : s));
    return next;
  }
  function removeVehicle(data, id) {
    const keep = (x) => x.vehicleId !== id;
    return { ...data, vehicles: data.vehicles.filter((v) => v.id !== id), schedules: data.schedules.filter(keep), services: data.services.filter(keep), readings: data.readings.filter(keep) };
  }

  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'vehicleservicelog' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'settings', 'vehicles', 'schedules', 'services', 'readings'])) fail('err.backup');
    for (const k of Object.keys(LIMITS)) {
      if (!Array.isArray(data[k])) fail('err.backup');
      if (data[k].length > LIMITS[k]) fail('err.tooMany', { max: LIMITS[k] });
    }
    if (!isPlain(data.settings) || !sameKeys(data.settings, ['soonDays', 'soonKm'])) fail('err.backup');
    const settings = makeSettings(data.settings);
    const keyed = (list, keys, make) => data[list].map((x) => { if (!isPlain(x) || !sameKeys(x, keys)) fail('err.backup'); return make(x); });
    const ints = (...vals) => { for (const v of vals) if (!Number.isSafeInteger(v)) fail('err.backup'); };
    const vehicles = keyed('vehicles', ['id', 'name', 'note'], (v) => makeVehicle(v, v.id));
    const schedules = keyed('schedules', ['id', 'vehicleId', 'name', 'everyKm', 'everyMonths', 'baseDate', 'baseKm'], (s) => {
      ints(s.everyKm, s.everyMonths, s.baseKm);
      if (!intIn(s.everyKm, 0, MAX_EVERY_KM) || !intIn(s.everyMonths, 0, MAX_EVERY_MONTHS) || !intIn(s.baseKm, 0, MAX_KM)) fail('err.backup');
      return makeSchedule(s, s.id, vehicles, null);
    });
    const services = keyed('services', ['id', 'vehicleId', 'scheduleId', 'date', 'km', 'label', 'cents', 'note'], (s) => {
      ints(s.km, s.cents); if (!intIn(s.km, 0, MAX_KM) || !intIn(s.cents, 0, MAX_CENTS) || typeof s.scheduleId !== 'string') fail('err.backup');
      return makeService(s, s.id, vehicles, schedules, null);
    });
    const readings = keyed('readings', ['id', 'vehicleId', 'date', 'km'], (r) => { ints(r.km); if (!intIn(r.km, 0, MAX_KM)) fail('err.backup'); return makeReading(r, r.id, vehicles, null); });
    const all = [vehicles, schedules, services, readings].flat().map((x) => x.id);
    if (new Set(all).size !== all.length) fail('err.backup');
    return { settings, vehicles, schedules, services, readings };
  }
  function backup(data) {
    const clean = validateData({ app: 'vehicleservicelog', version: VERSION, settings: data.settings, vehicles: data.vehicles, schedules: data.schedules, services: data.services, readings: data.readings });
    return JSON.stringify({ app: 'vehicleservicelog', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, LIMITS, MAX_KM, MIN_SPAN_DAYS,
    isDay, addDays, addMonths, dayDiff, parseKm, parseCents, centsText,
    makeVehicle, makeSchedule, makeService, makeReading, odometerPoints, checkOdometer, pace, estimateKm,
    lastDone, scheduleStatus, reminders, costSummary, servicesCSV, toICS, defaultSettings, makeSettings,
    emptyData, upsert, removeItem, removeVehicle, validateData, backup,
  };
  root.VehicleCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VehicleCore;
})(typeof window === 'undefined' ? globalThis : window);
