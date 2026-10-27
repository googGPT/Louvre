// Tests métier de WardrobeCapsule : pièces, règles, compteur de tenues, suggestions, bilan, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const ALL_S = ['spring', 'summer', 'autumn', 'winter'], ALL_O = ['casual', 'work', 'sport', 'evening'];
const it = (name, category, color, seasons = ALL_S, occasions = ALL_O) => C.makeItem({ name, category, color, seasons, occasions }, `item-${String(++n).padStart(4, '0')}`);
const rules = (o = {}) => C.makeRules({ ...C.DEFAULT_RULES, targets: { ...C.DEFAULT_RULES.targets }, ...o });
const ALL = { season: 'all', occasion: 'all' };

// Garde-robe de l'exemple de l'appli : 25 tenues attendues (calcul détaillé dans le test).
function sample() {
  const mid = ['spring', 'autumn', 'winter'], warm = ['spring', 'summer'];
  return [
    it('tee', 'top', 'white', ALL_S, ['casual', 'sport']), it('shirt', 'top', 'blue', ALL_S, ['casual', 'work']), it('sweater', 'top', 'grey', mid, ['casual', 'work']),
    it('blouse', 'top', 'burgundy', ALL_S, ['work', 'evening']), it('jeans', 'bottom', 'denim', ALL_S, ['casual']), it('trousers', 'bottom', 'navy', ALL_S, ['work', 'evening', 'casual']),
    it('skirt', 'bottom', 'black', warm, ['work', 'evening']), it('dress', 'onepiece', 'green', warm, ['casual', 'evening']), it('sneakers', 'shoes', 'white', ALL_S, ['casual', 'sport']),
    it('loafers', 'shoes', 'brown', ALL_S, ['work', 'casual']), it('boots', 'shoes', 'black', ['autumn', 'winter'], ['casual', 'work', 'evening']),
    it('coat', 'outer', 'beige', ['autumn', 'winter'], ALL_O), it('scarf', 'accessory', 'red', ['autumn', 'winter'], ['casual']),
  ];
}

test('pièce : validations, saisons et occasions remises dans l\'ordre', () => {
  const p = it(' Chemise  ', 'top', 'blue', ['winter', 'spring'], ['work']);
  assert.deepEqual([p.name, p.seasons], ['Chemise', ['spring', 'winter']]);
  assert.throws(() => it('X', 'hat', 'blue'), /err\.category/);
  assert.throws(() => it('X', 'top', 'teal'), /err\.color/);
  assert.throws(() => it('X', 'top', 'blue', []), /err\.seasons/);
  assert.throws(() => it('X', 'top', 'blue', ['summer', 'summer']), /err\.seasons/);
  assert.throws(() => it('X', 'top', 'blue', ALL_S, ['party']), /err\.occasions/);
  assert.throws(() => it('', 'top', 'blue'), /err\.nameRequired/);
});

test('règles : objectifs, palette, couleurs non neutres', () => {
  const r = rules({ targets: { ...C.DEFAULT_RULES.targets, top: '5', bottom: '' }, palette: ['red', 'black'], maxAccents: '2' });
  assert.equal(r.targets.top, 5); assert.equal(r.targets.bottom, 0);
  assert.deepEqual(r.palette, ['black', 'red']);
  assert.equal(r.maxAccents, 2);
  assert.throws(() => rules({ targets: { ...C.DEFAULT_RULES.targets, top: 51 } }), /err\.target/);
  assert.throws(() => rules({ targets: { ...C.DEFAULT_RULES.targets, top: 1.5 } }), /err\.target/);
  assert.throws(() => rules({ palette: ['teal'] }), /err\.palette/);
  assert.throws(() => rules({ maxAccents: 4 }), /err\.accents\|\{"max":3\}/);
});

test('couleurs : neutres avec tout, au plus N couleurs non neutres distinctes', () => {
  const red = it('r', 'top', 'red'), blue = it('b', 'bottom', 'blue'), red2 = it('r2', 'shoes', 'red'), black = it('k', 'shoes', 'black');
  assert.equal(C.accents([red, blue, black]), 2);
  assert.equal(C.accents([red, red2, black]), 1); // même couleur répétée : un seul accent
  assert.equal(C.compatible([red, blue, black], rules({ maxAccents: 1 }), ALL), false);
  assert.equal(C.compatible([red, blue, black], rules({ maxAccents: 2 }), ALL), true);
  assert.equal(C.compatible([red, black], rules({ maxAccents: 0 }), ALL), false);
});

