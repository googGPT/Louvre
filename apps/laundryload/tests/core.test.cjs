// Tests métier de LaundryLoad : saisie, regroupement en charges, explications, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const g = (name, color, maxC, weight, extra = {}) => C.makeGarment({ name, color, material: 'cotton', care: 'machine', maxC, weight, tumble: false, delicate: false, inBasket: true, ...extra }, `garment-${String(++n).padStart(4, '0')}`);
const S = (o = {}) => C.makeSettings({ ...C.DEFAULT_SETTINGS, capacityG: 7000, ...o });
const names = (all, ids) => ids.map((id) => all.find((x) => x.id === id).name);

test('poids et capacité en kg convertis en grammes entiers, bornes vérifiées', () => {
  assert.equal(C.parseWeight('0,25'), 250);
  assert.equal(C.parseWeight('1.2'), 1200);
  assert.equal(C.parseCapacity('7'), 7000);
  for (const bad of ['0', '', 'abc', '-1', '21', '0,001']) assert.throws(() => C.parseWeight(bad), /^Error: err\.weight/);
  assert.throws(() => C.parseCapacity('0,5'), /err\.capacity\|\{"min":1,"max":30\}/);
  assert.throws(() => C.parseCapacity('31'), /err\.capacity/);
});

test('vêtement : validations et température seulement pour la machine', () => {
  assert.equal(g('Pull', 'dark', '30', '0.5').maxC, 30);
  assert.equal(g('Gilet', 'light', 40, '0.4', { care: 'hand' }).maxC, null);
  assert.throws(() => g('X', 'pink', 40, '1'), /err\.color/);
  assert.throws(() => g('X', 'white', 45, '1'), /err\.temp/);
  assert.throws(() => g('X', 'white', 40, '1', { material: 'cuir' }), /err\.material/);
  assert.throws(() => g('X', 'white', 40, '1', { care: 'pressing' }), /err\.care/);
  assert.throws(() => g('  ', 'white', 40, '1'), /err\.nameRequired/);
  assert.throws(() => g('X', 'white', 40, '1', { tumble: 'oui' }), /err\.backup/);
});

test('réglages : écart, remplissage, capacité absente', () => {
  assert.deepEqual(S({ tempGapC: '20', gentleFillPct: '50' }), { capacityG: 7000, mergeLight: false, tempGapC: 20, gentleFillPct: 50 });
  assert.equal(S({ tempGapC: '' }).tempGapC, null);
  assert.throws(() => S({ tempGapC: 15 }), /err\.gap/);
  assert.throws(() => S({ gentleFillPct: 5 }), /err\.fill/);
  assert.throws(() => S({ gentleFillPct: 50.5 }), /err\.fill/);
  assert.throws(() => C.plan([], C.DEFAULT_SETTINGS), /err\.noCapacity/);
});

test('couleurs séparées, température = minimum du groupe, explications', () => {
  const all = [g('Draps', 'white', 60, '1.2'), g('T-shirt blanc', 'white', 40, '0.2'), g('Chemise', 'light', 40, '0.3'), g('Jean', 'dark', 40, '0.8'), g('Legging', 'dark', 30, '0.25')];
  const r = C.plan(all, S());
  assert.deepEqual(r.loads.map((l) => [l.color, l.program, l.maxC]), [['white', 'normal', 40], ['light', 'normal', 40], ['dark', 'normal', 30]]);
  const white = r.loads[0];
  assert.deepEqual(names(all, white.limitedBy), ['T-shirt blanc']);
  assert.deepEqual(names(all, white.colder), ['Draps']);
  assert.equal(white.weightG, 1400);
  assert.equal(white.fillPct, 20);
  assert.equal(r.totalG, 2750);
  // Blancs et clairs réunis sur demande.
  const merged = C.plan(all, S({ mergeLight: true }));
  assert.deepEqual(merged.loads.map((l) => l.color), ['whiteLight', 'dark']);
  assert.equal(merged.loads[0].items.length, 3);
});

test('délicat, soie et laine forment des programmes séparés ; main et « ne pas laver » mis de côté', () => {
  const all = [g('T-shirt', 'color', 40, '0.2'), g('Blouse', 'color', 30, '0.15', { material: 'silk' }), g('Top', 'color', 30, '0.2', { delicate: true }),
    g('Pull', 'color', 30, '0.5', { material: 'wool' }), g('Cachemire', 'color', 30, '0.4', { care: 'hand' }), g('Manteau', 'dark', 30, '1.5', { care: 'none' }),
    g('Hors panier', 'color', 40, '0.3', { inBasket: false })];
  assert.deepEqual([C.programOf(all[1]), C.programOf(all[2]), C.programOf(all[3])], ['delicate', 'delicate', 'wool']);
  const r = C.plan(all, S());
  assert.deepEqual(r.loads.map((l) => l.program), ['normal', 'delicate', 'wool']);
  assert.deepEqual(names(all, r.loads[1].items), ['Blouse', 'Top']);
  assert.deepEqual(names(all, r.excluded.hand), ['Cachemire']);
  assert.deepEqual(names(all, r.excluded.none), ['Manteau']);
  assert.equal(r.inBasket, 6);
});

