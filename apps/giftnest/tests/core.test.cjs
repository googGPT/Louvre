// Tests métier de GiftNest : occasions annuelles, budgets, statuts, suppressions, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const T = '2026-10-27';
function sample() {
  const lea = C.makePerson({ name: 'Léa', budget: '50' }, 'person-lea');
  const tom = C.makePerson({ name: 'Tom', budget: '' }, 'person-tom');
  const bday = C.makeOccasion({ name: 'Anniversaire', date: '1990-11-08', yearly: true }, 'occ-bday');
  const party = C.makeOccasion({ name: 'Pendaison de crémaillère', date: '2026-12-05', yearly: false }, 'occ-party');
  let data = { people: [lea, tom], occasions: [bday, party], gifts: [] };
  const g = (title, price, personId, occasionId, status, id) => C.makeGift({ title, price, personId, occasionId, status }, id, data);
  data = { ...data, gifts: [
    g('Atelier poterie', '45', 'person-lea', 'occ-bday', 'idée', 'gift-0001'),
    g('Roman', '19,90', 'person-lea', null, 'acheté', 'gift-0002'),
    g('Écharpe', '35', 'person-lea', 'occ-party', 'offert', 'gift-0003'),
    g('Jeu', '', 'person-tom', 'occ-party', 'idée', 'gift-0004'),
  ] };
  return data;
}

test('occasions annuelles : prochaine date et compte à rebours', () => {
  const bday = { name: 'A', date: '1990-11-08', yearly: true };
  assert.equal(C.nextDate(bday, T), '2026-11-08');
  assert.equal(C.daysUntil(bday, T), 12);
  assert.equal(C.nextDate({ ...bday, date: '1990-03-01' }, T), '2027-03-01'); // déjà passée cette année
  assert.equal(C.daysUntil({ ...bday, date: '1990-10-27' }, T), 0); // c'est aujourd'hui
  assert.equal(C.nextDate({ ...bday, date: '2000-02-29' }, T), '2027-02-28'); // 2027 non bissextile
  assert.equal(C.nextDate({ ...bday, date: '2000-02-29' }, '2028-01-01'), '2028-02-29');
  assert.equal(C.daysUntil({ name: 'B', date: '2026-10-20', yearly: false }, T), -7); // ponctuelle passée
});

test('budgets : dépensé = acheté + offert, idées à part, alertes de dépassement', () => {
  const data = sample();
  const lea = C.personTotals(data, 'person-lea');
  assert.deepEqual(lea, { count: 3, spent: 5490, planned: 4500, budget: 5000, remaining: -490, over: true, overIfAll: true });
  const tom = C.personTotals(data, 'person-tom');
  assert.equal(tom.budget, 0);
  assert.equal(tom.remaining, null); // pas de budget fixé
  assert.equal(tom.over, false);
});

test('occasions à venir triées, avec cadeaux prêts et idées', () => {
  const up = C.upcoming(sample(), T);
  assert.deepEqual(up.map((x) => [x.occasion.name, x.days, x.ready, x.ideas]), [['Anniversaire', 12, 0, 1], ['Pendaison de crémaillère', 39, 1, 1]]);
  const s = C.summary(sample());
  assert.deepEqual([s.spent, s.planned, s.ideas, s.toWrap, s.given], [5490, 4500, 2, 1, 1]);
});

test('statut : idée -> acheté -> offert -> idée', () => {
  let g = sample().gifts[0];
  const seen = [];
  for (let i = 0; i < 3; i += 1) { g = C.advance(g); seen.push(g.status); }
  assert.deepEqual(seen, ['acheté', 'offert', 'idée']);
});

test('suppressions : une personne emporte ses cadeaux, une occasion les détache', () => {
  const a = C.removePerson(sample(), 'person-lea');
  assert.deepEqual(a.gifts.map((g) => g.id), ['gift-0004']);
  const b = C.removeOccasion(sample(), 'occ-party');
  assert.equal(b.occasions.length, 1);
  assert.equal(b.gifts.find((g) => g.id === 'gift-0003').occasionId, null);
});

test('saisies refusées', () => {
  const data = sample();
  assert.throws(() => C.makeGift({ title: 'X', price: '1', personId: 'inconnu', occasionId: null, status: 'idée' }, 'gift-0009', data), /^Error: err\.person$/);
  assert.throws(() => C.makeGift({ title: 'X', price: '1', personId: 'person-tom', occasionId: 'nope', status: 'idée' }, 'gift-0009', data), /^Error: err\.occasion$/);
  assert.throws(() => C.makeGift({ title: 'X', price: '1', personId: 'person-tom', occasionId: null, status: 'perdu' }, 'gift-0009', data), /^Error: err\.status$/);
  assert.throws(() => C.makeGift({ title: ' ', price: '1', personId: 'person-tom', occasionId: null, status: 'idée' }, 'gift-0009', data), /^Error: err\.titleRequired$/);
  assert.throws(() => C.makePerson({ name: 'x'.repeat(61) }, 'person-x2'), /^Error: err\.nameLong\|\{"max":60\}$/);
  assert.throws(() => C.makePerson({ name: 'X', budget: '12,345' }, 'person-x1'), /^Error: err\.amount$/);
  assert.throws(() => C.makeOccasion({ name: 'X', date: '2026-02-30' }, 'occ-x1'), /^Error: err\.date$/);
  assert.equal(C.parseCents(''), 0);
});

test('sauvegarde : aller-retour exact, références croisées vérifiées', () => {
  const data = sample();
  const back = C.validateBackup(JSON.parse(C.backup(data)));
  assert.deepEqual(back, data);
  const raw = { app: 'giftnest', version: 1, ...data };
  assert.throws(() => C.validateBackup({ ...raw, app: 'x' }), /^Error: err\.notBackup$/);
  assert.throws(() => C.validateBackup({ ...raw, gifts: [{ ...data.gifts[0], personId: 'fantome' }] }), /^Error: err\.person$/);
  assert.throws(() => C.validateBackup({ ...raw, people: [{ ...data.people[0], extra: 1 }, data.people[1]] }), /^Error: err\.fields$/);
  assert.throws(() => C.validateBackup({ ...raw, people: [data.people[0], data.people[0], data.people[1]] }), /^Error: err\.duplicate$/);
});
