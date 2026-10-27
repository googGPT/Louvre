// Tests métier de FlightTimeMath : fuseaux, changements d'heure, durées, J+1, correspondances, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `seg-${String(++n).padStart(6, '0')}`;
const seg = (from, fromZone, depart, to, toZone, arrive, flight = '') => C.makeSegment({ flight, from, fromZone, depart, to, toZone, arrive }, id());
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
function trip(min, ...segments) { const t = C.makeTrip('Test', id(), min); t.segments = segments; return t; }

test('heure locale + fuseau IANA -> instant UTC', () => {
  assert.equal(iso(C.toInstant('2026-07-01T12:00', 'Europe/Paris').ms), '2026-07-01T10:00'); // heure d'été UTC+2
  assert.equal(iso(C.toInstant('2026-12-01T12:00', 'Europe/Paris').ms), '2026-12-01T11:00'); // heure d'hiver UTC+1
  assert.equal(iso(C.toInstant('2026-07-01T12:00', 'Asia/Kolkata').ms), '2026-07-01T06:30'); // UTC+5:30
  assert.equal(iso(C.toInstant('2026-07-01T12:00', 'Asia/Kathmandu').ms), '2026-07-01T06:15'); // UTC+5:45
  assert.equal(iso(C.toInstant('2026-07-01T12:00', 'UTC').ms), '2026-07-01T12:00');
  assert.equal(C.validZone('europe/paris'), 'Europe/Paris');
  for (const bad of ['Mars/Olympus', 'Paris', '', 'Europe/Paris; x', 42]) assert.throws(() => C.validZone(bad), /^Error: err\.zone$/);
});

test('changements d\'heure : trou du printemps refusé, heure répétée de l\'automne signalée', () => {
  assert.throws(() => C.toInstant('2026-03-29T02:30', 'Europe/Paris'), /^Error: err\.nonexistent\|\{"time":"02:30"\}$/);
  assert.throws(() => C.toInstant('2026-03-08T02:15', 'America/New_York'), /err\.nonexistent/);
  const fall = C.toInstant('2026-10-25T02:30', 'Europe/Paris');
  assert.equal(fall.ambiguous, true);
  assert.equal(iso(fall.ms), '2026-10-25T00:30'); // première occurrence (encore UTC+2)
  assert.equal(C.toInstant('2026-10-25T03:30', 'Europe/Paris').ambiguous, false);
  const ny = C.toInstant('2026-11-01T01:30', 'America/New_York');
  assert.equal(ny.ambiguous, true);
  assert.equal(iso(ny.ms), '2026-11-01T05:30');
});

test('durée de vol pendant un changement d\'heure : calculée sur les instants réels', () => {
  // Nuit du passage à l'heure d'hiver : 01:00 -> 04:00 heure de Paris = 4 h réelles, pas 3.
  const s = C.analyzeSegment(seg('Paris', 'Europe/Paris', '2026-10-25T01:00', 'Paris', 'Europe/Paris', '2026-10-25T04:00'));
  assert.equal(s.durationMin, 240);
  assert.equal(s.dstDuring, true);
  // Printemps : 01:00 -> 04:00 = 2 h réelles.
  assert.equal(C.analyzeSegment(seg('Paris', 'Europe/Paris', '2026-03-29T01:00', 'Paris', 'Europe/Paris', '2026-03-29T04:00')).durationMin, 120);
});

test('vol de nuit : J+1, décalage horaire et durée', () => {
  const s = C.analyzeSegment(seg('Paris (CDG)', 'Europe/Paris', '2026-11-10T21:30', 'Dubaï (DXB)', 'Asia/Dubai', '2026-11-11T06:35', 'XY 101'));
  assert.equal(s.durationMin, 365); // 6 h 05
  assert.equal(s.dayShift, 1);
  assert.equal(s.zoneShiftMin, 180); // UTC+1 -> UTC+4
  assert.deepEqual(s.dep, { date: '2026-11-10', time: '21:30', offset: 60 });
  assert.deepEqual(s.arr, { date: '2026-11-11', time: '06:35', offset: 240 });
  // Vers l'ouest, on peut « arriver avant de partir » à l'heure locale : J-1.
  const w = C.analyzeSegment(seg('Tokyo', 'Asia/Tokyo', '2026-06-10T01:00', 'Honolulu', 'Pacific/Honolulu', '2026-06-09T13:00'));
  assert.equal(w.dayShift, -1);
  assert.equal(w.durationMin, 7 * 60); // 16:00Z -> 23:00Z
});