test('capacité : remplissage « premier qui convient » par poids décroissant, déterministe', () => {
  const all = [g('A', 'white', 60, '3'), g('B', 'white', 60, '2.5'), g('C', 'white', 60, '2'), g('D', 'white', 60, '1.5'), g('E', 'white', 60, '1')];
  const r = C.plan(all, S({ capacityG: 5000 }));
  assert.deepEqual(r.loads.map((l) => names(all, l.items)), [['A', 'C'], ['B', 'D', 'E']].map((x) => x.sort()));
  assert.deepEqual(r.loads.map((l) => [l.part, l.parts, l.bands, l.weightG]), [[1, 2, 1, 5000], [2, 2, 1, 5000]]);
  // Même résultat quel que soit l'ordre de saisie.
  assert.deepEqual(C.plan(all.slice().reverse(), S({ capacityG: 5000 })).loads.map((l) => l.items), r.loads.map((l) => l.items));
  // Un article plus lourd que la capacité forme sa propre charge, signalée.
  const big = C.plan([g('Couette', 'white', 60, '6'), g('Taie', 'white', 60, '0.2')], S({ capacityG: 5000 }));
  assert.deepEqual(big.loads.map((l) => [l.over, l.items.length]), [[true, 1], [false, 1]]);
  // Remplissage réduit pour délicat et laine.
  const wool = C.plan([g('P1', 'dark', 30, '2', { material: 'wool' }), g('P2', 'dark', 30, '2', { material: 'wool' })], S({ capacityG: 6000, gentleFillPct: 50 }));
  assert.deepEqual(wool.loads.map((l) => [l.capacityG, l.weightG]), [[3000, 2000], [3000, 2000]]);
});

test('écart de température maximal : bandes de températures', () => {
  const all = [g('Serviettes', 'white', 90, '1.8'), g('Draps', 'white', 60, '1.2'), g('T-shirt', 'white', 40, '0.2'), g('Body', 'white', 30, '0.1')];
  assert.deepEqual(C.plan(all, S()).loads.map((l) => l.maxC), [30]);
  const r = C.plan(all, S({ tempGapC: 20 }));
  assert.deepEqual(r.loads.map((l) => [l.maxC, names(all, l.items).join('+'), l.bands]), [[90, 'Serviettes', 3], [40, 'T-shirt+Draps', 3], [30, 'Body', 3]]);
  assert.deepEqual(C.plan(all, S({ tempGapC: 0 })).loads.map((l) => l.maxC), [90, 60, 40, 30]);
});

test('export CSV : une ligne par vêtement, libellés fournis, cellules protégées', () => {
  const all = [g('=Draps', 'white', 60, '1.25', { tumble: true }), g('Pull; bleu', 'dark', 30, '0.5')];
  const r = C.plan(all, S());
  const csv = C.toCSV(r, all, { headers: ['Charge', 'Couleurs', 'Programme', 'Temp', 'Vêtement', 'Poids', 'Sèche-linge'], colorLabel: (c) => c.toUpperCase(), programLabel: (p) => p, yes: 'oui', no: 'non', decimal: 'comma' });
  assert.ok(csv.startsWith('﻿Charge;Couleurs;'));
  assert.ok(csv.includes("1;WHITE;normal;60;'=Draps;1,25;oui\r\n"), csv);
  assert.ok(csv.includes('2;DARK;normal;30;"Pull; bleu";0,5;non\r\n'), csv);
  assert.throws(() => C.toCSV(r, all, { headers: [] }), /err\.headers/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { settings: S({ tempGapC: 10 }), garments: [g('Draps', 'white', 60, '1.2'), g('Gilet', 'light', 40, '0.4', { care: 'hand' })] };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'laundryload', version: 1, ...data };
  assert.throws(() => C.validateData({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, settings: { ...ok.settings, capacityG: 500 } }), /err\.capacity/);
  assert.throws(() => C.validateData({ ...ok, settings: { ...ok.settings, mergeLight: 'oui' } }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, garments: [{ ...data.garments[1], maxC: 40 }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, garments: [{ ...data.garments[0], maxC: '60' }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, garments: [{ ...data.garments[0], weightG: 12.5 }] }), /err\.weight/);
  assert.throws(() => C.validateData({ ...ok, garments: [data.garments[0], data.garments[0]] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, garments: Array.from({ length: 301 }, () => data.garments[0]) }), /err\.tooMany/);
});
