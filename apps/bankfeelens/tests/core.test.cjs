// Tests métier de BankFeeLens : saisies, coût annuel ligne par ligne, retraits gratuits, découvert, opérations à l'étranger,
// classement, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const PROFILE = { withdrawals: '4', transfers: '2', foreignOps: '3', foreignAmount: '50', overdraftDays: '30', overdraftAmount: '300' };
const profile = (o) => C.makeProfile({ ...PROFILE, ...o });
const offer = (name, o) => C.makeOffer({ name, ...o }, `offer-${String(++n).padStart(4, '0')}`);
const A = { account: '2', card: '45', withdrawalFee: '1', freeWithdrawals: '3', transferFee: '0', overdraftRate: '16', foreignFixed: '0.50', foreignPct: '2' };

test('saisies : montants, moyennes d\'opérations, jours, taux', () => {
  assert.equal(C.parseCents('2,50', 'card'), 250);
  assert.equal(C.parseCents('', 'card'), 0);
  assert.throws(() => C.parseCents('-1', 'card'), /^Error: err\.amount\|\{"field":"card"\}/);
  assert.equal(C.parseCount('1,5', 'withdrawals'), 15);
  assert.equal(C.parseCount('12', 'withdrawals'), 120);
  for (const bad of ['1.25', '-1', 'x', '501']) assert.throws(() => C.parseCount(bad, 'transfers'), /err\.count/);
  assert.equal(C.parseDays('366', 'overdraftDays'), 366);
  assert.throws(() => C.parseDays('367', 'overdraftDays'), /err\.days/);
  assert.equal(C.parseRate('12,5 %', 'overdraftRate', 3000), 1250);
  assert.throws(() => C.parseRate('31', 'overdraftRate', 3000), /err\.rate\|\{"field":"overdraftRate","max":30\}/);
  assert.throws(() => C.parseRate('-1', 'foreignPct', 1000), /err\.rate/);
  assert.throws(() => profile({ overdraftAmount: '' }), /err\.overdraftAmount/);
  assert.throws(() => profile({ foreignAmount: '0' }), /err\.foreignAmount/);
  assert.throws(() => offer(' ', A), /err\.nameRequired/);
  assert.throws(() => offer('x'.repeat(41), A), /err\.nameLong/);
  assert.throws(() => C.makeOffer({ name: 'X' }, 'bad id'), /err\.id/);
});

test('coût annuel ligne par ligne', () => {
  const c = C.annualCost(profile({}), offer('A', A));
  assert.deepEqual(c.lines, {
    account: 2400, // 2,00 × 12
    card: 4500,
    withdrawals: 1200, // (4 − 3 gratuits) × 1,00 × 12
    transfers: 0,
    overdraft: 395, // 300 × 16 % × 30 / 365 = 3,945…
    foreign: 5400, // 3 × (0,50 + 2 % de 50) × 12
  });
  assert.equal(c.total, 13895);
  assert.equal(c.monthly, 1158);
});

test('moyennes décimales, retraits gratuits au-delà de l\'usage, profil vide', () => {
  const c = C.annualCost(profile({ withdrawals: '1.5', transfers: '0.5' }), offer('B', { withdrawalFee: '1', freeWithdrawals: '3', transferFee: '0.30' }));
  assert.equal(c.lines.withdrawals, 0); // 1,5 retrait < 3 gratuits
  assert.equal(c.lines.transfers, 180); // 0,5 × 0,30 × 12
  const none = C.annualCost(C.makeProfile({}), offer('C', A));
  assert.deepEqual([none.lines.withdrawals, none.lines.overdraft, none.lines.foreign], [0, 0, 0]);
  assert.equal(none.total, 6900); // seuls la tenue de compte et la carte restent
});

test('classement : moins cher d\'abord, écart avec la meilleure offre, égalités par nom', () => {
  const p = profile({});
  const rows = C.rank(p, [offer('Zeta', A), offer('Gratuite', {}), offer('Alpha', {}), offer('Virements', { transferFee: '0.5' })]);
  assert.deepEqual(rows.map((r) => r.name), ['Alpha', 'Gratuite', 'Virements', 'Zeta']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((r) => r.gap), [0, 0, 1200, 13895]);
  assert.deepEqual(C.rank(p, []), []);
  assert.throws(() => C.rank(null, []), /err\.params/);
});

test('CSV : colonnes traduites, montants en décimal, pas de formule', () => {
  const rows = C.rank(profile({}), [offer('=A', A)]);
  const labels = Object.fromEntries(['rank', 'name', ...C.LINES, 'total', 'gap'].map((c) => [c, c.toUpperCase()]));
  const lines = C.rankingCsv(rows, labels).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], '"RANK";"NAME";"ACCOUNT";"CARD";"WITHDRAWALS";"TRANSFERS";"OVERDRAFT";"FOREIGN";"TOTAL";"GAP"');
  assert.equal(lines[1], '"1";"\'=A";"24.00";"45.00";"12.00";"0.00";"3.95";"54.00";"138.95";"0.00"');
  assert.throws(() => C.rankingCsv([], labels), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const state = { profile: profile({ withdrawals: '1.5' }), offers: [offer('A', A), offer('B', { card: '12.34' })] };
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(state))), state);
  assert.deepEqual(C.validateBackup({ app: 'bankfeelens', version: 1, profile: null, offers: [] }), C.emptyState());
  const ok = { app: 'bankfeelens', version: 1, ...state };
  assert.throws(() => C.validateBackup({ ...ok, app: 'pricelens' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: true }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, profile: { ...state.profile, overdraftDays: 400 } }), /err\.days/);
  assert.throws(() => C.validateBackup({ ...ok, profile: { ...state.profile, withdrawalsTenths: 1.5 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, offers: [{ ...state.offers[0], cardCents: -1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, offers: [{ ...state.offers[0], foreignPctBp: 2000 }] }), /err\.rate/);
  assert.throws(() => C.validateBackup({ ...ok, offers: [{ ...state.offers[0], hack: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, offers: [state.offers[0], state.offers[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, offers: new Array(13).fill(state.offers[0]) }), /err\.tooMany/);
});
