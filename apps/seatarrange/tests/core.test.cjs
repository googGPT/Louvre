// Tests métier de SeatArrange : saisie, contraintes, placement déterministe, ajustements, rapport, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

function counter() { let n = 0; return () => 'id-' + String(++n).padStart(6, '0'); }
function build(guestText, zones, rules = []) {
  const id = counter();
  let ev = C.makeEvent('Fête', id());
  ev = C.addGuests(ev, C.parseGuestList(guestText), id);
  for (const [name, kind, cap] of zones) ev = C.addZone(ev, C.makeZone({ name, kind, capacity: String(cap) }, id()));
  const g = (n) => ev.guests.find((x) => x.name === n).id, z = (n) => ev.zones.find((x) => x.name === n).id;
  for (const r of rules) {
    const c = r.type === 'fixed' ? { type: 'fixed', a: g(r.a), zone: z(r.zone), seat: r.seat || '' } : { type: r.type, a: g(r.a), b: g(r.b) };
    ev = C.addConstraint(ev, C.makeConstraint(c, id(), ev));
  }
  return { ev, g, z, id };
}
const where = (ev, name) => { const gid = ev.guests.find((x) => x.name === name).id; const p = ev.seating[gid]; return p ? `${ev.zones.find((z) => z.id === p[0]).name}:${p[1] + 1}` : null; };
const zoneOf = (ev, name) => (where(ev, name) || '').split(':')[0] || null;
const place = (ev) => { const { exact, ...rest } = C.autoPlace(ev); return rest; };

test('saisie : liste collée, groupes, doublons et limites', () => {
  assert.deepEqual(C.parseGuestList(' Amina ; Famille \n\nLéa\tAmis\nMarc'), [{ name: 'Amina', group: 'Famille' }, { name: 'Léa', group: 'Amis' }, { name: 'Marc', group: '' }]);
  const { ev, id } = build('Amina\nLéa', [['T1', 'table', 4]]);
  assert.throws(() => C.addGuests(ev, [{ name: 'amina' }], id), /err\.dupGuest/);
  assert.throws(() => C.addGuests(ev, [{ name: 'Zoé' }, { name: 'zoé' }], id), /err\.dupGuest/);
  assert.throws(() => C.addGuests(ev, [{ name: '  ' }], id), /err\.guestName/);
  assert.throws(() => C.addGuests(ev, [{ name: 'x'.repeat(61) }], id), /err\.nameLong/);
  assert.throws(() => C.addGuests(ev, Array.from({ length: 299 }, (_, i) => ({ name: 'G' + i })), id), /err\.tooManyGuests/);
  assert.throws(() => C.makeZone({ name: 'T', kind: 'table', capacity: '0' }, 'zone-0001'), /err\.capacity/);
  assert.throws(() => C.makeZone({ name: 'T', kind: 'table', capacity: '41' }, 'zone-0001'), /err\.capacity/);
  assert.throws(() => C.makeZone({ name: 'T', kind: 'sofa', capacity: '4' }, 'zone-0001'), /err\.kind/);
  assert.throws(() => C.addZone(ev, C.makeZone({ name: 't1', kind: 'row', capacity: '4' }, 'zone-0001')), /err\.dupZone/);
});

