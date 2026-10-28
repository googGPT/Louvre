// Tests métier de PetCareLog : récurrences saisies, échéances, rendez-vous, poids, dépenses, CSV, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const TODAY = '2026-10-27';
const rex = C.makePet({ name: 'Rex', species: 'Chien', birth: '2020-05-04' }, 'pet-00001');
const mia = C.makePet({ name: 'Mia', species: '', birth: '' }, 'pet-00002');
const pets = [rex, mia];
const care = (over = {}, id = 'care-0001') => C.makeCare({ petId: rex.id, type: 'vaccine', label: 'Rage', every: '1', unit: 'year', last: '2025-11-03', note: '', ...over }, id, pets, TODAY);

test('animaux : nom obligatoire, date de naissance facultative mais valide', () => {
  assert.deepEqual(rex, { id: 'pet-00001', name: 'Rex', species: 'Chien', birth: '2020-05-04' });
  assert.throws(() => C.makePet({ name: ' ' }, 'pet-00009'), /err\.petName/);
  assert.throws(() => C.makePet({ name: 'A', birth: '2026-02-30' }, 'pet-00009'), /err\.birth/);
  assert.throws(() => C.makePet({ name: 'x'.repeat(41) }, 'pet-00009'), /err\.nameLong\|\{"max":40\}/);
  assert.throws(() => C.makePet({ name: 'A' }, 'x'), /err\.id/);
});

test('récurrences : jours, semaines, mois ancrés (fin de mois), années (29 février)', () => {
  assert.equal(C.addInterval('2026-01-31', 1, 'month'), '2026-02-28');
  assert.equal(C.addInterval('2026-01-31', 2, 'month'), '2026-03-31');
  assert.equal(C.addInterval('2024-02-29', 1, 'year'), '2025-02-28');
  assert.equal(C.addInterval('2026-10-27', 3, 'week'), '2026-11-17');
  assert.equal(C.addInterval('2026-12-30', 5, 'day'), '2027-01-04');
  assert.equal(C.addInterval('2026-11-15', 3, 'month'), '2027-02-15');
  assert.throws(() => C.addInterval('2026-10-27', 1, 'decade'), /err\.unit/);
  for (const bad of ['0', '121', '1.5', '', 'abc']) assert.throws(() => C.parseEvery(bad), /err\.every/);
});

test('soins : échéance, retard, « fait » qui ne recule jamais', () => {
  const c = care();
  assert.equal(C.nextDue(c), '2026-11-03');
  assert.deepEqual(C.careStatus(c, TODAY), { next: '2026-11-03', days: 7, state: 'soon' });
  const late = care({ type: 'deworm', label: '', every: '3', unit: 'month', last: '2026-07-01' }, 'care-0002');
  assert.deepEqual(C.careStatus(late, TODAY), { next: '2026-10-01', days: -26, state: 'late' });
  assert.equal(C.careStatus(care({ last: '2025-10-27' }), TODAY).state, 'today');
  assert.equal(C.careStatus(care({ every: '2' }), TODAY).state, 'ok');
  const done = C.markCareDone(late, TODAY, TODAY);
  assert.equal(C.nextDue(done), '2027-01-27');
  assert.equal(C.markCareDone(done, '2026-09-01', TODAY).last, TODAY); // un soin plus ancien ne recule pas
  assert.throws(() => C.markCareDone(done, '2026-10-28', TODAY), /err\.dateFuture/);
  assert.deepEqual(C.caresFor([c, late], rex.id, TODAY).map((x) => x.id), ['care-0002', 'care-0001']);
  assert.throws(() => care({ type: 'magic' }), /err\.careType/);
  assert.throws(() => care({ petId: 'pet-99999' }), /err\.petUnknown/);
  assert.throws(() => care({ last: '2026-11-01' }), /err\.lastFuture/);
  assert.throws(() => care({ last: '' }), /err\.last/);
});

test('rendez-vous : à venir triés, passés à part, heure facultative mais valide', () => {
  const a1 = C.makeAppt({ petId: rex.id, date: '2026-11-10', time: '09:30', title: 'Contrôle', place: 'Clinique' }, 'appt-0001', pets);
  const a2 = C.makeAppt({ petId: rex.id, date: '2026-11-10', time: '', title: 'Toilettage', place: '' }, 'appt-0002', pets);
  const a3 = C.makeAppt({ petId: rex.id, date: '2026-09-01', time: '', title: 'Ancien', place: '' }, 'appt-0003', pets);
  const r = C.apptsFor([a1, a3, a2], rex.id, TODAY);
  assert.deepEqual(r.upcoming.map((a) => a.id), ['appt-0002', 'appt-0001']);
  assert.deepEqual(r.past.map((a) => a.id), ['appt-0003']);
  assert.throws(() => C.makeAppt({ petId: rex.id, date: '2026-11-10', time: '24:00', title: 'X' }, 'appt-0004', pets), /err\.time/);
  assert.throws(() => C.makeAppt({ petId: rex.id, date: '2026-11-10', title: '' }, 'appt-0004', pets), /err\.apptTitle/);
});

