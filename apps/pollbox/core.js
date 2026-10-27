/* PollBox — logique pure : scrutins anonymes sur un même appareil.
   Seuls des totaux sont enregistrés (aucun bulletin individuel, aucun horodatage, aucun ordre de vote) ;
   les résultats ne sont calculables qu'après la clôture, qui est définitive. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ polls: 50, minOptions: 2, maxOptions: 20, question: 200, label: 80, ballots: 10000 });
  const MODES = Object.freeze(['single', 'multi']);
  const STATUSES = Object.freeze(['draft', 'open', 'closed']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const ID = /^[a-z0-9-]{6,64}$/i;
  const isInt = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;

  function cleanQuestion(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.questionRequired');
    const s = v.trim().replace(/\s+/g, ' ');
    if (s.length > LIMITS.question) fail('err.questionLong', { max: LIMITS.question });
    return s;
  }
  // Options : une par ligne (ou un tableau), lignes vides ignorées, doublons refusés.
  function cleanOptions(v) {
    const list = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '')).filter(Boolean);
    if (list.length < LIMITS.minOptions) fail('err.fewOptions', { min: LIMITS.minOptions });
    if (list.length > LIMITS.maxOptions) fail('err.manyOptions', { max: LIMITS.maxOptions });
    const seen = new Set();
    for (const l of list) {
      if (l.length > LIMITS.label) fail('err.optionLong', { max: LIMITS.label });
      const k = l.toLocaleLowerCase();
      if (seen.has(k)) fail('err.dupOption', { label: l });
      seen.add(k);
    }
    return list.map((label, i) => ({ id: 'o' + (i + 1), label }));
  }
  function parseCount(v, key, min, max) {
    if (v === '' || v === undefined || v === null) return min === 0 ? 0 : fail(key, { min, max });
    const s = String(v).trim();
    if (!/^\d{1,6}$/.test(s) || !isInt(Number(s), min, max)) fail(key, { min, max });
    return Number(s);
  }

  // Verrou de confort (code organisateur) : empreinte FNV-1a répétée. Elle évite une clôture par mégarde,
  // ce n'est PAS une protection contre quelqu'un qui a accès aux outils du navigateur.
  function lockHash(pin, salt) {
    if (!/^\d{4,8}$/.test(String(pin))) fail('err.pin');
    let h = 0x811c9dc5;
    const data = `${salt}:${pin}`;
    for (let round = 0; round < 1000; round++) {
      for (let i = 0; i < data.length; i++) { h ^= data.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      h ^= round; h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // Scrutin en brouillon (modifiable tant qu'il n'est pas ouvert).
  function makePoll(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const options = cleanOptions(input.options);
    const mode = input.mode;
    if (!MODES.includes(mode)) fail('err.mode');
    const noMax = input.maxChoices === undefined || input.maxChoices === null || String(input.maxChoices).trim() === '';
    const maxChoices = mode === 'single' ? 1 : noMax ? options.length : parseCount(input.maxChoices, 'err.maxChoices', 1, options.length); // vide : autant que d'options
    const maxBallots = parseCount(input.maxBallots, 'err.maxBallots', 0, LIMITS.ballots);
    const pin = String(input.pin || '').trim();
    let lock = typeof input.lock === 'string' ? input.lock : '';
    if (pin) lock = lockHash(pin, id);
    return {
      id, question: cleanQuestion(input.question), options, mode, maxChoices, allowBlank: !!input.allowBlank, maxBallots,
      lock, status: 'draft', counts: options.map(() => 0), blank: 0, ballots: 0,
    };
  }
  function editPoll(poll, input) {
    if (poll.status !== 'draft') fail('err.notDraft');
    return makePoll({ lock: poll.lock, ...input }, poll.id);
  }
  function openPoll(poll) {
    if (poll.status !== 'draft') fail('err.notDraft');
    return { ...poll, status: 'open' };
  }
  // Dépose un bulletin : seuls les totaux changent.
  function castBallot(poll, choiceIds) {
    if (poll.status !== 'open') fail('err.notOpen');
    if (poll.maxBallots && poll.ballots >= poll.maxBallots) fail('err.full', { max: poll.maxBallots });
    if (!Array.isArray(choiceIds)) fail('err.choice');
    const ids = new Set(choiceIds);
    if (ids.size !== choiceIds.length) fail('err.choice');
    for (const c of ids) if (!poll.options.some((o) => o.id === c)) fail('err.choice');
    if (!ids.size && !poll.allowBlank) fail('err.noChoice');
    if (poll.mode === 'single' && ids.size > 1) fail('err.oneChoice');
    if (ids.size > poll.maxChoices) fail('err.tooManyChoices', { max: poll.maxChoices });
    return {
      ...poll,
      counts: poll.options.map((o, i) => poll.counts[i] + (ids.has(o.id) ? 1 : 0)),
      blank: poll.blank + (ids.size ? 0 : 1),
      ballots: poll.ballots + 1,
    };
  }
  function closePoll(poll, pin) {
    if (poll.status !== 'open') fail('err.notOpen');
    if (poll.lock && (pin === null || pin === undefined || !/^\d{4,8}$/.test(String(pin)) || lockHash(pin, poll.id) !== poll.lock)) fail('err.badPin');
    return { ...poll, status: 'closed' };
  }
  function duplicatePoll(poll, id, question) {
    return makePoll({ question: question || poll.question, options: poll.options.map((o) => o.label), mode: poll.mode, maxChoices: String(poll.maxChoices), allowBlank: poll.allowBlank, maxBallots: String(poll.maxBallots) }, id);
  }

  // Pourcentages en dixièmes de point. Choix unique : base = bulletins exprimés (hors blancs), répartition
  // au plus fort reste pour que le total fasse exactement 100,0 %. Choix multiple : part des votants exprimés
  // ayant coché l'option (le total peut dépasser 100 %).
  function percentages(counts, base, exact) {
    if (!base) return counts.map(() => 0);
    const raw = counts.map((c) => (c * 1000) / base);
    const out = raw.map(Math.floor);
    if (!exact) return raw.map((x) => Math.round(x));
    let rest = 1000 - out.reduce((a, b) => a + b, 0);
    const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k][1]]++;
    return out;
  }
  function results(poll) {
    if (poll.status !== 'closed') fail('err.notClosed'); // jamais de résultats partiels
    const valid = poll.ballots - poll.blank;
    const pct = percentages(poll.counts, valid, poll.mode === 'single');
    const max = Math.max(0, ...poll.counts);
    const rows = poll.options.map((o, i) => ({ id: o.id, label: o.label, votes: poll.counts[i], pct: pct[i], winner: max > 0 && poll.counts[i] === max }));
    const sorted = rows.slice().sort((a, b) => b.votes - a.votes || poll.options.findIndex((o) => o.id === a.id) - poll.options.findIndex((o) => o.id === b.id));
    let rank = 0, prev = -1;
    sorted.forEach((r, i) => { if (r.votes !== prev) { rank = i + 1; prev = r.votes; } r.rank = rank; });
    const winners = rows.filter((r) => r.winner);
    return { rows: sorted, ballots: poll.ballots, blank: poll.blank, valid, winners, tie: winners.length > 1, blankPct: poll.ballots ? Math.round((poll.blank * 1000) / poll.ballots) : 0 };
  }

  // --- Export CSV (en-têtes et formats fournis par l'interface)
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function resultsCSV(poll, texts) {
    const r = results(poll);
    const rows = [[texts.question, poll.question], texts.headers];
    for (const row of r.rows) rows.push([row.label, row.votes, texts.pct(row.pct), row.rank]);
    rows.push([texts.blank, r.blank, '', ''], [texts.total, r.ballots, '', '']);
    return '﻿' + rows.map((row) => row.map(csvCell).join(texts.delimiter || ',')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : validée champ par champ, totaux cohérents
  function validatePoll(p) {
    const KEYS = 'allowBlank,ballots,blank,counts,id,lock,maxBallots,maxChoices,mode,options,question,status';
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).sort().join(',') !== KEYS) fail('err.backup');
    if (!Array.isArray(p.options) || !Array.isArray(p.counts) || typeof p.allowBlank !== 'boolean' || !STATUSES.includes(p.status)) fail('err.backup');
    if (typeof p.lock !== 'string' || !/^([0-9a-f]{8})?$/.test(p.lock)) fail('err.backup');
    if (p.options.some((o) => !o || typeof o !== 'object' || Object.keys(o).sort().join(',') !== 'id,label')) fail('err.backup');
    const base = makePoll({ question: p.question, options: p.options.map((o) => o.label), mode: p.mode, maxChoices: String(p.maxChoices), allowBlank: p.allowBlank, maxBallots: String(p.maxBallots), lock: p.lock }, p.id);
    if (p.options.some((o, i) => o.id !== base.options[i].id || o.label !== base.options[i].label)) fail('err.backup');
    if (p.counts.length !== base.options.length || !p.counts.every((c) => isInt(c, 0, LIMITS.ballots))) fail('err.backup');
    if (!isInt(p.ballots, 0, LIMITS.ballots) || !isInt(p.blank, 0, p.ballots)) fail('err.backup');
    if (p.blank && !p.allowBlank) fail('err.backup');
    if (p.maxBallots && p.ballots > p.maxBallots) fail('err.backup');
    if (p.status === 'draft' && p.ballots) fail('err.backup');
    const valid = p.ballots - p.blank, sum = p.counts.reduce((a, b) => a + b, 0);
    if (p.counts.some((c) => c > valid)) fail('err.backup');
    if (p.mode === 'single' ? sum !== valid : (sum < valid || sum > valid * p.maxChoices)) fail('err.backup');
    return { ...base, status: p.status, counts: p.counts.slice(), blank: p.blank, ballots: p.ballots };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'pollbox' || data.version !== VERSION) fail('err.notBackup');
    if (Object.keys(data).sort().join(',') !== 'app,polls,version' || !Array.isArray(data.polls)) fail('err.backup');
    if (data.polls.length > LIMITS.polls) fail('err.tooManyPolls', { max: LIMITS.polls });
    const polls = data.polls.map(validatePoll);
    if (new Set(polls.map((p) => p.id)).size !== polls.length) fail('err.backup');
    return polls;
  }
  function backup(polls) { return JSON.stringify({ app: 'pollbox', version: VERSION, polls: validateBackup({ app: 'pollbox', version: VERSION, polls }) }, null, 2); }

  root.PollCore = Object.freeze({ VERSION, LIMITS, MODES, STATUSES, cleanOptions, lockHash, makePoll, editPoll, openPoll, castBallot, closePoll, duplicatePoll, percentages, results, csvCell, resultsCSV, validatePoll, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PollCore;
})(typeof window === 'undefined' ? globalThis : window);