test('contraintes : références, doublons, contradictions, places fixes', () => {
  const { ev, g, z } = build('A\nB\nC', [['T1', 'table', 2]], [{ type: 'together', a: 'A', b: 'B' }, { type: 'fixed', a: 'C', zone: 'T1', seat: '2' }]);
  const mk = (c) => C.makeConstraint(c, 'cons-0099', ev);
  assert.throws(() => mk({ type: 'together', a: g('B'), b: g('A') }), /err\.dupConstraint/);
  assert.throws(() => mk({ type: 'apart', a: g('A'), b: g('B') }), /err\.contradiction/);
  assert.throws(() => mk({ type: 'apart', a: g('A'), b: g('A') }), /err\.sameGuest/);
  assert.throws(() => mk({ type: 'apart', a: g('A'), b: 'nobody-1' }), /err\.unknownGuest/);
  assert.throws(() => mk({ type: 'fixed', a: g('C'), zone: z('T1') }), /err\.alreadyFixed/);
  assert.throws(() => mk({ type: 'fixed', a: g('A'), zone: z('T1'), seat: '2' }), /err\.seatTaken/);
  assert.throws(() => mk({ type: 'fixed', a: g('A'), zone: z('T1'), seat: '3' }), /err\.seat/);
  assert.throws(() => mk({ type: 'fixed', a: g('A'), zone: 'zone-none' }), /err\.unknownZone/);
  assert.throws(() => mk({ type: 'love', a: g('A'), b: g('B') }), /err\.ctype/);
  // Retirer un invité retire ses règles et sa place.
  const placed = place(ev);
  const after = C.removeGuest(placed, g('A'));
  assert.equal(after.constraints.length, 1); assert.equal(after.seating[g('A')], undefined);
  const noZone = C.removeZone(placed, z('T1'));
  assert.deepEqual([noZone.constraints.length, Object.keys(noZone.seating).length], [1, 0]);
});

test('placement automatique : toutes les contraintes respectées quand c\'est possible', () => {
  const { ev } = build('Amina;Famille\nYoussef;Famille\nLéa;Amis\nHugo;Amis\nSara\nTom\nInès\nMarc\nZoé\nPaul',
    [['T1', 'table', 4], ['T2', 'table', 4], ['T3', 'table', 3]],
    [{ type: 'together', a: 'Amina', b: 'Youssef' }, { type: 'together', a: 'Léa', b: 'Hugo' }, { type: 'apart', a: 'Amina', b: 'Léa' },
      { type: 'apart', a: 'Tom', b: 'Marc' }, { type: 'fixed', a: 'Paul', zone: 'T3', seat: '1' }]);
  const r = C.autoPlace(ev);
  assert.equal(r.exact, true);
  const p = place(ev);
  const chk = C.check(p);
  assert.deepEqual([chk.ok, chk.placed, chk.seats, chk.issues.length], [true, 10, 11, 0]);
  assert.equal(where(p, 'Paul'), 'T3:1');
  assert.equal(zoneOf(p, 'Amina'), zoneOf(p, 'Youssef'));
  assert.notEqual(zoneOf(p, 'Amina'), zoneOf(p, 'Léa'));
  assert.notEqual(zoneOf(p, 'Tom'), zoneOf(p, 'Marc'));
  // Déterministe : mêmes données, même plan.
  assert.deepEqual(place(ev).seating, p.seating);
  // Les groupes « ensemble » sont assis côte à côte.
  const [, sa] = p.seating[ev.guests.find((x) => x.name === 'Amina').id], [, sy] = p.seating[ev.guests.find((x) => x.name === 'Youssef').id];
  assert.equal(Math.abs(sa - sy), 1);
});

test('placement : chaînes « ensemble », recherche avec retour arrière', () => {
  // A-B-C ensemble (3), D-E ensemble ; tables de 3 et 2 ; X séparé de A : le glouton naïf mettrait X avec A.
  const { ev } = build('A\nB\nC\nD\nE\nX', [['T1', 'table', 3], ['T2', 'table', 3]],
    [{ type: 'together', a: 'A', b: 'B' }, { type: 'together', a: 'B', b: 'C' }, { type: 'together', a: 'D', b: 'E' }, { type: 'apart', a: 'X', b: 'D' }, { type: 'apart', a: 'X', b: 'A' }]);
  const p = place(ev);
  const chk = C.check(p);
  // Impossible de tout respecter : X ne peut aller ni avec A,B,C (pleine) ni avec D,E.
  assert.equal(chk.issues.length >= 1, true);
  assert.equal(chk.placed, 6);
  // Variante satisfiable : 3 tables.
  const ok = build('A\nB\nC\nD\nE\nX', [['T1', 'table', 3], ['T2', 'table', 2], ['T3', 'table', 2]],
    [{ type: 'together', a: 'A', b: 'B' }, { type: 'together', a: 'B', b: 'C' }, { type: 'together', a: 'D', b: 'E' }, { type: 'apart', a: 'X', b: 'D' }, { type: 'apart', a: 'X', b: 'A' }]).ev;
  const q = place(ok);
  assert.equal(C.check(q).ok, true);
  assert.equal(zoneOf(q, 'X'), 'T3');
});

