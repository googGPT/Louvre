// Tests métier de RegexWorkbench : drapeaux, exécution, groupes nommés, remplacement, explication, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('drapeaux et syntaxe : ordre canonique, erreurs traduisibles', () => {
  assert.equal(C.cleanFlags('ig'), 'gi');
  assert.equal(C.cleanFlags(''), '');
  for (const bad of ['gg', 'x', 'd', 'v']) assert.throws(() => C.cleanFlags(bad), /err\.flags/);
  assert.throws(() => C.compile('(', 'g'), /^Error: err\.syntax\|/);
  assert.throws(() => C.compile('', 'g'), /err\.patternEmpty/);
  assert.throws(() => C.compile('a'.repeat(2001), ''), /err\.patternLong/);
  assert.match(C.compile('a+', 'gi').flags, /^gi$/);
});

test('exécution : positions, groupes nommés et numérotés, groupe non participant', () => {
  const r = C.execute({ pattern: '(?<y>\\d{4})-(\\d{2})(-(?<d>\\d{2}))?', flags: 'g', text: 'du 2026-10-27 au 2027-01.' });
  assert.equal(r.count, 2); assert.equal(r.groupCount, 4); assert.equal(r.truncated, false);
  assert.deepEqual([r.matches[0].index, r.matches[0].end, r.matches[0].text], [3, 13, '2026-10-27']);
  assert.deepEqual(r.matches[0].groups.map((g) => [g.n, g.name, g.value, g.start]), [[1, 'y', '2026', 3], [2, null, '10', 8], [3, null, '-27', 10], [4, 'd', '27', 11]]);
  assert.deepEqual(r.matches[1].groups[3], { n: 4, name: 'd', value: null, start: null, end: null });
  // Sans « g » : une seule correspondance.
  assert.equal(C.execute({ pattern: '\\d', flags: '', text: 'a1b2' }).count, 1);
  // « y » collant : s'arrête au premier trou.
  assert.deepEqual(C.execute({ pattern: '\\d', flags: 'gy', text: '12a3' }).matches.map((m) => m.text), ['1', '2']);
});

test('correspondances vides : pas de boucle infinie, paires Unicode respectées', () => {
  assert.equal(C.execute({ pattern: 'x*', flags: 'g', text: 'abc' }).count, 4);
  assert.deepEqual(C.execute({ pattern: '(?:)', flags: 'gu', text: 'a😀b' }).matches.map((m) => m.index), [0, 1, 3, 4]);
  assert.deepEqual(C.execute({ pattern: '(?:)', flags: 'g', text: 'a😀' }).matches.map((m) => m.index), [0, 1, 2, 3]);
});

test('limites : nombre de correspondances tronqué, texte trop long', () => {
  const r = C.execute({ pattern: 'a', flags: 'g', text: 'a'.repeat(50), maxMatches: 10 });
  assert.equal(r.count, 10); assert.equal(r.truncated, true);
  assert.equal(C.execute({ pattern: 'a', flags: 'g', text: 'a'.repeat(10), maxMatches: 10 }).truncated, false);
  assert.throws(() => C.execute({ pattern: 'a', flags: 'g', text: 'a'.repeat(200001) }), /err\.textLong/);
  assert.throws(() => C.execute({ pattern: 'a', flags: 'g', text: 'a'.repeat(3000), replacement: '$&'.repeat(1000) }), /err\.outputBig|err\.replacementLong/);
});

test('remplacement : identique à String.prototype.replace, avec les morceaux remplacés repérés', () => {
  const cases = [
    ['(?<y>\\d{4})-(?<m>\\d{2})', 'g', 'le 2026-10 et 2027-01', '$<m>/$<y> ($&) $$ $1$2 $3 $0 $<zz>'],
    ['(a)(b)?', 'g', 'xaab', "[$2|$1|$10|$01|$`|$']"],
    ['\\w+', '', 'mot suivant', '<$&>'],
    ['(\\d)', 'g', '1 2', '$<n>'], // pas de groupe nommé : « $< » reste tel quel
    ['(x)', 'g', 'x', '$1$'],
    ['(?:)', 'g', 'ab', '-'],
    ['b|', 'gu', 'a😀b', '_'],
  ];
  for (const [p, f, text, rep] of cases) {
    const r = C.execute({ pattern: p, flags: f, text, replacement: rep });
    assert.equal(C.outputText(r.output), text.replace(new RegExp(p, f), rep), `${p} / ${rep}`);
  }
  const r = C.execute({ pattern: 'o', flags: 'g', text: 'foo', replacement: '0' });
  assert.deepEqual(r.output, [{ t: 'keep', v: 'f' }, { t: 'rep', v: '0' }, { t: 'rep', v: '0' }]);
  assert.equal(C.execute({ pattern: 'z', flags: 'g', text: 'abc', replacement: 'Z' }).output[0].v, 'abc');
});

