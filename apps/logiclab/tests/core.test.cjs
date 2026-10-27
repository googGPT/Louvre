// Tests métier de LogicLab : analyse, priorités, erreurs, tables, classification, équivalence, formes normales, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const vec = (text) => { const a = C.parse(text); return Array.from(C.evalVec(a, C.variables(a))); };
const errKey = (text) => { try { C.parse(text); } catch (e) { return e.message; } return null; };

test('symboles, écriture programmation et mots-clés anglais/français donnent le même arbre', () => {
  const ref = C.toText(C.parse('¬(p ∧ q) ↔ (¬p ∨ ¬q)'));
  for (const s of ['!(p & q) <-> (!p | !q)', '~(p && q) <=> (~p || ~q)', 'NOT (p AND q) IFF (NOT p OR NOT q)', 'non (p et q) ssi (non p ou non q)', '¬(p·q) ⇔ (¬p + ¬q)', '¬[p ∧ q] ≡ [¬p ∨ ¬q]']) {
    assert.equal(C.toText(C.parse(s)), ref, s);
  }
  assert.equal(C.toText(C.parse('p IMPLIES q'), 'ascii'), 'p -> q');
  assert.equal(C.toText(C.parse('p => q XOR r'), 'words'), 'p IMPLIES q XOR r');
  assert.equal(C.toText(C.parse('vrai ∧ FAUX ∨ 1 ∧ 0 ∨ ⊤ ∨ ⊥')), '⊤ ∧ ⊥ ∨ ⊤ ∧ ⊥ ∨ ⊤ ∨ ⊥');
  assert.deepEqual(C.variables(C.parse('pluie ∧ x10 ∨ x2 ∨ Été')), ['Été', 'pluie', 'x2', 'x10'].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'case' })));
});

test('priorités et associativité', () => {
  assert.equal(C.toText(C.parse('p ∨ q ∧ r')), 'p ∨ q ∧ r');
  assert.deepEqual(vec('p ∨ q ∧ r'), vec('p ∨ (q ∧ r)'));
  assert.notDeepEqual(vec('p ∨ q ∧ r'), vec('(p ∨ q) ∧ r'));
  assert.deepEqual(vec('p → q → r'), vec('p → (q → r)')); // à droite
  assert.notDeepEqual(vec('p → q → r'), vec('(p → q) → r'));
  assert.equal(C.toText(C.parse('(p → q) → r')), '(p → q) → r');
  assert.equal(C.toText(C.parse('p → (q → r)')), 'p → q → r');
  assert.equal(C.toText(C.parse('p ↔ (q ↔ r)')), 'p ↔ (q ↔ r)');
  assert.deepEqual(vec('¬p ∧ q'), vec('(¬p) ∧ q'));
  assert.equal(C.toText(C.parse('¬(p ∧ q)')), '¬(p ∧ q)');
  assert.deepEqual(vec('p ∧ q ⊕ r ∨ s'), vec('((p ∧ q) ⊕ r) ∨ s'));
  assert.equal(C.toText(C.parse('((p))')), 'p');
});

test('tables de vérité exactes pour chaque opérateur (ordre 00, 01, 10, 11)', () => {
  assert.deepEqual(vec('p ∧ q'), [0, 0, 0, 1]);
  assert.deepEqual(vec('p ∨ q'), [0, 1, 1, 1]);
  assert.deepEqual(vec('p ⊕ q'), [0, 1, 1, 0]);
  assert.deepEqual(vec('p → q'), [1, 1, 0, 1]);
  assert.deepEqual(vec('p ↔ q'), [1, 0, 0, 1]);
  assert.deepEqual(vec('¬p'), [1, 0]);
  assert.deepEqual(vec('1'), [1]);
  assert.equal(C.evaluate(C.parse('p → q'), { p: 1, q: 0 }), 0);
  assert.equal(C.evaluate(C.parse('p → q'), { p: 0, q: 0 }), 1);
});