test('cas limites : places manquantes, groupe trop grand, aucune table', () => {
  // 5 invités, 4 places : un invité sans place, signalé.
  let p = place(build('A\nB\nC\nD\nE', [['T1', 'table', 2], ['R1', 'row', 2]]).ev);
  let chk = C.check(p);
  assert.deepEqual([chk.placed, chk.unplaced.length, chk.shortage, chk.ok], [4, 1, 1, false]);
  // Groupe de 5 « ensemble » pour des tables de 3 : découpé, la contrainte non respectée est rapportée.
  p = place(build('A\nB\nC\nD\nE', [['T1', 'table', 3], ['T2', 'table', 3]],
    [{ type: 'together', a: 'A', b: 'B' }, { type: 'together', a: 'B', b: 'C' }, { type: 'together', a: 'C', b: 'D' }, { type: 'together', a: 'D', b: 'E' }]).ev);
  chk = C.check(p);
  assert.equal(chk.placed, 5);
  assert.deepEqual(chk.issues.map((i) => i.type), ['together']);
  // Aucune table : personne n'est placé.
  p = place(build('A\nB', []).ev);
  assert.equal(C.check(p).placed, 0);
});

test('ajustement manuel : déplacement, échange, retrait, rapport mis à jour', () => {
  const { ev, g, z } = build('A\nB\nC', [['T1', 'table', 2], ['T2', 'row', 2]], [{ type: 'apart', a: 'A', b: 'B' }]);
  let p = place(ev);
  assert.equal(C.check(p).ok, true);
  const [zb, sb] = p.seating[g('B')];
  p = C.moveGuest(p, g('A'), zb, sb); // échange avec B
  assert.deepEqual(p.seating[g('A')], [zb, sb]);
  assert.equal(C.check(p).ok, true); // A et B toujours séparés (échangés)
  p = C.moveGuest(p, g('B'), zb, (sb + 1) % 2); // B rejoint A
  assert.equal(zoneOf(p, 'A'), zoneOf(p, 'B'));
  const chk = C.check(p);
  assert.deepEqual(chk.issues.map((i) => [i.type, i.reason]), [['apart', 'zone']]);
  p = C.unseat(p, g('C'));
  assert.equal(C.check(p).unplaced.length, 1);
  p = C.moveGuest(p, g('C'), z('T2'), 1); // un invité sans place prend une chaise libre
  assert.deepEqual(p.seating[g('C')], [z('T2'), 1]);
  assert.throws(() => C.moveGuest(p, g('C'), z('T2'), 2), /err\.seat/);
  assert.throws(() => C.moveGuest(p, g('C'), 'zone-x', 0), /err\.unknownZone/);
  assert.equal(C.clearSeating(p).seating && Object.keys(C.clearSeating(p).seating).length, 0);
});

test('places fixes : zone et numéro respectés, écart signalé après déplacement', () => {
  const { ev, g, z } = build('A\nB\nC\nD', [['T1', 'table', 4]], [{ type: 'fixed', a: 'C', zone: 'T1', seat: '3' }, { type: 'fixed', a: 'D', zone: 'T1' }]);
  let p = place(ev);
  assert.equal(where(p, 'C'), 'T1:3');
  assert.equal(C.check(p).ok, true);
  p = C.moveGuest(p, g('C'), z('T1'), 0);
  assert.deepEqual(C.check(p).issues.map((i) => [i.type, i.reason]), [['fixed', 'seat']]);
});

