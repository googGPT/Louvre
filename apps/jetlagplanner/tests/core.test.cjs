// Tests métier de JetLagPlanner : fuseaux réels (heure d'été), décalage progressif, sens, export .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const base = { name: 'Essai', homeZone: 'Europe/Paris', destZone: 'Asia/Tokyo', departure: '2026-11-20', bedtime: '23:00', wake: '07:00', stepMin: '60', direction: 'auto', before: '3', after: '5' };
const plan = (over = {}, id = 'plan-0001') => C.makePlan({ ...base, ...over }, id);
const hm = (m) => C.clock(m);

test('heures saisies et fuseaux IANA validés', () => {
  assert.equal(C.parseClock('23:00'), 1380);
  assert.equal(C.parseClock('7:30'), 450);
  for (const bad of ['24:00', '7h30', '', '12:60']) assert.throws(() => C.parseClock(bad), /^Error: err\.clock/);
  assert.equal(C.validZone(' Asia/Tokyo '), 'Asia/Tokyo');
  for (const bad of ['Mars/Olympus', 'paris', '', '../etc']) assert.throws(() => C.validZone(bad), /err\.zone/);
});

test('décalage réel au jour du départ, heure d\'été comprise', () => {
  assert.equal(C.zoneDiff(plan({ departure: '2026-01-15' })), 480); // Paris (UTC+1) -> Tokyo (UTC+9)
  assert.equal(C.zoneDiff(plan({ departure: '2026-07-15' })), 420); // Paris à l'heure d'été (UTC+2)
  // Entre le 8 et le 29 mars 2026, New York est déjà à l'heure d'été, pas Paris : 5 h au lieu de 6.
  assert.equal(C.zoneDiff(plan({ destZone: 'America/New_York', departure: '2026-03-10' })), -300);
  assert.equal(C.zoneDiff(plan({ destZone: 'America/New_York', departure: '2026-04-10' })), -360);
  assert.equal(C.zoneDiff(plan({ destZone: 'Asia/Kolkata', departure: '2026-01-15' })), 270); // demi-heure
  assert.equal(C.zoneDiff(plan({ destZone: 'Europe/Paris' })), 0);
});

test('sens du décalage : le plus court, avancer ou retarder', () => {
  assert.equal(C.totalShift(480, 'auto'), 480);
  assert.equal(C.totalShift(480, 'delay'), -960);
  assert.equal(C.totalShift(-360, 'auto'), -360);
  assert.equal(C.totalShift(-360, 'advance'), 1080);
  assert.equal(C.totalShift(720, 'auto'), 720); // 12 h pile : on avance
  assert.equal(C.totalShift(-720, 'auto'), 720);
  assert.equal(C.totalShift(0, 'delay'), 0);
});

test('programme vers l\'est : 1 h par jour, horaires dans les deux fuseaux', () => {
  const s = C.schedule(plan());
  assert.equal(s.diff, 480); assert.equal(s.direction, 'advance'); assert.equal(s.neededDays, 8);
  assert.equal(s.days.length, 9);
  const d = Object.fromEntries(s.days.map((x) => [x.k, x]));
  assert.equal(d[-3].date, '2026-11-17');
  assert.deepEqual([hm(d[-3].bedHome), hm(d[-3].wakeHome), hm(d[-3].bedDest), hm(d[-3].wakeDest)], ['22:00', '06:00', '06:00', '14:00']);
  assert.deepEqual([hm(d[0].bedHome), hm(d[0].bedDest), d[0].remaining, d[0].where], ['19:00', '03:00', 240, 'home']);
  assert.equal(d[1].where, 'dest');
  assert.equal(s.reachedOn, 4);
  assert.deepEqual([hm(d[4].bedDest), hm(d[4].wakeDest), d[4].remaining], ['23:00', '07:00', 0]);
  assert.deepEqual([hm(d[5].bedDest), hm(d[5].wakeDest)], ['23:00', '07:00']); // une fois atteint, l'horaire reste stable
  // Les instants sont cohérents : 8 h de sommeil.
  assert.equal(d[2].wakeMs - d[2].bedMs, 8 * 3600000);
});

test('programme vers l\'ouest avec demi-heures, et sens imposé', () => {
  const s = C.schedule(plan({ destZone: 'America/New_York', departure: '2026-03-10', stepMin: '30', before: '2', after: '10' }));
  assert.equal(s.shift, -300); assert.equal(s.neededDays, 10); assert.equal(s.reachedOn, 7);
  assert.deepEqual(s.days.slice(0, 3).map((x) => hm(x.bedHome)), ['23:30', '00:00', '00:30']); // on se couche plus tard
  assert.equal(hm(s.days[s.days.length - 1].bedDest), '23:00');
  // Sens imposé « avancer » vers l'ouest : 19 h à rattraper, non atteint en 13 jours à 30 min.
  const a = C.schedule(plan({ destZone: 'America/New_York', departure: '2026-03-10', stepMin: '30', before: '2', after: '10', direction: 'advance' }));
  assert.equal(a.shift, 1140); assert.equal(a.reachedOn, null); assert.equal(a.remainingEnd, 1140 - 13 * 30);
  assert.equal(a.neededDays, 38);
});