test('correspondances : seuil saisi, trop courte, impossible, changement d\'aéroport, nuit', () => {
  const a = seg('Paris', 'Europe/Paris', '2026-11-10T21:30', 'Dubaï', 'Asia/Dubai', '2026-11-11T06:35');
  const b = seg('Dubaï', 'Asia/Dubai', '2026-11-11T07:20', 'Singapour', 'Asia/Singapore', '2026-11-11T18:40');
  let r = C.analyze(trip(60, b, a)); // ordre de saisie quelconque : trié par départ
  assert.deepEqual(r.segments.map((s) => s.to), ['Dubaï', 'Singapour']);
  assert.equal(r.connections.length, 1);
  assert.equal(r.connections[0].minutes, 45);
  assert.equal(r.connections[0].status, 'short');
  assert.equal(r.connections[0].placeChange, false);
  assert.deepEqual({ ...r.totals }, { count: 2, journeyMin: 365 + 45 + 440, airMin: 365 + 440, groundMin: 45, dayShift: 1, zoneShiftMin: 420, short: 1, overlap: 0, placeChange: 0 });
  assert.equal(C.analyze(trip(45, a, b)).connections[0].status, 'ok'); // égal au seuil : accepté
  assert.equal(C.analyze(trip(null, a, b)).connections[0].status, 'ok'); // pas de seuil : pas de contrôle
  const early = seg('Dubai', 'Asia/Dubai', '2026-11-11T06:00', 'Doha', 'Asia/Qatar', '2026-11-11T06:10');
  r = C.analyze(trip(60, a, early));
  assert.equal(r.connections[0].status, 'overlap');
  assert.equal(r.connections[0].minutes, -35);
  assert.equal(r.connections[0].placeChange, true); // « Dubaï » ≠ « Dubai »
  const night = seg('Dubaï', 'Asia/Dubai', '2026-11-12T02:00', 'Singapour', 'Asia/Singapore', '2026-11-12T13:20');
  const late = seg('Paris', 'Europe/Paris', '2026-11-11T14:00', 'Dubaï', 'Asia/Dubai', '2026-11-11T22:55');
  assert.equal(C.analyze(trip(60, late, night)).connections[0].overnight, true);
});

test('escale pendant un changement d\'heure', () => {
  const a = seg('Montréal', 'America/Toronto', '2026-10-31T20:00', 'New York', 'America/New_York', '2026-10-31T21:30');
  const b = seg('New York', 'America/New_York', '2026-11-01T06:00', 'Miami', 'America/New_York', '2026-11-01T09:00');
  const c = C.analyze(trip(90, a, b)).connections[0];
  assert.equal(c.minutes, 9 * 60 + 30); // 8 h 30 à l'horloge, 9 h 30 réelles
  assert.equal(c.dstDuring, true);
});

