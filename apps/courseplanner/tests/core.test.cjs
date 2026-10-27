// Tests métier de CoursePlanner : durées, volume horaire, calendrier des séances, export .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const session = (n, minutes, activities = []) => ({ id: `sess-000${n}`, title: `Séance ${n}`, minutes, objectives: '', activities });
// Cours du lundi 9:00 et du jeudi 14:00, du lundi 7 septembre au vendredi 2 octobre 2026, fermé du 21 au 25 septembre.
function course(extra = {}) {
  return C.makeCourse({
    id: 'course-0001', name: 'Finance', plannedMinutes: '12h',
    calendar: { start: '2026-09-07', end: '2026-10-02', slots: [{ weekday: 4, time: '14:00' }, { weekday: 1, time: '09:00' }], closures: [{ id: 'clos-0001', from: '2026-09-21', to: '2026-09-25', label: 'Pause' }] },
    sessions: [session(1, '3h', [{ id: 'act-0001', label: 'Cours', minutes: '1h30' }, { id: 'act-0002', label: 'Cas', minutes: '45 min' }]), session(2, '3h'), session(3, '2h30'), session(4, '1:30')],
    ...extra,
  });
}

test('durées saisies : formats acceptés et refusés', () => {
  assert.equal(C.parseDuration('1h30'), 90);
  assert.equal(C.parseDuration('1 h 30'), 90);
  assert.equal(C.parseDuration('1:05'), 65);
  assert.equal(C.parseDuration('2h'), 120);
  assert.equal(C.parseDuration('45 min'), 45);
  assert.equal(C.parseDuration('1,5'), 90);
  assert.equal(C.parseDuration('0.25'), 15);
  assert.equal(C.parseDuration(75), 75);
  assert.throws(() => C.parseDuration('1,01'), /^Error: err\.durationMinutes$/); // 60,6 min
  for (const bad of ['', '0', 'abc', '1h75', '-2', '13h', '2h30x']) assert.throws(() => C.parseDuration(bad), /err\.duration\|\{"max":12\}/, bad);
  assert.equal(C.parseDuration('300', C.LIMITS.courseMinutes, 'err.volume'), 18000);
});

test('jours civils : validation, jours de la semaine, passage à l\'heure d\'hiver', () => {
  assert.equal(C.isoWeekday('2026-09-07'), 1);
  assert.equal(C.isoWeekday('2026-09-13'), 7);
  assert.equal(C.addDays('2026-10-24', 2), '2026-10-26'); // changement d'heure le 25 octobre : sans effet
  assert.equal(C.diffDays('2026-02-27', '2026-03-01'), 2);
  assert.equal(C.parseDay('2026-02-29'), null);
  assert.equal(C.parseDay('2026-13-01'), null);
});

test('volume horaire : total des séances face au volume prévu, activités face à la durée', () => {
  const c = course();
  const tt = C.totals(c);
  assert.equal(tt.total, 600); // 3 h + 3 h + 2 h 30 + 1 h 30
  assert.equal(tt.planned, 720);
  assert.equal(tt.diff, -120);
  assert.equal(tt.status, 'under');
  assert.deepEqual(tt.sessions[0], { id: 'sess-0001', minutes: 180, activities: 135, gap: -45 });
  assert.equal(C.totals(course({ plannedMinutes: '10h' })).status, 'exact');
  assert.equal(C.totals(course({ plannedMinutes: '9h' })).diff, 60);
});

test('calendrier : jours de cours successifs, fermetures sautées, séances sans date signalées', () => {
  const plan = C.schedule(course());
  assert.deepEqual(plan.rows.map((r) => r.date), ['2026-09-07', '2026-09-10', '2026-09-14', '2026-09-17']);
  assert.deepEqual(plan.rows.map((r) => `${r.start}-${r.end}`), ['09:00-12:00', '14:00-17:00', '09:00-11:30', '14:00-15:30']);
  assert.equal(plan.available, 6); // 7, 10, 14, 17 sept., 28 sept., 1er oct. (21 et 24 fermés)
  assert.equal(plan.spare, 2);
  assert.deepEqual(plan.skipped, ['2026-09-21', '2026-09-24']);
  const many = course({ sessions: Array.from({ length: 8 }, (_, i) => session(i + 1, '1h')) });
  const p2 = C.schedule(many);
  assert.deepEqual(p2.rows.slice(4, 6).map((r) => r.date), ['2026-09-28', '2026-10-01']); // reprise après la pause
  assert.equal(p2.unscheduled, 2);
  assert.equal(p2.rows[7].date, null);
  // Séance qui finit après minuit : fin le lendemain.
  const late = course({ calendar: { start: '2026-09-07', end: '2026-09-30', slots: [{ weekday: 1, time: '22:30' }], closures: [] }, sessions: [session(1, '2h')] });
  assert.deepEqual(C.schedule(late).rows[0], { id: 'sess-0001', index: 1, date: '2026-09-07', start: '22:30', end: '00:30', endDate: '2026-09-08' });
  // Aucun jour de cours choisi.
  assert.equal(C.schedule(course({ calendar: { start: '2026-09-07', end: '2026-09-30', slots: [], closures: [] } })).unscheduled, 4);
});

