// Tests métier de VolunteerRoster : saisies, contrôles d'affectation, affectation automatique déterministe, trous, planning, CSV, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const D = '2026-06-20';
const id = (p, n) => `${p}-${String(n).padStart(4, '0')}`;
const vol = (n, name, skills, maxHours, windows) => C.makeVolunteer({ name, skills, maxHours, availability: windows.map(([s, e, day = D]) => ({ day, start: s, end: e })) }, id('vol', n));
const shift = (n, post, start, end, need, skill = '', day = D) => C.makeShift({ post, day, start, end, need: String(need), skill }, id('shift', n));
function festival() {
  return {
    title: 'Fête du quartier',
    volunteers: [vol(1, 'Alice', 'secours', '6', [['08:00', '18:00']]), vol(2, 'Bruno', '', '4', [['08:00', '12:00']]), vol(3, 'Chloé', 'accueil', '8', [['12:00', '20:00']])],
    shifts: [shift(1, 'Accueil', '08:00', '12:00', 2), shift(2, 'Secours', '10:00', '14:00', 1, 'Secours'), shift(3, 'Accueil', '12:00', '16:00', 1), shift(4, 'Bar', '16:00', '20:00', 2)],
    assignments: [],
  };
}
const names = (state, shiftN) => state.assignments.filter((a) => a.shiftId === id('shift', shiftN)).map((a) => state.volunteers.find((v) => v.id === a.volunteerId).name);

test('saisies : heures, maximum, compétences, disponibilités fusionnées', () => {
  assert.equal(C.parseTime('08:30'), 510);
  for (const bad of ['8:30', '24:00', '12h', '']) assert.throws(() => C.parseTime(bad), /err\.time/);
  assert.equal(C.parseHours('6'), 360); assert.equal(C.parseHours('6:30'), 390); assert.equal(C.parseHours('2,5'), 150);
  assert.throws(() => C.parseHours('0'), /err\.hours/); assert.throws(() => C.parseHours('200'), /err\.hours/);
  assert.deepEqual(C.parseSkills('Accueil, secours; ACCUEIL'), ['Accueil', 'secours']);
  assert.deepEqual(C.mergeWindows([{ day: D, start: '10:00', end: '12:00' }, { day: D, start: '08:00', end: '10:00' }, { day: '2026-06-21', start: '09:00', end: '10:00' }]),
    [{ day: D, start: 480, end: 720 }, { day: '2026-06-21', start: 540, end: 600 }]);
  assert.throws(() => C.makeWindow({ day: D, start: '12:00', end: '12:00' }), /err\.range/);
  assert.throws(() => C.makeWindow({ day: '2026-02-30', start: '08:00', end: '09:00' }), /err\.day/);
  assert.throws(() => shift(9, 'X', '08:00', '09:00', 0), /err\.need/);
  assert.throws(() => shift(9, ' ', '08:00', '09:00', 1), /err\.postRequired/);
  assert.throws(() => C.makeVolunteer({ name: '', skills: '', maxHours: '4', availability: [] }, id('vol', 9)), /err\.nameRequired/);
});

test('contrôles : compétence (sans casse), disponibilité, chevauchement, doublon', () => {
  let s = festival();
  assert.equal(C.blocker(s, id('vol', 2), id('shift', 2)), 'skill');
  assert.equal(C.blocker(s, id('vol', 3), id('shift', 1)), 'unavailable');
  assert.equal(C.blocker(s, id('vol', 1), id('shift', 2)), null); // « secours » = « Secours »
  s = { ...s, assignments: C.assign(s, id('vol', 1), id('shift', 1)) };
  assert.equal(C.blocker(s, id('vol', 1), id('shift', 2)), 'overlap');
  assert.equal(C.blocker(s, id('vol', 1), id('shift', 1)), 'already');
});

test('contrôles : maximum d\'heures et créneau complet', () => {
  let s = festival();
  s = { ...s, assignments: C.assign(s, id('vol', 1), id('shift', 1)) };
  assert.equal(C.blocker(s, id('vol', 1), id('shift', 3)), 'hours'); // 4 h + 4 h > 6 h
  s = { ...s, assignments: C.assign(s, id('vol', 2), id('shift', 1)) };
  assert.equal(C.minutesOf(s, id('vol', 1)), 240);
  const extra = { ...s, volunteers: [...s.volunteers, vol(4, 'Dan', '', '10', [['08:00', '12:00']])] };
  assert.equal(C.blocker(extra, id('vol', 4), id('shift', 1)), 'full');
  assert.throws(() => C.assign(extra, id('vol', 4), id('shift', 1)), /err\.assign\.full/);
});

