// Tests métier de GroupAllocator : tailles, contraintes, équilibre, déterminisme, rapport, CSV, liste importée, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const sid = (i) => `stud-${String(i).padStart(4, '0')}`;
function klass(n, { constraints = [], settings = {}, attrs = null } = {}) {
  const students = Array.from({ length: n }, (_, i) => ({ id: sid(i), name: `Étudiant ${i}`, attr: attrs ? attrs[i % attrs.length] : '' }));
  return C.makeClass({ id: 'class-0001', name: 'L3', students, constraints, settings: { mode: 'size', value: 4, balance: false, seed: '42', attrName: '', ...settings } });
}
const con = (n, type, a, b) => ({ id: `cons-000${n}`, type, a: sid(a), b: sid(b) });
const groupOf = (res, id) => res.groups.find((g) => g.members.includes(id)).index;

test('tailles : taille cible (aucun groupe au-dessus) ou nombre de groupes (écart d\'au plus 1)', () => {
  assert.deepEqual(C.capacities(10, { mode: 'size', value: 4 }), [4, 3, 3]);
  assert.deepEqual(C.capacities(12, { mode: 'size', value: 4 }), [4, 4, 4]);
  assert.deepEqual(C.capacities(10, { mode: 'count', value: 4 }), [3, 3, 2, 2]);
  assert.deepEqual(C.capacities(3, { mode: 'count', value: 5 }), [1, 1, 1]);
  const res = C.allocate(klass(23));
  assert.deepEqual(res.groups.map((g) => g.members.length), [4, 4, 4, 4, 4, 3]);
  assert.equal(new Set(res.groups.flatMap((g) => g.members)).size, 23); // chacun une seule fois
  assert.deepEqual(res.issues, []);
  assert.deepEqual(C.allocate(klass(3, { settings: { mode: 'count', value: 5 } })).issues, [{ type: 'capped', k: 3 }]);
  assert.deepEqual(C.allocate(klass(0)).groups, []);
});

test('déterminisme : même graine => mêmes groupes ; autre graine => autre tirage', () => {
  const a = C.allocate(klass(20)), b = C.allocate(klass(20));
  assert.deepEqual(a, b);
  const c = C.allocate(klass(20, { settings: { seed: 'autre' } }));
  assert.notDeepEqual(a.groups.map((g) => g.members), c.groups.map((g) => g.members));
  assert.equal(C.hashSeed('42'), C.hashSeed('42'));
  const r = C.rng('x'); const first = [r(), r(), r()]; const r2 = C.rng('x');
  assert.deepEqual(first, [r2(), r2(), r2()]);
});

test('contraintes « séparer » et « réunir » respectées quand c\'est possible', () => {
  const cs = [con(1, 'together', 0, 1), con(2, 'together', 1, 2), con(3, 'apart', 0, 3), con(4, 'apart', 4, 5), con(5, 'apart', 3, 4)];
  for (const seed of ['1', '2', '3', 'abc', 'zz']) {
    const res = C.allocate(klass(12, { constraints: cs, settings: { seed } }));
    assert.equal(groupOf(res, sid(0)), groupOf(res, sid(1)));
    assert.equal(groupOf(res, sid(1)), groupOf(res, sid(2)));
    assert.notEqual(groupOf(res, sid(0)), groupOf(res, sid(3)));
    assert.notEqual(groupOf(res, sid(4)), groupOf(res, sid(5)));
    assert.notEqual(groupOf(res, sid(3)), groupOf(res, sid(4)));
    assert.deepEqual(res.issues, [], seed);
    assert.ok(res.groups.every((g) => g.members.length <= 4));
  }
});

test('rapport des contraintes non satisfiables', () => {
  // Contradiction : 0 et 2 réunis (via 1) mais à séparer.
  const r1 = C.allocate(klass(8, { constraints: [con(1, 'together', 0, 1), con(2, 'together', 1, 2), con(3, 'apart', 0, 2)] }));
  assert.deepEqual(r1.issues, [{ type: 'conflict', a: sid(0), b: sid(2) }]);
  // Bloc trop grand : 5 à réunir, groupes de 4 au plus -> débordement signalé.
  const five = [1, 2, 3, 4].map((i) => con(i, 'together', 0, i));
  const r2 = C.allocate(klass(8, { constraints: five }));
  assert.deepEqual(r2.issues.map((x) => x.type), ['blockTooBig', 'overflow']);
  assert.equal(r2.issues[0].size, 5); assert.equal(r2.issues[0].max, 4);
  // Un seul groupe : impossible de séparer.
  const r3 = C.allocate(klass(4, { constraints: [con(1, 'apart', 0, 1)], settings: { mode: 'count', value: 1 } }));
  assert.deepEqual(r3.issues, [{ type: 'apart', a: sid(0), b: sid(1), group: 1 }]);
  // Trois personnes à séparer deux à deux, mais seulement deux groupes.
  const r4 = C.allocate(klass(6, { constraints: [con(1, 'apart', 0, 1), con(2, 'apart', 1, 2), con(3, 'apart', 0, 2)], settings: { mode: 'count', value: 2 } }));
  assert.equal(r4.issues.filter((x) => x.type === 'apart').length, 1); // une seule violation, le minimum possible
});

