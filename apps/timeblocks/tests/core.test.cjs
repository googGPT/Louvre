// Tests métier de TimeBlocks : heures, blocs, chevauchements, bilans, déplacements au pas, modèles, .ics, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `blk-${String(++n).padStart(4, '0')}`;
const b = (title, start, end, cat = 'focus') => C.makeBlock({ title, start, end, cat }, id());
const S = { workStart: '09:00', workEnd: '17:00', step: 15 };

test('heures : saisie stricte, 24:00 accepté comme fin', () => {
  assert.equal(C.parseTime('09:30'), 570);
  assert.equal(C.parseTime('9h05'), 545);
  assert.equal(C.parseTime('24:00'), 1440);
  assert.equal(C.hhmm(545), '09:05');
  for (const bad of ['24:01', '12:60', '1230', 'midi', '', '-1:00']) assert.throws(() => C.parseTime(bad), /^Error: err\.time$/);
});

test('blocs : ordre, pas de 5 minutes, catégorie, titre', () => {
  assert.deepEqual(b(' Rédaction  rapport ', '09:00', '10:30'), { id: `blk-${String(n).padStart(4, '0')}`, title: 'Rédaction rapport', start: 540, end: 630, cat: 'focus' });
  assert.throws(() => b('X', '10:00', '10:00'), /err\.order/);
  assert.throws(() => b('X', '11:00', '10:00'), /err\.order/);
  assert.throws(() => b('X', '10:02', '10:30'), /err\.step5/);
  assert.throws(() => b('X', '10:00', '11:00', 'sieste'), /err\.cat/);
  assert.throws(() => b('  ', '10:00', '11:00'), /err\.title/);
  assert.throws(() => b('x'.repeat(61), '10:00', '11:00'), /err\.titleLong/);
  assert.throws(() => C.makeBlock({ title: 'X', start: 0, end: 30, cat: 'focus' }, '<id>'), /err\.id/);
});

test('chevauchements : paires et minutes communes ; blocs qui se touchent acceptés', () => {
  const a = b('A', '09:00', '10:30'), c = b('C', '10:00', '11:00'), d = b('D', '11:00', '12:00'), e = b('E', '09:15', '09:45');
  assert.deepEqual(C.overlaps([d, c, a, e]), [
    { a: a.id, b: e.id, minutes: 30 }, { a: a.id, b: c.id, minutes: 30 }]);
  assert.deepEqual(C.overlaps([a, d]), []);
  const lay = C.layout([a, c, d, e]);
  assert.deepEqual([lay.get(a.id), lay.get(e.id), lay.get(c.id), lay.get(d.id)],
    [{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 1 }]);
});

test('bilan : totaux par catégorie, pauses, temps libre, hors plage, plus longue suite', () => {
  const blocks = [b('Code', '09:00', '11:00'), b('Café', '11:00', '11:15', 'break'), b('Réunion', '11:15', '12:00', 'meeting'),
    b('Point', '11:30', '12:30', 'meeting'), b('Sport', '18:00', '19:00', 'personal')];
  const s = C.summary(blocks, S);
  assert.equal(s.byCat.focus, 120); assert.equal(s.byCat.meeting, 105); assert.equal(s.byCat.break, 15); assert.equal(s.byCat.personal, 60);
  assert.equal(s.busy, 120 + 75 + 60); // le chevauchement 11:30-12:00 n'est compté qu'une fois
  assert.equal(s.breaks, 15);
  assert.equal(s.range, 480);
  assert.equal(s.free, 480 - 210); // 09:00-12:30 occupé dans la plage
  assert.equal(s.outside, 60);
  assert.equal(s.overlapMinutes, 30);
  assert.equal(s.longestRun, 120); // la pause coupe la matinée
  assert.deepEqual(C.gaps(blocks, S), [{ start: 750, end: 1020 }]);
  assert.deepEqual(C.gaps([], S), [{ start: 540, end: 1020 }]);
  assert.equal(C.summary([], S).longestRun, 0);
});

test('déplacement et redimensionnement au pas, sans sortir de la journée', () => {
  const x = b('X', '09:05', '10:05');
  assert.deepEqual([C.moveBlock(x, 15, 15).start, C.moveBlock(x, 15, 15).end], [555, 615]); // 09:20 arrondi à 09:15
  assert.deepEqual([C.moveBlock(x, 5, 5).start, C.moveBlock(x, 5, 5).end], [550, 610]);
  assert.deepEqual([C.moveBlock(x, -2000, 15).start, C.moveBlock(x, 5000, 15).end], [0, 1440]);
  assert.equal(C.resizeBlock(x, 'end', 15, 15).end, 615);
  assert.equal(C.resizeBlock(x, 'end', -500, 15).end, 545 + 15); // au moins un pas
  assert.equal(C.resizeBlock(x, 'start', -15, 5).start, 530);
  assert.equal(C.resizeBlock(x, 'start', 500, 5).start, 605 - 5);
  assert.throws(() => C.snap(10, 10), /err\.step/);
  assert.throws(() => C.resizeBlock(x, 'middle', 5, 5), /err\.block/);
});