test('compteur exact sur l\'exemple : 23 ensembles + 2 robes = 25 tenues', () => {
  const items = sample();
  // Détail : t-shirt 6, chemise 7, pull 7, blouse 3 ; robe + baskets, robe + mocassins.
  const r = C.outfits(items, rules(), ALL);
  assert.deepEqual([r.count, r.sets, r.ones, r.truncated], [25, 23, 2, false]);
  const name = (id) => items.find((x) => x.id === id).name;
  assert.equal(r.uses[items.find((x) => x.name === 'blouse').id], 3);
  assert.equal(r.uses[items.find((x) => x.name === 'coat').id], 0);
  assert.deepEqual(r.list[0].map(name), ['blouse', 'skirt', 'loafers']); // ordre déterministe (noms)
  // Filtres : hiver + travail.
  const w = C.outfits(items, rules(), { season: 'winter', occasion: 'work' });
  assert.equal(w.count, 6); // (chemise, pull, blouse) × pantalon × (mocassins, bottines) ; jean = quotidien, jupe = printemps-été
  assert.throws(() => C.outfits(items, rules(), { season: 'monsoon', occasion: 'all' }), /err\.filter/);
});

test('suggestions gloutonnes et tenue du jour déterministes', () => {
  const items = sample();
  const r = C.outfits(items, rules(), ALL);
  const s = C.suggest(r, 6);
  assert.equal(s.length, 6);
  const covered = new Set(s.flat());
  assert.ok(covered.size >= 10, covered.size); // les 6 suggestions couvrent presque toute la garde-robe utile
  assert.deepEqual(C.suggest(r, 6), s);
  assert.equal(C.dayNumber('1970-01-02'), 1);
  assert.equal(C.dayNumber('2026-10-27') - C.dayNumber('2026-10-26'), 1);
  assert.deepEqual(C.ofDay(r, '2026-10-27'), r.list[C.dayNumber('2026-10-27') % 25]);
  assert.notDeepEqual(C.ofDay(r, '2026-10-27'), C.ofDay(r, '2026-10-28'));
  assert.throws(() => C.dayNumber('2026-02-30'), /err\.date/);
  assert.equal(C.ofDay(C.outfits([], rules(), ALL), '2026-10-27'), null);
});

test('bilan : objectifs, hors palette, pièces orphelines, gain d\'une pièce neutre', () => {
  const items = sample();
  const r = rules({ targets: { top: 5, bottom: 3, onepiece: 1, shoes: 3, outer: 1, accessory: 2 }, palette: ['black', 'white', 'grey', 'navy', 'beige', 'brown', 'denim', 'blue', 'burgundy', 'green'] });
  const a = C.analyze(items, r, ALL);
  assert.deepEqual(a.missing, [{ category: 'top', n: 1 }, { category: 'accessory', n: 1 }]);
  assert.deepEqual(a.outOfPalette.map((id) => items.find((x) => x.id === id).name), ['scarf']);
  assert.deepEqual(a.orphans, []);
  assert.equal(a.neutral, 'black');
  // Un haut noir (toutes saisons et occasions) : 3 bas × chaussures compatibles = jean 3 + pantalon 3 + jupe 1 = 7.
  assert.deepEqual(a.gains.find((g) => g.category === 'top'), { category: 'top', gain: 7 });
  // Un bas noir : t-shirt 3 + chemise 3 + pull 3 + blouse 2 (mocassins, bottines) = 11, la meilleure piste.
  assert.deepEqual(a.gains[0], { category: 'bottom', gain: 11 });
  // Une pièce orpheline : chaussures de sport uniquement en hiver, aucun haut de sport l'hiver.
  const more = [...items, it('crampons', 'shoes', 'black', ['winter'], ['sport'])];
  assert.deepEqual(C.analyze(more, r, ALL).orphans.map((id) => more.find((x) => x.id === id).name), ['crampons']);
  // Filtre été : bottines et pull ne correspondent pas.
  assert.equal(C.analyze(items, r, { season: 'summer', occasion: 'all' }).unfit.length, 2);
  assert.equal(C.analyze([], rules(), ALL).result.count, 0);
});

test('export CSV : haut ou pièce unique, bas, chaussures, couleurs', () => {
  const items = sample();
  const r = C.outfits(items, rules(), ALL);
  const csv = C.toCSV(r.list, items, { headers: ['N°', 'Haut', 'Bas', 'Chaussures', 'Couleurs'], colorLabel: (c) => c });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines.length, 26);
  assert.equal(lines[1], '1;blouse;skirt;loafers;burgundy + black + brown');
  assert.ok(lines.includes('24;dress;;loafers;green + brown') || lines.some((l) => /;dress;;/.test(l)));
  assert.throws(() => C.toCSV(r.list, items, { headers: ['a'] }), /err\.headers/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { rules: rules({ palette: ['navy'], maxAccents: 2 }), items: sample().slice(0, 3) };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'wardrobecapsule', version: 1, ...data };
  assert.throws(() => C.validateData({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, rules: { ...ok.rules, maxAccents: '2' } }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, rules: { ...ok.rules, targets: { ...ok.rules.targets, top: '3' } } }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, rules: { ...ok.rules, targets: { top: 1 } } }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, items: [{ ...data.items[0], color: 'teal' }] }), /err\.color/);
  assert.throws(() => C.validateData({ ...ok, items: [{ ...data.items[0], size: 'M' }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, items: [data.items[0], data.items[0]] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, items: Array.from({ length: 201 }, () => data.items[0]) }), /err\.tooMany/);
});
