// Tests métier de ParkingSpotMemory : durées, heure de fin, minuterie, GPS (distance, cap), photo, historique, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const NOW = Date.UTC(2026, 9, 27, 8, 0, 0); // 27/10/2026 09:00 à Paris (heure d'hiver)
const MIN = 60000;
const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(100);
const base = (over = {}) => C.makeSession({ place: 'Gare', level: '-2', zone: 'B', spot: '214', landmarks: 'près de l\'ascenseur', ...over }, over.id || 'ses-00001', NOW);

test('durées saisies : minutes, « 1h30 », « 1:30 », bornes', () => {
  assert.equal(C.parseDuration('90'), 90);
  assert.equal(C.parseDuration('1h30'), 90);
  assert.equal(C.parseDuration('1 h 30'), 90);
  assert.equal(C.parseDuration('2h'), 120);
  assert.equal(C.parseDuration('1:05'), 65);
  assert.equal(C.parseDuration('45 min'), 45);
  for (const bad of ['0', '', '1h75', 'abc', '10081', '-5', '1.5']) assert.throws(() => C.parseDuration(bad), /err\.duration\|\{"max":10080\}/);
});

test('heure de fin : prochaine occurrence en heure locale, le lendemain si passée', () => {
  assert.equal(C.endFromClock(NOW, '10:30'), Date.UTC(2026, 9, 27, 9, 30)); // 10:30 à Paris = 09:30 UTC
  assert.equal(C.endFromClock(NOW, '08:00'), Date.UTC(2026, 9, 28, 7, 0)); // déjà passée : demain
  assert.equal(C.endFromClock(NOW, '09:00'), Date.UTC(2026, 9, 28, 8, 0)); // exactement maintenant : demain
  for (const bad of ['24:00', '9:00', 'x', '']) assert.throws(() => C.endFromClock(NOW, bad), /err\.clock/);
});

test('emplacement : au moins un indice, longueurs, photo et position valides', () => {
  const s = base();
  assert.equal(s.startedMs, NOW); assert.equal(s.endMs, null); assert.equal(s.lat, null);
  assert.throws(() => C.makeSession({}, 'ses-00002', NOW), /err\.empty/);
  assert.deepEqual(C.makeSession({ photo: PHOTO }, 'ses-00002', NOW).photo, PHOTO); // une photo seule suffit
  assert.throws(() => base({ level: 'x'.repeat(21) }), /err\.shortLong\|\{"max":20\}/);
  assert.throws(() => base({ photo: 'data:image/svg+xml;base64,AAAA' }), /err\.photo/);
  assert.throws(() => base({ photo: 'data:image/jpeg;base64,' + 'A'.repeat(C.MAX_PHOTO) }), /err\.photo/);
  assert.throws(() => base({ lat: 91, lon: 0 }), /err\.coords/);
  assert.throws(() => base({ lon: 2 }), /err\.coords/);
  const g = base({ lat: 44.8378471, lon: -0.5791802, accuracy: 12.6 });
  assert.deepEqual([g.lat, g.lon, g.accuracy], [44.837847, -0.57918, 13]);
  assert.deepEqual(C.fitSize(4000, 3000, 640), { width: 640, height: 480 });
  assert.deepEqual(C.fitSize(300, 200, 640), { width: 300, height: 200 }); // jamais agrandie
  assert.deepEqual(C.fitSize(1080, 1920, 640), { width: 360, height: 640 });
});

test('minuterie : réglage, prolongation, alerte avant la fin, dépassement', () => {
  let s = C.setTimer(base(), NOW + 90 * MIN, NOW);
  assert.deepEqual(C.timerState(s, NOW, 10), { state: 'running', remainingMs: 90 * MIN });
  assert.equal(C.timerState(s, NOW + 80 * MIN, 10).state, 'warn');
  assert.equal(C.timerState(s, NOW + 90 * MIN, 10).state, 'expired');
  assert.equal(C.timerState(s, NOW + 95 * MIN, 10).remainingMs, -5 * MIN);
  assert.equal(C.extend(s, 15, NOW).endMs, NOW + 105 * MIN); // depuis la fin prévue
  assert.equal(C.extend(s, 15, NOW + 100 * MIN).endMs, NOW + 115 * MIN); // dépassée : depuis maintenant
  assert.throws(() => C.setTimer(s, NOW - 1, NOW), /err\.endPast/);
  assert.throws(() => C.setTimer(s, NOW + (10080 + 1) * MIN, NOW), /err\.duration/);
  assert.equal(C.clearTimer(s).endMs, null);
  assert.equal(C.timerState(C.clearTimer(s), NOW, 10).state, 'none');
  assert.deepEqual(C.splitMs(90061000), { d: 1, h: 1, m: 1, s: 1 });
});

test('retrouver le véhicule : distance (haversine), cap et point cardinal', () => {
  const car = C.makePosition(48.8584, 2.2945, 10); // tour Eiffel
  const here = C.makePosition(48.8606, 2.3376, 15); // Louvre (pyramide)
  const d = C.distanceM(here, car);
  assert.ok(d > 3100 && d < 3250, String(d)); // ~3,17 km
  const g = C.guide(here, car);
  assert.equal(g.dir, 'w'); assert.ok(g.bearing > 255 && g.bearing < 270, String(g.bearing));
  assert.equal(g.uncertaintyM, 25); assert.equal(g.close, false);
  assert.equal(C.bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0);
  assert.equal(C.bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 90);
  assert.equal(C.cardinal(359), 'n'); assert.equal(C.cardinal(135), 'se'); assert.equal(C.cardinal(225), 'sw');
  const near = C.guide(C.makePosition(48.85841, 2.29451, 8), car);
  assert.equal(near.close, true); assert.equal(near.distanceM, 1);
  assert.equal(C.guide(here, { lat: null }), null);
  assert.equal(C.mapLink(48.8584, 2.2945), 'https://www.openstreetmap.org/?mlat=48.858400&mlon=2.294500#map=18/48.858400/2.294500');
});

