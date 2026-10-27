/* ParkingSpotMemory — logique pure : où est garé le véhicule (parking, niveau, zone, place, repères, photo réduite,
   position GPS facultative), minuterie de fin de stationnement, distance et direction vers le véhicule, historique.
   Les instants sont des millisecondes entières depuis l'époque Unix (UTC) ; les durées sont des minutes entières ;
   les distances sont des mètres entiers. Aucune carte n'est chargée : seul un lien externe est proposé. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX_HISTORY = 100, PHOTOS_KEPT = 5; // les photos des anciens stationnements sont retirées au-delà des 5 plus récents
  const MAX_PLACE = 60, MAX_SHORT = 20, MAX_LANDMARKS = 200, MAX_PHOTO = 400000, MAX_MINUTES = 10080, MAX_WARN = 120;
  const MIN_MS = Date.UTC(2000, 0, 1), MAX_MS = Date.UTC(2200, 0, 1);
  const ID_RE = /^[a-z0-9-]{6,64}$/i;
  const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const EARTH_M = 6371008.8; // rayon terrestre moyen (m)
  const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const msOk = (v) => Number.isSafeInteger(v) && v >= MIN_MS && v <= MAX_MS;
  function text(v, max, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length > max) fail(keyLong, { max });
    return s;
  }

  // --- Durées : « 90 », « 1h30 », « 1 h », « 1:30 », « 45 min » -> minutes (1 à 10 080, soit 7 jours).
  function parseDuration(value) {
    const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase().replace(/\s+/g, '');
    let m = null, r;
    if ((r = /^(\d{1,5})(min|mn|m)?$/.exec(s))) m = Number(r[1]);
    else if ((r = /^(\d{1,3})(?:h|:)(\d{1,2})?(?:min|mn|m)?$/.exec(s))) { if (r[2] !== undefined && Number(r[2]) > 59) fail('err.duration', { max: MAX_MINUTES }); m = Number(r[1]) * 60 + Number(r[2] || 0); }
    if (m === null || m < 1 || m > MAX_MINUTES) fail('err.duration', { max: MAX_MINUTES });
    return m;
  }
  // Heure de fin « HH:MM » : prochaine occurrence après `nowMs` (le lendemain si l'heure est déjà passée), heure locale.
  function endFromClock(nowMs, hhmm) {
    if (!msOk(nowMs)) fail('err.time');
    const r = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim());
    if (!r) fail('err.clock');
    const now = new Date(nowMs);
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(r[1]), Number(r[2]), 0, 0);
    if (end.getTime() <= nowMs) end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, Number(r[1]), Number(r[2]), 0, 0);
    return end.getTime();
  }

  // --- Position GPS (facultative) : coordonnées arrondies au millionième de degré (~0,1 m), précision en mètres entiers.
  function makePosition(lat, lon, accuracy) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) fail('err.coords');
    const acc = accuracy === null || accuracy === undefined ? null : Math.round(Number(accuracy));
    if (acc !== null && (!Number.isSafeInteger(acc) || acc < 0 || acc > 100000)) fail('err.coords');
    const r6 = (x) => Math.round(x * 1e6) / 1e6;
    return { lat: r6(lat), lon: r6(lon), accuracy: acc };
  }
  const rad = (d) => d * Math.PI / 180;
  // Distance orthodromique (formule de haversine), en mètres entiers.
  function distanceM(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h))));
  }
  // Cap initial de a vers b, en degrés entiers (0 = nord, 90 = est).
  function bearingDeg(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (Math.round(Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }
  const cardinal = (deg) => DIRS[Math.round(deg / 45) % 8];
  // Où est la voiture depuis ici ? Distance, direction et marge d'incertitude (somme des précisions GPS).
  function guide(here, car) {
    if (!car || car.lat === null) return null;
    const d = distanceM(here, car), deg = bearingDeg(here, car);
    const uncertainty = (here.accuracy || 0) + (car.accuracy || 0);
    return { distanceM: d, bearing: deg, dir: cardinal(deg), uncertaintyM: uncertainty, close: d <= Math.max(25, uncertainty) };
  }
  function mapLink(lat, lon) { return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=18/${lat.toFixed(6)}/${lon.toFixed(6)}`; }

  // --- Stationnement en cours
  function checkPhoto(photo) {
    if (photo === '' || photo === undefined || photo === null) return '';
    if (typeof photo !== 'string' || photo.length > MAX_PHOTO || !PHOTO_RE.test(photo)) fail('err.photo');
    return photo;
  }
  // Taille cible d'une photo réduite : le plus grand côté ramené à `max` pixels, proportions conservées.
  function fitSize(w, h, max) {
    if (!(w > 0 && h > 0) || !(max > 0)) fail('err.photo');
    const k = Math.min(1, max / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
  }
  function makeSession(input, id, nowMs, allowEmpty = false) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    if (!isPlain(input)) fail('err.backup');
    const startedMs = input.startedMs === undefined ? nowMs : input.startedMs;
    if (!msOk(startedMs)) fail('err.time');
    const s = {
      id, startedMs,
      place: text(input.place, MAX_PLACE, 'err.placeLong'), level: text(input.level, MAX_SHORT, 'err.shortLong'),
      zone: text(input.zone, MAX_SHORT, 'err.shortLong'), spot: text(input.spot, MAX_SHORT, 'err.shortLong'),
      landmarks: text(input.landmarks, MAX_LANDMARKS, 'err.landmarksLong'), photo: checkPhoto(input.photo),
      lat: null, lon: null, accuracy: null, endMs: null,
    };
    if (input.lat !== null && input.lat !== undefined) Object.assign(s, makePosition(input.lat, input.lon, input.accuracy));
    else if (input.lon !== null && input.lon !== undefined) fail('err.coords');
    if (input.endMs !== null && input.endMs !== undefined) { if (!msOk(input.endMs) || input.endMs <= startedMs) fail('err.endBeforeStart'); s.endMs = input.endMs; }
    // Il faut au moins un repère pour retrouver le véhicule.
    if (!allowEmpty && !s.place && !s.level && !s.zone && !s.spot && !s.landmarks && !s.photo && s.lat === null) fail('err.empty');
    return s;
  }
  function setTimer(session, endMs, nowMs) {
    if (!msOk(endMs) || endMs <= nowMs) fail('err.endPast');
    if (endMs - nowMs > MAX_MINUTES * 60000) fail('err.duration', { max: MAX_MINUTES });
    return { ...session, endMs };
  }
  // Prolonger : à partir de la fin prévue, ou de maintenant si elle est dépassée (ou absente).
  function extend(session, minutes, nowMs) {
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) fail('err.duration', { max: MAX_MINUTES });
    const base = session.endMs && session.endMs > nowMs ? session.endMs : nowMs;
    return setTimer(session, base + minutes * 60000, nowMs);
  }
  function clearTimer(session) { return { ...session, endMs: null }; }
  // État de la minuterie : none, running, warn (moins de warnMinutes), expired.
  function timerState(session, nowMs, warnMinutes) {
    if (!session || !session.endMs) return { state: 'none', remainingMs: null };
    const left = session.endMs - nowMs;
    if (left <= 0) return { state: 'expired', remainingMs: left };
    return { state: left <= warnMinutes * 60000 ? 'warn' : 'running', remainingMs: left };
  }
  // Découpe une durée positive en jours, heures, minutes, secondes (pour l'affichage du compte à rebours).
  function splitMs(ms) {
    const total = Math.floor(Math.abs(ms) / 1000);
    return { d: Math.floor(total / 86400), h: Math.floor(total % 86400 / 3600), m: Math.floor(total % 3600 / 60), s: total % 60 };
  }

  // --- Historique
  function endSession(session, nowMs) {
    if (!msOk(nowMs) || nowMs < session.startedMs) fail('err.time');
    return { ...session, endedMs: nowMs };
  }
  // Ajoute en tête, limite à MAX_HISTORY et retire les photos au-delà des PHOTOS_KEPT plus récents.
  function addToHistory(history, entry) {
    return [entry, ...history].slice(0, MAX_HISTORY).map((h, i) => (i < PHOTOS_KEPT || !h.photo ? h : { ...h, photo: '' }));
  }
  function durationMin(h) { return Math.round((h.endedMs - h.startedMs) / 60000); }
  function historyStats(history, locale = 'fr') {
    if (!history.length) return { count: 0, avgMinutes: 0, places: [] };
    const counts = new Map();
    for (const h of history) if (h.place) { const k = h.place.toLocaleLowerCase(locale); const c = counts.get(k) || { place: h.place, count: 0 }; c.count += 1; counts.set(k, c); }
    const places = [...counts.values()].sort((a, b) => b.count - a.count || a.place.localeCompare(b.place, locale));
    return { count: history.length, avgMinutes: Math.round(history.reduce((a, h) => a + durationMin(h), 0) / history.length), places };
  }
  // Dernier niveau / zone / place notés pour ce parking (habitudes), ou null.
  function lastAt(history, place, locale = 'fr') {
    const k = String(place || '').trim().toLocaleLowerCase(locale);
    if (!k) return null;
    const h = history.find((x) => x.place.toLocaleLowerCase(locale) === k);
    return h ? { place: h.place, level: h.level, zone: h.zone, spot: h.spot, landmarks: h.landmarks, startedMs: h.startedMs } : null;
  }

  // --- Agenda .ics : rappel de fin de stationnement (instant UTC), alerte N minutes avant.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function toICS(session, stampMs, warnMinutes, summary, description) {
    if (!session || !session.endMs) fail('err.noTimer');
    if (!Number.isSafeInteger(warnMinutes) || warnMinutes < 0 || warnMinutes > MAX_WARN) fail('err.warn', { max: MAX_WARN });
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//ParkingSpotMemory//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:${session.id}-${session.endMs}@parkingspotmemory.louvre`, `DTSTAMP:${icsTime(stampMs)}`, `DTSTART:${icsTime(session.endMs)}`, `DTEND:${icsTime(session.endMs + 15 * 60000)}`,
      fold(`SUMMARY:${icsEscape(summary)}`), fold(`DESCRIPTION:${icsEscape(description)}`)];
    if (session.lat !== null) lines.push(`GEO:${session.lat.toFixed(6)};${session.lon.toFixed(6)}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEscape(summary)}`), `TRIGGER:-PT${warnMinutes}M`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  const SESSION_KEYS = ['id', 'startedMs', 'place', 'level', 'zone', 'spot', 'landmarks', 'photo', 'lat', 'lon', 'accuracy', 'endMs'];
  function defaultSettings() { return { warnMinutes: 10 }; }
  function makeSettings(input) {
    const s = String(input && input.warnMinutes !== undefined ? input.warnMinutes : '').trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) > MAX_WARN) fail('err.warn', { max: MAX_WARN });
    return { warnMinutes: Number(s) };
  }
  function emptyData() { return { settings: defaultSettings(), current: null, history: [] }; }
  function validSession(x, withEnd) {
    if (!isPlain(x) || !sameKeys(x, withEnd ? [...SESSION_KEYS, 'endedMs'] : SESSION_KEYS)) fail('err.backup');
    if ((x.lat === null) !== (x.lon === null) || (x.lat === null && x.accuracy !== null)) fail('err.backup');
    const s = makeSession(x, x.id, x.startedMs, withEnd); // une ancienne entrée peut avoir perdu sa photo
    if (withEnd) { if (!msOk(x.endedMs) || x.endedMs < x.startedMs) fail('err.backup'); s.endedMs = x.endedMs; }
    return s;
  }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'parkingspotmemory' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'settings', 'current', 'history']) || !Array.isArray(data.history)) fail('err.backup');
    if (data.history.length > MAX_HISTORY) fail('err.tooMany', { max: MAX_HISTORY });
    if (!isPlain(data.settings) || !sameKeys(data.settings, ['warnMinutes']) || !Number.isSafeInteger(data.settings.warnMinutes)) fail('err.backup');
    const settings = makeSettings({ warnMinutes: String(data.settings.warnMinutes) });
    const current = data.current === null ? null : validSession(data.current, false);
    const history = data.history.map((h) => validSession(h, true));
    const ids = [...(current ? [current.id] : []), ...history.map((h) => h.id)];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    if (history.filter((h) => h.photo).length > PHOTOS_KEPT) fail('err.backup');
    return { settings, current, history };
  }
  function backup(data) {
    const clean = validateData({ app: 'parkingspotmemory', version: VERSION, settings: data.settings, current: data.current, history: data.history });
    return JSON.stringify({ app: 'parkingspotmemory', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, MAX_HISTORY, PHOTOS_KEPT, MAX_PHOTO, MAX_MINUTES, DIRS,
    parseDuration, endFromClock, makePosition, distanceM, bearingDeg, cardinal, guide, mapLink, checkPhoto, fitSize,
    makeSession, setTimer, extend, clearTimer, timerState, splitMs, endSession, addToHistory, durationMin, historyStats, lastAt,
    toICS, defaultSettings, makeSettings, emptyData, validateData, backup,
  };
  root.ParkingCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ParkingCore;
})(typeof window === 'undefined' ? globalThis : window);
