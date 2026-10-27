// Tests métier de MeetingMinutes : minutage, dépassements, suivi des actions, compte rendu, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
function meeting(over = {}) {
  const m = C.makeMeeting({ title: 'Comité', date: '2026-03-02', start: '09:30', duration: '60', ...over }, id());
  return m;
}

test('saisies : durées, heures, dates et textes', () => {
  assert.equal(C.parseMinutes('15'), 15);
  for (const bad of ['0', '481', '1.5', '-3', 'abc', '']) assert.throws(() => C.parseMinutes(bad), /^Error: err\.minutes/);
  assert.throws(() => C.parseDuration('4'), /err\.duration/);
  assert.equal(C.parseSpent('0'), 0); assert.equal(C.parseSpent('25'), 1500);
  assert.throws(() => C.parseSpent('481'), /err\.spentInput/);
  assert.ok(C.isDay('2024-02-29')); assert.ok(!C.isDay('2023-02-29')); assert.ok(!C.isDay('2026-13-01'));
  assert.ok(C.isTime('23:59')); assert.ok(!C.isTime('24:00')); assert.ok(!C.isTime('9:00'));
  assert.throws(() => meeting({ date: '2026-02-30' }), /err\.date/);
  assert.throws(() => meeting({ start: '25:00' }), /err\.time/);
  assert.throws(() => meeting({ title: '   ' }), /err\.titleRequired/);
  assert.throws(() => C.makeItem({ title: 'x'.repeat(121), minutes: '5' }, id()), /err\.tooLong/);
  assert.throws(() => C.makeAction({ text: 'Relancer', due: '2026-04-31' }, id()), /err\.due/);
  assert.throws(() => C.makeParticipant({ name: 'Ana', presence: 'maybe' }, id()), /err\.presence/);
  assert.throws(() => C.makeItem({ title: 'A', minutes: '5' }, 'bad id'), /err\.id/);
  assert.equal(C.makeParticipant({ name: '  Ana   Diaz ' }, id()).name, 'Ana Diaz');
});

test('horaires prévus, temps passé, dépassement et heure de fin projetée', () => {
  const m = meeting({ duration: '45' });
  m.items = [C.makeItem({ title: 'Tour de table', minutes: '10' }, id()), C.makeItem({ title: 'Budget', minutes: '20', spentSec: 1530 }, id()), C.makeItem({ title: 'Divers', minutes: '20' }, id())];
  const s = C.schedule(m);
  assert.deepEqual(s.rows.map((r) => [r.startMin, r.endMin]), [[0, 10], [10, 30], [30, 50]]);
  assert.equal(s.plannedMin, 50);
  assert.equal(s.planOverMin, 5); // 50 min prévues pour 45 disponibles
  assert.equal(s.rows[1].overSec, 330); // 25 min 30 s pour 20 prévues
  assert.equal(s.forecastMin, 56); // 10 + 25,5 + 20 arrondi à la minute supérieure
  assert.equal(s.forecastOverMin, 11);
  assert.deepEqual(s.plannedEnd, { time: '10:15', dayOffset: 0 });
  assert.equal(s.forecastEnd.time, '10:26');
  assert.equal(s.slackMin, 0);
  assert.deepEqual(C.clock('23:30', 45), { time: '00:15', dayOffset: 1 });
});

test('réordonner l\'ordre du jour', () => {
  const items = ['A', 'B', 'C'].map((t) => C.makeItem({ title: t, minutes: '5' }, id()));
  assert.deepEqual(C.moveItem(items, items[2].id, -1).map((x) => x.title), ['A', 'C', 'B']);
  assert.deepEqual(C.moveItem(items, items[0].id, -1).map((x) => x.title), ['A', 'B', 'C']); // déjà en tête
  assert.deepEqual(items.map((x) => x.title), ['A', 'B', 'C']); // pas de mutation
});

test('suivi des actions : seules les actions ouvertes des réunions antérieures, avec retard', () => {
  const m1 = meeting({ date: '2026-03-02' }), m2 = meeting({ date: '2026-03-09' }), m3 = meeting({ date: '2026-03-16' });
  m1.actions = [C.makeAction({ text: 'Devis', owner: 'Ana', due: '2026-03-06' }, id()), C.makeAction({ text: 'Salle', done: true }, id())];
  m2.actions = [C.makeAction({ text: 'Compte rendu', due: '2026-03-20' }, id()), C.makeAction({ text: 'Sans date' }, id())];
  const p3 = C.pendingActions([m3, m1, m2], m3.id);
  assert.deepEqual(p3.map((p) => p.action.text), ['Devis', 'Compte rendu', 'Sans date']);
  assert.deepEqual(p3.map((p) => p.overdue), [true, false, false]);
  assert.deepEqual(C.pendingActions([m1, m2, m3], m1.id), []); // rien avant la première
  // Même jour : l'heure départage.
  const early = meeting({ date: '2026-03-16', start: '08:00' });
  early.actions = [C.makeAction({ text: 'Matin' }, id())];
  assert.ok(C.pendingActions([early, m3], m3.id).some((p) => p.action.text === 'Matin'));
  assert.ok(!C.pendingActions([early, m3], early.id).length);
  assert.deepEqual(C.actionStats(m1.actions, '2026-03-10'), { open: 1, done: 1, overdue: 1 });
});

