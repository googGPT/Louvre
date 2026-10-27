// Tests métier de KeyboardCoach : chronomètre, mesures de frappe et historique.
'use strict';
const test = require('node:test'); // moteur de test intégré à Node
const assert = require('node:assert/strict'); // assertions strictes
const C = require('../core.js'); // logique pure de l'appli

const TEXT = C.passage('fr-calm').text; // texte d'exercice de référence
const cps = (s) => Array.from(s); // découpe en caractères Unicode (é = 1 caractère)

test('une séance démarre à la première saisie, pas avant', () => {
  const s = C.create('fr-calm', 60); // séance prête
  assert.equal(s.mode, 'ready');
  assert.equal(C.input(s, '', 1000), s); // saisie vide : rien ne change
  const r = C.input(s, 'C', 1000); // première lettre
  assert.equal(r.mode, 'running');
  assert.equal(r.startedAt, 1000); // le chronomètre part à cet instant
});

test('vitesse nette = caractères corrects / 5 par minute', () => {
  let s = C.create('fr-calm', 60);
  const typed = cps(TEXT).slice(0, 50).join(''); // 50 caractères exacts
  s = C.input(s, typed.slice(0, 1), 0); // départ à t = 0
  s = C.input(s, typed, 30000); // 30 s plus tard
  const m = C.metrics(s, 30000);
  assert.equal(m.correct, 50);
  assert.equal(m.errors, 0);
  assert.equal(m.netWpm, 20); // 50 / 5 / 0,5 min = 20 mots/min
  assert.equal(m.accuracy, 100);
});

test('les erreurs sont comptées position par position', () => {
  let s = C.create('fr-calm', 60);
  s = C.input(s, 'Xhaque', 0); // première lettre fausse
  const m = C.metrics(s, 6000);
  assert.equal(m.typed, 6);
  assert.equal(m.errors, 1);
  assert.equal(m.correct, 5);
  assert.equal(m.accuracy, 83.33);
  assert.ok(m.rawWpm > m.netWpm); // le brut inclut les erreurs, pas le net
});

test('les lettres accentuées comptent pour un seul caractère', () => {
  const text = C.passage('fr-travel').text; // contient « À » et « ’ »
  let s = C.create('fr-travel', 60);
  s = C.input(s, cps(text).slice(0, 3).join(''), 0);
  assert.equal(C.metrics(s, 1000).correct, 3);
});

test('la pause arrête le chronomètre, la reprise le relance', () => {
  let s = C.input(C.create('fr-calm', 60), 'C', 0);
  s = C.pause(s, 10000); // 10 s actives
  assert.equal(s.mode, 'paused');
  assert.equal(C.elapsed(s, 50000), 10000); // le temps en pause ne compte pas
  s = C.resume(s, 50000);
  assert.equal(C.elapsed(s, 55000), 15000); // 10 s + 5 s
  assert.equal(C.input(C.pause(s, 55000), 'Ch', 56000).typed, 'C'); // saisie ignorée en pause
});

test('la séance se termine seule à la fin du temps', () => {
  let s = C.input(C.create('fr-calm', 30), 'C', 0);
  s = C.tick(s, 31000);
  assert.equal(s.mode, 'finished');
  assert.equal(s.elapsedMs, 30000); // plafonné à la durée choisie
  assert.equal(C.metrics(s, 99999).remainingMs, 0);
});

test('saisir tout le texte termine la séance', () => {
  let s = C.input(C.create('fr-calm', 120), 'C', 0);
  s = C.input(s, TEXT, 45000);
  assert.equal(s.mode, 'finished');
  assert.equal(C.metrics(s, 45000).progress, 100);
});

test('refuse une saisie plus longue que le texte et une durée inconnue', () => {
  const s = C.create('fr-calm', 60);
  assert.throws(() => C.input(s, TEXT + 'x', 0), /err\.input/);
  assert.throws(() => C.create('fr-calm', 45), /err\.duration/);
  assert.throws(() => C.create('inconnu', 60), /err\.passage/);
});

test('un état de séance trafiqué est refusé', () => {
  const s = C.create('fr-calm', 60);
  assert.throws(() => C.validateSession({ ...s, extra: 1 }), /err\.session$/);
  assert.throws(() => C.validateSession({ ...s, mode: 'running' }), /err\.sessionClock/);
  assert.throws(() => C.validateSession({ ...s, elapsedMs: 61000 }), /err\.sessionState/);
});

test('bilan et historique : cohérence vérifiée, 30 séances au plus', () => {
  let s = C.input(C.create('fr-calm', 60), 'C', 0);
  s = C.finish(C.input(s, 'Chaque', 6000), 6000);
  const rec = C.record(s, 6000, Date.UTC(2026, 9, 27));
  assert.equal(rec.correct, 6);
  let h = { version: 1, records: [] };
  for (let i = 0; i < 35; i++) h = C.appendHistory(h, { ...rec, at: rec.at + i });
  assert.equal(h.records.length, 30); // les plus anciennes sont retirées
  assert.equal(h.records[0].at, rec.at + 5);
  assert.throws(() => C.history({ version: 1, records: [{ ...rec, netWpm: 999 }] }), /err\.incoherent/);
  assert.throws(() => C.history({ version: 2, records: [] }), /err\.history/);
  assert.throws(() => C.record(C.create('fr-calm', 60), 0, 0), /err\.notFinished/);
});

test('export CSV : BOM, en-tête et une ligne par séance', () => {
  let s = C.input(C.create('en-river', 30), 'A', 0);
  s = C.finish(C.input(s, 'A calm', 3000), 3000);
  const h = C.appendHistory({ version: 1, records: [] }, C.record(s, 3000, Date.UTC(2026, 0, 2)));
  const out = C.csv(h);
  assert.ok(out.startsWith('﻿Date ISO,Exercice'));
  const lines = out.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^2026-01-02T00:00:00\.000Z,en-river,en,facile,30,3\.0,6,6,100\.00,/);
});

test('textes d’exercice dans les 7 langues : deux par niveau, identifiants uniques', () => {
  assert.deepEqual([...C.LANGS], ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']);
  for (const lang of C.LANGS) for (const level of C.LEVELS) assert.equal(C.PASSAGES.filter((p) => p.lang === lang && p.level === level).length, 2, lang + ' ' + level);
  assert.equal(new Set(C.PASSAGES.map((p) => p.id)).size, C.PASSAGES.length);
  for (const p of C.PASSAGES) assert.ok(cps(p.text).length <= 400 && p.text === p.text.trim(), p.id);
});

test('texte arabe : mesure caractère par caractère, de droite à gauche indifférent', () => {
  const text = C.passage('ar-garden').text;
  let s = C.input(C.create('ar-garden', 60), cps(text)[0], 0);
  s = C.input(s, cps(text).slice(0, 10).join(''), 6000);
  assert.equal(C.metrics(s, 6000).correct, 10);
});

test('en-tête CSV traduit fourni par l’interface', () => {
  let s = C.input(C.create('de-garden', 30), 'I', 0);
  s = C.finish(s, 2000);
  const h = C.appendHistory({ version: 1, records: [] }, C.record(s, 2000, 0));
  assert.ok(C.csv(h, 'A,B,C,D,E,F,G,H,I,J,K').startsWith('\uFEFFA,B,C'));
  assert.match(C.csv(h).split('\r\n')[1], /,de-garden,de,facile,30,/);
});
