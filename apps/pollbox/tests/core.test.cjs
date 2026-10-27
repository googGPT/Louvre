// Tests métier de PollBox : création, ouverture, bulletins, clôture, résultats, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const base = (over = {}) => C.makePoll({ question: ' Quel  jour ? ', options: 'Lundi\n\n Mardi \nJeudi', mode: 'single', allowBlank: true, ...over }, 'poll-000001');
const open = (p) => C.openPoll(p);
function castAll(p, ballots) { return ballots.reduce((acc, b) => C.castBallot(acc, b), p); }

test('création : nettoyage, options, limites et erreurs', () => {
  const p = base();
  assert.equal(p.question, 'Quel jour ?');
  assert.deepEqual(p.options, [{ id: 'o1', label: 'Lundi' }, { id: 'o2', label: 'Mardi' }, { id: 'o3', label: 'Jeudi' }]);
  assert.deepEqual([p.status, p.ballots, p.blank, p.counts, p.maxChoices, p.maxBallots, p.lock], ['draft', 0, 0, [0, 0, 0], 1, 0, '']);
  assert.throws(() => base({ question: '  ' }), /err\.questionRequired/);
  assert.throws(() => base({ question: 'x'.repeat(201) }), /err\.questionLong/);
  assert.throws(() => base({ options: 'Seule' }), /err\.fewOptions/);
  assert.throws(() => base({ options: Array.from({ length: 21 }, (_, i) => 'o' + i) }), /err\.manyOptions/);
  assert.throws(() => base({ options: 'Oui\noui' }), /err\.dupOption/);
  assert.throws(() => base({ options: 'a\n' + 'b'.repeat(81) }), /err\.optionLong/);
  assert.throws(() => base({ mode: 'rank' }), /err\.mode/);
  assert.equal(base({ mode: 'multi' }).maxChoices, 3); // vide : autant que d'options
  assert.equal(base({ mode: 'multi', maxChoices: '2' }).maxChoices, 2);
  assert.throws(() => base({ mode: 'multi', maxChoices: '4' }), /err\.maxChoices/);
  assert.throws(() => base({ mode: 'multi', maxChoices: '0' }), /err\.maxChoices/);
  assert.equal(base({ maxBallots: '25' }).maxBallots, 25);
  assert.throws(() => base({ maxBallots: '-3' }), /err\.maxBallots/);
  assert.throws(() => base({ maxBallots: '10001' }), /err\.maxBallots/);
  assert.throws(() => base({ pin: '12' }), /err\.pin/);
  assert.throws(() => base({ pin: 'abcd' }), /err\.pin/);
  assert.throws(() => C.makePoll({ question: 'q', options: 'a\nb', mode: 'single' }, 'x'), /err\.id/);
});

test('cycle de vie : brouillon modifiable, puis ouvert, puis clos définitivement', () => {
  let p = base();
  p = C.editPoll(p, { question: 'Quel soir ?', options: 'Lundi\nMardi', mode: 'single' });
  assert.equal(p.question, 'Quel soir ?');
  assert.throws(() => C.castBallot(p, ['o1']), /err\.notOpen/); // pas de vote en brouillon
  assert.throws(() => C.results(p), /err\.notClosed/);
  p = open(p);
  assert.throws(() => C.editPoll(p, { question: 'x', options: 'a\nb', mode: 'single' }), /err\.notDraft/);
  assert.throws(() => C.openPoll(p), /err\.notDraft/);
  p = C.castBallot(p, ['o2']);
  assert.throws(() => C.results(p), /err\.notClosed/); // aucun résultat partiel
  p = C.closePoll(p);
  assert.equal(p.status, 'closed');
  assert.throws(() => C.castBallot(p, ['o1']), /err\.notOpen/);
  assert.throws(() => C.closePoll(p), /err\.notOpen/);
});

test('bulletins : seuls les totaux changent, validations strictes', () => {
  let p = open(base({ mode: 'multi', maxChoices: '2', allowBlank: false }));
  p = C.castBallot(p, ['o1', 'o3']);
  assert.deepEqual(Object.keys(p).sort(), ['allowBlank', 'ballots', 'blank', 'counts', 'id', 'lock', 'maxBallots', 'maxChoices', 'mode', 'options', 'question', 'status']); // aucun bulletin individuel
  assert.deepEqual([p.counts, p.ballots], [[1, 0, 1], 1]);
  assert.throws(() => C.castBallot(p, ['o1', 'o2', 'o3']), /err\.tooManyChoices/);
  assert.throws(() => C.castBallot(p, ['o1', 'o1']), /err\.choice/);
  assert.throws(() => C.castBallot(p, ['o9']), /err\.choice/);
  assert.throws(() => C.castBallot(p, []), /err\.noChoice/);
  assert.throws(() => C.castBallot(p, 'o1'), /err\.choice/);
  const s = open(base());
  assert.throws(() => C.castBallot(s, ['o1', 'o2']), /err\.oneChoice/);
  assert.deepEqual(C.castBallot(s, []).blank, 1); // vote blanc autorisé
  // Nombre de votants attendu atteint.
  let f = open(base({ maxBallots: '2' }));
  f = castAll(f, [['o1'], ['o2']]);
  assert.throws(() => C.castBallot(f, ['o1']), /err\.full/);
});

