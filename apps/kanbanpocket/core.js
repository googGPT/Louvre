/* KanbanPocket — logique pure : tableaux, colonnes (renommables, limite WIP), cartes (étiquettes, échéances),
   déplacements (souris, tactile, clavier), filtres, export CSV. Dates en jours civils « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ boards: 50, columns: 8, cards: 300, title: 120, notes: 1000, name: 40, labels: 5, label: 24, wip: 99 });

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('err.id'); return id; }

  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (y < 1900 || y > 2200 || m < 1 || m > 12) return false;
    return d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function addDays(day, n) { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
  function text(v, max, key, required = true) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(key);
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(key);
    if (s.length > max) fail('err.tooLong', { max });
    return s;
  }

  // « urgent, Client A ,urgent » -> ['urgent', 'Client A'] (doublons ignorés sans tenir compte de la casse).
  function parseLabels(v) {
    const list = Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(',');
    const out = [], seen = new Set();
    for (const raw of list) {
      if (typeof raw !== 'string') fail('err.label');
      const s = raw.replace(/\s+/g, ' ').trim();
      if (!s) continue;
      if (s.length > MAX.label) fail('err.labelLong', { max: MAX.label });
      const k = s.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(s); }
    }
    if (out.length > MAX.labels) fail('err.tooManyLabels', { max: MAX.labels });
    return out;
  }
  // Limite WIP : 0 = pas de limite, sinon entier 1..99.
  function parseWip(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (s === '') return 0;
    if (!/^\d{1,2}$/.test(s)) fail('err.wip', { max: MAX.wip });
    return Number(s);
  }

  // Colonne : name '' = nom par défaut (traduit à l'affichage selon sa position).
  function makeColumn(input, id) { return { id: checkId(id), name: text(input.name, MAX.name, 'err.columnName', false), wip: parseWip(input.wip) }; }
  function makeCard(input, id) {
    const due = input.due === undefined || input.due === null ? '' : input.due;
    if (due !== '' && !isDay(due)) fail('err.due');
    const notes = input.notes === undefined ? '' : input.notes;
    if (typeof notes !== 'string') fail('err.notes');
    if (notes.length > MAX.notes) fail('err.tooLong', { max: MAX.notes });
    return { id: checkId(id), title: text(input.title, MAX.title, 'err.titleRequired'), labels: parseLabels(input.labels), due, notes: notes.trim(), col: checkId(input.col) };
  }
  // Nouveau tableau : trois colonnes par défaut (À faire, En cours, Fait).
  function makeBoard(input, id, makeId) {
    const columns = input.columns || [0, 1, 2].map(() => makeColumn({ name: '', wip: '' }, makeId()));
    if (!columns.length || columns.length > MAX.columns) fail('err.columns', { max: MAX.columns });
    return { id: checkId(id), name: text(input.name, MAX.name, 'err.boardName'), columns, cards: input.cards || [] };
  }

  // --- Limites WIP
  const inCol = (board, colId) => board.cards.filter((c) => c.col === colId);
  function wip(board) {
    return board.columns.map((col) => {
      const count = inCol(board, col.id).length;
      return { id: col.id, count, wip: col.wip, full: col.wip > 0 && count >= col.wip, over: col.wip > 0 && count > col.wip };
    });
  }
  function assertRoom(board, colId, cardId) {
    const col = board.columns.find((c) => c.id === colId);
    if (!col) fail('err.column');
    const others = inCol(board, colId).filter((c) => c.id !== cardId).length;
    if (col.wip > 0 && others >= col.wip) fail('err.wipFull', { max: col.wip });
  }
  function addCard(board, card) {
    if (board.cards.length >= MAX.cards) fail('err.tooManyCards', { max: MAX.cards });
    assertRoom(board, card.col, null);
    return { ...board, cards: [...board.cards, card] };
  }
  function updateCard(board, card) {
    const old = board.cards.find((c) => c.id === card.id);
    if (!old) fail('err.card');
    if (old.col !== card.col) return moveCard({ ...board, cards: board.cards.map((c) => (c.id === card.id ? { ...card, col: old.col } : c)) }, card.id, card.col, Infinity);
    return { ...board, cards: board.cards.map((c) => (c.id === card.id ? card : c)) };
  }

  // Déplace une carte vers une colonne, à la position `index` parmi les cartes de cette colonne (Infinity = en bas).
  // L'ordre global du tableau `cards` sert d'ordre dans chaque colonne. La limite WIP de la colonne d'arrivée est respectée.
  function moveCard(board, cardId, toCol, index) {
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) fail('err.card');
    if (card.col !== toCol) assertRoom(board, toCol, cardId);
    const rest = board.cards.filter((c) => c.id !== cardId);
    const target = rest.filter((c) => c.col === toCol);
    const i = Math.max(0, Math.min(Number.isFinite(index) ? index : target.length, target.length));
    const moved = { ...card, col: toCol };
    let pos;
    if (i < target.length) pos = rest.indexOf(target[i]);
    else if (target.length) pos = rest.indexOf(target[target.length - 1]) + 1;
    else pos = rest.length;
    rest.splice(pos, 0, moved);
    return { ...board, cards: rest };
  }
  // Déplacement au clavier : 'prev' / 'next' (colonne voisine, en bas), 'up' / 'down' (dans la colonne).
  function moveBy(board, cardId, dir) {
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) fail('err.card');
    const ci = board.columns.findIndex((c) => c.id === card.col);
    const list = inCol(board, card.col), at = list.findIndex((c) => c.id === cardId);
    if (dir === 'prev' || dir === 'next') {
      const to = board.columns[ci + (dir === 'next' ? 1 : -1)];
      return to ? moveCard(board, cardId, to.id, Infinity) : board;
    }
    if (dir === 'up') return at > 0 ? moveCard(board, cardId, card.col, at - 1) : board;
    if (dir === 'down') return at < list.length - 1 ? moveCard(board, cardId, card.col, at + 1) : board;
    return fail('err.direction');
  }
  // Supprime une colonne vide (au moins une colonne reste).
  function removeColumn(board, colId) {
    if (board.columns.length <= 1) fail('err.lastColumn');
    if (inCol(board, colId).length) fail('err.columnNotEmpty');
    return { ...board, columns: board.columns.filter((c) => c.id !== colId) };
  }

  // --- Filtres et indicateurs. La dernière colonne est la colonne « terminée » : ses cartes ne sont jamais en retard.
  const doneCol = (board) => board.columns[board.columns.length - 1].id;
  function isOverdue(board, card, today) { return !!card.due && card.due < today && card.col !== doneCol(board); }
  function filterCards(board, f, today) {
    const q = (f.text || '').trim().toLowerCase();
    const label = (f.label || '').toLowerCase();
    const soon = addDays(today, 7);
    return board.cards.filter((c) => {
      if (q && !(`${c.title} ${c.notes} ${c.labels.join(' ')}`.toLowerCase().includes(q))) return false;
      if (label && !c.labels.some((l) => l.toLowerCase() === label)) return false;
      switch (f.due || 'all') {
        case 'overdue': return isOverdue(board, c, today);
        case 'week': return !!c.due && c.due >= today && c.due <= soon && c.col !== doneCol(board);
        case 'none': return !c.due;
        case 'all': return true;
        default: return fail('err.filter');
      }
    }).map((c) => c.id);
  }
  function allLabels(board) {
    const seen = new Map();
    for (const c of board.cards) for (const l of c.labels) if (!seen.has(l.toLowerCase())) seen.set(l.toLowerCase(), l);
    return [...seen.values()];
  }
  function stats(board, today) {
    return { total: board.cards.length, done: inCol(board, doneCol(board)).length, overdue: board.cards.filter((c) => isOverdue(board, c, today)).length, overWip: wip(board).filter((w) => w.over).length };
  }

  // --- Export CSV (séparateur virgule, guillemets, protection contre les formules des tableurs).
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  }
  // `head` : en-têtes traduits ; `colName(col, index)` : nom affiché de la colonne.
  function toCSV(board, head, colName) {
    const rows = [head];
    board.columns.forEach((col, i) => {
      for (const c of inCol(board, col.id)) rows.push([colName(col, i), c.title, c.labels.join(', '), c.due, c.notes]);
    });
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function uniq(list) { if (new Set(list.map((x) => x.id)).size !== list.length) fail('err.backup'); return list; }
  function validateBoard(b) {
    if (!isObj(b) || !keysAre(b, ['id', 'name', 'columns', 'cards']) || !Array.isArray(b.columns) || !Array.isArray(b.cards)) fail('err.backup');
    if (b.cards.length > MAX.cards) fail('err.tooManyCards', { max: MAX.cards });
    const columns = uniq(b.columns.map((c) => {
      if (!isObj(c) || !keysAre(c, ['id', 'name', 'wip']) || !Number.isSafeInteger(c.wip) || c.wip < 0 || c.wip > MAX.wip) fail('err.backup');
      return makeColumn({ name: c.name, wip: String(c.wip) }, c.id);
    }));
    const ids = new Set(columns.map((c) => c.id));
    const cards = uniq(b.cards.map((c) => {
      if (!isObj(c) || !keysAre(c, ['id', 'title', 'labels', 'due', 'notes', 'col']) || !Array.isArray(c.labels) || !ids.has(c.col)) fail('err.backup');
      return makeCard(c, c.id);
    }));
    return makeBoard({ name: b.name, columns, cards }, b.id);
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'kanbanpocket' || data.version !== VERSION || !Array.isArray(data.boards)) fail('err.notBackup');
    if (data.boards.length > MAX.boards) fail('err.tooManyBoards', { max: MAX.boards });
    return uniq(data.boards.map(validateBoard));
  }
  function backup(boards) { return JSON.stringify({ app: 'kanbanpocket', version: VERSION, boards: validateBackup({ app: 'kanbanpocket', version: VERSION, boards }) }, null, 2); }

  root.KanbanCore = Object.freeze({
    VERSION, MAX, isDay, addDays, parseLabels, parseWip, makeColumn, makeCard, makeBoard, wip, addCard, updateCard, moveCard, moveBy,
    removeColumn, isOverdue, filterCards, allLabels, stats, toCSV, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KanbanCore;
})(typeof window === 'undefined' ? globalThis : window);
