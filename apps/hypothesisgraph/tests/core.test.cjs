// Tests métier de HypothesisGraph : validation du modèle, cycles, médiation, mise en page, géométrie, exports, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const id = (p, i) => `${p}-${String(i).padStart(4, '0')}`;
const tr = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k); // traduction factice : la clé et ses paramètres
// Modèle de médiation modérée : X → M → Y, X → Y modérée par W, contrôle C → Y.
function model() {
  let g = C.newGraph('Modèle', id('graph', 1));
  for (const [i, label, role] of [[1, 'Formation', 'iv'], [2, 'Motivation', 'med'], [3, 'Performance', 'dv'], [4, 'Ancienneté', 'mod'], [5, 'Taille', 'ctrl']]) g = C.putNode(g, { id: id('node', i), label, role });
  g = C.putEdge(g, { id: id('edge', 1), from: id('node', 1), to: id('node', 2), sign: '+', label: 'H1' });
  g = C.putEdge(g, { id: id('edge', 2), from: id('node', 2), to: id('node', 3), sign: '-', label: 'H2' });
  g = C.putEdge(g, { id: id('edge', 3), from: id('node', 1), to: id('node', 3), sign: '+', label: 'H3' });
  g = C.putEdge(g, { id: id('edge', 4), from: id('node', 4), to: id('edge', 3), sign: '-', label: 'H4' });
  g = C.putEdge(g, { id: id('edge', 5), from: id('node', 5), to: id('node', 3), sign: '?', label: '' });
  return g;
}

test('variables : rôles, noms obligatoires, doublons insensibles à la casse et aux accents, limite', () => {
  let g = C.newGraph('M', id('graph', 1));
  g = C.putNode(g, { id: id('node', 1), label: '  Satisfaction   client ', role: 'iv' });
  assert.equal(g.nodes[0].label, 'Satisfaction client');
  assert.throws(() => C.putNode(g, { id: id('node', 2), label: 'SATISFACTION CLIENT', role: 'dv' }), /^Error: err\.nodeDup/);
  assert.throws(() => C.putNode(g, { id: id('node', 2), label: 'Réussite', role: 'xx' }), /err\.role/);
  assert.throws(() => C.putNode(g, { id: id('node', 2), label: '  ', role: 'dv' }), /err\.labelRequired/);
  assert.throws(() => C.putNode(g, { id: id('node', 2), label: 'x'.repeat(41), role: 'dv' }), /err\.labelLong\|\{"max":40\}/);
  g = C.putNode(g, { id: id('node', 2), label: 'Reussite', role: 'dv' });
  assert.throws(() => C.putNode(g, { id: id('node', 3), label: 'Réussite', role: 'dv' }), /err\.nodeDup/); // accent ignoré
  let big = C.newGraph('Big', id('graph', 2));
  for (let i = 1; i <= C.LIMITS.nodes; i++) big = C.putNode(big, { id: id('node', i), label: 'V' + i, role: 'iv' });
  assert.throws(() => C.putNode(big, { id: id('node', 99), label: 'Trop', role: 'iv' }), /err\.nodesMany/);
});

