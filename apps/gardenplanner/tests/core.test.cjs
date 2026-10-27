// Tests métier de GardenPlanner : parcelles, placement, dates saisies ou délais, occupation, rotation, calendrier, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const bed = C.makeBed({ name: 'Carré nord', cols: '4', rows: '3', cellCm: '30' }, 'bed-00001');
const beds = [bed];
const crop = (over = {}, id = 'crop-0001') => C.makeCrop({
  bedId: bed.id, name: 'Tomate', family: 'solanaceae', x: '1', y: '1', w: '2', h: '1', sow: '2026-03-01',
  plant: { mode: 'days', value: '60' }, harvest: { mode: 'days', value: '140' }, harvestEnd: { mode: 'none' }, note: '', ...over,
}, id, beds);

test('parcelles : grille de cases entières, taille de case en cm, surface', () => {
  assert.deepEqual(bed, { id: 'bed-00001', name: 'Carré nord', cols: 4, rows: 3, cellCm: 30 });
  assert.equal(C.bedAreaCm2(bed), 4 * 3 * 900); // 1,08 m²
  assert.throws(() => C.makeBed({ name: '', cols: '4', rows: '3', cellCm: '30' }, 'bed-00002'), /err\.bedName/);
  assert.throws(() => C.makeBed({ name: 'A', cols: '21', rows: '3', cellCm: '30' }, 'bed-00002'), /err\.side\|\{"max":20\}/);
  assert.throws(() => C.makeBed({ name: 'A', cols: '2.5', rows: '3', cellCm: '30' }, 'bed-00002'), /err\.side/);
  assert.throws(() => C.makeBed({ name: 'A', cols: '2', rows: '3', cellCm: '5' }, 'bed-00002'), /err\.cell\|\{"min":10,"max":500\}/);
});

test('dates saisies ou délais saisis à partir du semis : stockés en délais, mêmes résultats', () => {
  const byDays = crop();
  const byDates = crop({ plant: { mode: 'date', value: '2026-04-30' }, harvest: { mode: 'date', value: '2026-07-19' }, harvestEnd: { mode: 'date', value: '2026-09-30' } });
  assert.equal(byDates.plantDays, 60); assert.equal(byDates.harvestDays, 140); assert.equal(byDates.harvestEndDays, 213);
  assert.deepEqual(C.cropDates(byDays), { sow: '2026-03-01', plant: '2026-04-30', harvest: '2026-07-19', harvestEnd: null, start: '2026-04-30', end: '2026-07-19', year: 2026 });
  assert.equal(C.cropDates(byDates).end, '2026-09-30');
  const direct = crop({ name: 'Radis', family: 'brassicaceae', plant: { mode: 'none' }, harvest: { mode: 'days', value: '28' } });
  assert.equal(C.cropDates(direct).start, '2026-03-01'); // semis direct : occupé dès le semis
  assert.equal(C.cropAreaCm2(byDays, bed), 2 * 900);
});

test('saisies refusées : hors grille, ordre des étapes, délais', () => {
  assert.throws(() => crop({ x: '4', w: '2' }), /err\.outside\|\{"cols":4,"rows":3\}/);
  assert.throws(() => crop({ y: '4' }), /err\.cellPos/);
  assert.throws(() => crop({ name: ' ' }), /err\.cropName/);
  assert.throws(() => crop({ family: 'rosaceae' }), /err\.family/);
  assert.throws(() => crop({ sow: '2026-02-30' }), /err\.sow/);
  assert.throws(() => crop({ plant: { mode: 'date', value: '2026-02-01' } }), /err\.plantBeforeSow/);
  assert.throws(() => crop({ plant: { mode: 'days', value: '400' } }), /err\.plantDays\|\{"max":365\}/);
  assert.throws(() => crop({ harvest: { mode: 'days', value: '50' } }), /err\.harvestBeforePlant/);
  assert.throws(() => crop({ harvest: { mode: 'none' } }), /err\.harvestRequired/);
  assert.throws(() => crop({ harvestEnd: { mode: 'days', value: '100' } }), /err\.harvestEndBefore/);
  assert.throws(() => crop({ bedId: 'bed-99999' }), /err\.bedUnknown/);
});