test('erreurs de saisie avec position', () => {
  assert.equal(errKey(''), 'err.empty');
  assert.equal(errKey('   '), 'err.empty');
  assert.equal(errKey('p q'), 'err.missingOperator|{"pos":3}');
  assert.equal(errKey('(p ∧ q'), 'err.missingClose|{"pos":1,"ch":")"}');
  assert.equal(errKey('p ∧ q)'), 'err.unmatchedClose|{"pos":6}');
  assert.equal(errKey('[p ∧ q)'), 'err.wrongClose|{"pos":7,"ch":"]"}');
  assert.equal(errKey('p ∧'), 'err.expectedOperand|{"pos":4}');
  assert.equal(errKey('∧ p'), 'err.expectedOperand|{"pos":1}');
  assert.equal(errKey('p # q'), 'err.char|{"ch":"#","pos":3}');
  assert.equal(errKey('p ∧ 2'), 'err.char|{"ch":"2","pos":5}');
  assert.equal(errKey('p ∧ 10'), 'err.char|{"ch":"1","pos":5}');
  assert.equal(errKey('averyveryverylongname'), 'err.varLong|{"max":12,"pos":1}');
  assert.equal(errKey('p'.repeat(301)), 'err.tooLong|{"max":300}');
  assert.equal(errKey('a&b&c&d&e&f&g&h&i&j&k'), 'err.tooManyVars|{"max":10,"n":11}');
  assert.equal(errKey('a&b&c&d&e&f&g&h&i&j'), null); // 10 variables : accepté
  assert.throws(() => C.analyze('a&b&c&d&e', 'f&g&h&i&j&k'), /err\.tooManyVars/); // limite sur l'union
});

test('tautologie, contradiction, satisfiable', () => {
  const k = (s) => C.classify(C.analyze(s).vecA);
  assert.equal(k('p ∨ ¬p').kind, 'tautology');
  assert.equal(k('((p → q) ∧ p) → q').kind, 'tautology'); // modus ponens
  assert.equal(k('(p → q) ↔ (¬q → ¬p)').kind, 'tautology'); // contraposée
  assert.equal(k('p ∧ ¬p').kind, 'contradiction');
  assert.equal(k('p ∧ ¬p').satisfiable, false);
  const c = k('p ∧ q ∨ r');
  assert.deepEqual([c.kind, c.models, c.rows, c.satisfiable], ['contingent', 5, 8, true]);
  assert.equal(k('a&b&c&d&e&f&g&h&i&j').models, 1);
  assert.equal(k('a|b|c|d|e|f|g|h|i|j').models, 1023);
});

test('équivalence, contre-exemples et implication', () => {
  let r = C.analyze('¬(p ∧ q)', '¬p ∨ ¬q');
  assert.equal(r.b.equivalent, true); assert.equal(r.b.differ, 0);
  r = C.analyze('p → q', 'q → p');
  assert.equal(r.b.equivalent, false); assert.equal(r.b.differ, 2);
  assert.deepEqual(r.b.diff.map((d) => [d.values, d.a, d.b]), [[{ p: 0, q: 1 }, 1, 0], [{ p: 1, q: 0 }, 0, 1]]);
  assert.equal(r.b.aImpB, false); assert.equal(r.b.bImpA, false);
  r = C.analyze('p ∧ q', 'p');
  assert.equal(r.b.aImpB, true); assert.equal(r.b.bImpA, false);
  // Variables différentes : la comparaison se fait sur l'union.
  r = C.analyze('p', 'p ∧ (q ∨ ¬q)');
  assert.deepEqual(r.vars, ['p', 'q']); assert.equal(r.b.equivalent, true);
  r = C.analyze('p ∧ (q ∨ r)', '(p ∧ q) ∨ (p ∧ r)');
  assert.equal(r.b.equivalent, true);
  r = C.analyze('a ⊕ b ⊕ c ⊕ d ⊕ e ⊕ f ⊕ g ⊕ h ⊕ i ⊕ j', 'a');
  assert.equal(r.b.diff.length, 8); // contre-exemples limités
});

