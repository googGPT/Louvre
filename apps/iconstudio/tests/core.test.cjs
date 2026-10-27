// Tests métier d'IconStudio : formes, chemins, calques, historique, export SVG contrôlé, import assaini, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const blank = (size = 24) => C.makeIcon({ name: 'Test', size, bg: null, shapes: [] }, 'icon-0001');
const add = (icon, s) => C.addShape(icon, s).icon;

test('formes : validation des coordonnées, couleurs, épaisseur et visibilité', () => {
  const r = C.makeShape({ id: 's1', type: 'rect', x: 2, y: '2,5', w: 20, h: 19, rx: 3, fill: '#ABC', stroke: 'none', sw: 0 }, 24);
  assert.deepEqual(r, { id: 's1', type: 'rect', fill: '#aabbcc', stroke: 'none', sw: 0, round: false, x: 2, y: 2.5, w: 20, h: 19, rx: 3 });
  assert.throws(() => C.makeShape({ id: 's1', type: 'rect', x: 10, y: 0, w: 20, h: 4, fill: '#000000' }, 24), /err\.coord/); // dépasse la grille
  assert.throws(() => C.makeShape({ id: 's1', type: 'rect', x: 0, y: 0, w: 4, h: 4, rx: 3, fill: '#000000' }, 24), /err\.rx/);
  assert.throws(() => C.makeShape({ id: 's1', type: 'circle', cx: 1.3, cy: 1, r: 1, fill: '#000000' }, 24), /err\.coord/); // pas d'un demi
  assert.throws(() => C.makeShape({ id: 's1', type: 'circle', cx: 1, cy: 1, r: 1, fill: 'red' }, 24), /err\.color/);
  assert.throws(() => C.makeShape({ id: 's1', type: 'circle', cx: 1, cy: 1, r: 1, fill: 'none', stroke: '#000000', sw: 0 }, 24), /err\.invisible/);
  assert.throws(() => C.makeShape({ id: 's1', type: 'line', x1: 1, y1: 1, x2: 1, y2: 1, stroke: '#000000', sw: 1 }, 24), /err\.lineZero/);
  assert.throws(() => C.makeShape({ id: 's1', type: 'line', x1: 1, y1: 1, x2: 5, y2: 1, stroke: '#000000', sw: 7 }, 24), /err\.sw/);
  assert.throws(() => C.makeShape({ id: 's1', type: 'polyline', points: [[1, 1], [2, 2]], closed: true, fill: '#000000' }, 24), /err\.points/);
  assert.throws(() => C.makeShape({ id: '<x>', type: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#000000' }, 24), /err\.id/);
  assert.throws(() => C.makeShape({ id: 's1', type: 'ellipse' }, 24), /err\.shapeType/);
});

test('chemins : commandes absolues et relatives normalisées, refus du reste', () => {
  assert.equal(C.formatPath(C.parsePath('m2 3 l4 0 h2 v-1 c1 1 2 2 3 3 q1 1 2 0 z', 24)), 'M2 3L6 3H8V2C9 3 10 4 11 5Q12 6 13 5Z');
  assert.equal(C.formatPath(C.parsePath('M0,0 10,10 .5-1.25', 24)), 'M0 0L10 10L0.5 -1.25');
  for (const bad of ['L1 1', 'M1', 'M1 1 A1 1 0 0 1 2 2', 'M1 1<script>', 'M100 100', '', 'M1 1 C1 1']) assert.throws(() => C.parsePath(bad, 24), /^Error: err\.path/);
});

test('calques : ajout, ordre, duplication décalée, déplacement, suppression', () => {
  let ic = blank();
  ic = add(ic, { type: 'rect', x: 0, y: 0, w: 4, h: 4, fill: '#ff0000' });
  ic = add(ic, { type: 'circle', cx: 12, cy: 12, r: 4, fill: '#00ff00' });
  ic = add(ic, { type: 'line', x1: 0, y1: 0, x2: 24, y2: 24, stroke: '#0000ff', sw: 2, round: true });
  assert.deepEqual(ic.shapes.map((s) => s.id), ['s1', 's2', 's3']);
  assert.deepEqual(C.moveShape(ic, 's1', 'top').shapes.map((s) => s.id), ['s2', 's3', 's1']);
  assert.deepEqual(C.moveShape(ic, 's3', 'down').shapes.map((s) => s.id), ['s1', 's3', 's2']);
  assert.deepEqual(C.moveShape(ic, 's3', 'bottom').shapes.map((s) => s.id), ['s3', 's1', 's2']);
  assert.deepEqual(C.moveShape(ic, 's3', 'up').shapes.map((s) => s.id), ['s1', 's2', 's3']); // déjà au-dessus
  const d = C.duplicateShape(ic, 's1');
  assert.equal(d.id, 's4'); assert.deepEqual([d.icon.shapes[3].x, d.icon.shapes[3].y], [1, 1]);
  const dl = C.duplicateShape(ic, 's3'); // la ligne touche les bords : copie non décalée
  assert.equal(dl.icon.shapes[3].x1, 0);
  assert.equal(C.translateShape(ic, 's2', -2, 3).shapes[1].cx, 10);
  assert.throws(() => C.translateShape(ic, 's1', -1, 0), /err\.coord/);
  assert.deepEqual(C.removeShape(ic, 's2').shapes.map((s) => s.id), ['s1', 's3']);
  assert.throws(() => C.updateShape(ic, 's9', {}), /err\.noShape/);
  const p = add(blank(), { type: 'path', d: 'M2 2H10V10Z', fill: '#000000' });
  assert.equal(C.translateShape(p, 's1', 1, 2).shapes[0].d, 'M3 4H11V12Z');
});

test('historique : annuler, rétablir, nouvelle action efface le futur', () => {
  let h = C.history(blank());
  h = C.commit(h, add(h.present, { type: 'rect', x: 0, y: 0, w: 2, h: 2, fill: '#000000' }));
  h = C.commit(h, add(h.present, { type: 'rect', x: 4, y: 4, w: 2, h: 2, fill: '#000000' }));
  assert.equal(C.undo(h).present.shapes.length, 1);
  assert.equal(C.undo(C.undo(h)).present.shapes.length, 0);
  assert.equal(C.redo(C.undo(C.undo(h))).present.shapes.length, 1);
  assert.equal(C.undo(C.history(blank())).present.shapes.length, 0); // rien à annuler
  const branched = C.commit(C.undo(h), blank());
  assert.equal(branched.future.length, 0);
  let big = C.history(blank()); for (let i = 0; i < 150; i++) big = C.commit(big, blank());
  assert.equal(big.past.length, 100);
});

test('export SVG : balisage reconstruit, valeurs numériques et couleurs uniquement', () => {
  let ic = C.makeIcon({ name: '<script>alert(1)</script>', size: 24, bg: '#ffffff', shapes: [] }, 'icon-0001');
  ic = add(ic, { type: 'rect', x: 2, y: 2, w: 20, h: 20, rx: 4, fill: '#3366ff' });
  ic = add(ic, { type: 'polyline', points: [[6, 12], [10, 16], [18, 8]], fill: 'none', stroke: '#ffffff', sw: 2.5, round: true });
  ic = add(ic, { type: 'path', d: 'm4 20 h16', stroke: '#000000', sw: 1, fill: 'none' });
  const svg = C.toSvg(ic, 64);
  assert.equal(svg, [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64">',
    '  <rect width="24" height="24" fill="#ffffff"/>',
    '  <rect x="2" y="2" width="20" height="20" rx="4" fill="#3366ff"/>',
    '  <polyline points="6,12 10,16 18,8" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '  <path d="M4 20H20" fill="none" stroke="#000000" stroke-width="1"/>',
    '</svg>', ''].join('\n'));
  assert.ok(!svg.includes('script'));
  // Une forme falsifiée (attribut injecté) est refusée avant l'écriture.
  assert.throws(() => C.toSvg({ ...ic, shapes: [{ ...ic.shapes[0], fill: '#000" onload="x' }] }), /err\.color/);
  assert.equal(C.fileName('Maison été !', 'svg'), 'maison-ete.svg');
  assert.equal(C.fileName('<>', 'png'), 'icon.png');
});

test('changement de grille : proportions gardées', () => {
  let ic = add(blank(24), { type: 'rect', x: 3, y: 3, w: 18, h: 18, rx: 3, fill: '#000000' });
  ic = add(ic, { type: 'path', d: 'M0 0L24 24', stroke: '#000000', sw: 2, fill: 'none' });
  const big = C.scaleIcon(ic, 48);
  assert.deepEqual([big.size, big.shapes[0].x, big.shapes[0].w, big.shapes[0].rx, big.shapes[1].d, big.shapes[1].sw], [48, 6, 36, 6, 'M0 0L48 48', 4]);
  const small = C.scaleIcon(ic, 16);
  assert.deepEqual([small.shapes[0].x, small.shapes[0].w], [2, 12]);
  assert.throws(() => C.scaleIcon(ic, 20), /err\.gridSize/);
});

test('import SVG : formes prises en charge reconstruites, le reste ignoré, héritage et mise à l\'échelle', () => {
  const evil = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" onload="alert(1)">
    <script>alert(2)</script><style>rect{fill:red}</style>
    <defs><path d="M0 0L5 5"/></defs>
    <!-- <circle cx="1" cy="1" r="1"/> -->
    <a href="javascript:alert(3)"><circle cx="5" cy="5" r="2"/></a>
    <g fill="#f00"><rect x="2" y="3" width="10" height="8" rx="2" onclick="alert(4)"/></g>
    <circle cx="12" cy="12" r="3" style="fill:#00F;stroke:none"/>
    <polyline points="4 18, 8 14 12 18"/>
    <path d="M4 4l4 4" transform="rotate(45)"/>
    <ellipse cx="3" cy="3" rx="1" ry="2"/>
    <image href="https://evil.example/x.png"/>
    <line x1="2" y1="22" x2="22" y2="22"></line>
  </svg>`;
  const r = C.importSvg(evil, 'Importée', 'icon-0002');
  assert.equal(r.imported, 4);
  assert.equal(r.ignored, 9); // script, style, defs (+ son path), a (+ son cercle), path transformé, ellipse, image
  assert.deepEqual(r.icon.shapes.map((s) => [s.type, s.fill, s.stroke, s.sw, s.round]), [
    ['rect', '#ff0000', '#000000', 2, true], ['circle', '#0000ff', 'none', 2, true],
    ['polyline', 'none', '#000000', 2, true], ['line', 'none', '#000000', 2, true]]);
  const svg = C.toSvg(r.icon);
  for (const bad of ['script', 'onload', 'onclick', 'javascript', 'href', 'style', 'evil']) assert.ok(!svg.includes(bad), bad);
  // viewBox 0 0 100 100 -> grille de 24, coordonnées mises à l'échelle.
  const s = C.importSvg('<svg viewBox="0 0 100 100"><rect x="50" y="0" width="50" height="50" fill="#123456"/><path d="M0 0L100 100" stroke="#000" stroke-width="10"/></svg>', 'x', 'icon-0003');
  assert.equal(s.icon.size, 24);
  assert.deepEqual([s.icon.shapes[0].x, s.icon.shapes[0].w, s.icon.shapes[1].d, s.icon.shapes[1].sw], [12, 12, 'M0 0L24 24', 2.5]);
  assert.throws(() => C.importSvg('<svg><script>x</script></svg>', 'x', 'icon-0004'), /err\.importEmpty/);
  assert.throws(() => C.importSvg('pas du svg', 'x', 'icon-0004'), /err\.importSvg/);
});

test('contraste : formule WCAG, couleurs peintes, fond de l\'icône prioritaire', () => {
  assert.equal(C.contrast('#000000', '#ffffff'), 21);
  assert.equal(C.contrast('#ffffff', '#ffffff'), 1);
  assert.equal(C.contrast('#777777', '#ffffff'), 4.48); // valeur de référence connue (≈ 4,48:1)
  assert.equal(C.contrast('#ffffff', '#777777'), C.contrast('#777777', '#ffffff')); // symétrique
  assert.throws(() => C.luminance('none'), /err\.color/);
  let ic = add(blank(), { type: 'rect', x: 0, y: 0, w: 4, h: 4, fill: '#ffd43b', stroke: '#343a40', sw: 1 });
  ic = add(ic, { type: 'circle', cx: 12, cy: 12, r: 3, fill: 'none', stroke: '#ffd43b', sw: 1 });
  assert.deepEqual(C.paintColors(ic), ['#ffd43b', '#343a40']);
  const [light, dark] = C.contrastReport(ic);
  assert.deepEqual([light.bg, light.color, light.ok], ['#ffffff', '#ffd43b', false]); // jaune sur blanc : trop pâle
  assert.ok(light.ratio < 2);
  assert.deepEqual([dark.bg, dark.color, dark.ok], ['#1e1e1e', '#343a40', false]); // gris foncé sur fond sombre
  const withBg = C.contrastReport({ ...ic, bg: '#000000' });
  assert.equal(withBg.length, 1);
  assert.deepEqual([withBg[0].color, withBg[0].ok], ['#343a40', false]);
  assert.deepEqual(C.contrastReport(blank()), [{ bg: '#ffffff', color: null, ratio: null, ok: true }, { bg: '#1e1e1e', color: null, ratio: null, ok: true }]);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  let ic = add(blank(), { type: 'circle', cx: 12, cy: 12, r: 6, fill: '#000000' });
  ic = add(ic, { type: 'polyline', points: [[1, 1], [5, 5], [9, 1]], closed: true, fill: '#ff0000' });
  const icons = [ic];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(icons))), icons);
  const ok = { app: 'iconstudio', version: 1, icons };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, icons: [{ ...ic, size: 20 }] }), /err\.gridSize/);
  assert.throws(() => C.validateBackup({ ...ok, icons: [{ ...ic, shapes: [{ ...ic.shapes[0], extra: 1 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, icons: [{ ...ic, shapes: [{ ...ic.shapes[0], fill: '#FFF' }] }] }), /err\.backup/); // non normalisée
  assert.throws(() => C.validateBackup({ ...ok, icons: [{ ...ic, shapes: [ic.shapes[0], ic.shapes[0]] }] }), /err\.id/);
  assert.throws(() => C.validateBackup({ ...ok, icons: [ic, ic] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, icons: [{ ...ic, bg: 'none' }] }), /err\.color/);
});