test('voisins à une table ronde et dans une rangée', () => {
  assert.deepEqual(C.neighbours({ kind: 'table', capacity: 6 }, 0).sort(), [1, 5]);
  assert.deepEqual(C.neighbours({ kind: 'row', capacity: 6 }, 0), [1]);
  assert.deepEqual(C.neighbours({ kind: 'row', capacity: 6 }, 5), [4]);
  assert.deepEqual(C.neighbours({ kind: 'table', capacity: 2 }, 0), [1]);
});

test('un grand événement est placé rapidement et de façon déterministe', () => {
  const names = Array.from({ length: 200 }, (_, i) => `Invité ${i + 1}`).join('\n');
  const zones = Array.from({ length: 21 }, (_, i) => [`T${i + 1}`, 'table', 10]);
  const rules = [];
  for (let i = 1; i < 200; i += 4) rules.push({ type: 'together', a: `Invité ${i}`, b: `Invité ${i + 1}` });
  for (let i = 3; i < 190; i += 7) rules.push({ type: 'apart', a: `Invité ${i}`, b: `Invité ${i + 5}` });
  const { ev } = build(names, zones, rules);
  const t0 = Date.now(), p = place(ev);
  assert.ok(Date.now() - t0 < 5000);
  const chk = C.check(p);
  assert.deepEqual([chk.placed, chk.ok], [200, true]);
  assert.deepEqual(place(ev).seating, p.seating);
});

test('export CSV et sauvegarde (valide, puis refus des incohérences)', () => {
  const { ev, g, z } = build('=Amina;Famille\nLéa;Amis\nMarc', [['T1', 'table', 2], ['R1', 'row', 1]], [{ type: 'together', a: '=Amina', b: 'Léa' }]);
  const p = place(ev);
  const csv = C.planCSV(p, { headers: ['Table', 'Type', 'Place', 'Invité', 'Groupe'], kind: { table: 'Table', row: 'Rangée' }, unplaced: 'Sans place' });
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.deepEqual(lines, ['"Table","Type","Place","Invité","Groupe"', '"T1","Table","1","\'=Amina","Famille"', '"T1","Table","2","Léa","Amis"', '"R1","Rangée","1","Marc",""']);
  const json = C.backup([p]);
  assert.deepEqual(C.validateBackup(JSON.parse(json)), [p]);
  const bad = (mut) => { const d = JSON.parse(json); mut(d.events[0], d); return d; };
  assert.throws(() => C.validateBackup(null), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((e, d) => { d.app = 'pollbox'; })), /err\.notBackup/);
  assert.throws(() => C.validateBackup(bad((e) => { e.seating[g('Marc')] = [z('T1'), 0]; })), /err\.backup/); // deux invités sur une chaise
  assert.throws(() => C.validateBackup(bad((e) => { e.seating[g('Marc')] = [z('R1'), 1]; })), /err\.backup/); // place hors capacité
  assert.throws(() => C.validateBackup(bad((e) => { e.seating['ghost-0001'] = [z('R1'), 0]; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((e) => { e.constraints[0].b = 'ghost-0001'; })), /err\.unknownGuest/);
  assert.throws(() => C.validateBackup(bad((e) => { e.guests[1].name = 'amina'; e.guests[0].name = 'Amina'; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((e) => { e.zones[0].capacity = 99; })), /err\.capacity/);
  assert.throws(() => C.validateBackup(bad((e) => { e.extra = 1; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((e) => { e.guests[0].name = '  Amina  '; })), /err\.backup/);
  assert.throws(() => C.validateBackup(bad((e, d) => { d.events.push({ ...e }); })), /err\.backup/);
});