test('formes normales canoniques et simplifiées, toutes équivalentes à l\'expression', () => {
  let r = C.analyze('p ∧ q ∨ r');
  assert.equal(r.forms.canonDnf, '(¬p ∧ ¬q ∧ r) ∨ (¬p ∧ q ∧ r) ∨ (p ∧ ¬q ∧ r) ∨ (p ∧ q ∧ ¬r) ∨ (p ∧ q ∧ r)');
  assert.equal(r.forms.canonCnf, '(p ∨ q ∨ r) ∧ (p ∨ ¬q ∨ r) ∧ (¬p ∨ q ∨ r)');
  assert.equal(r.forms.dnf, '(p ∧ q) ∨ r'.replace('(p ∧ q) ∨ r', r.forms.dnf)); // forme stable
  assert.deepEqual(new Set(r.forms.dnf.split(' ∨ ')), new Set(['r', '(p ∧ q)']));
  assert.deepEqual(new Set(r.forms.cnf.split(' ∧ ')), new Set(['(p ∨ r)', '(q ∨ r)']));
  r = C.analyze('p ∨ ¬p'); assert.deepEqual([r.forms.dnf, r.forms.cnf, r.forms.canonCnf], ['⊤', '⊤', '⊤']);
  r = C.analyze('p ∧ ¬p'); assert.deepEqual([r.forms.dnf, r.forms.cnf, r.forms.canonDnf], ['⊥', '⊥', '⊥']);
  r = C.analyze('p ⊕ q', '', 'ascii');
  assert.equal(r.forms.canonDnf, '(!p & q) | (p & !q)');
  // Propriété : sur de nombreuses expressions, chaque forme est équivalente à l'original.
  const exprs = ['p → q', '(p ↔ q) ⊕ r', '¬(a ∧ b) ∨ (c → d)', 'a ⊕ b ⊕ c ⊕ d', '(a ∨ b) ∧ (¬a ∨ c) ∧ (b ∨ ¬c ∨ d)', 'x1 ∧ x2 ∨ x3 ∧ x4 ∨ x5 ∧ x6',
    '(a → b) ∧ (b → c) ∧ (c → a)', 'a ∧ ¬b ∧ c ∨ ¬a ∧ b ∨ c ∧ d ∧ ¬e', '¬a ∧ ¬b ∧ ¬c ∨ a ∧ b ∧ c ∨ a ∧ ¬c', 'a ↔ b ↔ c ↔ d ↔ e'];
  for (const e of exprs) {
    const res = C.analyze(e);
    for (const f of ['dnf', 'cnf', 'canonDnf', 'canonCnf']) {
      const cmp = C.analyze(e, res.forms[f], 'symbols', 100000);
      assert.equal(cmp.b.equivalent, true, `${e} / ${f} = ${res.forms[f]}`);
    }
  }
  // La forme simplifiée est bien plus courte que la canonique.
  r = C.analyze('a&b|c&d|e&f|g&h|i&j');
  assert.equal(r.forms.dnf, '(a ∧ b) ∨ (c ∧ d) ∨ (e ∧ f) ∨ (g ∧ h) ∨ (i ∧ j)');
  assert.equal(r.forms.dnfTerms, 5);
  assert.ok(r.forms.canonDnf.length > 10 * r.forms.dnf.length);
});