test('explication : éléments reconnus, groupes, quantificateurs et alerte de retour arrière catastrophique', () => {
  const e = C.explain('^(?<year>\\d{4})-[0-9]{2}(?:a|b)+?\\.\\bfoo*\\k<year>\\1[^\\s]$', '');
  assert.deepEqual(e.tokens.map((t) => t.key), [
    'ex.start', 'ex.named', 'ex.digit', 'ex.q.exact', 'ex.groupEnd', 'ex.literal', 'ex.class', 'ex.q.exact',
    'ex.nonCapture', 'ex.literal', 'ex.alt', 'ex.literal', 'ex.groupEnd', 'ex.q.plus', 'ex.literal', 'ex.boundary',
    'ex.literal', 'ex.literal', 'ex.q.star', 'ex.backrefName', 'ex.backref', 'ex.notClass', 'ex.end']);
  assert.deepEqual(e.tokens[1].params, { name: 'year', n: 1 });
  assert.equal(e.tokens[2].depth, 1);
  assert.equal(e.tokens[13].lazy, true);
  assert.deepEqual([e.tokens[16].params.c, e.tokens[17].params.c], ['fo', 'o']); // « o* » ne porte que sur le dernier o
  assert.equal(e.tokens[14].params.c, '.');
  assert.deepEqual(e.warnings, []);
  assert.deepEqual(C.explain('(a+)+$').warnings, ['warn.nested']);
  assert.deepEqual(C.explain('((ab)*c)*').warnings, ['warn.nested']);
  assert.deepEqual(C.explain('(a+)?').warnings, []);
  assert.equal(C.explain('.', 's').tokens[0].key, 'ex.anyAll');
  assert.equal(C.explain('^$', 'm').tokens[0].key, 'ex.startLine');
  assert.deepEqual(C.explain('\\p{L}\\u00e9', 'u').tokens.map((t) => [t.key, t.params.p || t.params.hex]), [['ex.prop', 'L'], ['ex.unicode', '00E9']]);
  assert.equal(C.explain('a{2,').tokens[0].params.c, 'a{2,'); // accolade non quantificatrice : texte
  assert.deepEqual(C.groupNames('(a)(?<b>c)(?<=x)(?<d>e)'), { 2: 'b', 3: 'd' });
});

test('bibliothèque : validation, même nom = mise à jour', () => {
  let items = C.addItem([], { name: 'Date ISO', pattern: '\\d{4}-\\d{2}-\\d{2}', flags: 'g', replacement: '' }, 'item-0001');
  items = C.addItem(items, { name: 'date iso', pattern: '\\d+', flags: 'gi', replacement: 'N' }, 'item-0002');
  assert.equal(items.length, 1); assert.deepEqual([items[0].id, items[0].pattern, items[0].flags], ['item-0001', '\\d+', 'gi']);
  assert.throws(() => C.addItem([], { name: 'x', pattern: '(', flags: '' }, 'item-0003'), /err\.syntax/);
  assert.throws(() => C.addItem([], { name: ' ', pattern: 'a', flags: '' }, 'item-0003'), /err\.nameRequired/);
  assert.throws(() => C.parseTimeout('50'), /err\.timeout/);
  assert.equal(C.parseTimeout('1500'), 1500);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const state = { items: [C.makeItem({ name: 'Mail', pattern: '\\S+@\\S+', flags: 'gi', replacement: '' }, 'item-0001')], draft: { pattern: 'a', flags: 'g', text: 'aaa', replacement: 'b' }, timeoutMs: 1000 };
  const back = C.validateBackup(JSON.parse(C.backup(state)));
  assert.deepEqual(back, state);
  const ok = JSON.parse(C.backup(state));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, items: [{ ...ok.items[0], pattern: '(' }] }), /err\.syntax/);
  assert.throws(() => C.validateBackup({ ...ok, items: [{ ...ok.items[0], flags: 'ig' }] }), /err\.backup/); // non canonique
  assert.throws(() => C.validateBackup({ ...ok, items: [ok.items[0], ok.items[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, draft: { ...ok.draft, text: 1 } }), /err\.textLong/);
  assert.throws(() => C.validateBackup({ ...ok, draft: { ...ok.draft, x: 1 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, timeoutMs: 99999 }), /err\.timeout/);
  assert.throws(() => C.validateBackup({ ...ok, timeoutMs: '1000' }), /err\.backup/);
});
