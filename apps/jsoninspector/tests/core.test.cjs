// Tests métier de JSONInspector : analyseur strict, positions d'erreur, doublons, nombres imprécis, chemins, formatage, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const err = (text) => { const r = C.parse(text); assert.equal(r.ok, false, text); return r.error; };

test('le JSON valide donne le même résultat que JSON.parse (sans doublons)', () => {
  const samples = ['{}', '[]', '0', '-0.5e-3', '"é\\u00e9\\n"', 'true', 'null', '{"a":[1,{"b":"c"}],"d":false}', ' \n\t[1 , 2 ]\r\n'];
  for (const s of samples) {
    const sess = C.createSession(s);
    assert.equal(sess.result.ok, true, s);
    assert.deepEqual(JSON.parse(sess.minify()), JSON.parse(s), s);
  }
});

test('erreurs : clé précise, ligne et colonne comptées à partir de 1', () => {
  let e = err('{\n  "a": 1,\n}');
  assert.equal(e.key, 'err.json.trailingComma'); assert.deepEqual([e.line, e.col], [2, 9]); // la virgule fautive
  e = err('[1, 2,]'); assert.equal(e.key, 'err.json.trailingComma'); assert.equal(e.col, 6);
  e = err('{"a" 1}'); assert.equal(e.key, 'err.json.expectedColon'); assert.equal(e.col, 6);
  e = err("{'a': 1}"); assert.equal(e.key, 'err.json.singleQuote');
  e = err('{a: 1}'); assert.equal(e.key, 'err.json.unquotedKey');
  e = err('// note\n{}'); assert.equal(e.key, 'err.json.comment');
  e = err('[1, 2'); assert.equal(e.key, 'err.json.unexpectedEnd'); assert.equal(e.col, 6);
  e = err('{"a": 01}'); assert.equal(e.key, 'err.json.leadingZero');
  for (const s of ['1.', '.5', '+1', '-', '1e', '1.2.3']) assert.equal(err(s).key, 'err.json.badNumber', s);
  e = err('[True]'); assert.equal(e.key, 'err.json.badLiteral'); assert.deepEqual(e.params, { word: 'True' });
  assert.equal(err('[NaN]').key, 'err.json.badLiteral');
  assert.equal(err('"a\\x"').key, 'err.json.badEscape');
  assert.equal(err('"\\u12G4"').key, 'err.json.badUnicode');
  assert.equal(err('"ab').key, 'err.json.unterminatedString');
  assert.equal(err('"a\nb"').key, 'err.json.newlineInString');
  assert.equal(err('"a\tb"').key, 'err.json.controlChar');
  assert.equal(err('{"a":1} x').key, 'err.json.trailingData');
  assert.equal(err('{"a":1 "b":2}').key, 'err.json.expectedCommaObject');
  assert.equal(err('[1 2]').key, 'err.json.expectedCommaArray');
  assert.equal(err('   ').key, 'err.json.empty');
  e = err('[1, 2]'); assert.equal(e.key, 'err.json.unexpectedChar'); assert.deepEqual(e.params, { ch: 'U+00A0' }); // espace insécable
  // La colonne compte des caractères : un émoji (2 unités UTF-16) compte pour 1.
  e = err('{"🎉": 1,}'); assert.equal(e.col, 8);
  // Fins de ligne Windows et Mac classiques.
  assert.equal(err('{\r\n"a":1,\r\n}').line, 2);
  assert.equal(err('[\r1\r,]').line, 3);
  // Toute erreur que signale JSON.parse est aussi signalée ici.
  for (const s of ['{', '}', '[,1]', '{"a":}', '{,}', '["a" "b"]', '1 2', 'nul', 'tru', '{"a":1,,"b":2}']) {
    assert.throws(() => JSON.parse(s)); assert.equal(C.parse(s).ok, false, s);
  }
});

test('extrait de la ligne fautive avec position du curseur', () => {
  const e = err('{\n  "nom": "x",\n  "age": 3,\n}');
  assert.equal(e.excerpt.text, '  "age": 3,');
  assert.equal(e.excerpt.caret, 10);
  const long = '[' + '1,'.repeat(100) + ']';
  const e2 = err(long);
  assert.ok(e2.excerpt.text.startsWith('…') && e2.excerpt.text.length <= 82);
  assert.equal(e2.excerpt.text[e2.excerpt.caret], ',');
});

test('imbrication limitée sans dépassement de pile', () => {
  const ok = '['.repeat(C.LIMITS.depth) + ']'.repeat(C.LIMITS.depth);
  assert.equal(C.parse(ok).ok, true);
  assert.equal(C.parse(ok).stats.maxDepth, C.LIMITS.depth);
  const deep = '['.repeat(C.LIMITS.depth + 1) + ']'.repeat(C.LIMITS.depth + 1);
  const e = err(deep); assert.equal(e.key, 'err.json.tooDeep'); assert.deepEqual(e.params, { max: C.LIMITS.depth });
});