test('saisies refusées', () => {
  assert.throws(() => seg('A', 'Europe/Paris', '2026-11-10T10:00', 'B', 'Europe/Paris', '2026-11-10T10:00'), /^Error: err\.order$/);
  assert.throws(() => seg('A', 'Europe/Paris', '2026-11-10T10:00', 'B', 'Asia/Tokyo', '2026-11-10T17:00'), /err\.order/); // 17:00 Tokyo = 08:00Z < 09:00Z
  assert.throws(() => seg('A', 'UTC', '2026-11-10T10:00', 'B', 'UTC', '2026-11-12T00:00'), /^Error: err\.tooLong\|\{"max":36\}$/);
  assert.throws(() => seg('', 'UTC', '2026-11-10T10:00', 'B', 'UTC', '2026-11-10T11:00'), /err\.placeRequired/);
  assert.throws(() => seg('A', 'UTC', '2026-02-30T10:00', 'B', 'UTC', '2026-03-01T11:00'), /err\.datetime/);
  assert.throws(() => seg('A', 'UTC', '2026-11-10 10:00', 'B', 'UTC', '2026-11-10T11:00'), /err\.datetime/);
  assert.throws(() => seg('A', 'UTC', '2026-11-10T24:00', 'B', 'UTC', '2026-11-11T11:00'), /err\.datetime/);
  assert.throws(() => seg('A'.repeat(61), 'UTC', '2026-11-10T10:00', 'B', 'UTC', '2026-11-10T11:00'), /err\.placeLong/);
  assert.throws(() => seg('A', 'UTC', '2026-11-10T10:00', 'B', 'UTC', '2026-11-10T11:00', 'X'.repeat(21)), /err\.flightLong/);
  assert.throws(() => C.makeSegment({ from: 'A', fromZone: 'UTC', depart: '2026-11-10T10:00', to: 'B', toZone: 'UTC', arrive: '2026-11-10T11:00' }, 'x'), /err\.id/);
});

test('seuil de correspondance : minutes ou h:mm, vide = aucun contrôle', () => {
  assert.equal(C.parseConnection('90'), 90);
  assert.equal(C.parseConnection('1:30'), 90);
  assert.equal(C.parseConnection('1h05'), 65);
  assert.equal(C.parseConnection(' '), null);
  assert.equal(C.parseConnection('0'), 0);
  for (const bad of ['-5', '1,5', 'abc', '1:75', '1441', '25:00']) assert.throws(() => C.parseConnection(bad), /^Error: err\.connection\|\{"max":1440\}$/);
  assert.throws(() => C.makeTrip('X', id(), 1.5), /err\.connection/);
});

test('export .ics : un événement par vol, horaires UTC, texte échappé et replié', () => {
  const a = seg('Paris, CDG', 'Europe/Paris', '2026-11-10T21:30', 'Dubaï', 'Asia/Dubai', '2026-11-11T06:35', 'XY 101');
  const b = seg('Dubaï', 'Asia/Dubai', '2026-11-11T07:20', 'Singapour', 'Asia/Singapore', '2026-11-11T18:40');
  const ics = C.toICS(trip(60, b, a), '20261027T080000Z', { summary: (s) => `Vol ${s.from} → ${s.to}`, describe: () => 'é'.repeat(60) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes('DTSTART:20261110T203000Z\r\nDTEND:20261111T023500Z'), ics);
  assert.ok(ics.includes('DTSTART:20261111T032000Z'));
  assert.ok(ics.includes('SUMMARY:Vol Paris\\, CDG → Dubaï'));
  assert.ok(ics.indexOf('20261110T203000Z') < ics.indexOf('20261111T032000Z')); // triés par départ
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.throws(() => C.toICS(trip(60), '20261027T080000Z'), /err\.noSegment/);
  assert.throws(() => C.toICS(trip(60, a), 'hier'), /err\.stamp/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const t = trip(60, seg('Paris', 'Europe/Paris', '2026-11-10T21:30', 'Dubaï', 'Asia/Dubai', '2026-11-11T06:35', 'XY 101'));
  t.name = 'Voyage';
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([t]))), [t]);
  const ok = { app: 'flighttimemath', version: 1, trips: [t] };
  assert.throws(() => C.validateBackup(null), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, app: 'worldmeet' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, segments: [{ ...t.segments[0], more: 1 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, segments: [{ ...t.segments[0], toZone: 'Nowhere/City' }] }] }), /err\.zone/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, segments: [{ ...t.segments[0], arrive: '2026-11-10T18:00' }] }] }), /err\.order/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, minConnection: -1 }] }), /err\.connection/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, segments: [t.segments[0], t.segments[0]] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [t, t] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: Array(31).fill(t) }), /err\.tooManyTrips/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, segments: Array(13).fill(t.segments[0]) }] }), /err\.tooManySegments/);
});
