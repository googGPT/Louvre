// Tests métier de BillCalendar : échéances récurrentes, fins de mois, totaux, export agenda, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const bill = (over = {}) => C.makeBill({ name: 'Forfait', amount: '12,99', frequency: 'monthly', start: '2026-01-31', category: 'Télécom', ...over }, `bill-${String(++n).padStart(4, '0')}`);

test('échéance mensuelle fixée le 31 : dernier jour des mois courts, puis retour au 31', () => {
  const b = bill();
  assert.deepEqual([0, 1, 2, 3].map((k) => C.occurrence(b, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(C.occurrence(bill({ start: '2028-01-31' }), 1), '2028-02-29'); // année bissextile
});

test('trimestrielle, annuelle et hebdomadaire', () => {
  assert.deepEqual([0, 1, 2].map((k) => C.occurrence(bill({ frequency: 'quarterly', start: '2026-11-30' }), k)), ['2026-11-30', '2027-02-28', '2027-05-30']);
  assert.equal(C.occurrence(bill({ frequency: 'yearly', start: '2028-02-29' }), 1), '2029-02-28');
  assert.deepEqual([0, 1, 2].map((k) => C.occurrence(bill({ frequency: 'weekly', start: '2026-10-26' }), k)), ['2026-10-26', '2026-11-02', '2026-11-09']);
});

test('échéances d\'une période, prochaine échéance, pause', () => {
  const b = bill({ start: '2025-06-15' });
  assert.deepEqual(C.occurrencesBetween(b, '2026-10-01', '2026-12-31'), ['2026-10-15', '2026-11-15', '2026-12-15']);
  assert.equal(C.nextDue(b, '2026-10-16'), '2026-11-15');
  assert.equal(C.nextDue(b, '2026-10-15'), '2026-10-15'); // le jour même compte
  assert.deepEqual(C.occurrencesBetween(bill({ start: '2027-01-01' }), '2026-10-01', '2026-12-31'), []); // pas encore commencée
  const paused = { ...b, active: false };
  assert.equal(C.nextDue(paused, '2026-10-16'), null);
  assert.deepEqual(C.occurrencesBetween(paused, '2026-10-01', '2026-12-31'), []);
});

test('coût mensuel moyen et annuel', () => {
  assert.equal(C.monthlyEquivalentCents(bill({ amount: '120', frequency: 'yearly' })), 1000); // 10 €/mois
  assert.equal(C.monthlyEquivalentCents(bill({ amount: '30', frequency: 'quarterly' })), 1000);
  assert.equal(C.monthlyEquivalentCents(bill({ amount: '10', frequency: 'weekly' })), 4333); // 10 × 52 / 12
  assert.equal(C.yearlyCents(bill({ amount: '10', frequency: 'weekly' })), 52000);
});

test('mois civil, 30 prochains jours et résumé', () => {
  const bills = [
    bill({ name: 'Loyer', amount: '780', start: '2026-01-05', category: 'Logement' }),
    bill({ name: 'Assurance', amount: '168', frequency: 'yearly', start: '2025-11-20', category: 'Assurance' }),
    { ...bill({ name: 'Ancien', amount: '50', start: '2026-01-10' }), active: false },
  ];
  const nov = C.month(bills, 2026, 11);
  assert.deepEqual(nov.items.map((x) => `${x.day} ${x.bill.name}`), ['2026-11-05 Loyer', '2026-11-20 Assurance']);
  assert.equal(nov.totalCents, 94800);
  const s = C.summary(bills, '2026-10-27');
  assert.equal(s.active, 2);
  assert.equal(s.paused, 1);
  assert.equal(s.monthlyCents, 78000 + 1400);
  assert.equal(s.yearlyCents, 78000 * 12 + 16800);
  assert.equal(s.next30Cents, 78000 + 16800); // 5 et 20 novembre
  assert.deepEqual(s.byCategory.map((x) => x[0]), ['Logement', 'Assurance']);
});

test('export agenda .ics : règles de récurrence et échappement', () => {
  assert.equal(C.rrule(bill({ start: '2026-03-05' })), 'FREQ=MONTHLY');
  assert.equal(C.rrule(bill({ start: '2026-01-31' })), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  assert.equal(C.rrule(bill({ start: '2026-01-30', frequency: 'quarterly' })), 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=28,29,30;BYSETPOS=-1');
  assert.equal(C.rrule(bill({ start: '2028-02-29', frequency: 'yearly' })), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
  const ics = C.toICS([bill({ name: 'Eau, gaz; etc', start: '2026-11-03' }), { ...bill(), active: false }], '20261027T010203Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1); // la facture en pause n'est pas exportée
  assert.match(ics, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104\r\nRRULE:FREQ=MONTHLY\r\n/);
  assert.match(ics, /SUMMARY:Eau\\, gaz\\; etc — 12\\,99 €/); // la virgule est échappée (RFC 5545)
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

test('saisies refusées et sauvegarde validée', () => {
  assert.throws(() => bill({ amount: '0' }), /positif/);
  assert.throws(() => bill({ amount: '12,999' }), /Montant/);
  assert.throws(() => bill({ frequency: 'daily' }), /Fréquence/);
  assert.throws(() => bill({ start: '2026-02-30' }), /Date/);
  assert.throws(() => bill({ category: 'Divers' }), /Catégorie/);
  const bills = [bill(), { ...bill({ frequency: 'yearly' }), active: false }];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(bills))), bills);
  const ok = { app: 'billcalendar', version: 1, bills };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /pas une sauvegarde/);
  assert.throws(() => C.validateBackup({ ...ok, bills: [{ ...bills[0], hack: 1 }] }), /inattendus/);
  assert.throws(() => C.validateBackup({ ...ok, bills: [{ ...bills[0], active: 'oui' }] }), /Statut/);
  assert.throws(() => C.validateBackup({ ...ok, bills: [bills[0], bills[0]] }), /double/);
});