test('clés dupliquées détectées, la valeur masquée est la première (comme JSON.parse)', () => {
  const text = '{\n "a": 1,\n "b": {"x": 1, "x": 2, "x": 3},\n "a": 2\n}';
  const s = C.createSession(text);
  assert.equal(s.result.ok, true);
  assert.equal(s.result.stats.duplicates, 3);
  assert.deepEqual(s.result.dups.map((d) => [d.path, d.key, d.firstLine, d.line]), [['$.b', 'x', 3, 3], ['$.b', 'x', 3, 3], ['$', 'a', 2, 4]]);
  // La valeur retenue par un chemin est la dernière, comme JSON.parse.
  const id = s.resolve('$.a');
  assert.equal(s.node(id).preview, '2');
  assert.equal(JSON.parse(text).a, 2);
  const first = s.node(s.result.dups[2].first);
  assert.equal(first.m, true); assert.equal(first.preview, '1');
  // Le formatage conserve les deux occurrences.
  assert.equal((s.minify().match(/"a":/g) || []).length, 2);
});

test('nombres imprécis (lus différemment par JavaScript)', () => {
  for (const raw of ['9007199254740993', '-9007199254740993', '1e400', '0.123456789012345678', '123456789012345678901']) assert.equal(C.isUnsafeNumber(raw), true, raw);
  for (const raw of ['9007199254740991', '0.1', '1e10', '-0', '3.14159', '1.5e300', '100000000000000000000.0e-5']) assert.equal(C.isUnsafeNumber(raw), false, raw);
  const s = C.createSession('{"id": 12345678901234567890, "ok": 42}');
  assert.equal(s.result.stats.unsafeNumbers, 1);
  assert.deepEqual(s.result.unsafe.map((u) => u.path), ['$.id']);
  assert.equal(s.format(2), '{\n  "id": 12345678901234567890,\n  "ok": 42\n}'); // recopié tel quel
});

test('statistiques : profondeur, clés, types, taille UTF-8, lignes', () => {
  const text = '{"a": [1, 2, {"b": null}], "c": "é", "d": true, "e": {}}\n';
  const st = C.parse(text).stats;
  assert.equal(st.maxDepth, 3);
  assert.equal(st.members, 5); assert.equal(st.uniqueKeys, 5);
  assert.deepEqual([st.objects, st.arrays, st.strings, st.numbers, st.booleans, st.nulls], [3, 1, 1, 2, 1, 1]);
  assert.equal(st.values, 9); assert.equal(st.maxArray, 3); assert.equal(st.maxKeys, 4);
  assert.equal(st.bytes, Buffer.byteLength(text, 'utf8')); assert.equal(st.lines, 2);
  assert.equal(C.utf8Bytes('🎉é'), Buffer.byteLength('🎉é'));
  assert.equal(C.parse('7').stats.maxDepth, 0);
  // Marque BOM tolérée mais signalée.
  const b = C.parse('﻿{"a":1}'); assert.equal(b.ok, true); assert.equal(b.stats.bom, true);
});

test('chemins JSONPath : construction, lecture, cas particuliers', () => {
  const s = C.createSession('{"items": [{"name": "x", "b c": [true]}], "l\'été": 1, "_ok$": 2, "": 3, "back\\\\slash": 4}');
  const id = s.resolve("$.items[0]['b c'][0]");
  assert.equal(s.node(id).path, "$.items[0]['b c'][0]");
  assert.equal(s.node(s.resolve("$['l\\'été']")).path, "$['l\\'été']");
  assert.equal(s.node(s.resolve('$._ok$')).path, '$._ok$');
  assert.equal(s.node(s.resolve("$['']")).path, "$['']");
  assert.equal(s.node(s.resolve("$['back\\\\slash']")).path, "$['back\\\\slash']");
  assert.equal(s.node(s.resolve('$["items"][0].name')).preview, 'x');
  assert.deepEqual(C.parsePath("$.a[12]['x.y']"), ['a', 12, 'x.y']);
  for (const bad of ['', 'a.b', '$.', '$[x]', "$['a'", '$..a', '$.1a']) assert.throws(() => C.parsePath(bad), /^Error: err\.path$/, bad);
  for (const missing of ['$.nope', '$.items[5]', '$.items.name', '$[0]']) assert.throws(() => s.resolve(missing), /err\.pathNotFound/, missing);
  // Chaîne d'ancêtres avec la position de chacun (pour déplier l'arbre).
  assert.deepEqual(s.node(id).chain.map((c) => c.index), [0, 0, 0, 1, 0]);
});

