// Tests métier de RepairLedger : dates, montants, objets, réparations, garanties, seuil, rappels, CSV, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = (p) => `${p}-${String(++n).padStart(4, '0')}`;
const obj = (name, price, threshold, purchaseDate = '') => C.makeObject({ name, category: 'electronics', purchaseDate, price, threshold }, id('obj'));
const rep = (objects, objectId, date, cost, extra = {}) => C.makeRepair({ objectId, date, cost, provider: 'Atelier', description: 'Écran', warrantyMonths: '', warrantyDate: '', ...extra }, id('rep'), objects);

test('dates civiles : validation, écarts, ajout de mois borné', () => {
  assert.equal(C.isDay('2026-02-29'), false);
  assert.equal(C.isDay('2028-02-29'), true);
  assert.equal(C.addDays('2026-03-28', 3), '2026-03-31'); // passage à l'heure d'été sans effet
  assert.equal(C.diffDays('2026-10-20', '2026-10-27'), 7);
  assert.equal(C.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(C.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(C.addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(C.addMonths('2026-05-31', 12), '2027-05-31');
});

test('montants en centimes ; zéro permis seulement pour une réparation', () => {
  assert.equal(C.parseCents('89,90'), 8990);
  assert.equal(C.parseCents(' 1 249.5 '), 124950);
  assert.equal(C.parseCents('0', true), 0);
  assert.throws(() => C.parseCents('0'), /err\.amountPositive/);
  for (const bad of ['', 'abc', '-3', '1,999']) assert.throws(() => C.parseCents(bad), /^Error: err\.amount$/);
});

test('objet : prix, seuil et date d\'achat facultatifs mais cohérents', () => {
  const o = obj(' Téléphone ', '499', '50', '2025-01-10');
  assert.deepEqual([o.name, o.priceCents, o.thresholdPct, o.purchaseDate], ['Téléphone', 49900, 50, '2025-01-10']);
  assert.deepEqual([obj('Vélo', '', '').priceCents, obj('Vélo', '', '').thresholdPct], [null, null]);
  assert.throws(() => obj('X', '', '50'), /err\.thresholdNoPrice/);
  assert.throws(() => obj('X', '100', '0'), /err\.threshold/);
  assert.throws(() => obj('X', '100', '501'), /err\.threshold\|\{"max":500\}/);
  assert.throws(() => obj('X', '100', '12.5'), /err\.threshold/);
  assert.throws(() => obj('X', '100', '50', '2026-13-01'), /err\.purchaseDate/);
  assert.throws(() => C.makeObject({ name: 'X', category: 'house', price: '', threshold: '' }, id('obj')), /err\.category/);
});

test('réparation : garantie en mois ou par date, contrôles de cohérence', () => {
  const o = obj('Téléphone', '499', '50', '2025-01-10'), objects = [o];
  assert.equal(rep(objects, o.id, '2026-01-31', '129', { warrantyMonths: '1' }).warrantyEnd, '2026-02-28');
  assert.equal(rep(objects, o.id, '2026-01-31', '0', { warrantyDate: '2026-06-30' }).warrantyEnd, '2026-06-30');
  assert.equal(rep(objects, o.id, '2026-01-31', '20').warrantyEnd, null);
  assert.throws(() => rep(objects, o.id, '2026-01-31', '20', { warrantyMonths: '3', warrantyDate: '2026-06-30' }), /err\.warrantyBoth/);
  assert.throws(() => rep(objects, o.id, '2026-01-31', '20', { warrantyDate: '2026-01-30' }), /err\.warrantyBefore/);
  assert.throws(() => rep(objects, o.id, '2026-01-31', '20', { warrantyMonths: '121' }), /err\.months/);
  assert.throws(() => rep(objects, o.id, '2024-12-31', '20'), /err\.beforePurchase/);
  assert.throws(() => rep(objects, 'obj-none', '2026-01-31', '20'), /err\.object/);
  assert.throws(() => rep(objects, o.id, '31/01/2026', '20'), /err\.date/);
  assert.throws(() => rep(objects, o.id, '2026-01-31', '20', { provider: 'x'.repeat(61) }), /err\.providerLong/);
});

test('bilan par objet : coût cumulé, part du prix, seuil atteint ou restant', () => {
  const o = obj('Téléphone', '499', '50'), b = obj('Bottes', '', ''), objects = [o, b];
  const repairs = [rep(objects, o.id, '2025-06-01', '129'), rep(objects, o.id, '2026-10-07', '79,50')];
  const s = C.objectSummary(o, repairs);
  assert.deepEqual(s, { count: 2, totalCents: 20850, ratioPct: 41.8, thresholdCents: 24950, status: 'below', remainingCents: 4100, lastDate: '2026-10-07' });
  repairs.push(rep(objects, o.id, '2026-10-20', '41'));
  assert.equal(C.objectSummary(o, repairs).status, 'reached'); // 249,50 = seuil exact : atteint
  assert.equal(C.objectSummary(o, repairs).remainingCents, 0);
  assert.deepEqual(C.objectSummary(b, repairs), { count: 0, totalCents: 0, ratioPct: null, thresholdCents: null, status: 'none', remainingCents: null, lastDate: null });
});

test('garanties : état, rappels dans N jours, réparation pendant une garantie précédente', () => {
  const o = obj('Machine à café', '120', '50'), v = obj('Vélo', '650', '60'), objects = [o, v];
  const a = rep(objects, o.id, '2026-01-10', '45', { warrantyMonths: '3' }); // jusqu'au 2026-04-10
  const b = rep(objects, o.id, '2026-03-01', '60');
  const c = rep(objects, v.id, '2026-09-01', '85', { warrantyDate: '2026-11-06' });
  const d = rep(objects, v.id, '2026-10-01', '30', { warrantyDate: '2026-10-27' });
  const repairs = [a, b, c, d];
  assert.deepEqual(C.warrantyState(a, '2026-10-27'), { state: 'expired', days: -200 });
  assert.deepEqual(C.warrantyState(c, '2026-10-27'), { state: 'active', days: 10 });
  assert.deepEqual(C.warrantyState(b, '2026-10-27'), { state: 'none', days: null });
  assert.equal(C.coveredBy(b, repairs).id, a.id);
  assert.equal(C.coveredBy(a, repairs), null);
  assert.equal(C.coveredBy(d, repairs).id, c.id); // même objet, dans la garantie de c
  assert.deepEqual(C.reminders(repairs, '2026-10-27', 30).map((r) => [r.repair.id, r.days]), [[d.id, 0], [c.id, 10]]);
  assert.deepEqual(C.reminders(repairs, '2026-10-27', 5).map((r) => r.days), [0]);
  const tt = C.totals(objects, repairs, '2026-10-27');
  assert.deepEqual(tt, { totalCents: 22000, yearCents: 22000, count: 4, active: 2, reached: 1 });
});

test('exports : CSV protégé et agenda .ics avec alarme', () => {
  const o = obj('=Téléphone; pro', '499', '50'), objects = [o];
  const repairs = [rep(objects, o.id, '2026-10-01', '129,9', { warrantyMonths: '6', description: 'Écran, vitre' }), rep(objects, o.id, '2026-02-01', '10')];
  const csv = C.toCSV(objects, repairs, { headers: ['Date', 'Objet', 'Catégorie', 'Prestataire', 'Travaux', 'Coût (EUR)', 'Fin'], categoryLabel: () => 'Électronique', decimal: 'comma' });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[1], `2026-02-01;"'=Téléphone; pro";Électronique;Atelier;Écran;10,00;`);
  assert.equal(lines[2], `2026-10-01;"'=Téléphone; pro";Électronique;Atelier;Écran, vitre;129,90;2027-04-01`);
  const text = { summary: (ob) => `Fin de garantie : ${ob.name}`, describe: (ob, r) => `${r.description}, ${r.provider}` };
  const ics = C.toICS(objects, repairs, '2026-10-27', '20261027T120000Z', text, 30);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270401\r\nDTEND;VALUE=DATE:20270402'));
  assert.ok(ics.includes('TRIGGER:-P30D'));
  assert.ok(ics.includes('DESCRIPTION:Écran\\, vitre\\, Atelier'));
  assert.ok(!C.toICS(objects, repairs, '2026-10-27', '20261027T120000Z', text, 0).includes('VALARM'));
  assert.throws(() => C.toICS(objects, repairs, '2026-10-27', 'bad', text, 0), /err\.stamp/);
  assert.throws(() => C.toCSV(objects, repairs, { headers: [] }), /err\.headers/);
});

test('calendrier : retour chariot isolé échappé dans les événements et les alarmes',()=>{
  const o=obj('Vélo','500','50','2026-01-01'), objects=[o];
  const r=rep(objects,o.id,'2026-02-01','20',{warrantyDate:'2026-12-01'});
  const text=C.toICS(objects,[r],'2026-10-27','20261027T120000Z',{
    summary:()=> 'Garantie\rInjection',describe:()=> 'Ligne\r\nSuite'
  },7);
  assert.ok(text.includes('SUMMARY:Garantie\\nInjection'));
  assert.ok(text.includes('DESCRIPTION:Ligne\\nSuite'));
  assert.equal(text.replace(/\r\n/g,'').includes('\r'),false);
});
test('calendrier : rejette les durées d’alarme invalides hors de 0 à 365 jours',()=>{
  const opts={summary:()=> 'Garantie',describe:()=> 'Description'};
  for(const n of [-1,366,400,1.5,'7',NaN])assert.throws(()=>C.toICS([],[],'2026-10-27','20261027T120000Z',opts,n),/err\.remind/);
  assert.ok(C.toICS([],[],'2026-10-27','20261027T120000Z',opts,365).includes('END:VCALENDAR'));
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const o = obj('Vélo', '650', '60', '2023-05-01'), objects = [o];
  const data = { settings: C.makeSettings({ reminderDays: '15' }), objects, repairs: [rep(objects, o.id, '2026-09-01', '85', { warrantyMonths: '2' })] };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'repairledger', version: 1, ...data };
  assert.throws(() => C.validateData({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, settings: { reminderDays: '15' } }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, settings: { reminderDays: 400 } }), /err\.remind/);
  assert.throws(() => C.validateData({ ...ok, objects: [{ ...o, priceCents: 12.5 }] }), /err\.amount/);
  assert.throws(() => C.validateData({ ...ok, objects: [] }), /err\.object/); // réparation orpheline
  assert.throws(() => C.validateData({ ...ok, repairs: [{ ...data.repairs[0], costCents: -1 }] }), /err\.amount/);
  assert.throws(() => C.validateData({ ...ok, repairs: [{ ...data.repairs[0], warrantyEnd: '2026-08-01' }] }), /err\.warrantyBefore/);
  assert.throws(() => C.validateData({ ...ok, repairs: [{ ...data.repairs[0], date: '2023-01-01' }] }), /err\.beforePurchase/);
  assert.throws(() => C.validateData({ ...ok, repairs: [data.repairs[0], data.repairs[0]] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, repairs: [{ ...data.repairs[0], note: '' }] }), /err\.backup/);
});