test('hypothèses : auto-relation, doublon, étiquette obligatoire et unique, modération valide', () => {
  const g = model();
  const e = (from, to, label = 'H9', sign = '+') => ({ id: id('edge', 9), from: id('node', from), to: typeof to === 'string' ? to : id('node', to), sign, label });
  assert.throws(() => C.putEdge(g, e(1, 1)), /err\.selfLoop/);
  assert.throws(() => C.putEdge(g, e(1, 2)), /err\.edgeDup/);
  assert.throws(() => C.putEdge(g, e(2, 1, '')), /err\.hypRequired/);
  assert.throws(() => C.putEdge(g, e(2, 1, 'h1')), /err\.hypDup/);
  assert.throws(() => C.putEdge(g, e(2, 1, 'H 1')), /err\.hypFormat/);
  assert.throws(() => C.putEdge(g, e(2, 1, 'H9', '*')), /err\.sign/);
  assert.throws(() => C.putEdge(g, e(1, id('edge', 4))), /err\.modTarget/); // modérer une modération
  assert.throws(() => C.putEdge(g, e(1, id('edge', 3))), /err\.modOwn/); // X modère X → Y
  assert.throws(() => C.putEdge(g, e(1, 'node-9999')), /err\.edgeEnds/);
  assert.equal(C.putEdge(g, e(5, 2, '')).edges.length, 6); // une flèche de contrôle peut rester sans étiquette
  assert.equal(C.nextLabel(g), 'H5');
  // Une hypothèse modérée ne peut pas changer d'extrémités tant que la modération existe.
  assert.throws(() => C.putEdge(g, { id: id('edge', 3), from: id('node', 2), to: id('node', 3), sign: '+', label: 'H3' }), /err\.edgeModerated/);
  assert.equal(C.putEdge(g, { id: id('edge', 3), from: id('node', 1), to: id('node', 3), sign: '-', label: 'H3b' }).edges[2].label, 'H3b');
});

test('suppression en cascade : variable → flèches → modérations de ces flèches', () => {
  const g = model();
  const noX = C.removeNode(g, id('node', 1));
  assert.deepEqual(noX.edges.map((e) => e.label), ['H2', '']); // H1, H3 et la modération H4 de H3 disparaissent
  assert.deepEqual(C.removeEdge(g, id('edge', 3)).edges.map((e) => e.label), ['H1', 'H2', '']);
  assert.throws(() => C.removeEdge(g, 'edge-9999'), /err\.notFound/);
});

test('cycles : détection et circuit explicite', () => {
  const g = model();
  assert.deepEqual(C.cycles(g), []);
  const loop = C.putEdge(g, { id: id('edge', 6), from: id('node', 3), to: id('node', 1), sign: '+', label: 'H6' });
  const cyc = C.cycles(loop);
  assert.equal(cyc.length, 1);
  assert.deepEqual([...cyc[0].nodes].sort(), [id('node', 1), id('node', 2), id('node', 3)]);
  const p = cyc[0].path;
  assert.equal(p[0], p[p.length - 1]); // circuit fermé
  for (let i = 0; i < p.length - 1; i++) assert.ok(loop.edges.some((e) => e.from === p[i] && e.to === p[i + 1]), 'chaque pas est une vraie flèche');
  assert.equal(C.diagnose(loop)[0].key, 'diag.cycle');
  assert.equal(C.diagnose(loop)[0].level, 'error');
});

test('médiation : signe du chemin indirect = produit des signes ; partielle si effet direct', () => {
  const paths = C.mediationPaths(model());
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0], { from: id('node', 1), to: id('node', 3), via: [id('node', 2)], labels: ['H1', 'H2'], sign: '-', partial: true });
  const full = C.mediationPaths(C.removeEdge(model(), id('edge', 3)));
  assert.equal(full[0].partial, false);
});

test('diagnostics : rôles incohérents et variables isolées', () => {
  let g = C.newGraph('D', id('graph', 1));
  for (const [i, label, role] of [[1, 'A', 'iv'], [2, 'B', 'iv'], [3, 'M', 'med'], [4, 'W', 'mod'], [5, 'Seule', 'dv']]) g = C.putNode(g, { id: id('node', i), label, role });
  g = C.putEdge(g, { id: id('edge', 1), from: id('node', 1), to: id('node', 2), sign: '+', label: 'H1' });
  g = C.putEdge(g, { id: id('edge', 2), from: id('node', 2), to: id('node', 3), sign: '?', label: 'H2' });
  g = C.putEdge(g, { id: id('edge', 3), from: id('node', 4), to: id('node', 3), sign: '+', label: 'H3' });
  const keys = C.diagnose(g).map((d) => `${d.key}:${d.node ? g.nodes.find((n) => n.id === d.node).label : d.edge}`);
  assert.ok(keys.includes('diag.ivIncoming:B'));
  assert.ok(keys.includes('diag.isolated:Seule'));
  assert.ok(keys.includes('diag.modNoArrow:W'));
  assert.ok(keys.includes(`diag.noSign:${id('edge', 2)}`));
  assert.ok(keys.includes('diag.medIncomplete:M')); // M reçoit une flèche mais n'en émet aucune
  assert.ok(!keys.some((k) => k.startsWith('diag.isolated:A'))); // A est reliée
  assert.ok(C.diagnose(C.newGraph('V', id('graph', 2))).length === 0);
});

