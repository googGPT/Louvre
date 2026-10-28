// Tests métier de LaundryDecoder : catalogue, combinaison d'étiquette, conflits, recherche, pictogrammes, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('catalogue : 38 symboles, chaque famille représentée, catégories cohérentes', () => {
  assert.equal(C.IDS.length, 38);
  for (const f of C.FAMILIES) assert.ok(C.IDS.some((id) => C.SYMBOLS[id].family === f), f);
  assert.deepEqual(Object.values(C.CATEGORIES).flat().sort(), C.FAMILIES.slice().sort());
  assert.equal(C.IDS.filter((id) => C.SYMBOLS[id].family === 'wash').length, 13);
});

test('une étiquette sans conflit : consignes par famille et familles absentes', () => {
  const r = C.combine(['dP', 'w40', 'tlow', 'boxy', 'i150']);
  assert.deepEqual(r.ids, ['w40', 'boxy', 'tlow', 'i150', 'dP']); // ordre du catalogue
  assert.deepEqual(r.families.wash, { kind: 'machine', maxC: 40, mode: 'normal' });
  assert.deepEqual(r.families.bleach, { level: 1 });
  assert.deepEqual(r.families.tumble, { level: 1 });
  assert.deepEqual(r.families.iron, { maxC: 150 });
  assert.deepEqual(r.families.dry, { kind: 'pro', solvent: 'P', mode: 'normal' });
  assert.equal(r.families.natural, null);
  assert.deepEqual(r.missing, ['natural', 'wet']);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(C.combine([]).empty, true);
});

test('symboles contradictoires : la consigne la plus prudente est retenue et le conflit signalé', () => {
  const r = C.combine(['w60', 'w40g', 'i200', 'i110', 'bany', 'bno']);
  assert.deepEqual(r.families.wash, { kind: 'machine', maxC: 40, mode: 'gentle' });
  assert.deepEqual(r.families.iron, { maxC: 110 });
  assert.deepEqual(r.families.bleach, { level: 0 });
  assert.deepEqual(r.conflicts.map((c) => [c.type, c.family]), [['duplicate', 'wash'], ['duplicate', 'bleach'], ['duplicate', 'iron']]);
  // Température et douceur se combinent séparément : 60 °C modéré + 40 °C normal -> 40 °C modéré.
  assert.deepEqual(C.combine(['w60g', 'w40']).families.wash, { kind: 'machine', maxC: 40, mode: 'gentle' });
  assert.deepEqual(C.combine(['w30vg', 'w95']).families.wash, { kind: 'machine', maxC: 30, mode: 'veryGentle' });
  // Lavage à la main + machine : main, à la température la plus basse.
  assert.deepEqual(C.combine(['whand', 'w30']).families.wash, { kind: 'hand', maxC: 30 });
  assert.deepEqual(C.combine(['whand', 'w60']).families.wash, { kind: 'hand', maxC: 40 });
  assert.deepEqual(C.combine(['wno', 'w30']).families.wash, { kind: 'none' });
  // Nettoyage à sec : F plus restrictif que P ; la douceur la plus grande l'emporte.
  assert.deepEqual(C.combine(['dPg', 'dF']).families.dry, { kind: 'pro', solvent: 'F', mode: 'gentle' });
  assert.deepEqual(C.combine(['ww', 'wwvg']).families.wet, { kind: 'pro', mode: 'veryGentle' });
  assert.deepEqual(C.combine(['tnormal', 'tno']).families.tumble, { level: 0 });
});

test('séchage naturel : plusieurs modes listés et signalés', () => {
  const r = C.combine(['nline', 'nflatShade']);
  assert.deepEqual(r.families.natural, { ids: ['nline', 'nflatShade'] });
  assert.deepEqual(r.conflicts, [{ type: 'naturalMany', family: 'natural', ids: ['nline', 'nflatShade'] }]);
});

test('avertissements entre familles', () => {
  assert.deepEqual(C.combine(['wno', 'dno', 'wwno']).conflicts, [{ type: 'noCleaning' }]);
  assert.deepEqual(C.combine(['wno', 'dno']).warnings, [{ type: 'noMethod' }]);
  assert.deepEqual(C.combine(['wno']).warnings, [{ type: 'noMethod' }]);
  assert.deepEqual(C.combine(['wno', 'dP']).warnings, []);
  assert.deepEqual(C.combine(['wno', 'ww', 'dno']).warnings, []);
  assert.deepEqual(C.combine(['w30', 'tno']).warnings, [{ type: 'dryingUnknown' }]);
  assert.deepEqual(C.combine(['w30', 'tno', 'nflat']).warnings, []);
  assert.deepEqual(C.combine(['wno', 'bany', 'dP']).warnings, [{ type: 'bleachNoWash' }]);
});

