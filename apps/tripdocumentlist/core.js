/* TripDocumentList — logique pure : documents de voyage par voyageur, contrôle des échéances
   par rapport aux dates du voyage et à une marge saisie par l'utilisateur.
   Aucune règle d'entrée de pays n'est intégrée. Aucun numéro de document n'est stocké :
   seulement le type, le titulaire, l'échéance, un statut et une note (refusée si elle ressemble à un numéro). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ trips: 30, travelers: 12, docs: 150, name: 60, note: 140, marginDays: 730, marginMonths: 24 });
  const TYPES = Object.freeze(['passport', 'idcard', 'visa', 'insurance', 'booking', 'ticket', 'license', 'health', 'other']);
  const ID = /^[a-z0-9-]{6,64}$/i;
  const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
  // Validités « bloquantes », « à vérifier », neutres.
  const BAD = Object.freeze(['expired', 'beforeTrip', 'duringTrip']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanName(v, key = 'err.nameRequired') {
    if (typeof v !== 'string' || !v.trim() || /[\u0000-\u001f]/.test(v)) fail(key);
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return v.trim();
  }

  // --- Jours civils « AAAA-MM-JJ » (calculs en UTC à midi : aucun piège d'heure d'été)
  function isDay(s) {
    const m = typeof s === 'string' ? DAY.exec(s) : null;
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number);
    const z = new Date(Date.UTC(y, mo - 1, d));
    return y >= 1900 && y <= 2200 && z.getUTCFullYear() === y && z.getUTCMonth() === mo - 1 && z.getUTCDate() === d;
  }
  function checkDay(s, key = 'err.date') { if (!isDay(s)) fail(key); return s; }
  const toMs = (s) => Date.parse(s + 'T12:00:00Z');
  const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
  function addDays(s, n) { return fromMs(toMs(checkDay(s)) + n * 86400000); }
  function diffDays(a, b) { return Math.round((toMs(checkDay(b)) - toMs(checkDay(a))) / 86400000); } // b - a
  // Ajout de mois ancré sur le jour : 31 août + 6 mois = 28 (ou 29) février.
  function addMonths(s, n) {
    const [y, m, d] = checkDay(s).split('-').map(Number);
    const total = y * 12 + (m - 1) + n, ny = Math.floor(total / 12), nm = total % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  }

  // --- Note libre : jamais de numéro de document
  // Refuse une suite d'au moins 6 lettres/chiffres contenant au moins 4 chiffres (« 12AB34567 », « 0612345678 »).
  function looksLikeNumber(note) {
    for (const tok of note.match(/[\p{L}\p{N}]{6,}/gu) || []) if ((tok.match(/\p{N}/gu) || []).length >= 4) return true;
    return false;
  }
  function cleanNote(v) {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string' || /[\u0000-\u0008\u000b-\u001f]/.test(v)) fail('err.note');
    const s = v.trim().replace(/\r\n?/g, '\n');
    if (s.length > MAX.note) fail('err.noteLong', { max: MAX.note });
    if (looksLikeNumber(s)) fail('err.noteNumber');
    return s;
  }

  // --- Constructeurs
  function makeTrip(name, id) { return { id: checkId(id), name: cleanName(name), start: null, end: null, margin: 0, marginUnit: 'd', travelers: [], docs: [] }; }
  // Dates du voyage et marge de validité exigée après le retour (saisie par l'utilisateur, 0 par défaut).
  function makeSettings(input) {
    const start = checkDay(input.start, 'err.start'), end = checkDay(input.end, 'err.end');
    if (end < start) fail('err.endBeforeStart');
    if (diffDays(start, end) > 366) fail('err.tripLong');
    const unit = input.marginUnit === 'm' ? 'm' : input.marginUnit === 'd' ? 'd' : fail('err.unit');
    const raw = String(input.margin === undefined || input.margin === null ? '' : input.margin).trim();
    const max = unit === 'm' ? MAX.marginMonths : MAX.marginDays;
    if (raw !== '' && !/^\d{1,3}$/.test(raw)) fail('err.margin', { max });
    const margin = raw === '' ? 0 : Number(raw);
    if (margin > max) fail('err.margin', { max });
    return { start, end, margin, marginUnit: unit };
  }
  function makeTraveler(name, id) { return { id: checkId(id), name: cleanName(name, 'err.travelerRequired') }; }
  function makeDoc(input, id, travelers) {
    if (!TYPES.includes(input.type)) fail('err.type');
    if (!travelers.some((t) => t.id === input.travelerId)) fail('err.traveler');
    const exp = input.expires === undefined || input.expires === null || String(input.expires).trim() === '' ? null : checkDay(String(input.expires).trim(), 'err.expires');
    return { id: checkId(id), travelerId: input.travelerId, type: input.type, expires: exp, done: input.done === true, note: cleanNote(input.note) };
  }

  // --- Contrôles
  // Date jusqu'à laquelle un document doit rester valide : retour + marge.
  function requiredUntil(trip) {
    if (!trip.end) return null;
    return trip.marginUnit === 'm' ? addMonths(trip.end, trip.margin) : addDays(trip.end, trip.margin);
  }
  function checkDoc(trip, doc, today) {
    checkDay(today, 'err.today');
    const until = requiredUntil(trip);
    let validity;
    if (doc.expires === null) validity = 'noExpiry';
    else if (doc.expires < today) validity = 'expired'; // valide jusqu'au jour d'échéance inclus
    else if (!trip.start) validity = 'noDates';
    else if (doc.expires < trip.start) validity = 'beforeTrip';
    else if (doc.expires < trip.end) validity = 'duringTrip';
    else if (doc.expires < until) validity = 'margin';
    else validity = 'ok';
    const level = BAD.includes(validity) ? 'bad' : validity === 'margin' ? 'warn' : 'ok';
    return {
      ...doc, validity, level, requiredUntil: until,
      afterEnd: doc.expires && trip.end ? diffDays(trip.end, doc.expires) : null, // jours entre le retour et l'échéance
      ready: doc.done && level === 'ok',
    };
  }
  function summary(trip, today) {
    const docs = trip.docs.map((d) => checkDoc(trip, d, today));
    const byTraveler = trip.travelers.map((t) => {
      const mine = docs.filter((d) => d.travelerId === t.id);
      return { id: t.id, name: t.name, docs: mine, ready: mine.filter((d) => d.ready).length, total: mine.length };
    });
    const upcoming = docs.filter((d) => d.expires && d.expires >= today).sort((a, b) => (a.expires < b.expires ? -1 : a.expires > b.expires ? 1 : 0));
    return {
      byTraveler, total: docs.length, ready: docs.filter((d) => d.ready).length,
      bad: docs.filter((d) => d.level === 'bad').length, warn: docs.filter((d) => d.level === 'warn').length,
      todo: docs.filter((d) => !d.done).length, nextExpiry: upcoming[0] || null,
      requiredUntil: requiredUntil(trip), daysToStart: trip.start ? diffDays(today, trip.start) : null,
      allReady: docs.length > 0 && docs.every((d) => d.ready),
    };
  }

  // --- Export agenda (.ics) : un événement d'une journée par échéance (documents avec date).
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    const out = [], enc = new TextEncoder(); let cur = '';
    for (const ch of line) { if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  const DEFAULT_TEXT = { summary: (d, t) => `${d.type} — ${t.name}`, describe: (d) => d.note };
  function toICS(trip, stamp, text = DEFAULT_TEXT) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const docs = trip.docs.filter((d) => d.expires);
    if (!docs.length) fail('err.noExpiry');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//TripDocumentList//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const d of docs) {
      const who = trip.travelers.find((t) => t.id === d.travelerId);
      lines.push('BEGIN:VEVENT', `UID:${d.id}@tripdocumentlist.louvre`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d.expires.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(d.expires, 1).replace(/-/g, '')}`,
        fold(`SUMMARY:${icsEscape(text.summary(d, who))}`), fold(`DESCRIPTION:${icsEscape(text.describe(d, who))}`), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateTrip(tr) {
    if (keys(tr) !== 'docs,end,id,margin,marginUnit,name,start,travelers' || !Array.isArray(tr.travelers) || !Array.isArray(tr.docs)) fail('err.backup');
    if (tr.travelers.length > MAX.travelers) fail('err.tooManyTravelers', { max: MAX.travelers });
    if (tr.docs.length > MAX.docs) fail('err.tooManyDocs', { max: MAX.docs });
    const trip = makeTrip(tr.name, tr.id);
    if (tr.start === null && tr.end === null) {
      if (tr.margin !== 0 || tr.marginUnit !== 'd') fail('err.backup');
    } else {
      if (!Number.isSafeInteger(tr.margin)) fail('err.backup');
      Object.assign(trip, makeSettings({ start: tr.start, end: tr.end, margin: String(tr.margin), marginUnit: tr.marginUnit }));
    }
    trip.travelers = tr.travelers.map((t) => { if (keys(t) !== 'id,name') fail('err.backup'); return makeTraveler(t.name, t.id); });
    trip.docs = tr.docs.map((d) => {
      if (keys(d) !== 'done,expires,id,note,travelerId,type' || typeof d.done !== 'boolean' || typeof d.note !== 'string' || !(d.expires === null || typeof d.expires === 'string')) fail('err.backup');
      return makeDoc(d, d.id, trip.travelers);
    });
    const ids = [trip.id, ...trip.travelers.map((t) => t.id), ...trip.docs.map((d) => d.id)];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return trip;
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'tripdocumentlist' || data.version !== VERSION || !Array.isArray(data.trips)) fail('err.notBackup');
    if (keys(data) !== 'app,trips,version') fail('err.backup');
    if (data.trips.length > MAX.trips) fail('err.tooManyTrips', { max: MAX.trips });
    const trips = data.trips.map(validateTrip);
    if (new Set(trips.map((t) => t.id)).size !== trips.length) fail('err.backup');
    return trips;
  }
  function backup(trips) { return JSON.stringify({ app: 'tripdocumentlist', version: VERSION, trips: validateBackup({ app: 'tripdocumentlist', version: VERSION, trips }) }, null, 2); }

  root.DocCore = Object.freeze({ VERSION, MAX, TYPES, isDay, addDays, addMonths, diffDays, looksLikeNumber, cleanNote, makeTrip, makeSettings, makeTraveler, makeDoc, requiredUntil, checkDoc, summary, toICS, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DocCore;
})(typeof window === 'undefined' ? globalThis : window);