test('réglages : plage et pas validés', () => {
  assert.deepEqual(C.makeSettings({}), { workStart: 540, workEnd: 1080, step: 15 });
  assert.deepEqual(C.makeSettings({ workStart: '08:30', workEnd: '16:00', step: '5' }), { workStart: 510, workEnd: 960, step: 5 });
  assert.throws(() => C.makeSettings({ workStart: '17:00', workEnd: '09:00' }), /err\.range/);
  assert.throws(() => C.makeSettings({ step: 10 }), /err\.step/);
});

test('jours civils et modèles', () => {
  assert.equal(C.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(C.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(C.addDays('2026-10-25', 1), '2026-10-26'); // changement d'heure : sans effet sur un jour civil
  assert.throws(() => C.makeDay('2026-02-30', []), /err\.day/);
  const day = C.makeDay('2026-10-27', [b('Tard', '15:00', '16:00'), b('Tôt', '08:00', '09:00')]);
  assert.deepEqual(day.blocks.map((x) => x.title), ['Tôt', 'Tard']);
  const tpl = C.makeTemplate('Journée type', 'tpl-0001', day.blocks);
  let k = 0; const fresh = () => `new-${String(++k).padStart(4, '0')}`;
  const merged = C.applyTemplate(day, tpl, 'merge', fresh);
  assert.equal(merged.blocks.length, 4);
  assert.equal(C.overlaps(merged.blocks).length, 2);
  const replaced = C.applyTemplate(C.makeDay('2026-10-28', []), tpl, 'replace', fresh);
  assert.deepEqual(replaced.blocks.map((x) => [x.id, x.start]), [['new-0003', 480], ['new-0004', 900]]);
  assert.throws(() => C.makeTemplate('Vide', 'tpl-0002', []), /err\.templateEmpty/);
  assert.throws(() => C.makeDay('2026-10-27', Array.from({ length: 61 }, () => b('X', '08:00', '09:00'))), /err\.tooMany/);
});

test('export .ics : heures flottantes, minuit, échappement, lignes pliées', () => {
  const day = C.makeDay('2026-10-27', [
    C.makeBlock({ title: 'Revue; budget, Q4', start: '09:00', end: '10:30', cat: 'meeting' }, 'ics-0001'),
    C.makeBlock({ title: 'Veille'.padEnd(60, 'é'), start: '23:00', end: '24:00', cat: 'break' }, 'ics-0002')]);
  const ics = C.toICS([day], '20261027T080000Z', (c) => ({ meeting: 'Réunion', break: 'Pause' })[c]);
  const lines = ics.split('\r\n');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(lines.includes('DTSTART:20261027T090000')); // aucun « Z », aucun TZID : heure locale flottante
  assert.ok(lines.includes('DTEND:20261027T103000'));
  assert.ok(lines.includes('DTEND:20261028T000000')); // 24:00 -> minuit du lendemain
  assert.ok(lines.includes('SUMMARY:Revue\\; budget\\, Q4'));
  assert.ok(lines.includes('CATEGORIES:Pause') && lines.includes('TRANSP:TRANSPARENT'));
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75));
  assert.ok(!/TZID|T\d{6}Z\r\nDTEND/.test(ics));
  assert.throws(() => C.toICS([day], '2026-10-27'), /err\.stamp/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const day = C.makeDay('2026-10-27', [b('A', '09:00', '10:00'), b('B', '10:00', '11:00', 'admin')]);
  const tpl = C.makeTemplate('Type', 'tpl-0009', day.blocks);
  const state = { settings: C.makeSettings({}), days: [day, C.makeDay('2026-10-28', [])], templates: [tpl] };
  const back = C.validateBackup(JSON.parse(C.backup(state)));
  assert.deepEqual(back, { settings: state.settings, days: [day], templates: [tpl] }); // jours vides non gardés
  const ok = JSON.parse(C.backup(state));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { ...ok.settings, step: 7 } }), /err\.step/);
  assert.throws(() => C.validateBackup({ ...ok, days: [{ ...ok.days[0], blocks: [{ ...ok.days[0].blocks[0], note: 'x' }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, days: [{ ...ok.days[0], blocks: [{ ...ok.days[0].blocks[0], start: '09:00' }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, days: [{ ...ok.days[0], blocks: [{ ...ok.days[0].blocks[0], end: 500 }] }] }), /err\.order/);
  assert.throws(() => C.validateBackup({ ...ok, days: [ok.days[0], ok.days[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, days: [{ ...ok.days[0], date: '2026-13-01' }] }), /err\.day/);
  assert.throws(() => C.validateBackup({ ...ok, templates: [ok.templates[0], ok.templates[0]] }), /err\.backup/);
});