test('saisies refusées : symbole inconnu, doublon, trop de symboles', () => {
  assert.throws(() => C.combine(['w41']), /^Error: err\.symbol$/);
  assert.throws(() => C.combine(['w40', 'w40']), /err\.symbol/);
  assert.throws(() => C.combine('w40'), /err\.symbol/);
  assert.throws(() => C.combine(['__proto__']), /err\.symbol/);
  assert.throws(() => C.combine(C.IDS.slice(0, 15)), /err\.tooManySymbols\|\{"max":14\}/);
});

test('recherche : mots sans accents ni casse, et température', () => {
  const text = (id) => (C.SYMBOLS[id].family === 'bleach' ? 'Blanchiment chlore' : C.SYMBOLS[id].family === 'natural' ? 'Séchage À plat' : 'autre');
  assert.deepEqual(C.search('CHLORE', text), ['bany', 'boxy', 'bno']);
  assert.deepEqual(C.search('sechage a plat', text), C.IDS.filter((id) => C.SYMBOLS[id].family === 'natural'));
  assert.deepEqual(C.search('40', () => ''), ['w40', 'w40g', 'w40vg', 'whand']);
  assert.deepEqual(C.search('150', () => ''), ['i150']);
  assert.deepEqual(C.search('  ', () => '').length, 38);
  assert.deepEqual(C.search('piano', text), []);
});

test('pictogrammes SVG : un par symbole, barré pour les interdictions, export autonome échappé', () => {
  for (const id of C.IDS) {
    const s = C.svg(id);
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48"/);
    assert.equal(s.includes('M5 5 43 43'), /no$/.test(id) || id === 'ino', id); // croix
  }
  assert.match(C.svg('w40'), />40<\/text>/);
  assert.equal((C.svg('w30vg').match(/M9 4[15] H39/g) || []).length, 2); // deux traits
  assert.equal((C.svg('i200').match(/<circle/g) || []).length, 3);
  assert.throws(() => C.svg('x'), /err\.symbol/);
  const doc = C.labelSvg(['w40', 'dP'], 'Pull <rouge> & "bleu"', ['Lavage : 40 °C']);
  assert.ok(doc.startsWith('<?xml'));
  assert.ok(doc.includes('Pull &lt;rouge&gt; &amp; &quot;bleu&quot;'));
  assert.ok(!doc.includes('<rouge>'));
  assert.ok(C.labelSvg(['w40'], 'X', [], true).includes('direction="rtl"'));
  assert.throws(() => C.labelSvg([], 'X'), /err\.noSymbols/);
});

test('export SVG : caractères de contrôle XML interdits remplacés, accents préservés',()=>{
  const title='Chemise\u0000 à l’été';
  const lines=['Lavage\u0001 doux','Emojis 🧺 et contrôle \uD800'];
  const svg=C.labelSvg(['w40'],title,lines);
  assert.equal(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/u.test(svg),false);
  assert.ok(svg.includes('Chemise� à l’été'));
  assert.ok(svg.includes('Lavage� doux'));
  assert.ok(svg.includes('Emojis 🧺'));
});

test('étiquettes et sauvegarde : aller-retour exact et contenus refusés', () => {
  const l = C.makeLabel({ name: '  Chemise   bleue ', symbols: ['dP', 'w40'] }, 'label-0001');
  assert.deepEqual(l, { id: 'label-0001', name: 'Chemise bleue', symbols: ['w40', 'dP'] });
  assert.throws(() => C.makeLabel({ name: 'X', symbols: [] }, 'label-0002'), /err\.noSymbols/);
  assert.throws(() => C.makeLabel({ name: ' ', symbols: ['w40'] }, 'label-0002'), /err\.nameRequired/);
  assert.throws(() => C.makeLabel({ name: 'x'.repeat(61), symbols: ['w40'] }, 'label-0002'), /err\.nameLong\|\{"max":60\}/);
  assert.throws(() => C.makeLabel({ name: 'X', symbols: ['w40'] }, 'bad id'), /err\.id/);
  const data = { labels: [l] };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'laundrydecoder', version: 1, labels: [l] };
  assert.throws(() => C.validateData({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, labels: [{ ...l, color: 'red' }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, labels: [{ ...l, symbols: ['w40', 'zz'] }] }), /err\.symbol/);
  assert.throws(() => C.validateData({ ...ok, labels: [l, l] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, labels: Array.from({ length: 301 }, (_, k) => ({ ...l, id: `label-${1000 + k}` })) }), /err\.tooMany/);
  assert.throws(() => C.validateData(null), /err\.backup/);
});