test('historique : limite, photos des anciens retirées, statistiques et habitudes', () => {
  let h = [];
  for (let i = 0; i < 8; i += 1) h = C.addToHistory(h, C.endSession(base({ id: `ses-1000${i}`, photo: PHOTO, place: i % 2 ? 'Gare' : 'Centre', spot: String(i), startedMs: NOW + i * 1000 * MIN }), NOW + i * 1000 * MIN + (60 + i) * MIN));
  assert.equal(h.length, 8);
  assert.deepEqual(h.map((x) => !!x.photo), [true, true, true, true, true, false, false, false]);
  assert.equal(h[0].spot, '7');
  const st = C.historyStats(h);
  assert.equal(st.count, 8); assert.equal(st.avgMinutes, 64); // (60+…+67)/8 = 63,5 -> 64
  assert.deepEqual(st.places, [{ place: 'Centre', count: 4 }, { place: 'Gare', count: 4 }]);
  assert.deepEqual(C.lastAt(h, ' gare '), { place: 'Gare', level: '-2', zone: 'B', spot: '7', landmarks: 'près de l\'ascenseur', startedMs: NOW + 7000 * MIN });
  assert.equal(C.lastAt(h, 'Inconnu'), null);
  let big = [];
  for (let i = 0; i < 105; i += 1) big = C.addToHistory(big, C.endSession(base({ id: `ses-2${String(i).padStart(4, '0')}` }), NOW + MIN));
  assert.equal(big.length, C.MAX_HISTORY);
  assert.throws(() => C.endSession(base(), NOW - 1), /err\.time/);
});

test('rappel .ics : instant UTC de fin, alarme N minutes avant, position', () => {
  const s = C.setTimer(base({ lat: 44.837847, lon: -0.57918, accuracy: 5 }), NOW + 90 * MIN, NOW);
  const ics = C.toICS(s, NOW, 10, 'Fin du stationnement', 'Gare, niveau -2; place 214');
  assert.ok(ics.includes('DTSTART:20261027T093000Z\r\n'));
  assert.ok(ics.includes('TRIGGER:-PT10M\r\n'));
  assert.ok(ics.includes('GEO:44.837847;-0.579180\r\n'));
  assert.ok(ics.includes('DESCRIPTION:Gare\\, niveau -2\\; place 214\r\n'));
  assert.throws(() => C.toICS(base(), NOW, 10, 'x', 'y'), /err\.noTimer/);
  assert.throws(() => C.toICS(s, NOW, 121, 'x', 'y'), /err\.warn/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const cur = C.setTimer(base({ id: 'ses-00010', lat: 44.8, lon: -0.5, accuracy: 7, photo: PHOTO }), NOW + 60 * MIN, NOW);
  const hist = [C.endSession(base({ id: 'ses-00011', startedMs: NOW - 300 * MIN }), NOW - 200 * MIN)];
  const data = { settings: { warnMinutes: 15 }, current: cur, history: hist };
  const back = JSON.parse(C.backup(data));
  assert.equal(back.app, 'parkingspotmemory');
  assert.deepEqual(C.validateData(back), data);
  const ok = () => JSON.parse(C.backup(data));
  assert.throws(() => C.validateData({ ...ok(), app: 'parkwise' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok(), more: 1 }), /err\.backup/);
  const b1 = ok(); b1.current.lat = null; assert.throws(() => C.validateData(b1), /err\.backup/); // lat sans lon
  const b2 = ok(); b2.history[0].endedMs = b2.history[0].startedMs - 1; assert.throws(() => C.validateData(b2), /err\.backup/);
  const b3 = ok(); b3.current.photo = 'javascript:alert(1)'; assert.throws(() => C.validateData(b3), /err\.photo/);
  const b4 = ok(); b4.settings.warnMinutes = 500; assert.throws(() => C.validateData(b4), /err\.warn/);
  const b5 = ok(); b5.history[0].id = b5.current.id; assert.throws(() => C.validateData(b5), /err\.backup/);
  const b6 = ok(); b6.current.endMs = b6.current.startedMs; assert.throws(() => C.validateData(b6), /err\.endBeforeStart/);
  const b7 = ok(); b7.current.startedMs = 1.5; assert.throws(() => C.validateData(b7), /err\.time/);
  const b8 = ok(); b8.history = Array.from({ length: 6 }, (_, i) => ({ ...b8.history[0], id: `ses-3000${i}`, photo: PHOTO })); assert.throws(() => C.validateData(b8), /err\.backup/);
  // Une ancienne entrée dont la photo a été retirée reste valide, même sans autre indice.
  const b9 = ok(); b9.history[0] = { ...b9.history[0], place: '', level: '', zone: '', spot: '', landmarks: '', photo: '' }; assert.equal(C.validateData(b9).history.length, 1);
  assert.deepEqual(C.validateData({ app: 'parkingspotmemory', version: 1, ...C.emptyData() }), C.emptyData());
});