test('équilibre d\'un attribut : chaque groupe reçoit sa part (écart d\'au plus 1)', () => {
  const attrs = ['Finance', 'Finance', 'Finance', 'Marketing', 'Audit', 'Audit'];
  for (const seed of ['1', '7', 'xyz']) {
    const res = C.allocate(klass(24, { attrs, settings: { balance: true, seed } })); // 6 groupes de 4
    for (const b of res.balance) assert.ok(b.max - b.min <= 1, `${seed} ${b.value} ${b.perGroup}`);
    assert.deepEqual(res.balance.map((b) => b.value), ['Audit', 'Finance', 'Marketing']);
    assert.deepEqual(res.balance.find((b) => b.value === 'Finance').perGroup, [2, 2, 2, 2, 2, 2]);
  }
  // Sans équilibre demandé : aucun rapport d'équilibre.
  assert.deepEqual(C.allocate(klass(24, { attrs })).balance, []);
});

test('saisies refusées : doublons, contraintes, réglages', () => {
  const base = klass(4);
  assert.throws(() => C.makeClass({ ...base, students: [...base.students, { id: sid(9), name: ' étudiant  0 ', attr: '' }] }), /err\.duplicateName/);
  assert.throws(() => C.makeConstraint({ id: 'cons-0001', type: 'apart', a: sid(0), b: sid(0) }, base.students), /err\.constraintSame/);
  assert.throws(() => C.makeConstraint({ id: 'cons-0001', type: 'apart', a: sid(0), b: sid(99) }, base.students), /err\.constraintStudent/);
  assert.throws(() => C.makeConstraint({ id: 'cons-0001', type: 'near', a: sid(0), b: sid(1) }, base.students), /err\.constraintType/);
  assert.throws(() => klass(4, { constraints: [con(1, 'apart', 0, 1), con(2, 'apart', 1, 0)] }), /err\.constraintDuplicate/);
  assert.throws(() => klass(4, { settings: { value: 0 } }), /err\.groupSize\|\{"max":500\}/);
  assert.throws(() => klass(4, { settings: { mode: 'count', value: '2,5' } }), /err\.groupCount/);
  assert.throws(() => klass(4, { settings: { seed: '  ' } }), /err\.seed/);
  assert.throws(() => klass(4, { settings: { mode: 'random' } }), /err\.mode/);
  assert.throws(() => C.makeStudent({ id: sid(1), name: '', attr: '' }), /err\.studentName/);
});

test('liste collée ou CSV : séparateurs, guillemets, en-tête, erreurs ligne par ligne', () => {
  assert.deepEqual(C.parseRoster('Ana\nBob ; Finance\n\n', false), [{ name: 'Ana', attr: '' }, { name: 'Bob', attr: 'Finance' }]);
  assert.deepEqual(C.parseRoster('﻿Nom,Programme\r\n"Martin, Léa",Audit\r\n"Dupont ""Jo""",\r\n', true), [{ name: 'Martin, Léa', attr: 'Audit' }, { name: 'Dupont "Jo"', attr: '' }]);
  assert.deepEqual(C.parseRoster('Ana\tFinance\nBob\tAudit', false).map((s) => s.attr), ['Finance', 'Audit']);
  assert.throws(() => C.parseRoster('Ana;x\n;Finance', false), /err\.rosterLine\|\{"line":2\}/);
  assert.throws(() => C.parseRoster('x'.repeat(81), false), /err\.rosterLong/);
});

test('CSV des groupes : en-têtes fournis, une ligne par étudiant, cellules protégées', () => {
  const cls = C.makeClass({ ...klass(3), students: [{ id: sid(0), name: '=Ana', attr: 'A' }, { id: sid(1), name: 'Bob', attr: '' }, { id: sid(2), name: 'Cléo', attr: 'B' }], settings: { mode: 'count', value: 2, balance: false, seed: '1', attrName: 'Prog' } });
  const out = C.csv(cls, C.allocate(cls));
  const lines = out.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], '"Groupe";"Étudiant";"Attribut"');
  assert.equal(lines.length, 4);
  assert.ok(lines.some((l) => l.includes('"\'=Ana";"A"')));
  const en = C.csv(cls, C.allocate(cls), { head: ['Group', 'Student', 'Prog'], group: (n) => `Group ${n}`, delimiter: ',' });
  assert.ok(en.includes('"Group 1",'));
});

test('performance : 500 étudiants, 100 contraintes, équilibre, en moins de 3 s', () => {
  const constraints = Array.from({ length: 100 }, (_, i) => con(i + 1000, i % 2 ? 'apart' : 'together', (i * 7) % 500, (i * 13 + 1) % 500)).filter((c) => c.a !== c.b);
  const uniq = []; const seen = new Set();
  for (const c of constraints) { const k = `${c.type}:${[c.a, c.b].sort()}`; if (!seen.has(k)) { seen.add(k); uniq.push(c); } }
  const big = klass(500, { constraints: uniq, attrs: ['A', 'B', 'C', 'D', 'E'], settings: { balance: true, value: 5 } });
  const t0 = Date.now(); const res = C.allocate(big); const ms = Date.now() - t0;
  assert.equal(res.groups.length, 100);
  assert.ok(ms < 3000, `${ms} ms`);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const cls = klass(6, { constraints: [con(1, 'apart', 0, 1)], attrs: ['A', 'B'] });
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([cls]))), [cls]);
  const ok = JSON.parse(C.backup([cls]));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: [cls, cls] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: [{ ...ok.classes[0], settings: { ...ok.classes[0].settings, value: '4' } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: [{ ...ok.classes[0], constraints: [{ ...ok.classes[0].constraints[0], b: 'stud-9999' }] }] }), /err\.constraintStudent/);
  const bad = JSON.parse(JSON.stringify(ok)); bad.classes[0].students[0].extra = 1;
  assert.throws(() => C.validateBackup(bad), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: Array.from({ length: 31 }, () => ok.classes[0]) }), /err\.tooManyClasses/);
});
