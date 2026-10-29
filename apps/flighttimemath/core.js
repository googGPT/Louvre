/* FlightTimeMath — logique pure : vols avec escales en heures locales et fuseaux IANA (Intl).
   Chaque heure saisie est convertie en instant UTC : durées de vol et d'escale exactes, même quand
   un fuseau change d'heure (heure d'été). Aucun horaire de compagnie ni temps de correspondance
   minimal n'est inventé : le seuil de correspondance est saisi par l'utilisateur. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ trips: 30, segments: 12, name: 60, place: 60, flight: 20, connection: 1440, flightMin: 36 * 60 });
  const ID = /^[a-z0-9-]{6,64}$/i;
  const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/; // « 2026-11-10T14:05 », heure murale sans fuseau
  const ZONE = /^(UTC|[A-Za-z][A-Za-z_]*(\/[A-Za-z0-9_+-]+){1,2})$/;
  const MIN = 60000, DAY = 86400000;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function text(v, max, required, keyRequired, keyLong) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (typeof v !== 'string' && v !== undefined && v !== null) fail(keyRequired);
    if (!s && required) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    if (/[\u0000-\u001f]/.test(s)) fail(keyRequired);
    return s;
  }

  // --- Fuseaux
  const fmtCache = new Map();
  function formatter(zone) { // un formateur par fuseau (coûteux à créer)
    if (!fmtCache.has(zone)) fmtCache.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return fmtCache.get(zone);
  }
  // Nom IANA reconnu par le navigateur (« europe/paris » -> « Europe/Paris »).
  function validZone(zone) {
    if (typeof zone !== 'string' || !ZONE.test(zone.trim())) fail('err.zone');
    try { return new Intl.DateTimeFormat('en-US', { timeZone: zone.trim() }).resolvedOptions().timeZone; } catch (e) { return fail('err.zone'); }
  }
  // Heure murale d'un instant dans un fuseau : { date: 'AAAA-MM-JJ', time: 'HH:MM', offset: minutes par rapport à UTC }.
  function localParts(ms, zone) {
    const p = {}; for (const x of formatter(zone).formatToParts(new Date(ms))) p[x.type] = x.value;
    const hour = p.hour === '24' ? 0 : Number(p.hour);
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(hour).padStart(2, '0')}:${p.minute}`, offset: Math.round((wall - Math.floor(ms / 1000) * 1000) / MIN) };
  }
  const offsetAt = (ms, zone) => localParts(ms, zone).offset;

  function validDay(y, m, d) { const z = new Date(Date.UTC(y, m - 1, d)); return z.getUTCFullYear() === y && z.getUTCMonth() === m - 1 && z.getUTCDate() === d; }
  function parseLocal(s) {
    const m = typeof s === 'string' ? LOCAL.exec(s) : null;
    if (!m) fail('err.datetime');
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    if (y < 1970 || y > 2100 || !validDay(y, mo, d) || h > 23 || mi > 59) fail('err.datetime');
    return Date.UTC(y, mo - 1, d, h, mi); // heure murale lue « comme si » c'était de l'UTC
  }
  // Heure locale + fuseau -> instant. Trou de l'heure d'été : refusé. Heure répétée à l'automne : première occurrence, signalée.
  function toInstant(local, zone) {
    const wall = parseLocal(local), z = validZone(zone);
    const offsets = new Set([-DAY, -DAY / 2, 0, DAY / 2, DAY].map((d) => offsetAt(wall + d, z)));
    const hits = [...offsets].map((o) => wall - o * MIN).filter((ms) => offsetAt(ms, z) * MIN === wall - ms).sort((a, b) => a - b);
    const unique = [...new Set(hits)];
    if (!unique.length) fail('err.nonexistent', { time: local.slice(11) });
    return { ms: unique[0], ambiguous: unique.length > 1 };
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY); }

  // Seuil de correspondance saisi : minutes (« 90 ») ou heures:minutes (« 1:30 ») ; vide = pas de contrôle.
  function parseConnection(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (s === '') return null;
    let n;
    if (/^\d{1,4}$/.test(s)) n = Number(s);
    else if (/^\d{1,2}[:h]\d{2}$/i.test(s)) { const [h, m] = s.split(/[:h]/i).map(Number); if (m > 59) fail('err.connection', { max: MAX.connection }); n = h * 60 + m; }
    else fail('err.connection', { max: MAX.connection });
    if (n > MAX.connection) fail('err.connection', { max: MAX.connection });
    return n;
  }

  // --- Constructeurs
  function makeSegment(input, id) {
    const seg = {
      id: checkId(id),
      flight: text(input.flight, MAX.flight, false, 'err.flight', 'err.flightLong'),
      from: text(input.from, MAX.place, true, 'err.placeRequired', 'err.placeLong'),
      fromZone: validZone(input.fromZone),
      depart: input.depart,
      to: text(input.to, MAX.place, true, 'err.placeRequired', 'err.placeLong'),
      toZone: validZone(input.toZone),
      arrive: input.arrive,
    };
    const dep = toInstant(seg.depart, seg.fromZone).ms, arr = toInstant(seg.arrive, seg.toZone).ms;
    if (arr <= dep) fail('err.order');
    if (arr - dep > MAX.flightMin * MIN) fail('err.tooLong', { max: MAX.flightMin / 60 });
    return seg;
  }
  function makeTrip(name, id, minConnection = null) {
    if (minConnection !== null && (!Number.isInteger(minConnection) || minConnection < 0 || minConnection > MAX.connection)) fail('err.connection', { max: MAX.connection });
    return { id: checkId(id), name: text(name, MAX.name, true, 'err.nameRequired', 'err.nameLong'), minConnection, segments: [] };
  }

  // --- Calculs
  function analyzeSegment(s) {
    const d = toInstant(s.depart, s.fromZone), a = toInstant(s.arrive, s.toZone);
    const dep = localParts(d.ms, s.fromZone), arr = localParts(a.ms, s.toZone);
    return {
      ...s, depMs: d.ms, arrMs: a.ms, durationMin: Math.round((a.ms - d.ms) / MIN),
      dep, arr, dayShift: daysBetween(dep.date, arr.date), // « J+1 » : la date d'arrivée locale moins la date de départ locale
      zoneShiftMin: arr.offset - dep.offset, // décalage horaire ressenti à l'arrivée
      // Changement d'heure pendant le vol (dans le fuseau de départ ou d'arrivée).
      dstDuring: offsetAt(d.ms, s.fromZone) !== offsetAt(a.ms, s.fromZone) || offsetAt(d.ms, s.toZone) !== offsetAt(a.ms, s.toZone),
      ambiguous: d.ambiguous || a.ambiguous,
    };
  }
  const samePlace = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  function analyze(trip) {
    const segs = trip.segments.map(analyzeSegment).sort((a, b) => a.depMs - b.depMs || a.arrMs - b.arrMs);
    const connections = [];
    for (let i = 1; i < segs.length; i += 1) {
      const prev = segs[i - 1], next = segs[i];
      const minutes = Math.round((next.depMs - prev.arrMs) / MIN);
      let status = 'ok';
      if (minutes < 0) status = 'overlap'; // le vol suivant part avant l'arrivée du précédent
      else if (trip.minConnection !== null && minutes < trip.minConnection) status = 'short';
      connections.push({
        after: prev.id, before: next.id, place: prev.to, minutes, status,
        placeChange: !samePlace(prev.to, next.from), // arrivée et départ dans deux lieux différents
        dstDuring: minutes > 0 && offsetAt(prev.arrMs, prev.toZone) !== offsetAt(next.depMs, prev.toZone),
        overnight: minutes > 0 && localParts(prev.arrMs, prev.toZone).date !== localParts(next.depMs, next.fromZone).date,
      });
    }
    const air = segs.reduce((s, x) => s + x.durationMin, 0);
    // En présence de vols chevauchants, le dernier départ n'est pas toujours la dernière arrivée.
    const finalArrival = segs.reduce((latest, s) => !latest || s.arrMs > latest.arrMs ? s : latest, null);
    const journey = segs.length ? Math.round((finalArrival.arrMs - segs[0].depMs) / MIN) : 0;
    return {
      segments: segs, connections,
      totals: {
        count: segs.length, journeyMin: journey, airMin: air, groundMin: connections.reduce((s, c) => s + Math.max(0, c.minutes), 0),
        dayShift: segs.length ? daysBetween(segs[0].dep.date, finalArrival.arr.date) : 0,
        zoneShiftMin: segs.length ? finalArrival.arr.offset - segs[0].dep.offset : 0,
        short: connections.filter((c) => c.status === 'short').length, overlap: connections.filter((c) => c.status === 'overlap').length,
        placeChange: connections.filter((c) => c.placeChange).length,
      },
    };
  }
  const splitMinutes = (m) => ({ h: Math.floor(Math.abs(m) / 60), m: Math.abs(m) % 60, neg: m < 0 });

  // --- Export agenda (.ics, RFC 5545) : un événement par vol, horaires en UTC (aucune ambiguïté de fuseau).
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n'); }
  function fold(line) { // lignes de 75 octets au plus
    const out = []; let cur = '';
    const enc = new TextEncoder();
    for (const ch of line) { if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  const stampOf = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const DEFAULT_TEXT = { summary: (s) => `${s.flight ? s.flight + ' ' : ''}${s.from} → ${s.to}`, describe: (s) => `${s.depart} ${s.fromZone} → ${s.arrive} ${s.toZone}` };
  function toICS(trip, stamp, txt = DEFAULT_TEXT) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const { segments } = analyze(trip);
    if (!segments.length) fail('err.noSegment');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//FlightTimeMath//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const s of segments) {
      lines.push('BEGIN:VEVENT', `UID:${s.id}@flighttimemath.louvre`, `DTSTAMP:${stamp}`, `DTSTART:${stampOf(s.depMs)}`, `DTEND:${stampOf(s.arrMs)}`,
        fold(`SUMMARY:${icsEscape(txt.summary(s))}`), fold(`DESCRIPTION:${icsEscape(txt.describe(s))}`), fold(`LOCATION:${icsEscape(s.from)}`), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateTrip(tr) {
    if (keys(tr) !== 'id,minConnection,name,segments' || !Array.isArray(tr.segments)) fail('err.backup');
    if (tr.segments.length > MAX.segments) fail('err.tooManySegments', { max: MAX.segments });
    const trip = makeTrip(tr.name, tr.id, tr.minConnection);
    trip.segments = tr.segments.map((s) => {
      if (keys(s) !== 'arrive,depart,flight,from,fromZone,id,to,toZone') fail('err.backup');
      return makeSegment(s, s.id);
    });
    const ids = [trip.id, ...trip.segments.map((s) => s.id)];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return trip;
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'flighttimemath' || data.version !== VERSION || !Array.isArray(data.trips)) fail('err.notBackup');
    if (keys(data) !== 'app,trips,version') fail('err.backup');
    if (data.trips.length > MAX.trips) fail('err.tooManyTrips', { max: MAX.trips });
    const trips = data.trips.map(validateTrip);
    if (new Set(trips.map((t) => t.id)).size !== trips.length) fail('err.backup');
    return trips;
  }
  function backup(trips) { return JSON.stringify({ app: 'flighttimemath', version: VERSION, trips: validateBackup({ app: 'flighttimemath', version: VERSION, trips }) }, null, 2); }

  root.FlightCore = Object.freeze({ VERSION, MAX, validZone, localParts, offsetAt, parseLocal, toInstant, daysBetween, parseConnection, makeSegment, makeTrip, analyzeSegment, analyze, splitMinutes, toICS, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FlightCore;
})(typeof window === 'undefined' ? globalThis : window);
