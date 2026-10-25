/* ParkWise domain functions — no external APIs. Original Louvre application code. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ParkWiseCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_SPOTS = 250;
  const maxCents = 10000000;
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  const boundedText = (v, max = 100) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max && !/[\u0000-\u0008\u000B\u000E-\u001F]/.test(v);
  const optionalText = (v, max = 140) => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000B\u000E-\u001F]/.test(v);
  const intIn = (v, low, high) => Number.isSafeInteger(v) && v >= low && v <= high;
  function eurosToCents(input) {
    if (typeof input !== 'string' && typeof input !== 'number') throw Error('Montant incorrect');
    const s = String(input).trim().replace(',', '.');
    if (!/^(?:\d{1,6})(?:\.\d{1,2})?$/.test(s)) throw Error('Saisissez un montant à deux décimales maximum');
    const parts = s.split('.'); const n = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
    if (!intIn(n, 0, maxCents)) throw Error('Montant hors limites');
    return n;
  }
  function validateSpot(s) {
    if (!plain(s) || Object.keys(s).sort().join(',') !== 'address,capCents,entryCents,freeMinutes,id,name,rateCents,walkMinutes') throw Error('Format de parking non reconnu');
    if (!boundedText(s.id, 80) || !/^[a-zA-Z0-9_-]+$/.test(s.id)) throw Error('Identifiant de parking invalide');
    if (!boundedText(s.name, 90) || !optionalText(s.address, 180)) throw Error('Nom ou adresse incorrect');
    if (!intIn(s.rateCents, 0, maxCents) || !intIn(s.entryCents, 0, maxCents) || !intIn(s.capCents, 0, maxCents) || !intIn(s.freeMinutes, 0, 240) || !intIn(s.walkMinutes, 0, 180)) throw Error('Tarifs ou durées incorrects');
    if (s.capCents !== 0 && s.capCents < s.entryCents) throw Error('Plafond inférieur aux frais d’entrée');
    return { ...s };
  }
  function validateState(raw) {
    if (!plain(raw) || Object.keys(raw).sort().join(',') !== 'parkingSpot,spots,version') throw Error('Sauvegarde incompatible');
    if (raw.version !== 1 || !Array.isArray(raw.spots) || raw.spots.length > MAX_SPOTS) throw Error('Sauvegarde trop volumineuse ou version inconnue');
    const spots = raw.spots.map(validateSpot), ids = new Set(spots.map(s => s.id));
    if (ids.size !== spots.length) throw Error('Parkings dupliqués');
    const v = raw.parkingSpot;
    if (v !== null) {
      if (!plain(v) || Object.keys(v).sort().join(',') !== 'lat,lon,note,savedAt') throw Error('Localisation sauvegardée incorrecte');
      if (!Number.isFinite(v.lat) || Math.abs(v.lat) > 90 || !Number.isFinite(v.lon) || Math.abs(v.lon) > 180 || !optionalText(v.note, 140) || typeof v.savedAt !== 'string' || Number.isNaN(Date.parse(v.savedAt))) throw Error('Coordonnées invalides');
    }
    return { version: 1, spots, parkingSpot: v ? { ...v } : null };
  }
  function defaultState() { return { version: 1, spots: [], parkingSpot: null }; }
  function costOfParking(spot, minutes) {
    validateSpot(spot);
    if (!intIn(minutes, 1, 10080)) throw Error('Durée comprise entre 1 minute et 7 jours');
    if (minutes <= spot.freeMinutes) return 0;
    const billable = minutes - spot.freeMinutes;
    // Simplified model: each begun hour is billed; day cap is per 24-hour block, not a calendar day.
    const fullDays = Math.floor(billable / 1440), leftover = billable % 1440;
    const oneDay = mins => mins === 0 ? 0 : Math.min(Math.ceil(mins / 60) * spot.rateCents, spot.capCents || Infinity);
    const total = spot.entryCents + fullDays * oneDay(1440) + oneDay(leftover);
    return Math.min(total, 1000000000);
  }
  function compare(spots, durationMinutes, timeValueEuroHour = 0) {
    if (!Array.isArray(spots) || !intIn(durationMinutes, 1, 10080) || !intIn(timeValueEuroHour, 0, 100)) throw Error('Paramètres de comparaison invalides');
    return spots.map(spot => {
      const priceCents = costOfParking(spot, durationMinutes);
      const roundtrip = spot.walkMinutes * 2;
      const walkEquivalentCents = Math.round(roundtrip * timeValueEuroHour * 100 / 60);
      return { ...spot, priceCents, walkEquivalentCents, scoreCents: priceCents + walkEquivalentCents };
    }).sort((a, b) => a.scoreCents - b.scoreCents || a.priceCents - b.priceCents || a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name, 'fr'));
  }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function icsTime(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function calendarFile({ title, location = '', start, end }) {
    if (!boundedText(title, 100) || !optionalText(location, 180) || !(start instanceof Date) || !(end instanceof Date) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw Error('Événement calendrier incorrect');
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Louvre//ParkWise//FR','CALSCALE:GREGORIAN','BEGIN:VEVENT', 'UID:parkwise-' + start.getTime() + '@louvre.local', 'DTSTAMP:' + icsTime(new Date()), 'DTSTART:' + icsTime(start), 'DTEND:' + icsTime(end), 'SUMMARY:' + icsEscape(title), 'LOCATION:' + icsEscape(location), 'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  }
  return Object.freeze({ eurosToCents, validateSpot, validateState, defaultState, costOfParking, compare, calendarFile, MAX_SPOTS });
});