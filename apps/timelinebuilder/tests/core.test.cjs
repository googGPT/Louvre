// Tests métier de TimelineBuilder : calendrier (avant notre ère compris), précisions, périodes, graduations,
// mise en page sans chevauchement, SVG échappé, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
const D = (year, month = 0, day = 0, era = 'ce') => C.parseDate({ era, year: String(year), month: String(month), day: String(day) });
const track = (name = 'Piste') => C.makeTrack({ name }, id());

test('calendrier : jours, années bissextiles, aller-retour sur 20 000 ans', () => {
  assert.equal(C.dayNumber(1970, 1, 1), 0);
  assert.equal(C.dayNumber(2000, 3, 1) - C.dayNumber(2000, 2, 28), 2); // 2000 bissextile
  assert.equal(C.dayNumber(1900, 3, 1) - C.dayNumber(1900, 2, 28), 1); // 1900 non bissextile
  assert.equal(C.dayNumber(1, 1, 1) - C.dayNumber(0, 1, 1), 366); // an 0 astronomique (1 av. J.-C.) bissextile
  for (let k = -3650000; k <= 3650000; k += 7919) assert.deepEqual(C.dayNumber(C.civil(k).y, C.civil(k).m, C.civil(k).d), k);
  assert.deepEqual(C.civil(C.dayNumber(-752, 4, 21)), { y: -752, m: 4, d: 21 });
});

test('saisie : ère, année sans zéro, mois et jour facultatifs', () => {
  assert.deepEqual(D(753, 0, 0, 'bce'), { y: -752, m: 0, d: 0 });
  assert.deepEqual(D(1, 0, 0, 'bce'), { y: 0, m: 0, d: 0 });
  assert.deepEqual(D(1789, 7, 14), { y: 1789, m: 7, d: 14 });
  assert.deepEqual(C.fromAstro(-752), { era: 'bce', year: 753 });
  for (const bad of ['0', '10000', '-5', '12.5', '']) assert.throws(() => D(bad), /err\.year/);
  assert.throws(() => D(2023, 2, 29), /err\.day/);
  assert.equal(D(2024, 2, 29).d, 29);
  assert.equal(D(5, 2, 29, 'bce').d, 29); // 5 av. J.-C. = -4 astronomique, bissextile en grégorien proleptique
  assert.throws(() => D(2024, 13), /err\.month/);
  assert.throws(() => C.parseDate({ era: 'ce', year: '2024', month: '0', day: '3' }), /err\.dayWithoutMonth/);
  assert.throws(() => C.parseDate({ era: 'ad', year: '1' }), /err\.era/);
  assert.equal(C.precision(D(1969, 7)), 'month');
  assert.equal(C.iso(D(753, 0, 0, 'bce')), '-0752');
  assert.equal(C.iso(D(1969, 7)), '1969-07');
  assert.equal(C.iso(D(476)), '0476');
});

test('intervalles : une année, un mois ou un jour ; périodes ; ordre', () => {
  assert.deepEqual(C.span(D(2024)), [C.dayNumber(2024, 1, 1), C.dayNumber(2025, 1, 1)]);
  assert.deepEqual(C.span(D(2024, 12)), [C.dayNumber(2024, 12, 1), C.dayNumber(2025, 1, 1)]);
  const tr = track();
  const rome = C.makeEvent({ title: 'Empire romain', start: D(27, 0, 0, 'bce'), end: D(476), track: tr.id }, id());
  assert.deepEqual(C.eventSpan(rome), [C.dayNumber(-26, 1, 1), C.dayNumber(477, 1, 1)]);
  assert.throws(() => C.makeEvent({ title: 'X', start: D(1800), end: D(1799), track: tr.id }, id()), /err\.endBeforeStart/);
  assert.throws(() => C.makeEvent({ title: 'X', start: D(1800), end: D(1800), track: tr.id }, id()), /err\.sameDates/);
  // Fin dans la même année mais plus précise : accepté (la période se termine fin mars 1800).
  assert.ok(C.makeEvent({ title: 'X', start: D(1800), end: D(1800, 3), track: tr.id }, id()));
  assert.throws(() => C.makeEvent({ title: ' ', start: D(1800), end: null, track: tr.id }, id()), /err\.titleRequired/);
  const a = C.makeEvent({ title: 'B', start: D(1789, 7, 14), end: null, track: tr.id }, id());
  const b = C.makeEvent({ title: 'A', start: D(776, 0, 0, 'bce'), end: null, track: tr.id }, id());
  assert.deepEqual(C.sorted([a, rome, b]).map((e) => e.title), ['A', 'Empire romain', 'B']);
});

