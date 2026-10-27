// Tests métier de PlantPulse : fréquences saisies, échéances, retards, saisons, historique, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const TODAY = '2026-10-27';
const plant = (over = {}, id = 'plant-0001') => C.makePlant({
  name: 'Ficus', place: 'Salon', note: '',
  tasks: { water: { every: '7', since: '2026-10-20' }, feed: { every: '30', since: '2026-10-01' }, repot: { every: '' } },
  season: null, ...over,
}, id, TODAY);
const ev = (kind, date, id, plantId = 'plant-0001') => C.makeEvent({ plantId, kind, date, note: '' }, id);

test('fréquences : entiers de 1 à 3650 jours, vide = soin non suivi', () => {
  assert.equal(C.parseEvery(' 14 '), 14);
  assert.equal(C.parseEvery(''), null);
  for (const bad of ['0', '-3', '1.5', 'abc', '3651']) assert.throws(() => C.parseEvery(bad), /^Error: err\.every/);
  assert.throws(() => plant({ tasks: { water: { every: '0' } } }), /err\.every\.water/);
  assert.throws(() => plant({ tasks: {} }), /err\.noTask/);
  assert.throws(() => plant({ name: '  ' }), /err\.nameRequired/);
  assert.throws(() => plant({ name: 'x'.repeat(61) }), /err\.nameLong\|\{"max":60\}/);
  assert.throws(() => plant({ tasks: { water: { every: '7', since: '2026-11-01' } } }), /err\.sinceFuture/);
  assert.throws(() => plant({ tasks: { water: { every: '7', since: '2026-02-30' } } }), /err\.since\.water/);
  // Date du dernier soin absente : aujourd'hui.
  assert.equal(plant({ tasks: { water: { every: '3' } } }).tasks.water.since, TODAY);
});

test('prochaine échéance, retard et état', () => {
  const p = plant();
  assert.equal(C.nextDue(p, 'water', []), '2026-10-27');
  assert.equal(C.nextDue(p, 'feed', []), '2026-10-31');
  assert.equal(C.nextDue(p, 'repot', []), null);
  assert.deepEqual(C.taskStatus(p, 'water', [], TODAY).state, 'today');
  const late = C.taskStatus(p, 'water', [], '2026-10-30');
  assert.equal(late.state, 'late'); assert.equal(late.days, -3);
  assert.equal(C.taskStatus(p, 'feed', [], TODAY).state, 'soon');
  assert.equal(C.taskStatus(p, 'feed', [], '2026-10-01').state, 'ok');
  assert.deepEqual(C.summary([p], [], '2026-10-30'), { plants: 1, late: 1, today: 0, week: 1 });
});

test("l'historique fait avancer l'échéance ; le supprimer la ramène", () => {
  const p = plant();
  let data = { plants: [p], history: [] };
  data = C.recordCare(data, { plantId: p.id, kind: 'water', date: TODAY, note: 'bien sec' }, 'event-0001', TODAY);
  assert.equal(C.nextDue(p, 'water', data.history), '2026-11-03');
  // Un soin plus ancien que la date connue ne recule pas l'échéance.
  data = C.recordCare(data, { plantId: p.id, kind: 'water', date: '2026-10-10', note: '' }, 'event-0002', TODAY);
  assert.equal(C.lastDone(p, 'water', data.history), TODAY);
  assert.deepEqual(data.history.map((h) => h.id), ['event-0001', 'event-0002']); // plus récent d'abord
  data = C.removeEvent(data, 'event-0001');
  assert.equal(C.nextDue(p, 'water', data.history), '2026-10-27');
  assert.throws(() => C.recordCare(data, { plantId: p.id, kind: 'repot', date: TODAY }, 'event-0003', TODAY), /err\.task/);
  assert.throws(() => C.recordCare(data, { plantId: p.id, kind: 'water', date: '2026-10-28' }, 'event-0003', TODAY), /err\.dateFuture/);
  assert.throws(() => C.recordCare(data, { plantId: 'plant-9999', kind: 'water', date: TODAY }, 'event-0003', TODAY), /err\.plantUnknown/);
});

test('soins du jour : retards d\'abord, puis aujourd\'hui ; rien de futur', () => {
  const a = plant({ name: 'Aloès', tasks: { water: { every: '10', since: '2026-10-10' } } }, 'plant-000a'); // dû le 20 : 7 j de retard
  const b = plant({ name: 'Basilic', tasks: { water: { every: '2', since: '2026-10-25' }, feed: { every: '60', since: '2026-10-01' } } }, 'plant-000b');
  const list = C.dueToday([b, a], [], TODAY);
  assert.deepEqual(list.map((x) => [x.plant.name, x.kind, x.days]), [['Aloès', 'water', -7], ['Basilic', 'water', 0]]);
});

test('ajustement saisonnier : coefficient saisi, appliqué selon le mois du dernier soin, pas au rempotage', () => {
  const p = C.makePlant({
    name: 'Ficus', tasks: { water: { every: '7', since: '2026-11-28' }, feed: { every: '30', since: '2026-10-01' }, repot: { every: '365', since: '2026-01-15' } },
    season: { months: ['12', '1', '2', '11'], pct: '150' },
  }, 'plant-0001', '2026-12-01');
  assert.deepEqual(p.season, { months: [1, 2, 11, 12], pct: 150 });
  assert.equal(C.intervalAfter(p, 'water', '2026-11-28'), 11); // 7 × 1,5 = 10,5 -> 11 (moitié vers le haut)
  assert.equal(C.intervalAfter(p, 'water', '2026-10-28'), 7); // octobre : hors saison
  assert.equal(C.intervalAfter(p, 'feed', '2026-12-01'), 45);
  assert.equal(C.intervalAfter(p, 'repot', '2026-01-15'), 365);
  assert.equal(C.nextDue(p, 'water', []), '2026-12-09');
  const short = plant({ tasks: { water: { every: '1', since: '2026-10-01' } }, season: { months: [10], pct: '25' } });
  assert.equal(C.intervalAfter(short, 'water', '2026-10-01'), 1); // jamais moins d'un jour
  assert.throws(() => plant({ season: { months: [1], pct: '10' } }), /err\.pct\|\{"min":25,"max":400\}/);
  assert.throws(() => plant({ season: { months: [], pct: '150' } }), /err\.seasonMonths/);
  assert.throws(() => plant({ season: { months: [13], pct: '150' } }), /err\.seasonMonths/);
  assert.throws(() => plant({ season: { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], pct: '150' } }), /err\.seasonMonths/);
});