test('Quine-McCluskey : implicants premiers et choix glouton signalé', () => {
  // f(a,b,c) = Σ m(0,1,2,5,6,7) : fonction « cyclique » sans implicant essentiel -> choix glouton.
  const v = new Uint8Array([1, 1, 1, 0, 0, 1, 1, 1]);
  const primes = C.primeImplicants([0, 1, 2, 5, 6, 7], 3);
  assert.equal(primes.length, 6);
  const s = C.simplify(v, ['a', 'b', 'c']);
  assert.equal(s.dnfGreedy, false); // recherche exacte menée à terme
  assert.equal(s.dnfTerms, 3); // minimum connu : 3 termes de 2 littéraux (un glouton naïf en trouve 4)
  assert.equal(s.dnf.match(/[abc]/g).length, 6)
  const back = C.analyze(s.dnf, '(¬a ∧ ¬b) ∨ (b ∧ ¬c) ∨ (a ∧ c)');
  assert.equal(back.b.equivalent, true);
  assert.equal(C.simplify(new Uint8Array([0, 1, 1, 1]), ['p', 'q']).dnfGreedy, false);
  // Sur 10 variables, une fonction pseudo-aléatoire reste simplifiée rapidement et correctement.
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const big = new Uint8Array(1024).map(() => (rnd() < 0.5 ? 1 : 0));
  const vars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const t0 = Date.now(), sb = C.simplify(big, vars);
  assert.ok(Date.now() - t0 < 8000, 'simplification trop lente');
  const back2 = C.parse(sb.dnf, 1e6);
  assert.deepEqual(Array.from(C.evalVec(back2, vars)), Array.from(big));
});

test('sous-formules et export CSV', () => {
  const r = C.analyze('(p → q) ∧ p', 'q');
  assert.deepEqual(r.subs.map((s) => s.text), ['p → q', '(p → q) ∧ p']);
  const csv = C.truthCSV(r, ['p', 'q', 'A = (p → q) ∧ p', 'B = q']);
  assert.ok(csv.startsWith('﻿"p","q","A = (p → q) ∧ p","B = q"\r\n"0","0","0","0"'));
  assert.equal(csv.trim().split('\r\n').length, 5);
  const rev = C.truthCSV(r, ['p', 'q', 'A', 'B'], 'trueFirst').split('\r\n');
  assert.equal(rev[1], '"1","1","1","1"');
  assert.equal(C.csvCell('=1+1'), '"\'=1+1"'); // pas de formule exécutée par un tableur
  assert.equal(C.csvCell('-p'), '"\'-p"');
});

test('expressions enregistrées et sauvegarde : valides et invalides', () => {
  const s = C.makeSaved({ name: '  De   Morgan ', a: ' ¬(p ∧ q) ', b: '¬p ∨ ¬q' }, 'item-000001');
  assert.deepEqual(s, { id: 'item-000001', name: 'De Morgan', a: '¬(p ∧ q)', b: '¬p ∨ ¬q' });
  assert.throws(() => C.makeSaved({ name: 'x', a: 'p ∧', b: '' }, 'item-000001'), /err\.expectedOperand/);
  assert.throws(() => C.makeSaved({ name: '', a: 'p', b: '' }, 'item-000001'), /err\.nameRequired/);
  assert.throws(() => C.makeSaved({ name: 'x'.repeat(61), a: 'p', b: '' }, 'item-000001'), /err\.nameLong/);
  assert.throws(() => C.makeSaved({ name: 'x', a: 'p', b: '' }, '../x'), /err\.id/);
  const state = { prefs: { notation: 'ascii', order: 'trueFirst' }, draft: { a: 'p ∧', b: '' }, saved: [s] };
  const json = C.backup(state);
  assert.deepEqual(C.validateBackup(JSON.parse(json)), state); // un brouillon invalide est conservé tel quel
  const bad = (mut) => { const d = JSON.parse(json); mut(d); return d; };
  assert.throws(() => C.validateBackup([]), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.app = 'jsoninspector'; })), /err\.notBackup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.version = 9; })), /err\.notBackup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.more = true; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.prefs.notation = 'latex'; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.draft.a = 5; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.draft.a = 'p'.repeat(301); })), /err\.tooLong/);
  assert.throws(() => C.validateBackup(bad((d) => { d.saved[0].a = 'p q'; })), /err\.missingOperator/);
  assert.throws(() => C.validateBackup(bad((d) => { d.saved.push({ ...d.saved[0] }); })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { delete d.saved[0].b; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.saved = Array.from({ length: 101 }, (_, i) => ({ ...d.saved[0], id: 'item-' + String(i).padStart(6, '0') })); })), /err\.tooManySaved/);
});