test('mise en page : déterministe, couches dans le bon ordre, aucune boîte superposée', () => {
  const g = model();
  const pos = (label) => g.nodes.find((n) => n.label === label);
  assert.ok(pos('Formation').x < pos('Motivation').x && pos('Motivation').x < pos('Performance').x); // causes à gauche
  assert.ok(pos('Ancienneté').y < pos('Formation').y); // modératrice au-dessus
  assert.ok(pos('Taille').y > pos('Performance').y); // contrôle en dessous
  assert.deepEqual(C.overlaps(g.nodes), []);
  assert.deepEqual(C.applyLayout(g).nodes, g.nodes); // même entrée, même résultat
  // Gros modèle : toujours sans chevauchement.
  let big = C.newGraph('Big', id('graph', 2));
  for (let i = 1; i <= 30; i++) big = C.putNode(big, { id: id('node', i), label: 'V' + i, role: C.ROLES[i % 5] });
  for (let i = 1; i < 30; i++) if (big.nodes[i - 1].role !== 'mod') try { big = C.putEdge(big, { id: id('edge', i), from: id('node', i), to: id('node', i + 1), sign: '+', label: 'H' + i }); } catch (_) { /* combinaisons refusées ignorées */ }
  assert.deepEqual(C.overlaps(big.nodes), []);
  // Déplacement manuel : la mise en page automatique ne réécrit plus les positions, sauf « Réorganiser ».
  const moved = C.moveNode(g, id('node', 1), 900, 700);
  assert.equal(moved.manual, true);
  const withNew = C.putNode(moved, { id: id('node', 9), label: 'Nouvelle', role: 'iv' });
  assert.deepEqual(withNew.nodes.find((n) => n.id === id('node', 1)), { ...g.nodes[0], x: 900, y: 700 });
  assert.deepEqual(C.overlaps(withNew.nodes), []);
  assert.equal(C.applyLayout(withNew).manual, false);
});

test('géométrie : la flèche directe X → Y contourne la médiatrice ; flèches opposées séparées', () => {
  const g = model();
  const geo = C.geometry(g), m = g.nodes.find((n) => n.label === 'Motivation');
  const d = geo[id('edge', 3)];
  assert.ok(d.bend > 0, 'courbée vers le haut, côté modératrice');
  // échantillonne la courbe : aucun point dans la boîte de la médiatrice
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, x = (1 - t) ** 2 * d.x1 + 2 * (1 - t) * t * d.cx + t * t * d.x2, y = (1 - t) ** 2 * d.y1 + 2 * (1 - t) * t * d.cy + t * t * d.y2;
    assert.ok(!(x > m.x && x < m.x + C.NODE.w && y > m.y && y < m.y + C.NODE.h), `point ${i} dans la médiatrice`);
  }
  assert.equal(geo[id('edge', 1)].bend, 0); // flèches voisines : droites
  const mod = geo[id('edge', 4)];
  assert.deepEqual([mod.x2, mod.y2], [d.mx, d.my]); // la modération vise le milieu de H3
  const twin = C.geometry(C.putEdge(g, { id: id('edge', 6), from: id('node', 2), to: id('node', 1), sign: '+', label: 'H6' }));
  assert.ok(twin[id('edge', 1)].bend * twin[id('edge', 6)].bend < 0, 'A → B et B → A de part et d\'autre');
});