test('calendrier des échéances : série enchaînée, retard ramené au premier jour', () => {
  const p = plant({ tasks: { water: { every: '10', since: '2026-10-10' } }, season: { months: [11], pct: '200' } });
  // dû le 20/10 (en retard) -> placé au 27/10, puis +10 (octobre) = 06/11, puis +20 (novembre) = 26/11, +20 = 16/12, +10…
  assert.deepEqual(C.schedule(p, 'water', [], TODAY, '2026-12-31'), ['2026-10-27', '2026-11-06', '2026-11-26', '2026-12-16', '2026-12-26']);
  assert.deepEqual(C.schedule(p, 'repot', [], TODAY, '2026-12-31'), []);
});

test('export .ics : une occurrence par échéance, textes fournis, lignes pliées', () => {
  const p = plant({ name: 'Monstera, grande; salon' });
  const text = { summary: (pl, k) => `${k} — ${pl.name}`, description: () => 'PlantPulse' };
  const { text: ics, count } = C.toICS([p], [], TODAY, 14, '20261027T120000Z', text);
  assert.equal(count, 3); // arrosage 27/10, 03/11 ; engrais 31/10
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104/);
  assert.match(ics, /SUMMARY:water — Monstera\\, grande\\; salon/);
  assert.match(ics, /UID:plant-0001-feed-20261031@plantpulse\.louvre/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.throws(() => C.toICS([p], [], TODAY, 0, '20261027T120000Z', text), /err\.horizon/);
  assert.throws(() => C.toICS([p], [], TODAY, 14, 'hier', text), /err\.stamp/);
  const daily = Array.from({ length: 10 }, (_, i) => plant({ tasks: { water: { every: '1', since: TODAY }, feed: { every: '1', since: TODAY } } }, `plant-d${String(i).padStart(4, '0')}`));
  assert.throws(() => C.toICS(daily, [], TODAY, 365, '20261027T120000Z', text), /err\.icsTooMany/);
});

test('supprimer une plante ou retirer un soin efface l\'historique correspondant', () => {
  const p = plant();
  let data = { plants: [p], history: [ev('water', '2026-10-25', 'event-0001'), ev('feed', '2026-10-20', 'event-0002')] };
  const noFeed = { ...p, tasks: { ...p.tasks, feed: null } };
  data = C.upsertPlant(data, noFeed);
  assert.deepEqual(data.history.map((h) => h.kind), ['water']);
  assert.deepEqual(C.removePlant(data, p.id), { plants: [], history: [] });
  const full = { plants: Array.from({ length: C.MAX_PLANTS }, (_, i) => ({ ...p, id: `plant-x${String(i).padStart(4, '0')}` })), history: [] };
  assert.throws(() => C.upsertPlant(full, { ...p, id: 'plant-new001' }), /err\.tooManyPlants/);
});

test("l'historique est plafonné : les soins les plus anciens sont oubliés", () => {
  const p = plant({ tasks: { water: { every: '1', since: '2000-01-01' } } });
  const history = Array.from({ length: C.MAX_HISTORY }, (_, i) => ev('water', C.addDays('2010-01-01', i), `event-${String(i).padStart(5, '0')}`));
  const data = C.recordCare({ plants: [p], history }, { plantId: p.id, kind: 'water', date: TODAY }, 'event-last01', TODAY);
  assert.equal(data.history.length, C.MAX_HISTORY);
  assert.equal(data.history[0].id, 'event-last01');
  assert.ok(!data.history.some((h) => h.id === 'event-00000'));
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const p = plant({ season: { months: [12, 1], pct: '150' } });
  const data = { plants: [p], history: [ev('water', '2026-10-25', 'event-0001')] };
  const back = C.validateData(JSON.parse(C.backup(data)));
  assert.deepEqual(back, data);
  const ok = JSON.parse(C.backup(data));
  const bad = (mut) => { const d = JSON.parse(JSON.stringify(ok)); mut(d); return d; };
  assert.throws(() => C.validateData({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateData(bad((d) => { d.extra = 1; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.plants[0].tasks.water.every = 0; })), /err\.every\.water/);
  assert.throws(() => C.validateData(bad((d) => { d.plants[0].tasks.water.every = '7'; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.plants[0].season.pct = 1000; })), /err\.pct/);
  assert.throws(() => C.validateData(bad((d) => { d.plants[0].season.months = [12, 1]; })), /err\.backup/); // non trié
  assert.throws(() => C.validateData(bad((d) => { d.history[0].plantId = 'plant-9999'; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.history[0].kind = 'repot'; })), /err\.backup/); // soin non suivi
  assert.throws(() => C.validateData(bad((d) => { d.history[0].date = '2026-13-01'; })), /err\.date/);
  assert.throws(() => C.validateData(bad((d) => { d.plants.push(d.plants[0]); })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.plants[0].name = 42; })), /err\.backup/);
  assert.throws(() => C.validateData(null), /err\.backup/);
});