test('occupation : mêmes cases en même temps refusé, successions acceptées', () => {
  let data = { beds, crops: [] };
  data = C.upsertCrop(data, crop());
  // Laitue sur une case de la tomate, récoltée avant la plantation de la tomate : succession possible.
  const lettuce = crop({ name: 'Laitue', family: 'asteraceae', x: '2', w: '1', sow: '2026-02-01', plant: { mode: 'none' }, harvest: { mode: 'days', value: '60' } }, 'crop-0002');
  data = C.upsertCrop(data, lettuce);
  // Même case, période qui chevauche : refusé et nommé.
  const clash = crop({ name: 'Poivron', x: '2', w: '1', sow: '2026-03-15' }, 'crop-0003');
  assert.throws(() => C.upsertCrop(data, clash), /err\.overlap\|\{"name":"Tomate"\}/);
  // Autre case : accepté.
  data = C.upsertCrop(data, crop({ name: 'Poivron', x: '3', w: '1', sow: '2026-03-15' }, 'crop-0003'));
  // Modifier une culture ne la compare pas à elle-même.
  data = C.upsertCrop(data, { ...data.crops[0], note: 'tuteurs' });
  assert.equal(data.crops.length, 3);
  const g = C.grid(bed, data.crops, 2026);
  assert.deepEqual(g[0], [['crop-0001'], ['crop-0002', 'crop-0001'], ['crop-0003'], []]);
  assert.deepEqual(C.grid(bed, data.crops, 2025)[0][0], []);
  // Réduire la parcelle sous une culture : refusé.
  assert.throws(() => C.upsertBed(data, { ...bed, cols: 2 }), /err\.shrink/);
  assert.equal(C.upsertBed(data, { ...bed, rows: 1 }).beds[0].rows, 1);
});

test("rotation : même famille sur la même parcelle l'année précédente signalée", () => {
  const prev = crop({ name: 'Pomme de terre', x: '3', w: '2', sow: '2025-04-01', plant: { mode: 'none' }, harvest: { mode: 'days', value: '100' } }, 'crop-0010');
  const prevBeans = crop({ name: 'Haricot', family: 'fabaceae', sow: '2025-05-01', plant: { mode: 'none' }, harvest: { mode: 'days', value: '70' } }, 'crop-0011');
  const old = crop({ name: 'Aubergine', sow: '2024-03-01' }, 'crop-0012');
  const tomato = crop();
  const w = C.rotationWarnings([prev, prevBeans, old, tomato], tomato);
  assert.deepEqual(w.map((x) => [x.crop.name, x.cells]), [['Pomme de terre', false]]); // même parcelle, autres cases
  const onTop = crop({ x: '3', w: '1' }, 'crop-0013');
  assert.equal(C.rotationWarnings([prev, onTop], onTop)[0].cells, true);
  assert.deepEqual(C.rotationWarnings([prev, prevBeans], crop({ family: 'other' }, 'crop-0014')), []);
  const bed2 = C.makeBed({ name: 'Sud', cols: '4', rows: '4', cellCm: '30' }, 'bed-00002');
  const elsewhere = C.makeCrop({ ...prev, bedId: bed2.id, x: '3', y: '1', w: '2', h: '1', plant: { mode: 'none' }, harvest: { mode: 'days', value: '100' }, harvestEnd: { mode: 'none' } }, 'crop-0015', [bed, bed2]);
  assert.deepEqual(C.rotationWarnings([elsewhere, tomato], tomato), []);
});