test('export SVG autonome : échappement, rôles traduits, pointillés, aucune ressource externe', () => {
  let g = model();
  g = C.putNode(g, { id: id('node', 9), label: 'R&D <interne>', role: 'iv' });
  const svg = C.toSVG(g, (r) => 'ROLE-' + r, 'Titre "x"');
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('R&amp;D &lt;interne&gt;') && !svg.includes('<interne>'));
  assert.ok(svg.includes('ROLE-med') && svg.includes('aria-label="Titre &quot;x&quot;"'));
  assert.equal((svg.match(/stroke-dasharray/g) || []).length, 2); // modération + contrôle
  assert.ok(svg.includes('H2 (−)'));
  assert.ok(!/href=|xlink|url\((?!#arrow)/.test(svg));
  const b = C.canvas(g);
  assert.ok(svg.includes(`viewBox="0 0 ${b.width} ${b.height}"`));
  for (const n of g.nodes) assert.ok(n.x + C.NODE.w <= b.width && n.y + C.NODE.h <= b.height);
});

test('hypothèses rédigées : phrases par signe, médiation, contrôles et boucles', () => {
  const md = C.toMarkdown(model(), tr);
  assert.ok(md.startsWith('# Modèle\n'));
  assert.ok(md.includes('- **H1** (+)md.colonmd.directPos{"a":"Formation","b":"Motivation"}'));
  assert.ok(md.includes('- **H2** (−)md.colonmd.directNeg{"a":"Motivation","b":"Performance"}'));
  assert.ok(md.includes('- **H4** (−)md.colonmd.modNeg{"m":"Ancienneté","a":"Formation","b":"Performance"}'));
  assert.ok(md.includes('Formationmd.arrowMotivationmd.arrowPerformance (H1 × H2)md.colonmd.indirect{"sign":"−"} md.partial'));
  assert.ok(md.includes('## md.controls\n\n- Taillemd.arrowPerformance\n'));
  assert.ok(!md.includes('md.warnings'));
  const loop = C.putEdge(model(), { id: id('edge', 6), from: id('node', 3), to: id('node', 1), sign: '+', label: 'H6' });
  assert.ok(C.toMarkdown(loop, tr).includes('md.cycle{"path":"Formationmd.arrowPerformancemd.arrowFormation"}'));
  assert.equal(C.sentence(model(), model().edges[0], tr), 'md.directPos{"a":"Formation","b":"Motivation"}');
});

test('sauvegarde : aller-retour exact et contenus refusés champ par champ', () => {
  const graphs = [model(), C.newGraph('Vide', id('graph', 2))];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(graphs))), graphs);
  const ok = { app: 'hypothesisgraph', version: 1, graphs };
  const g0 = graphs[0];
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup([]), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [g0, g0] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [{ ...g0, extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [{ ...g0, nodes: [{ ...g0.nodes[0], x: -5 }, ...g0.nodes.slice(1)] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [{ ...g0, nodes: [{ ...g0.nodes[0], role: 'x' }, ...g0.nodes.slice(1)] }] }), /err\.role/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [{ ...g0, edges: [...g0.edges, { ...g0.edges[0], id: id('edge', 7) }] }] }), /err\.edgeDup/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [{ ...g0, edges: [{ ...g0.edges[0], to: g0.edges[0].from }] }] }), /err\.selfLoop/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: [{ ...g0, edges: [{ ...g0.edges[0], id: g0.nodes[0].id }] }] }), /err\.id/);
  assert.throws(() => C.validateBackup({ ...ok, graphs: Array.from({ length: 31 }, (_, i) => C.newGraph('G', id('graph', i + 10))) }), /err\.graphsMany/);
});
