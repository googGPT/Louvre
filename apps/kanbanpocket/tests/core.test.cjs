// Tests métier de KanbanPocket : cartes, étiquettes, limites WIP, déplacements, filtres, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
const board = () => C.makeBoard({ name: 'Projet' }, id(), id);
const card = (b, title, colIndex = 0, extra = {}) => C.makeCard({ title, col: b.columns[colIndex].id, ...extra }, id());
const titles = (b, i) => b.cards.filter((c) => c.col === b.columns[i].id).map((c) => c.title);

test('saisies : étiquettes, limite WIP, échéance, textes', () => {
  assert.deepEqual(C.parseLabels(' urgent, Client A ,URGENT,, '), ['urgent', 'Client A']);
  assert.throws(() => C.parseLabels('a,b,c,d,e,f'), /err\.tooManyLabels/);
  assert.throws(() => C.parseLabels('x'.repeat(25)), /err\.labelLong/);
  assert.equal(C.parseWip(''), 0); assert.equal(C.parseWip('3'), 3);
  for (const bad of ['-1', '1.5', '100', 'abc']) assert.throws(() => C.parseWip(bad), /err\.wip/);
  const b = board();
  assert.equal(b.columns.length, 3);
  assert.throws(() => card(b, '  '), /err\.titleRequired/);
  assert.throws(() => card(b, 'X', 0, { due: '2026-02-30' }), /err\.due/);
  assert.throws(() => C.makeCard({ title: 'X', col: 'bad id' }, id()), /err\.id/);
  assert.throws(() => C.makeBoard({ name: '' }, id(), id), /err\.boardName/);
});

test('limite WIP : ajout et déplacement refusés dans une colonne pleine', () => {
  let b = board();
  b = { ...b, columns: b.columns.map((c, i) => (i === 1 ? { ...c, wip: 2 } : c)) };
  b = C.addCard(b, card(b, 'A', 1)); b = C.addCard(b, card(b, 'B', 1)); b = C.addCard(b, card(b, 'C', 0));
  assert.deepEqual(C.wip(b)[1], { id: b.columns[1].id, count: 2, wip: 2, full: true, over: false });
  assert.throws(() => C.addCard(b, card(b, 'D', 1)), /err\.wipFull\|\{"max":2\}/);
  const cId = b.cards.find((c) => c.title === 'C').id;
  assert.throws(() => C.moveCard(b, cId, b.columns[1].id, 0), /err\.wipFull/);
  // Réordonner dans une colonne pleine reste possible.
  const aId = b.cards.find((c) => c.title === 'A').id;
  assert.deepEqual(titles(C.moveCard(b, aId, b.columns[1].id, Infinity), 1), ['B', 'A']);
  // Limite abaissée sous le nombre de cartes : signalée comme dépassée.
  const low = { ...b, columns: b.columns.map((c, i) => (i === 1 ? { ...c, wip: 1 } : c)) };
  assert.equal(C.wip(low)[1].over, true);
  assert.equal(C.stats(low, '2026-01-01').overWip, 1);
});

test('déplacements à une position précise et au clavier', () => {
  let b = board();
  for (const t of ['A', 'B', 'C']) b = C.addCard(b, card(b, t, 0));
  b = C.addCard(b, card(b, 'X', 1));
  const get = (t) => b.cards.find((c) => c.title === t).id;
  b = C.moveCard(b, get('C'), b.columns[0].id, 0);
  assert.deepEqual(titles(b, 0), ['C', 'A', 'B']);
  b = C.moveCard(b, get('A'), b.columns[1].id, 0);
  assert.deepEqual(titles(b, 1), ['A', 'X']);
  b = C.moveBy(b, get('A'), 'down');
  assert.deepEqual(titles(b, 1), ['X', 'A']);
  b = C.moveBy(b, get('A'), 'down'); // déjà en bas : inchangé
  assert.deepEqual(titles(b, 1), ['X', 'A']);
  b = C.moveBy(b, get('A'), 'next');
  assert.deepEqual([titles(b, 1), titles(b, 2)], [['X'], ['A']]);
  b = C.moveBy(b, get('A'), 'next'); // dernière colonne : inchangé
  assert.deepEqual(titles(b, 2), ['A']);
  b = C.moveBy(b, get('B'), 'prev'); // première colonne : inchangé
  assert.deepEqual(titles(b, 0), ['C', 'B']);
  b = C.moveBy(b, get('B'), 'up');
  assert.deepEqual(titles(b, 0), ['B', 'C']);
  assert.throws(() => C.moveBy(b, get('B'), 'diagonal'), /err\.direction/);
  // Changer la colonne d'une carte modifiée la place en bas de la nouvelle colonne.
  const edited = { ...b.cards.find((c) => c.title === 'B'), title: 'B2', col: b.columns[1].id };
  assert.deepEqual(titles(C.updateCard(b, edited), 1), ['X', 'B2']);
});