test('changements d\'heure pendant le plan : chaque fuseau garde son heure murale', () => {
  // Paris passe à l'heure d'été le 29 mars 2026 ; décalage 0 min/jour : 23:00 reste 23:00 à Paris.
  const s = C.schedule(plan({ destZone: 'America/New_York', departure: '2026-03-31', stepMin: '0', before: '4', after: '2' }));
  assert.equal(s.neededDays, null); assert.equal(s.reachedOn, null);
  const before = s.days.filter((x) => x.k <= 0);
  assert.ok(before.every((x) => hm(x.bedHome) === '23:00'));
  assert.deepEqual(before.map((x) => hm(x.bedDest)), ['18:00', '18:00', '17:00', '17:00', '17:00']); // NY déjà à l'heure d'été, Paris à partir du 29
  assert.equal(before[0].wakeMs - before[0].bedMs, 8 * 3600000);
  // Même fuseau : rien à décaler, horaire atteint dès le premier jour.
  const same = C.schedule(plan({ destZone: 'Europe/Paris' }));
  assert.equal(same.direction, 'none'); assert.equal(same.reachedOn, -3); assert.equal(same.neededDays, 0);
});

test('coucher après minuit : la nuit tombe le lendemain sur le calendrier', () => {
  const s = C.schedule(plan({ bedtime: '00:30', wake: '08:00', destZone: 'Europe/London', departure: '2026-06-10', before: '0', after: '1' }));
  assert.equal(s.diff, -60);
  assert.equal(C.dayAt(s.days[0].bedMs, 'Europe/Paris'), '2026-06-11');
  assert.equal(hm(s.days[0].bedHome), '01:30');
});

test('saisies refusées', () => {
  assert.throws(() => plan({ name: ' ' }), /err\.nameRequired/);
  assert.throws(() => plan({ name: 'x'.repeat(61) }), /err\.nameLong\|\{"max":60\}/);
  assert.throws(() => plan({ stepMin: '181' }), /err\.step\|\{"min":0,"max":180\}/);
  assert.throws(() => plan({ stepMin: '-5' }), /err\.step/);
  assert.throws(() => plan({ stepMin: '1.5' }), /err\.step/);
  assert.throws(() => plan({ before: '8' }), /err\.before/);
  assert.throws(() => plan({ after: '15' }), /err\.after/);
  assert.throws(() => plan({ departure: '2026-02-30' }), /err\.date/);
  assert.throws(() => plan({ wake: '01:00' }), /err\.sleepLength/); // 2 h de nuit
  assert.throws(() => plan({ wake: '23:30' }), /err\.sleepLength/); // 30 min… ou 24 h
  assert.throws(() => plan({ direction: 'north' }), /err\.direction/);
  assert.throws(() => plan({}, 'x'), /err\.id/);
  assert.equal(plan({ stepMin: '0' }).stepMin, 0);
});

test('export agenda .ics : une nuit par jour, en UTC, texte échappé et plié', () => {
  const p = plan({ before: '1', after: '1', name: 'Tokyo' });
  const s = C.schedule(p);
  const ics = C.toICS(p, s, '20261027T120000Z', { summary: (d) => `Sommeil, J${d.k}; « nuit »`, description: (d) => `Départ ${hm(d.bedHome)}\nDestination ${hm(d.bedDest)} ` + 'é'.repeat(60) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  // J-1 (19 nov.), un jour d'ajustement : coucher 22:00 à Paris (UTC+1) = 21:00 UTC, lever 06:00 = 05:00 UTC.
  assert.ok(ics.includes('DTSTART:20261119T210000Z\r\nDTEND:20261120T050000Z'));
  assert.ok(ics.includes('SUMMARY:Sommeil\\, J-1\\; « nuit »'));
  assert.ok(ics.includes('\\nDestination'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.throws(() => C.toICS(p, s, 'demain', { summary: () => '', description: () => '' }), /err\.stamp/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const plans = [plan(), plan({ name: 'Retour', homeZone: 'Asia/Tokyo', destZone: 'Europe/Paris', stepMin: '0' }, 'plan-0002')];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(plans))), plans);
  const ok = { app: 'jetlagplanner', version: 1, plans };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, plans: [{ ...plans[0], extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, plans: [{ ...plans[0], homeZone: 'Nowhere/City' }] }), /err\.zone/);
  assert.throws(() => C.validateBackup({ ...ok, plans: [{ ...plans[0], bedtime: '23:00' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, plans: [{ ...plans[0], stepMin: 500 }] }), /err\.step/);
  assert.throws(() => C.validateBackup({ ...ok, plans: [plans[0], plans[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, plans: Array(31).fill(plans[0]) }), /err\.tooManyPlans/);
  assert.throws(() => C.validateBackup([]), /err\.backup/);
});
