// Tests métier de MoveBox : saisie des cartons, numéros, poids, recherche, suivi, statistiques, export, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const boxes = [];
const add = (input, id) => { const b = C.makeBox(input, id, boxes); boxes.push(b); return b; };
add({ number: '1', room: 'Cuisine', items: 'Assiettes\nVerres à vin; Saladier\n\n', fragile: true, weight: '12,5' }, 'box-0001');
add({ number: '#2', room: 'Salon', items: 'Livres\nTélécommande télé', weight: '23' }, 'box-0002');
add({ number: '7', room: 'Chambre', items: 'Draps\nOreillers', weight: '', notes: 'À ouvrir en premier' }, 'box-0007');

test('saisie : numéro, pièce, contenu, poids en grammes entiers', () => {
  assert.deepEqual(boxes[0], { id: 'box-0001', number: 1, room: 'Cuisine', items: ['Assiettes', 'Verres à vin', 'Saladier'], fragile: true, weightG: 12500, status: 'packed', notes: '' });
  assert.equal(boxes[1].number, 2);
  assert.equal(boxes[2].weightG, null);
  assert.equal(C.nextNumber(boxes), 8);
  assert.equal(C.parseWeightKg('0,355'), 355);
  for (const bad of ['0', '-1', '101', '1,2345', 'lourd']) assert.throws(() => C.parseWeightKg(bad), /^Error: err\.weight\|/, bad);
  assert.throws(() => C.makeBox({ number: '2', room: 'Bureau', items: '' }, 'box-0099', boxes), /err\.numberTaken\|\{"n":2\}/);
  assert.throws(() => C.makeBox({ number: '0', room: 'Bureau', items: '' }, 'box-0099', boxes), /err\.number/);
  assert.throws(() => C.makeBox({ number: '10000', room: 'Bureau', items: '' }, 'box-0099', boxes), /err\.number/);
  assert.throws(() => C.makeBox({ number: '9', room: '  ', items: '' }, 'box-0099', boxes), /err\.roomRequired/);
  assert.throws(() => C.makeBox({ number: '9', room: 'x'.repeat(41), items: '' }, 'box-0099', boxes), /err\.roomLong/);
  assert.throws(() => C.makeBox({ number: '9', room: 'Bureau', items: 'x'.repeat(81) }, 'box-0099', boxes), /err\.itemLong/);
  assert.throws(() => C.makeBox({ number: '9', room: 'Bureau', items: Array(101).fill('a').join('\n') }, 'box-0099', boxes), /err\.tooManyItems/);
  assert.throws(() => C.makeBox({ number: '9', room: 'Bureau', items: '', status: 'lost' }, 'box-0099', boxes), /err\.status/);
  // Modifier un carton garde son propre numéro.
  assert.equal(C.makeBox({ number: '2', room: 'Salon', items: 'Livres' }, 'box-0002', boxes).number, 2);
  assert.equal(C.matchRoom(' cuisine ', boxes), 'Cuisine');
  assert.equal(C.matchRoom('Bureau', boxes), 'Bureau');
});

test('recherche : sans accents ni casse, plusieurs mots, numéro', () => {
  const ids = (q) => C.search(boxes, q).map((r) => r.box.number);
  assert.deepEqual(ids('verre'), [1]);
  assert.deepEqual(ids('TELE'), [2]);
  assert.deepEqual(ids('cuisine saladier'), [1]);
  assert.deepEqual(ids('cuisine livres'), []);
  assert.deepEqual(ids('#7'), [7]);
  assert.deepEqual(ids('ouvrir'), [7]); // notes
  assert.deepEqual(ids('   '), []);
  assert.deepEqual(C.search(boxes, 'verres saladier')[0].hits, [1, 2]);
});

test('suivi : statut suivant, changement groupé', () => {
  assert.equal(C.nextStatus('packed'), 'loaded');
  assert.equal(C.nextStatus('delivered'), 'opened');
  assert.equal(C.nextStatus('opened'), 'opened');
  const moved = C.setStatus(boxes, ['box-0001', 'box-0007'], 'delivered');
  assert.deepEqual(moved.map((b) => b.status), ['delivered', 'packed', 'delivered']);
  assert.throws(() => C.setStatus(boxes, [], 'lost'), /err\.status/);
});

test('statistiques : par statut, poids connus, cartons trop lourds selon le seuil choisi, par pièce', () => {
  const s = C.stats(C.setStatus(boxes, ['box-0002'], 'opened'), 20000);
  assert.deepEqual(s.byStatus, { packed: 2, loaded: 0, delivered: 0, opened: 1 });
  assert.equal(s.arrived, 1);
  assert.equal(s.weightG, 35500);
  assert.equal(s.unknownWeight, 1);
  assert.equal(s.fragile, 1);
  assert.deepEqual(s.heavy, [2]);
  assert.deepEqual(s.rooms.find((r) => r.room === 'Salon'), { room: 'Salon', count: 1, weightG: 23000, arrived: 1 });
  assert.deepEqual(C.stats(boxes, null).heavy, []); // pas de seuil : pas d'alerte inventée
});

test('export CSV : en-têtes et statuts traduits, poids en kg, formules neutralisées', () => {
  const extra = C.makeBox({ number: '3', room: '=Cave', items: 'Vin; "Grand" cru' }, 'box-0003', boxes);
  const csv = C.toCSV([...boxes, extra], { headers: ['N°', 'Pièce', 'Contenu', 'Fragile', 'Poids (kg)', 'Statut', 'Notes'], statusLabel: (s) => ({ packed: 'Emballé' }[s]), yes: 'oui', no: 'non', decimal: 'comma' });
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'N°;Pièce;Contenu;Fragile;Poids (kg);Statut;Notes');
  assert.equal(lines[1], '1;Cuisine;Assiettes | Verres à vin | Saladier;oui;12,5;Emballé;');
  assert.equal(lines[3], '\'=Cave;"Vin | ""Grand"" cru";non;;Emballé;'.replace(/^/, '3;'));
  assert.equal(lines[4], '7;Chambre;Draps | Oreillers;non;;Emballé;À ouvrir en premier');
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { settings: { maxWeightG: 20000 }, boxes };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'movebox', version: 1, ...data };
  assert.throws(() => C.validateData({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, settings: { maxWeightG: -1 } }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, settings: {} }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, boxes: [boxes[0], { ...boxes[1], number: 1 }] }), /err\.numberTaken/);
  assert.throws(() => C.validateData({ ...ok, boxes: [boxes[0], boxes[0]] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, boxes: [{ ...boxes[0], fragile: 'oui' }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, boxes: [{ ...boxes[0], weightG: 12.5 }] }), /err\.weight/);
  assert.throws(() => C.validateData({ ...ok, boxes: [{ ...boxes[0], status: 'lost' }] }), /err\.status/);
  assert.throws(() => C.validateData({ ...ok, boxes: [{ ...boxes[0], items: [1] }] }), /err\.backup/);
  // Un objet contenant « ; » dans une sauvegarde reste un seul objet.
  const semi = { ...boxes[0], items: ['Vis; écrous'] };
  assert.deepEqual(C.validateData({ ...ok, boxes: [semi] }).boxes[0].items, ['Vis; écrous']);
});