test('poids : saisie en kg ou g convertie en grammes entiers, statistiques et géométrie du graphique', () => {
  assert.equal(C.parseGrams('12,345', 'kg'), 12345);
  assert.equal(C.parseGrams('4.2', 'kg'), 4200);
  assert.equal(C.parseGrams('850', 'g'), 850);
  for (const [v, u] of [['0', 'kg'], ['1.2345', 'kg'], ['12.5', 'g'], ['abc', 'kg'], ['1001', 'kg']]) assert.throws(() => C.parseGrams(v, u), /err\.weight/);
  assert.throws(() => C.parseGrams('1', 'lb'), /err\.unit/);
  const w = (date, value, id) => C.makeWeight({ petId: rex.id, date, value, unit: 'kg' }, id, pets, TODAY);
  const weights = [w('2026-03-01', '20', 'w-000003'), w('2026-01-01', '21', 'w-000001'), w('2026-02-01', '20.5', 'w-000002'),
    C.makeWeight({ petId: mia.id, date: '2026-01-01', value: '4', unit: 'kg' }, 'w-000009', pets, TODAY)];
  const s = C.weightSeries(weights, rex.id);
  assert.deepEqual(s.map((x) => x.grams), [21000, 20500, 20000]);
  const st = C.weightStats(s);
  assert.equal(st.changeGrams, -1000); assert.equal(st.changePermil, -48); // -4,8 %
  assert.equal(st.minGrams, 20000); assert.equal(st.maxGrams, 21000);
  const g = C.chartGeometry(s, 600, 200, { left: 50, right: 10, top: 10, bottom: 30 });
  assert.equal(g.points[0].x, 50); assert.equal(g.points[2].x, 590);
  assert.ok(g.points[0].y < g.points[2].y); // plus lourd = plus haut
  assert.ok(g.lo < 20000 && g.hi > 21000);
  assert.equal(C.chartGeometry([s[0]], 600, 200, { left: 50, right: 10, top: 10, bottom: 30 }).points[0].x, 320);
  assert.equal(C.weightStats([]), null);
  assert.throws(() => w('2026-12-01', '20', 'w-000004'), /err\.dateFuture/);
});

test('dépenses : centimes exacts, totaux par animal, catégorie et année', () => {
  assert.equal(C.parseCents('12,30'), 1230);
  assert.equal(C.parseCents('0.10'), 10);
  for (const bad of ['0', '-5', '1,234', 'abc', '']) assert.throws(() => C.parseCents(bad), /err\.amount/);
  const e = (date, category, amount, petId, id) => C.makeExpense({ petId, date, category, amount, label: '' }, id, pets);
  const list = [e('2026-01-05', 'food', '0.10', rex.id, 'exp-00001'), e('2026-02-05', 'food', '0.20', rex.id, 'exp-00002'),
    e('2026-03-05', 'vet', '45', mia.id, 'exp-00003'), e('2025-12-31', 'vet', '100', rex.id, 'exp-00004')];
  const all = C.expenseTotals(list);
  assert.equal(all.total, 14530);
  assert.deepEqual(all.byCategory, { food: 30, vet: 14500 }); // 0,10 + 0,20 = 0,30 exactement
  assert.deepEqual(all.byPet, { [rex.id]: 10030, [mia.id]: 4500 });
  assert.deepEqual(C.expenseTotals(list, { year: 2026 }).byPet, { [rex.id]: 30, [mia.id]: 4500 });
  assert.equal(C.expenseTotals(list, { petId: rex.id, year: '2025' }).total, 10000);
  assert.deepEqual(C.years(list), ['2026', '2025']);
  assert.throws(() => e('2026-01-01', 'toys', '1', rex.id, 'exp-00005'), /err\.category/);
  const csv = C.expensesCSV(list, { headers: ['Date', 'Animal', 'Catégorie', 'Libellé', 'Montant'], petName: (id) => (id === rex.id ? 'Rex' : '=Mia'), catLabel: (c) => c, decimal: 'comma' });
  assert.ok(csv.startsWith('﻿Date;Animal;Catégorie;Libellé;Montant\r\n2025-12-31;Rex;vet;;100,00\r\n'));
  assert.ok(csv.includes("2026-03-05;'=Mia;vet;;45,00\r\n")); // formule neutralisée
  assert.ok(csv.includes('2026-01-05;Rex;food;;0,10\r\n'));
  const wcsv = C.weightsCSV([C.makeWeight({ petId: rex.id, date: '2026-01-01', grams: 20050 }, 'w-000001', pets, TODAY)], { headers: ['Date', 'Animal', 'kg'], petName: () => 'Rex', decimal: 'dot' });
  assert.equal(wcsv, '﻿Date;Animal;kg\r\n2026-01-01;Rex;20.050\r\n');
});