test('graduations : jours, mois ou années « rondes », sans an 0', () => {
  const days = C.ticks(C.dayNumber(2024, 3, 1), C.dayNumber(2024, 3, 6), 10);
  assert.deepEqual(days.map((k) => k.d), [1, 2, 3, 4, 5, 6]);
  const months = C.ticks(C.dayNumber(2024, 1, 10), C.dayNumber(2024, 12, 20), 12);
  assert.deepEqual(months.map((k) => k.m), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const quarters = C.ticks(C.dayNumber(2020, 1, 1), C.dayNumber(2023, 1, 1), 13);
  assert.ok(quarters.every((k) => (k.m - 1) % 3 === 0) && quarters[0].unit === 'year');
  const ancient = C.ticks(C.dayNumber(-800, 1, 1), C.dayNumber(500, 1, 1), 8);
  // Pas de 200 ans aligné sur la numérotation historique (801 av. J.-C. -> 500) : 800 av., 600 av., 400 av., 200 av., 200, 400.
  assert.deepEqual(ancient.map((k) => C.fromAstro(k.y)), [
    { era: 'bce', year: 800 }, { era: 'bce', year: 600 }, { era: 'bce', year: 400 }, { era: 'bce', year: 200 }, { era: 'ce', year: 200 }, { era: 'ce', year: 400 }]);
  assert.ok(ancient.length <= 8);
});

test('mise en page : échelle linéaire, pistes, voies sans chevauchement, libellé à gauche en bout de frise', () => {
  const p1 = track('Politique'), p2 = track('Sciences');
  const ev = (title, start, end, tr) => C.makeEvent({ title, start, end, track: tr.id }, id());
  const t = C.makeTimeline({ name: 'Frise', tracks: [p1, p2], events: [
    ev('Alpha', D(1900), D(1950), p1), ev('Beta', D(1910), D(1920), p1), ev('Gamma', D(1960), null, p1), ev('Delta', D(2000, 6, 1), null, p2),
  ] }, id());
  const g = C.layout(t, { width: 800 });
  assert.equal(g.width, 800);
  const [a, b, c] = g.tracks[0].items;
  assert.equal(a.lane, 0); assert.equal(b.lane, 1); // Beta chevauche Alpha
  assert.ok(Math.abs((a.x2 - a.x1) / (b.x2 - b.x1) - 51 / 11) < 0.05); // longueurs proportionnelles aux durées
  assert.equal(c.lane, 0);
  assert.ok(g.tracks[1].top > g.tracks[0].top + g.tracks[0].height);
  const d = g.tracks[1].items[0];
  assert.equal(d.side, 'start'); // près du bord droit : libellé placé à gauche du point
  assert.ok(g.ticks.length >= 3 && g.ticks.every((k) => k.x >= g.left && k.x <= g.right));
  // Point d'un mois : placé au milieu du mois.
  const one = C.layout(C.makeTimeline({ name: 'X', tracks: [p1], events: [ev('M', D(1969, 7), null, p1), ev('N', D(1969, 8), null, p1)] }, id()), { width: 600 });
  const [m] = one.tracks[0].items;
  const mid = C.dayNumber(1969, 7, 1) + 15.5;
  assert.ok(Math.abs(m.x1 - (one.left + (mid - one.min) / (one.max - one.min) * (one.right - one.left))) < 0.01);
});

test('SVG : textes échappés, une forme par événement, titre et description', () => {
  const p1 = track('<b>Piste</b>');
  const t = C.makeTimeline({ name: 'A & B', tracks: [p1], events: [
    C.makeEvent({ title: '<script>alert(1)</script>', start: D(1789, 7, 14), end: null, track: p1.id }, id()),
    C.makeEvent({ title: 'Révolution', start: D(1789), end: D(1799), track: p1.id }, id()),
  ] }, id());
  const svg = C.toSVG(t, { width: 700 }, { desc: (g) => `${g.count} événements`, tick: (k) => String(k.y), range: (e) => C.iso(e.start), emptyTrack: 'vide' });
  assert.ok(!svg.includes('<script>') && svg.includes('&lt;script&gt;') && svg.includes('&lt;b&gt;Piste'));
  assert.match(svg, /<title id="tl-title">A &amp; B<\/title>/);
  assert.match(svg, /<desc id="tl-desc">2 événements<\/desc>/);
  assert.equal((svg.match(/<circle /g) || []).length, 1);
  // Libellé du point à droite (ancré au début), libellé de la période dans sa barre (texte blanc ancré au début).
  assert.match(svg, /text-anchor="start">&lt;script&gt;/);
  assert.match(svg, /fill="#ffffff" text-anchor="start">Révolution<\/text>/);
  assert.match(svg, /direction="ltr"/);
  assert.equal((svg.match(/<rect x=/g) || []).length, 2); // fond de piste + période
});

test('CSV : dates ISO (astronomiques) et dates lisibles', () => {
  const p1 = track('Antiquité');
  const t = C.makeTimeline({ name: 'F', tracks: [p1], events: [C.makeEvent({ title: 'Rome', start: D(753, 0, 0, 'bce'), end: null, track: p1.id, note: '=selon, la tradition' }, id())] }, id());
  const csv = C.toCSV(t, { head: ['Piste', 'Événement', 'Début', 'Fin', 'Début (texte)', 'Fin (texte)', 'Note'], date: (x) => `${C.fromAstro(x.y).year} av. J.-C.` });
  assert.equal(csv, '﻿Piste,Événement,Début,Fin,Début (texte),Fin (texte),Note\r\nAntiquité,Rome,-0752,,753 av. J.-C.,,"\'=selon, la tradition"\r\n');
});

test('pistes et sauvegarde', () => {
  const p1 = track('A'), p2 = track('B');
  let t = C.makeTimeline({ name: 'F', tracks: [p1, p2], events: [C.makeEvent({ title: 'E', start: D(1, 1, 1, 'bce'), end: D(2, 3), track: p1.id, note: 'n' }, id())] }, id());
  assert.throws(() => C.removeTrack(t, p1.id), /err\.trackNotEmpty/);
  assert.throws(() => C.makeTimeline({ name: 'F', tracks: [] }, id()), /err\.noTrack/);
  const list = [t];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(list))), list);
  t = C.removeTrack(t, p2.id);
  assert.throws(() => C.removeTrack(t, p1.id), /err\.lastTrack/);
  const ok = { app: 'timelinebuilder', version: 1, timelines: list };
  const clone = () => JSON.parse(JSON.stringify(ok));
  assert.throws(() => C.validateBackup({ ...ok, app: 'x' }), /err\.notBackup/);
  let x = clone(); x.timelines[0].events[0].start.d = 31; x.timelines[0].events[0].start.m = 2; assert.throws(() => C.validateBackup(x), /err\.day/);
  x = clone(); x.timelines[0].events[0].start.y = 20000; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.timelines[0].events[0].track = 'id-inconnue'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.timelines[0].events[0].end = { y: -5, m: 0, d: 0 }; assert.throws(() => C.validateBackup(x), /err\.endBeforeStart/);
  x = clone(); x.timelines[0].events[0].start.extra = 1; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.timelines[0].tracks = Array.from({ length: 9 }, (_, i) => ({ id: `trk-00000${i}`, name: 'T' })); x.timelines[0].events = []; assert.throws(() => C.validateBackup(x), /err\.tooManyTracks/);
});
