// Tests métier de HabitSteps : pointages, séries quotidiennes et hebdomadaires, régularité, grille, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const T = '2026-10-28'; // un mercredi ; la semaine commence le lundi 26
const daily = (checks, created = '2026-09-01') => ({ ...C.makeHabit({ name: 'Marcher', goal: { type: 'daily' } }, created, 'habit-0001'), checks });
const weekly = (times, checks, created = '2026-09-01') => ({ ...C.makeHabit({ name: 'Sport', goal: { type: 'weekly', times } }, created, 'habit-0002'), checks });

test('semaine du lundi au dimanche, dates sans piège d\'heure d\'été', () => {
  assert.equal(C.weekStart(T), '2026-10-26');
  assert.equal(C.weekStart('2026-11-01'), '2026-10-26'); // dimanche
  assert.equal(C.addDays('2026-10-25', 1), '2026-10-26'); // passage à l'heure d'hiver
  assert.equal(C.diffDays('2026-10-01', T), 27);
});

test('série quotidienne : aujourd\'hui pas encore pointé ne casse pas la série', () => {
  assert.equal(C.streaks(daily(['2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28']), T).current, 3);
  assert.equal(C.streaks(daily(['2026-10-26', '2026-10-27']), T).current, 2); // « en jeu » aujourd'hui
  assert.equal(C.streaks(daily(['2026-10-25', '2026-10-26']), T).current, 0); // hier manqué : série cassée
  const s = C.streaks(daily(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-27', '2026-10-28']), T);
  assert.equal(s.best, 5);
  assert.equal(s.unit, 'jour');
});

test('série hebdomadaire : semaines réussies consécutives, semaine en cours « en jeu »', () => {
  const checks = ['2026-10-06', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-20', '2026-10-22', '2026-10-26'];
  const h = weekly(2, checks);
  assert.deepEqual(C.streaks(h, T), { current: 2, best: 2, unit: 'semaine' }); // semaines du 12 et du 19
  assert.equal(C.weekProgress(h, T), 1);
  assert.equal(C.streaks(weekly(2, [...checks, '2026-10-27']), T).current, 3); // semaine en cours réussie
});

test('régularité : depuis la création seulement', () => {
  const r = C.rate(daily(['2026-10-20', '2026-10-21', '2026-10-25', '2026-10-28'], '2026-10-20'), T);
  assert.deepEqual(r, { done: 4, total: 9, pct: 44.4 });
  assert.equal(C.rate(daily([], '2026-08-01'), T).total, 30);
  const w = C.rate(weekly(1, ['2026-10-27', '2026-10-21'], '2026-09-01'), T);
  assert.deepEqual(w, { done: 2, total: 8, pct: 25 });
});

test('pointer : bascule, pas de futur, pas trop ancien, rattrapage avant la création', () => {
  let h = daily([], '2026-10-20');
  h = C.toggle(h, T, T);
  assert.deepEqual(h.checks, [T]);
  h = C.toggle(h, '2026-10-26', T);
  assert.deepEqual(h.checks, ['2026-10-26', T]); // toujours triés
  assert.deepEqual(C.toggle(h, T, T).checks, ['2026-10-26']); // second appui : annule
  assert.throws(() => C.toggle(h, '2026-10-29', T), /futur/);
  assert.throws(() => C.toggle(h, '2025-01-01', T), /ancienne/);
  assert.equal(C.toggle(h, '2026-10-15', T).created, '2026-10-15');
});

test('grille de 12 semaines : dernière colonne = semaine en cours', () => {
  const g = C.grid(daily([T, '2026-08-10']), T, 12);
  assert.equal(g.length, 12);
  assert.equal(g[0][0].day, '2026-08-10'); // lundi, 11 semaines avant le 26 octobre
  assert.equal(g[0][0].done, true);
  assert.equal(g[11][2].day, T);
  assert.equal(g[11][2].done, true);
  assert.equal(g[11][3].future, true);
});

test('saisies refusées et sauvegarde validée', () => {
  assert.throws(() => C.makeHabit({ name: ' ', goal: { type: 'daily' } }, T, 'habit-0003'), /obligatoire/);
  assert.throws(() => C.makeHabit({ name: 'X', goal: { type: 'weekly', times: 8 } }, T, 'habit-0003'), /1 à 7/);
  assert.throws(() => C.makeHabit({ name: 'X', goal: { type: 'monthly' } }, T, 'habit-0003'), /inconnu/);
  const habits = [daily(['2026-10-27', T]), weekly(3, ['2026-10-26'])];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(habits))), habits);
  const ok = { app: 'habitsteps', version: 1, habits };
  assert.throws(() => C.validateBackup({ ...ok, app: 'x' }), /pas une sauvegarde/);
  assert.throws(() => C.validateBackup({ ...ok, habits: [{ ...habits[0], checks: [T, '2026-10-27'] }] }), /triées/);
  assert.throws(() => C.validateBackup({ ...ok, habits: [{ ...habits[0], checks: ['2026-08-01'] }] }), /après la création/);
  assert.throws(() => C.validateBackup({ ...ok, habits: [{ ...habits[0], goal: { type: 'daily', times: 3 } }] }), /Objectif/);
  assert.throws(() => C.validateBackup({ ...ok, habits: [habits[0], habits[0]] }), /double/);
});