test('export .ics : occurrences des soins (retard ramené au premier jour) et rendez-vous', () => {
  const monthly = care({ type: 'flea', label: '', every: '1', unit: 'month', last: '2026-09-15' }, 'care-0003'); // dû le 15/10 : en retard
  assert.deepEqual(C.careOccurrences(monthly, TODAY, '2027-01-31'), ['2026-10-27', '2026-11-15', '2026-12-15', '2027-01-15']);
  assert.deepEqual(C.careOccurrences(care(), TODAY, '2027-01-31'), ['2026-11-03']);
  const appt = C.makeAppt({ petId: rex.id, date: '2026-11-10', time: '09:30', title: 'Contrôle, annuel', place: 'Clinique' }, 'appt-0001', pets);
  const { text, count } = C.toICS({ cares: [monthly], appts: [appt] }, TODAY, 60, '20261027T120000Z', { care: (c) => `Antiparasitaire — Rex`, appt: (a) => `${a.title} — Rex` });
  assert.equal(count, 4); // 27/10, 15/11, 15/12 + rendez-vous
  assert.match(text, /DTSTART:20261110T093000\r\nDURATION:PT1H/);
  assert.match(text, /SUMMARY:Contrôle\\, annuel — Rex/);
  assert.match(text, /LOCATION:Clinique/);
  assert.throws(() => C.toICS({ cares: [], appts: [] }, TODAY, 0, '20261027T120000Z', { care: String, appt: String }), /err\.horizon/);
  const daily = Array.from({ length: 10 }, (_, i) => care({ every: '1', unit: 'day', last: TODAY }, `care-d${String(i).padStart(4, '0')}`));
  assert.throws(() => C.toICS({ cares: daily, appts: [] }, TODAY, 365, '20261027T120000Z', { care: String, appt: String }), /err\.icsTooMany/);
});

test('ICS : les retours chariot seuls sont échappés, pas injectés dans les événements',()=>{
  const appointment=C.makeAppt({petId:rex.id,date:'2026-11-10',time:'09:30',title:'Visite',place:'Cabinet'},'appt-cr001',pets);
  const {text}=C.toICS({cares:[],appts:[appointment]},TODAY,40,'20261027T120000Z',{care:()=>'',appt:()=>'Visite\rInjectée'});
  assert.ok(text.includes('SUMMARY:Visite\\nInjectée'));
  assert.equal(text.replace(/\r\n/g,'').includes('\r'),false);
});
test('rendez-vous à date et heure égales : ordre stable par identifiant',()=>{
  const a=C.makeAppt({petId:rex.id,date:'2026-11-10',time:'09:30',title:'Visite',place:''},'appt-0001',pets);
  assert.deepEqual(C.apptsFor([{...a,id:'appt-0002'},a],rex.id,TODAY).upcoming.map(x=>x.id),['appt-0001','appt-0002']);
});

test('supprimer un animal supprime ses soins, rendez-vous, poids et dépenses ; limites', () => {
  let data = { ...C.emptyData(), pets };
  data = C.upsert(data, 'cares', care());
  data = C.upsert(data, 'expenses', C.makeExpense({ petId: mia.id, date: TODAY, category: 'food', amount: '5' }, 'exp-00001', pets));
  data = C.upsert(data, 'cares', { ...care(), label: 'Rage (rappel)' });
  assert.equal(data.cares.length, 1); assert.equal(data.cares[0].label, 'Rage (rappel)');
  const after = C.removePet(data, rex.id);
  assert.deepEqual([after.pets.length, after.cares.length, after.expenses.length], [1, 0, 1]);
  const full = { ...C.emptyData(), pets: Array.from({ length: C.MAX_PETS }, (_, i) => C.makePet({ name: 'P' + i }, `pet-x${String(i).padStart(4, '0')}`)) };
  assert.throws(() => C.upsert(full, 'pets', C.makePet({ name: 'Z' }, 'pet-zzzzz')), /err\.tooMany\|\{"max":30\}/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = {
    pets, cares: [care()], appts: [C.makeAppt({ petId: rex.id, date: '2026-11-10', time: '09:30', title: 'Contrôle', place: '' }, 'appt-0001', pets)],
    weights: [C.makeWeight({ petId: rex.id, date: '2026-01-01', value: '20', unit: 'kg' }, 'w-000001', pets, TODAY)],
    expenses: [C.makeExpense({ petId: mia.id, date: TODAY, category: 'vet', amount: '45,50', label: 'Visite' }, 'exp-00001', pets)],
  };
  const json = JSON.parse(C.backup(data));
  assert.deepEqual(C.validateData(json), data);
  const bad = (mut) => { const d = JSON.parse(JSON.stringify(json)); mut(d); return d; };
  assert.throws(() => C.validateData({ ...json, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData(bad((d) => { d.extra = 1; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.cares[0].petId = 'pet-99999'; })), /err\.petUnknown/);
  assert.throws(() => C.validateData(bad((d) => { d.cares[0].every = '1'; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.expenses[0].cents = 12.5; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.expenses[0].cents = -1; })), /err\.amount/);
  assert.throws(() => C.validateData(bad((d) => { d.weights[0].grams = 0; })), /err\.weight/);
  assert.throws(() => C.validateData(bad((d) => { d.appts[0].time = '9h'; })), /err\.time/);
  assert.throws(() => C.validateData(bad((d) => { d.weights[0].id = d.expenses[0].id; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.pets[0].extra = ''; })), /err\.backup/);
  assert.throws(() => C.validateData([]), /err\.backup/);
});