test('arbre chargé par morceaux', () => {
  const arr = '[' + Array.from({ length: 450 }, (_, i) => i).join(',') + ']';
  const s = C.createSession(arr);
  assert.equal(s.result.root.count, 450);
  const p1 = s.children(0);
  assert.equal(p1.total, 450); assert.equal(p1.items.length, C.LIMITS.page);
  const p3 = s.children(0, 400);
  assert.deepEqual(p3.items.map((x) => x.k).slice(0, 2), [400, 401]); assert.equal(p3.items.length, 50);
  assert.throws(() => s.children(1), /err\.node/); // un nombre n'a pas d'enfants
  const long = C.createSession(JSON.stringify({ t: 'x'.repeat(500) }));
  const kid = long.children(0).items[0];
  assert.equal(kid.len, 500); assert.equal(kid.preview.length, 121);
});

test('formatage et minification fidèles, aperçu tronqué', () => {
  const s = C.createSession('{"a":[],"b":{},"c":[1,{"d":"\\u00e9\\"q"}]}');
  assert.equal(s.format('2'), '{\n  "a": [],\n  "b": {},\n  "c": [\n    1,\n    {\n      "d": "é\\"q"\n    }\n  ]\n}');
  assert.equal(s.format('tab').split('\n')[1], '\t"a": [],');
  assert.equal(s.format('4').split('\n')[1], '    "a": [],');
  assert.equal(s.minify(), '{"a":[],"b":{},"c":[1,{"d":"é\\"q"}]}');
  assert.throws(() => s.format('3'), /err\.indent/);
  const big = C.createSession(JSON.stringify(Array.from({ length: 5000 }, (_, i) => ({ i }))));
  const sub = big.subtree(0, '2', 1000);
  assert.equal(sub.cut, true); assert.equal(sub.text.length, 1000);
  assert.equal(big.subtree(2, '2').cut, false);
});

test('un fichier de plusieurs mégaoctets est analysé', () => {
  const text = JSON.stringify(Array.from({ length: 40000 }, (_, i) => ({ id: i, name: 'n' + i, tags: ['a', 'b'], v: i / 3 })));
  assert.ok(text.length > 2_000_000);
  const s = C.createSession(text);
  assert.equal(s.result.ok, true);
  assert.equal(s.result.stats.objects, 40000); assert.equal(s.result.stats.arrays, 40001);
  assert.deepEqual(JSON.parse(s.minify()), JSON.parse(text));
});

test('documents et sauvegarde : valides et invalides', () => {
  const doc = C.makeDoc({ name: '  Mon   fichier ', text: '{"a":', updated: '2026-10-27' }, 'doc-000001');
  assert.equal(doc.name, 'Mon fichier'); // un brouillon peut être du JSON invalide
  assert.throws(() => C.makeDoc({ name: '', text: '', updated: '2026-10-27' }, 'doc-000001'), /err\.nameRequired/);
  assert.throws(() => C.makeDoc({ name: 'x'.repeat(81), text: '', updated: '2026-10-27' }, 'doc-000001'), /err\.nameLong/);
  assert.throws(() => C.makeDoc({ name: 'x', text: 'a'.repeat(C.LIMITS.saveChars + 1), updated: '2026-10-27' }, 'doc-000001'), /err\.tooBigToSave/);
  assert.throws(() => C.makeDoc({ name: 'x', text: '', updated: '2026-02-30' }, 'doc-000001'), /err\.date/);
  assert.throws(() => C.makeDoc({ name: 'x', text: '', updated: '2026-10-27' }, 'bad id'), /err\.id/);
  const state = { prefs: { indent: '4' }, docs: [doc] };
  const json = C.backup(state);
  assert.deepEqual(C.validateBackup(JSON.parse(json)), state);
  const base = JSON.parse(json);
  const bad = (mut) => { const d = JSON.parse(json); mut(d); return d; };
  assert.throws(() => C.validateBackup(null), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...base, app: 'pricelens' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...base, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...base, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.prefs.indent = '8'; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.docs[0].x = 1; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.docs.push({ ...d.docs[0] }); })), /err\.backup/); // identifiant en double
  assert.throws(() => C.validateBackup(bad((d) => { d.docs[0].text = 42; })), /err\.input/);
  assert.throws(() => C.validateBackup(bad((d) => { d.docs = Array.from({ length: 31 }, (_, i) => ({ ...d.docs[0], id: 'doc-' + String(i).padStart(6, '0') })); })), /err\.tooManyDocs/);
  assert.throws(() => C.validateBackup(bad((d) => { d.docs = Array.from({ length: 6 }, (_, i) => ({ ...d.docs[0], id: 'doc-' + String(i).padStart(6, '0'), text: 'x'.repeat(390000) })); })), /err\.backupBig/);
  assert.equal(C.fileName('Données été 2026', '.min'), 'donnees-ete-2026.min.json');
  assert.equal(C.fileName('///', ''), 'document.json');
});
