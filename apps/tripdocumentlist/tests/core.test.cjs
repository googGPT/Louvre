// Tests métier de TripDocumentList : jours civils, marge, validité, statut prêt, notes sans numéro, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
function trip(settings = { start: '2026-12-10', end: '2026-12-24', margin: '3', marginUnit: 'm' }) {
  const t = { ...C.makeTrip('Japon', id()), ...(settings ? C.makeSettings(settings) : {}) };
  t.travelers = [C.makeTraveler('Nadia', id()), C.makeTraveler('Hugo', id())];
  return t;
}
const doc = (t, type, expires, done = true, note = '', who = 0) => C.makeDoc({ travelerId: t.travelers[who].id, type, expires, done, note }, id(), t.travelers);
const TODAY = '2026-10-27';

test('jours civils : ajout de jours et de mois ancré', () => {
  assert.equal(C.addDays('2026-12-24', 8), '2027-01-01');
  assert.equal(C.addDays('2026-03-28', 1), '2026-03-29'); // passage à l'heure d'été sans effet
  assert.equal(C.diffDays('2026-12-24', '2027-03-24'), 90);
  assert.equal(C.addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(C.addMonths('2027-08-31', 6), '2028-02-29'); // année bissextile
  assert.equal(C.addMonths('2026-12-24', 3), '2027-03-24');
  assert.equal(C.addMonths('2026-01-15', 0), '2026-01-15');
  assert.equal(C.isDay('2026-02-29'), false);
  assert.equal(C.isDay('2028-02-29'), true);
  assert.throws(() => C.addDays('2026-13-01', 1), /err\.date/);
});

test('marge saisie : jours ou mois après le retour', () => {
  assert.equal(C.requiredUntil(trip()), '2027-03-24');
  assert.equal(C.requiredUntil(trip({ start: '2026-12-10', end: '2026-12-24', margin: '30', marginUnit: 'd' })), '2027-01-23');
  assert.equal(C.requiredUntil(trip({ start: '2026-12-10', end: '2026-12-24', margin: '', marginUnit: 'd' })), '2026-12-24');
  assert.equal(C.requiredUntil(trip(null)), null);
});

test('validité de chaque document par rapport au voyage et à la marge', () => {
  const t = trip();
  const v = (expires) => C.checkDoc(t, doc(t, 'passport', expires), TODAY);
  assert.equal(v('2026-10-01').validity, 'expired');
  assert.equal(v(TODAY).validity, 'beforeTrip'); // valide aujourd'hui inclus, mais pas jusqu'au départ
  assert.equal(v('2026-12-09').validity, 'beforeTrip');
  assert.equal(v('2026-12-10').validity, 'duringTrip');
  assert.equal(v('2026-12-23').validity, 'duringTrip');
  assert.equal(v('2026-12-24').validity, 'margin'); // valide le jour du retour, mais pas la marge de 3 mois
  assert.equal(v('2027-03-23').validity, 'margin');
  const ok = v('2027-03-24');
  assert.equal(ok.validity, 'ok');
  assert.equal(ok.afterEnd, 90);
  assert.equal(ok.level, 'ok');
  assert.equal(v('').validity, 'noExpiry');
  assert.equal(v('2026-12-12').level, 'bad');
  assert.equal(v('2027-01-01').level, 'warn');
  const noDates = trip(null);
  assert.equal(C.checkDoc(noDates, doc(noDates, 'visa', '2027-01-01'), TODAY).validity, 'noDates');
  assert.equal(C.checkDoc(noDates, doc(noDates, 'visa', '2026-01-01'), TODAY).validity, 'expired');
});

test('prêt = coché et valide ; synthèse par voyageur', () => {
  const t = trip();
  t.docs = [doc(t, 'passport', '2030-01-01', true), doc(t, 'insurance', '2026-12-20', true), doc(t, 'booking', '', false),
    doc(t, 'passport', '2027-01-15', true, '', 1), doc(t, 'ticket', '', true, '', 1)];
  const s = C.summary(t, TODAY);
  assert.equal(s.total, 5);
  assert.equal(s.ready, 2); // passeport de Nadia, billet de Hugo ; ni l'assurance (expire pendant), ni la réservation (à faire), ni le passeport sous la marge
  assert.deepEqual(s.byTraveler.map((g) => [g.name, g.ready, g.total]), [['Nadia', 1, 3], ['Hugo', 1, 2]]);
  assert.equal(s.bad, 1);
  assert.equal(s.warn, 1);
  assert.equal(s.todo, 1);
  assert.equal(s.nextExpiry.expires, '2026-12-20');
  assert.equal(s.requiredUntil, '2027-03-24');
  assert.equal(s.daysToStart, 44);
  assert.equal(s.allReady, false);
  t.docs = [doc(t, 'passport', '2030-01-01', true), doc(t, 'ticket', '', true, '', 1)];
  assert.equal(C.summary(t, TODAY).allReady, true);
});

test('notes : aucun numéro de document accepté', () => {
  assert.equal(C.cleanNote('  Copie dans le sac  '), 'Copie dans le sac');
  assert.equal(C.cleanNote('Renouveler avant le 12 mars'), 'Renouveler avant le 12 mars');
  assert.equal(C.cleanNote('Vol AF 1234'), 'Vol AF 1234'); // 6 caractères d'affilée non atteints
  for (const bad of ['N° 12AB34567', 'passeport 18CV12345', 'tel 0612345678', 'réf ABC12345XY', '٠١٢٣٤٥٦٧']) assert.throws(() => C.cleanNote(bad), /^Error: err\.noteNumber$/, bad);
  assert.throws(() => C.cleanNote('x'.repeat(141)), /err\.noteLong/);
  const t = trip();
  assert.throws(() => doc(t, 'visa', '2027-06-01', false, 'numéro 99887766'), /err\.noteNumber/);
});

test('saisies refusées', () => {
  assert.throws(() => C.makeSettings({ start: '2026-12-24', end: '2026-12-10', margin: '0', marginUnit: 'd' }), /err\.endBeforeStart/);
  assert.throws(() => C.makeSettings({ start: '', end: '2026-12-10', margin: '0', marginUnit: 'd' }), /err\.start/);
  assert.throws(() => C.makeSettings({ start: '2026-01-01', end: '2027-06-01', margin: '0', marginUnit: 'd' }), /err\.tripLong/);
  assert.throws(() => C.makeSettings({ start: '2026-12-10', end: '2026-12-24', margin: '25', marginUnit: 'm' }), /^Error: err\.margin\|\{"max":24\}$/);
  assert.throws(() => C.makeSettings({ start: '2026-12-10', end: '2026-12-24', margin: '1,5', marginUnit: 'd' }), /err\.margin/);
  assert.throws(() => C.makeSettings({ start: '2026-12-10', end: '2026-12-24', margin: '1', marginUnit: 'y' }), /err\.unit/);
  const t = trip();
  assert.throws(() => C.makeDoc({ travelerId: t.travelers[0].id, type: 'crown' }, id(), t.travelers), /err\.type/);
  assert.throws(() => C.makeDoc({ travelerId: 'id-absent', type: 'visa' }, id(), t.travelers), /err\.traveler/);
  assert.throws(() => doc(t, 'visa', '2026-02-30'), /err\.expires/);
  assert.throws(() => C.makeTraveler('', id()), /err\.travelerRequired/);
});

test('export .ics : une journée par échéance', () => {
  const t = trip();
  t.docs = [doc(t, 'passport', '2027-01-15', true, 'Copie, sac'), doc(t, 'ticket', '', true)];
  const ics = C.toICS(t, '20261027T080000Z', { summary: (d, who) => `Échéance : ${d.type} de ${who.name}`, describe: (d) => d.note });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270115\r\nDTEND;VALUE=DATE:20270116'));
  assert.ok(ics.includes('SUMMARY:Échéance : passport de Nadia'));
  assert.ok(ics.includes('DESCRIPTION:Copie\\, sac'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  t.docs = [doc(t, 'ticket', '', true)];
  assert.throws(() => C.toICS(t, '20261027T080000Z'), /err\.noExpiry/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const t = trip();
  t.docs = [doc(t, 'passport', '2027-01-15', true, 'Copie'), doc(t, 'ticket', '', false, '', 1)];
  const undated = trip(null);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([t, undated]))), [t, undated]);
  const ok = { app: 'tripdocumentlist', version: 1, trips: [t] };
  assert.throws(() => C.validateBackup({ ...ok, app: 'trippack' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, docs: [{ ...t.docs[0], number: 'X' }] }] }), /err\.backup/); // aucun champ « numéro »
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, docs: [{ ...t.docs[0], note: 'n° 12345678' }] }] }), /err\.noteNumber/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, docs: [{ ...t.docs[0], done: 'oui' }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, docs: [{ ...t.docs[0], travelerId: 'id-absent' }] }] }), /err\.traveler/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, end: '2026-12-01' }] }), /err\.endBeforeStart/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, start: null, end: null, margin: 3 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, margin: 1.5 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, travelers: [...t.travelers, t.travelers[0]] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: Array(31).fill(t) }), /err\.tooManyTrips/);
});