test('calendrier : tâches du mois triées, tâches faites marquées', () => {
  const t1 = C.toggleDone(crop(), 'sow');
  const t2 = crop({ name: 'Radis', family: 'brassicaceae', x: '4', w: '1', sow: '2026-04-10', plant: { mode: 'none' }, harvest: { mode: 'days', value: '28' }, harvestEnd: { mode: 'days', value: '35' } }, 'crop-0002');
  assert.deepEqual(C.monthBounds('2026-04'), { from: '2026-04-01', to: '2026-04-30' });
  assert.deepEqual(C.monthBounds('2028-02').to, '2028-02-29');
  const april = C.tasks([t1, t2], '2026-04-01', '2026-04-30');
  assert.deepEqual(april.map((x) => [x.day, x.kind, x.crop.name]), [['2026-04-10', 'sow', 'Radis'], ['2026-04-30', 'plant', 'Tomate']]);
  assert.deepEqual(C.tasks([t1], '2026-03-01', '2026-03-31').map((x) => x.done), [true]);
  assert.deepEqual(C.toggleDone(t1, 'sow').done, []);
  assert.deepEqual(C.toggleDone(C.toggleDone(crop(), 'harvest'), 'sow').done, ['sow', 'harvest']);
  assert.equal(C.addMonth('2026-12', 1), '2027-01');
  assert.equal(C.addMonth('2026-01', -1), '2025-12');
});

test('export .ics : tâches non faites de l\'année', () => {
  const c = C.toggleDone(crop({ name: 'Tomate, cœur de bœuf' }), 'sow');
  const { text, count } = C.toICS([c], beds, 2026, '20261027T120000Z', { summary: (k, cr, b) => `${k} — ${cr.name} (${b.name})`, description: () => 'GardenPlanner' });
  assert.equal(count, 2); // plantation et récolte (semis déjà fait)
  assert.match(text, /DTSTART;VALUE=DATE:20260430\r\nDTEND;VALUE=DATE:20260501/);
  assert.match(text, /SUMMARY:plant — Tomate\\, cœur de bœuf \(Carré nord\)/);
  assert.ok(!text.includes('crop-0001-sow'));
  assert.ok(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.equal(C.toICS([c], beds, 2027, '20261027T120000Z', { summary: String, description: String }).count, 0);
  assert.throws(() => C.toICS([c], beds, 2026, 'x', { summary: String, description: String }), /err\.stamp/);
});

test('suppression d\'une parcelle : ses cultures partent avec elle ; limites', () => {
  const data = C.upsertCrop({ beds, crops: [] }, crop());
  assert.deepEqual(C.removeBed(data, bed.id), { beds: [], crops: [] });
  const full = { beds: Array.from({ length: C.MAX_BEDS }, (_, i) => ({ ...bed, id: `bed-x${String(i).padStart(4, '0')}` })), crops: [] };
  assert.throws(() => C.upsertBed(full, { ...bed, id: 'bed-new001' }), /err\.tooManyBeds/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  let data = { beds, crops: [] };
  data = C.upsertCrop(data, C.toggleDone(crop({ harvestEnd: { mode: 'days', value: '200' } }), 'sow'));
  data = C.upsertCrop(data, crop({ name: 'Radis', family: 'brassicaceae', x: '4', w: '1', plant: { mode: 'none' }, harvest: { mode: 'days', value: '30' } }, 'crop-0002'));
  const json = JSON.parse(C.backup(data));
  assert.deepEqual(C.validateData(json), data);
  const bad = (mut) => { const d = JSON.parse(JSON.stringify(json)); mut(d); return d; };
  assert.throws(() => C.validateData({ ...json, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData(bad((d) => { d.extra = 1; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.crops[0].x = '1'; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.crops[0].done = ['water']; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.crops[0].bedId = 'bed-99999'; })), /err\.bedUnknown/);
  assert.throws(() => C.validateData(bad((d) => { d.crops[1].x = 2; d.crops[1].harvestDays = 90; })), /err\.overlap/); // chevauchement
  assert.throws(() => C.validateData(bad((d) => { d.crops[1].id = d.crops[0].id; d.crops[1].x = 4; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.beds[0].cols = 30; })), /err\.side/);
  assert.throws(() => C.validateData(bad((d) => { d.crops[0].plantDays = 200; })), /err\.harvestBeforePlant/);
});