test('résultats : voix, rangs, égalités, pourcentages au plus fort reste', () => {
  let p = open(base());
  p = C.closePoll(castAll(p, [['o1'], ['o2'], ['o2'], ['o3'], ['o3'], ['o3'], ['o1'], []]));
  const r = C.results(p);
  assert.deepEqual(r.rows.map((x) => [x.label, x.votes, x.rank]), [['Jeudi', 3, 1], ['Lundi', 2, 2], ['Mardi', 2, 2]]);
  assert.deepEqual(r.rows.map((x) => x.pct), [428, 286, 286]); // 42,8 + 28,6 + 28,6 = 100,0 % (plus fort reste)
  assert.equal(r.rows.reduce((a, x) => a + x.pct, 0), 1000);
  assert.deepEqual([r.ballots, r.blank, r.valid, r.blankPct, r.tie], [8, 1, 7, 125, false]);
  assert.deepEqual(r.winners.map((x) => x.label), ['Jeudi']);
  // Égalité en tête.
  const t = C.results(C.closePoll(castAll(open(base()), [['o1'], ['o2']])));
  assert.equal(t.tie, true); assert.deepEqual(t.winners.map((x) => x.label), ['Lundi', 'Mardi']);
  // Aucun suffrage exprimé.
  const z = C.results(C.closePoll(castAll(open(base()), [[], []])));
  assert.deepEqual([z.valid, z.winners.length, z.rows.every((x) => x.pct === 0)], [0, 0, true]);
  // Choix multiple : part des votants, le total peut dépasser 100 %.
  const m = C.results(C.closePoll(castAll(open(base({ mode: 'multi' })), [['o1', 'o2'], ['o1'], ['o1', 'o3']])));
  assert.deepEqual(m.rows.map((x) => [x.label, x.pct]), [['Lundi', 1000], ['Mardi', 333], ['Jeudi', 333]]);
  assert.deepEqual(C.percentages([1, 1, 1], 3, true), [334, 333, 333]);
});

test('code organisateur : verrou de confort pour la clôture', () => {
  const p = open(base({ pin: '2468' }));
  assert.match(p.lock, /^[0-9a-f]{8}$/);
  assert.equal(p.lock, C.lockHash('2468', 'poll-000001'));
  assert.notEqual(p.lock, C.lockHash('2468', 'poll-000002')); // dépend du scrutin
  assert.throws(() => C.closePoll(p), /err\.badPin/);
  assert.throws(() => C.closePoll(p, '1357'), /err\.badPin/);
  assert.throws(() => C.closePoll(p, 'abc'), /err\.badPin/);
  assert.equal(C.closePoll(p, '2468').status, 'closed');
  // Modifier le brouillon sans ressaisir le code garde le verrou.
  const d = base({ pin: '2468' });
  assert.equal(C.editPoll(d, { question: 'Autre ?', options: 'a\nb', mode: 'single' }).lock, d.lock);
  // Dupliquer repart sans votes ni code.
  const dup = C.duplicatePoll(C.closePoll(castAll(p, [['o1']]), '2468'), 'poll-000002');
  assert.deepEqual([dup.status, dup.ballots, dup.lock, dup.question], ['draft', 0, '', 'Quel jour ?']);
});

test('export CSV : en-têtes traduits, cellules protégées', () => {
  const p = C.closePoll(castAll(open(C.makePoll({ question: '=Choix ?', options: '+Oui\nNon', mode: 'single', allowBlank: true }, 'poll-000003')), [['o1'], ['o1'], ['o2'], []]));
  const texts = { question: 'Question', headers: ['Option', 'Voix', '%', 'Rang'], blank: 'Blancs', total: 'Bulletins', pct: (x) => (x / 10).toFixed(1).replace('.', ',') };
  const lines = C.resultsCSV(p, texts).replace(/^﻿/, '').trim().split('\r\n');
  assert.deepEqual(lines, ['"Question","\'=Choix ?"', '"Option","Voix","%","Rang"', '"\'+Oui","2","66,7","1"', '"Non","1","33,3","2"', '"Blancs","1","",""', '"Bulletins","4","",""']);
  assert.throws(() => C.resultsCSV(open(base()), texts), /err\.notClosed/);
});

test('sauvegarde : valide, et refus des totaux incohérents', () => {
  const a = castAll(open(base({ pin: '1234' })), [['o1'], ['o3'], []]);
  const b = C.closePoll(castAll(open(C.makePoll({ question: 'Q', options: 'x\ny\nz', mode: 'multi', maxChoices: '2' }, 'poll-000002')), [['o1', 'o2'], ['o2']]));
  const draft = C.makePoll({ question: 'Brouillon', options: 'a\nb', mode: 'single' }, 'poll-000004');
  const json = C.backup([a, b, draft]);
  assert.deepEqual(C.validateBackup(JSON.parse(json)), JSON.parse(json).polls);
  const bad = (mut) => { const d = JSON.parse(json); mut(d); return d; };
  assert.throws(() => C.validateBackup('x'), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.app = 'logiclab'; })), /err\.notBackup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].ballots = 2; })), /err\.backup/); // somme ≠ bulletins exprimés
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].counts[0] = -1; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].counts.push(0); })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].status = 'won'; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].lock = 'zzzz'; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].ballot_log = []; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[0].options[0].id = 'o7'; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[1].counts = [2, 2, 2]; })), /err\.backup/); // plus de 2 choix par votant
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[2].ballots = 1; d.polls[2].counts[0] = 1; })), /err\.backup/); // votes sur un brouillon
  assert.throws(() => C.validateBackup(bad((d) => { d.polls[1].blank = 1; d.polls[1].ballots = 3; })), /err\.backup/); // blanc non autorisé
  assert.throws(() => C.validateBackup(bad((d) => { d.polls.push({ ...d.polls[0] }); })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((d) => { d.polls = Array.from({ length: 51 }, (_, i) => ({ ...d.polls[2], id: 'poll-' + String(i).padStart(6, '0') })); })), /err\.tooManyPolls/);
});