test('préparer la réunion suivante', () => {
  const m = meeting();
  m.participants = [C.makeParticipant({ name: 'Ana', presence: 'absent' }, id())];
  m.items = [C.makeItem({ title: 'Budget', minutes: '20', notes: 'x', spentSec: 90 }, id())];
  const next = C.nextMeeting(m, C.addDays(m.date, 7), id);
  assert.equal(next.date, '2026-03-09');
  assert.equal(next.participants[0].presence, 'present');
  assert.deepEqual([next.items[0].title, next.items[0].notes, next.items[0].spentSec], ['Budget', '', 0]);
  assert.notEqual(next.items[0].id, m.items[0].id);
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
});

test('compte rendu Markdown : présences, notes, décisions, actions et suivi', () => {
  const m = meeting();
  m.participants = [C.makeParticipant({ name: 'Ana' }, id()), C.makeParticipant({ name: 'Bo', presence: 'excused' }, id())];
  m.items = [C.makeItem({ title: 'Budget', minutes: '20', notes: 'Hausse de 3 %.', spentSec: 1500 }, id())];
  m.decisions = [C.makeDecision({ text: 'Budget validé', itemId: m.items[0].id }, id()), C.makeDecision({ text: 'Prochaine séance en ligne' }, id())];
  m.actions = [C.makeAction({ text: 'Envoyer | le devis', owner: 'Ana', due: '2026-03-06' }, id())];
  const prev = meeting({ date: '2026-02-23' }); prev.actions = [C.makeAction({ text: 'Réserver', due: '2026-02-27' }, id())];
  const md = C.toMarkdown(m, C.pendingActions([prev, m], m.id));
  assert.match(md, /^# Comité\n/);
  assert.match(md, /09:30–10:30/);
  assert.match(md, /- \*\*Présents\*\* : Ana\n- \*\*Excusés\*\* : Bo/);
  assert.match(md, /### 1\. Budget\n\n\*09:30 · prévu 20 min · passé 25 min\*\n\nHausse de 3 %\.\n\n\*\*Décisions\*\*\n\n- Budget validé/);
  assert.match(md, /## Décisions\n\n- Prochaine séance en ligne/);
  assert.match(md, /\| Envoyer \\\| le devis \| Ana \| 2026-03-06 \| À faire \|/);
  assert.match(md, /## Suivi des actions précédentes[\s\S]*\| Réserver \| — \| 2026-02-27 \| À faire \(en retard\) \| Comité \(2026-02-23\) \|/);
});

test('.ics : une journée par action ouverte datée, texte échappé et replié', () => {
  const m = meeting();
  const a = C.makeAction({ text: 'Relancer, vite; ' + 'é'.repeat(60), owner: 'Ana', due: '2026-12-31' }, id());
  const b = C.makeAction({ text: 'Fait', due: '2026-03-01', done: true }, id());
  const c = C.makeAction({ text: 'Sans date' }, id());
  const ics = C.toICS([a, b, c].map((action) => ({ action, meeting: m })), '20260302T080000Z');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(ics, /SUMMARY:Relancer\\, vite\\; /);
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, l);
  assert.throws(() => C.toICS([{ action: c, meeting: m }], '20260302T080000Z'), /err\.noDue/);
  assert.throws(() => C.toICS([], '2026-03-02'), /err\.stamp/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const m = meeting();
  m.participants = [C.makeParticipant({ name: 'Ana' }, id())];
  m.items = [C.makeItem({ title: 'Budget', minutes: '20', notes: 'a\nb' }, id())];
  m.decisions = [C.makeDecision({ text: 'OK', itemId: m.items[0].id }, id())];
  m.actions = [C.makeAction({ text: 'Devis', owner: 'Ana', due: '2026-03-06', itemId: m.items[0].id }, id())];
  const list = [m];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(list))), list);
  const ok = { app: 'meetingminutes', version: 1, meetings: list };
  const clone = () => JSON.parse(JSON.stringify(ok));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  let x = clone(); x.meetings[0].extra = 1; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.meetings[0].items[0].minutes = '20'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.meetings[0].items[0].spentSec = -1; assert.throws(() => C.validateBackup(x), /err\.spent/);
  x = clone(); x.meetings[0].actions[0].itemId = 'id-inconnu'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.meetings[0].actions[0].done = 'non'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.meetings[0].date = '2026-02-31'; assert.throws(() => C.validateBackup(x), /err\.date/);
  x = clone(); x.meetings.push(x.meetings[0]); assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.meetings[0].items = Array.from({ length: 41 }, () => x.meetings[0].items[0]); assert.throws(() => C.validateBackup(x), /err\.backup/);
});