test('affectation automatique : déterministe, contraintes respectées, trous signalés', () => {
  const s = festival();
  const a = C.autoAssign(s), res = { ...s, assignments: a };
  assert.deepEqual(names(res, 1), ['Alice', 'Bruno']);
  assert.deepEqual(names(res, 2), []); // Alice déjà à l'accueil de 8 h à 12 h
  assert.deepEqual(names(res, 3), ['Chloé']); // Alice dépasserait son maximum de 6 h
  assert.deepEqual(names(res, 4), ['Chloé']);
  assert.ok(a.every((x) => x.locked === false));
  // Même entrée, même résultat, quel que soit l'ordre de saisie des bénévoles.
  assert.deepEqual(C.autoAssign({ ...s, volunteers: s.volunteers.slice().reverse() }).map((x) => x.shiftId + x.volunteerId).sort(), a.map((x) => x.shiftId + x.volunteerId).sort());
  const g = C.gaps(res);
  assert.equal(g.places, 2); assert.equal(g.shifts, 2);
  assert.deepEqual(g.rows.map((r) => [r.shift.post, r.missing, r.cause]), [['Secours', 1, 'short'], ['Bar', 1, 'short']]);
  // Un poste sans aucun candidat possible.
  const lone = { ...s, shifts: [...s.shifts, shift(5, 'Nuit', '21:00', '23:00', 1)] };
  assert.equal(C.gaps({ ...lone, assignments: C.autoAssign(lone) }).rows.find((r) => r.shift.post === 'Nuit').cause, 'nobody');
});

test('ajustement manuel : les affectations verrouillées sont gardées par le calcul automatique', () => {
  let s = festival();
  s = { ...s, assignments: C.assign(s, id('vol', 1), id('shift', 2), true) }; // Alice au secours, à la main
  const res = { ...s, assignments: C.autoAssign(s) };
  assert.deepEqual(names(res, 2), ['Alice']);
  assert.deepEqual(names(res, 1), ['Bruno']); // Alice ne peut plus faire l'accueil du matin
  assert.deepEqual(names(res, 3), ['Chloé']);
  const unlocked = { ...res, assignments: C.setLock(res, id('vol', 1), id('shift', 2), false) };
  assert.equal(unlocked.assignments.find((a) => a.shiftId === id('shift', 2)).locked, false);
  assert.equal(C.unassign(res, id('vol', 2), id('shift', 1)).length, res.assignments.length - 1);
});

test('planning par personne et nettoyage après modification', () => {
  const s = festival(), res = { ...s, assignments: C.autoAssign(s) };
  const p = C.personSchedule(res, id('vol', 3));
  assert.deepEqual(p.shifts.map((x) => x.post), ['Accueil', 'Bar']); assert.equal(p.minutes, 480);
  // Chloé n'est plus disponible le soir : son créneau au bar est retiré.
  const edited = { ...res, volunteers: res.volunteers.map((v) => (v.id === id('vol', 3) ? vol(3, 'Chloé', 'accueil', '8', [['12:00', '16:00']]) : v)) };
  const { state, removed } = C.prune(edited);
  assert.equal(removed, 1);
  assert.deepEqual(names(state, 4), []);
});

test('export CSV : une ligne par créneau, manquants, noms, protection des formules', () => {
  const f = festival(), s = { ...f, volunteers: [...f.volunteers, vol(4, 'Dan', '', '4', [['16:00', '20:00']])] };
  const auto = { ...s, assignments: C.autoAssign({ ...s, volunteers: f.volunteers }) };
  const res = { ...auto, assignments: C.assign(auto, id('vol', 4), id('shift', 4), true) };
  const lines = C.csv(res).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], '"Date";"Début";"Fin";"Poste";"Compétence";"Besoin";"Affectés";"Manquants";"Bénévoles"');
  assert.equal(lines[1], `"${D}";"08:00";"12:00";"Accueil";"";"2";"2";"0";"Alice / Bruno"`);
  assert.equal(lines[2], `"${D}";"10:00";"14:00";"Secours";"Secours";"1";"0";"1";""`);
  assert.equal(lines[4], `"${D}";"16:00";"20:00";"Bar";"";"2";"2";"0";"Chloé / Dan (manuel)"`);
  const evil = { ...res, shifts: res.shifts.map((x, i) => (i === 0 ? { ...x, post: '=HYPERLINK(1)' } : x)) };
  assert.ok(C.csv(evil).includes('"\'=HYPERLINK(1)"'));
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const s = festival(), res = { ...s, assignments: C.autoAssign(s) };
  const ok = JSON.parse(C.backup(res));
  assert.deepEqual(C.validateBackup(ok), res);
  assert.throws(() => C.validateBackup({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, assignments: [...ok.assignments, ok.assignments[0]] }), /err\.backup/); // doublon
  assert.throws(() => C.validateBackup({ ...ok, assignments: [{ shiftId: id('shift', 2), volunteerId: id('vol', 2), locked: true }] }), /err\.backup/); // sans la compétence
  assert.throws(() => C.validateBackup({ ...ok, shifts: [{ ...ok.shifts[0], end: 2000 }] , assignments: [] }), /err\.range/);
  assert.throws(() => C.validateBackup({ ...ok, volunteers: [...ok.volunteers, ok.volunteers[0]], assignments: [] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, volunteers: [{ ...ok.volunteers[0], availability: [{ day: D, start: 1, end: 2, x: 1 }] }], assignments: [] }), /err\.backup/);
});