test('saisies refusées : période, heure, fermeture, titres, limites', () => {
  const cal = { start: '2026-09-07', end: '2026-10-02', slots: [], closures: [] };
  assert.throws(() => C.makeCalendar({ ...cal, end: '2026-09-01' }), /err\.periodOrder/);
  assert.throws(() => C.makeCalendar({ ...cal, start: '2026-02-30' }), /err\.start/);
  assert.throws(() => C.makeCalendar({ ...cal, end: '2030-01-01' }), /err\.periodLong/);
  assert.throws(() => C.makeCalendar({ ...cal, slots: [{ weekday: 1, time: '24:00' }] }), /err\.time/);
  assert.throws(() => C.makeCalendar({ ...cal, slots: [{ weekday: 1, time: '09:00' }, { weekday: 1, time: '10:00' }] }), /err\.backup/);
  assert.throws(() => C.makeClosure({ id: 'clos-0001', from: '2026-09-10', to: '2026-09-01', label: '' }), /err\.closureOrder/);
  assert.equal(C.makeClosure({ id: 'clos-0001', from: '2026-09-10', to: '', label: ' Férié ' }).to, '2026-09-10'); // jour isolé
  assert.throws(() => C.makeSession({ id: 'sess-0001', title: ' ', minutes: '1h' }), /err\.sessionTitle/);
  assert.throws(() => C.makeActivity({ id: 'act-0001', label: 'x', minutes: '0' }), /err\.duration/);
  assert.throws(() => course({ name: '' }), /err\.courseName/);
  assert.throws(() => course({ plannedMinutes: 'beaucoup' }), /err\.volume/);
  assert.throws(() => C.makeSession({ id: 'sess-0001', title: 'x', minutes: '1h', activities: Array.from({ length: 21 }, (_, i) => ({ id: `act-${1000 + i}`, label: 'a', minutes: 5 })) }), /err\.tooManyActivities/);
});

test('export .ics : un événement par séance datée, heures locales, textes échappés', () => {
  const c = course({ sessions: [session(1, '3h', [{ id: 'act-0001', label: 'Cours; partie 1', minutes: 90 }]), ...Array.from({ length: 6 }, (_, i) => session(i + 2, '1h'))] });
  const ics = C.toICS(c, '20260901T080000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 6); // 7 séances, 6 jours disponibles
  assert.ok(ics.includes('DTSTART:20260907T090000\r\nDTEND:20260907T120000'));
  assert.ok(ics.includes('SUMMARY:Finance — Séance 1 : Séance 1'));
  assert.ok(ics.includes('DESCRIPTION:• Cours\\; partie 1 (90 min)'));
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.throws(() => C.toICS(c, 'hier'), /err\.stamp/);
  const custom = C.toICS(c, '20260901T080000Z', { summary: (co, s, n) => `${co.name} — Session ${n}`, description: () => '' });
  assert.ok(custom.includes('SUMMARY:Finance — Session 2') && !custom.includes('DESCRIPTION'));
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const c = course();
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([c]))), [c]);
  const ok = JSON.parse(C.backup([c]));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: true }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, courses: [c, c] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, courses: [{ ...ok.courses[0], plannedMinutes: '12h' }] }), /err\.backup/);
  const bad = JSON.parse(JSON.stringify(ok)); bad.courses[0].sessions[0].activities[0].minutes = -5;
  assert.throws(() => C.validateBackup(bad), /err\.duration/);
  const bad2 = JSON.parse(JSON.stringify(ok)); bad2.courses[0].calendar.slots[0].hack = 1;
  assert.throws(() => C.validateBackup(bad2), /err\.backup/);
  const bad3 = JSON.parse(JSON.stringify(ok)); bad3.courses[0].calendar.closures[0].from = '2026-02-31';
  assert.throws(() => C.validateBackup(bad3), /err\.date/);
  assert.throws(() => C.validateBackup({ ...ok, courses: Array.from({ length: 31 }, () => ok.courses[0]) }), /err\.tooManyCourses/);
});