test('colonnes : suppression seulement si vide, jamais la dernière', () => {
  let b = board();
  b = C.addCard(b, card(b, 'A', 0));
  assert.throws(() => C.removeColumn(b, b.columns[0].id), /err\.columnNotEmpty/);
  b = C.removeColumn(b, b.columns[1].id);
  b = C.removeColumn(b, b.columns[1].id);
  assert.equal(b.columns.length, 1);
  assert.throws(() => C.removeColumn(b, b.columns[0].id), /err\.lastColumn/);
});

test('filtres : texte, étiquette, échéances (la colonne terminée n\'est jamais en retard)', () => {
  let b = board();
  b = C.addCard(b, card(b, 'Devis client', 0, { labels: 'client, urgent', due: '2026-03-01' }));
  b = C.addCard(b, card(b, 'Maquette', 1, { labels: 'design', due: '2026-03-12', notes: 'version mobile' }));
  b = C.addCard(b, card(b, 'Facture', 2, { labels: 'Client', due: '2026-02-01' }));
  b = C.addCard(b, card(b, 'Idées', 0));
  const today = '2026-03-10';
  const f = (x) => C.filterCards(b, x, today).map((i) => b.cards.find((c) => c.id === i).title);
  assert.deepEqual(f({}), ['Devis client', 'Maquette', 'Facture', 'Idées']);
  assert.deepEqual(f({ text: 'MOBILE' }), ['Maquette']);
  assert.deepEqual(f({ label: 'client' }), ['Devis client', 'Facture']);
  assert.deepEqual(f({ due: 'overdue' }), ['Devis client']);
  assert.deepEqual(f({ due: 'week' }), ['Maquette']);
  assert.deepEqual(f({ due: 'none' }), ['Idées']);
  assert.deepEqual(f({ label: 'client', due: 'overdue' }), ['Devis client']);
  assert.throws(() => f({ due: 'demain' }), /err\.filter/);
  assert.deepEqual(C.allLabels(b), ['client', 'urgent', 'design']);
  assert.deepEqual(C.stats(b, today), { total: 4, done: 1, overdue: 1, overWip: 0 });
});

test('CSV : en-têtes fournis, guillemets, formules neutralisées', () => {
  let b = board();
  b = C.addCard(b, card(b, '=SOMME(A1)', 0, { labels: 'a, b', notes: 'ligne "1"\nligne 2' }));
  b = C.addCard(b, card(b, 'Fini', 2, { due: '2026-03-01' }));
  const csv = C.toCSV(b, ['Colonne', 'Titre', 'Étiquettes', 'Échéance', 'Notes'], (c, i) => c.name || ['À faire', 'En cours', 'Fait'][i]);
  assert.ok(csv.startsWith('﻿Colonne,Titre,Étiquettes,Échéance,Notes\r\n'));
  assert.match(csv, /À faire,'=SOMME\(A1\),"a, b",,"ligne ""1""\nligne 2"\r\n/);
  assert.match(csv, /Fait,Fini,,2026-03-01,\r\n$/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  let b = board();
  b = C.addCard(b, card(b, 'A', 0, { labels: 'x', due: '2026-03-01', notes: 'n' }));
  const list = [b];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(list))), list);
  const ok = { app: 'kanbanpocket', version: 1, boards: list };
  const clone = () => JSON.parse(JSON.stringify(ok));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  let x = clone(); x.boards[0].cards[0].col = 'id-inconnue'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.boards[0].columns[0].wip = -1; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.boards[0].columns = []; x.boards[0].cards = []; assert.throws(() => C.validateBackup(x), /err\.columns/);
  x = clone(); x.boards[0].cards[0].labels = 'x'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.boards[0].cards[0].extra = 1; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.boards[0].cards.push(x.boards[0].cards[0]); assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.boards[0].cards[0].due = '2026-13-01'; assert.throws(() => C.validateBackup(x), /err\.due/);
});
