// Tests métier de StudyRecall : boîtes de Leitner, file du jour, statistiques, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const T = '2026-10-27'; // « aujourd'hui » fixe pour des tests reproductibles
const card = (over = {}) => ({ ...C.createCard({ front: 'Q', back: 'R', deck: '' }, T, 'card-0001'), ...over });

test('une nouvelle fiche part en boîte 1, à réviser aujourd\'hui, paquet « Général » par défaut', () => {
  const c = card();
  assert.equal(c.box, 1);
  assert.equal(c.due, T);
  assert.equal(c.deck, 'Général');
  assert.throws(() => C.createCard({ front: ' ', back: 'R' }, T, 'card-0002'), /err\.frontRequired/);
  assert.throws(() => C.createCard({ front: 'Q', back: 'x'.repeat(501) }, T, 'card-0002'), /err\.backLong/);
});

test('« je savais » fait monter d\'une boîte et espace la révision : 2, 4, 8, 16 jours', () => {
  let c = card(), day = T;
  const expected = [['2026-10-29', 2], ['2026-11-02', 3], ['2026-11-10', 4], ['2026-11-26', 5]];
  for (const [due, box] of expected) {
    c = C.review(c, true, day);
    assert.equal(c.box, box);
    assert.equal(c.due, due);
    day = c.due;
  }
  c = C.review(c, true, day); // boîte 5 : on y reste, 16 jours
  assert.equal(c.box, 5);
  assert.equal(c.due, C.addDays(day, 16));
  assert.equal(c.reviews, 5);
});

test('« à revoir » renvoie en boîte 1, à revoir demain, et compte un oubli', () => {
  const c = C.review(card({ box: 4, due: T }), false, T);
  assert.equal(c.box, 1);
  assert.equal(c.due, '2026-10-28');
  assert.equal(c.lapses, 1);
  assert.equal(c.last, T);
});

test('une fiche pas encore due ne peut pas être révisée', () => {
  assert.throws(() => C.review(card({ due: '2026-10-30' }), true, T), /err\.notDue/);
});

test('file du jour : retards d\'abord, puis boîtes basses, filtre par paquet', () => {
  const cards = [
    card({ id: 'aaaaaa', due: T, box: 3, deck: 'Maths' }),
    card({ id: 'bbbbbb', due: '2026-10-20', box: 4, deck: 'Maths' }),
    card({ id: 'cccccc', due: T, box: 1, deck: 'Anglais' }),
    card({ id: 'dddddd', due: '2026-11-01', box: 1, deck: 'Maths' }),
  ];
  assert.deepEqual(C.queue(cards, T).map((c) => c.id), ['bbbbbb', 'cccccc', 'aaaaaa']);
  assert.deepEqual(C.queue(cards, T, 'Maths').map((c) => c.id), ['bbbbbb', 'aaaaaa']);
});

test('statistiques et prévision sur 7 jours (le retard compte aujourd\'hui)', () => {
  const cards = [
    card({ id: 'aaaaaa', due: '2026-10-20', box: 2, reviews: 4, lapses: 1, last: T }),
    card({ id: 'bbbbbb', due: '2026-10-29', box: 5, reviews: 4, lapses: 0 }),
    card({ id: 'cccccc', due: T, box: 1 }),
  ];
  const s = C.stats(cards, T);
  assert.equal(s.total, 3);
  assert.equal(s.due, 2);
  assert.equal(s.reviewedToday, 1);
  assert.equal(s.mastered, 1);
  assert.deepEqual(s.perBox, [1, 1, 0, 0, 1]);
  assert.equal(s.retention, 87.5); // 7 réussites sur 8 révisions
  const f = C.forecast(cards, T, 7);
  assert.equal(f.length, 7);
  assert.deepEqual(f.slice(0, 3).map((x) => x.count), [2, 0, 1]);
  assert.equal(C.stats([], T).retention, null);
});

test('dates : années bissextiles et changement d\'heure', () => {
  assert.equal(C.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(C.addDays('2026-10-24', 2), '2026-10-26'); // passage à l'heure d'hiver le 25/10
  assert.equal(C.isDay('2026-02-30'), false);
  assert.equal(C.daysBetween('2026-10-27', '2026-11-26'), 30);
});

test('sauvegarde : aller-retour exact, contenus inattendus refusés', () => {
  const cards = [C.review(card(), true, T), card({ id: 'eeeeee', deck: 'Histoire' })];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(cards))), cards);
  const ok = { app: 'studyrecall', version: 1, cards };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, cards: [{ ...cards[0], extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, cards: [{ ...cards[0], box: 6 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, cards: [{ ...cards[0], lapses: 9 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, cards: [cards[0], cards[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, cards: [{ ...cards[0], due: '2026-13-01' }] }), /err\.backup/);
});
