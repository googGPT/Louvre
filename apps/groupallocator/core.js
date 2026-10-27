/* GroupAllocator — logique pure : constitution de groupes d'étudiants avec contraintes (séparer, réunir,
   équilibre d'un attribut). Algorithme déterministe : même liste, mêmes contraintes, même graine => mêmes groupes.
   Étapes : blocs « à réunir » (union-find), ordre mélangé par la graine, placement glouton, puis échanges locaux
   qui ne font jamais augmenter le coût (violations d'abord, déséquilibre ensuite). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ classes: 30, students: 500, constraints: 500, name: 80, attr: 40, seed: 40, groupValue: 500, passes: 40 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanText(v, max, requiredKey) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.trim().replace(/\s+/g, ' ');
    if (requiredKey && !s) fail(requiredKey);
    if (s.length > max) fail('err.textLong', { max });
    return s;
  }
  const norm = (s) => s.normalize('NFC').toLowerCase();

  // --- Graine et hasard reproductible
  function hashSeed(seed) { // FNV-1a 32 bits
    let h = 0x811c9dc5;
    for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) { // mulberry32
    let a = hashSeed(seed);
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Comparaison lexicographique de deux clés numériques de même longueur.
  function lexLess(a, b) { for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i]; return false; }
  function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // --- Modèle
  function makeStudent(input) {
    if (!isObj(input)) fail('err.backup');
    return { id: checkId(input.id), name: cleanText(input.name, LIMITS.name, 'err.studentName'), attr: cleanText(input.attr, LIMITS.attr) };
  }
  function makeSettings(input) {
    if (!isObj(input)) fail('err.backup');
    if (!['size', 'count'].includes(input.mode)) fail('err.mode');
    const s = typeof input.value === 'number' ? String(input.value) : String(input.value === undefined ? '' : input.value).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > LIMITS.groupValue) fail(input.mode === 'size' ? 'err.groupSize' : 'err.groupCount', { max: LIMITS.groupValue });
    if (typeof input.balance !== 'boolean') fail('err.backup');
    const seed = cleanText(String(input.seed === undefined ? '' : input.seed), LIMITS.seed, 'err.seed');
    return { mode: input.mode, value: Number(s), balance: input.balance, seed, attrName: cleanText(input.attrName, LIMITS.attr) };
  }
  function makeConstraint(input, students) {
    if (!isObj(input)) fail('err.backup');
    if (!['apart', 'together'].includes(input.type)) fail('err.constraintType');
    if (!students.some((s) => s.id === input.a) || !students.some((s) => s.id === input.b)) fail('err.constraintStudent');
    if (input.a === input.b) fail('err.constraintSame');
    return { id: checkId(input.id), type: input.type, a: input.a, b: input.b };
  }
  const pairKey = (c) => `${c.type}:${[c.a, c.b].sort().join('|')}`;
  function makeClass(input) {
    if (!isObj(input)) fail('err.backup');
    const st = input.students === undefined ? [] : input.students, cs = input.constraints === undefined ? [] : input.constraints;
    if (!Array.isArray(st) || !Array.isArray(cs)) fail('err.backup');
    if (st.length > LIMITS.students) fail('err.tooManyStudents', { max: LIMITS.students });
    if (cs.length > LIMITS.constraints) fail('err.tooManyConstraints', { max: LIMITS.constraints });
    const students = st.map(makeStudent);
    if (new Set(students.map((s) => s.id)).size !== students.length) fail('err.id');
    const seen = new Set();
    for (const s of students) { if (seen.has(norm(s.name))) fail('err.duplicateName', { name: s.name }); seen.add(norm(s.name)); }
    const constraints = cs.map((c) => makeConstraint(c, students));
    if (new Set(constraints.map((c) => c.id)).size !== constraints.length) fail('err.id');
    if (new Set(constraints.map(pairKey)).size !== constraints.length) fail('err.constraintDuplicate');
    return { id: checkId(input.id), name: cleanText(input.name, LIMITS.name, 'err.className'), students, constraints, settings: makeSettings(input.settings) };
  }

  // --- Lecture d'une liste collée ou d'un CSV : « Nom » ou « Nom;Attribut » (séparateur ; , ou tabulation, guillemets acceptés).
  function parseCSV(text) {
    const src = String(text).replace(/^﻿/, '');
    const sample = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20); // séparateur deviné sur les premières lignes
    const d = sample.some((l) => l.includes('\t')) ? '\t' : sample.some((l) => l.includes(';')) ? ';' : ',';
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch;
      } else if (ch === '"' && cell === '') quoted = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  function parseRoster(text, hasHeader) {
    if (String(text).length > 200000) fail('err.fileBig');
    const rows = parseCSV(text).slice(hasHeader ? 1 : 0);
    if (rows.length > LIMITS.students) fail('err.tooManyStudents', { max: LIMITS.students });
    return rows.map((r, i) => {
      const name = (r[0] || '').trim().replace(/\s+/g, ' '), attr = (r[1] || '').trim().replace(/\s+/g, ' ');
      if (!name) fail('err.rosterLine', { line: i + 1 + (hasHeader ? 1 : 0) });
      if (name.length > LIMITS.name || attr.length > LIMITS.attr) fail('err.rosterLong', { line: i + 1 + (hasHeader ? 1 : 0) });
      return { name, attr };
    });
  }

  // --- Constitution des groupes
  function capacities(n, settings) {
    if (!n) return [];
    let k = settings.mode === 'size' ? Math.ceil(n / settings.value) : settings.value;
    k = Math.min(k, n);
    const base = Math.floor(n / k), extra = n % k;
    return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
  }

  function allocate(cls) {
    const students = cls.students, n = students.length, settings = cls.settings;
    const caps = capacities(n, settings), k = caps.length;
    const issues = [];
    if (settings.mode === 'count' && settings.value > n && n) issues.push({ type: 'capped', k });
    if (!n) return { groups: [], issues, caps, balance: [] };
    const index = new Map(students.map((s, i) => [s.id, i]));

    // 1. Blocs « à réunir » (union-find).
    const parent = students.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (const c of cls.constraints) if (c.type === 'together') { const a = find(index.get(c.a)), b = find(index.get(c.b)); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    const blocksMap = new Map();
    students.forEach((_, i) => { const r = find(i); if (!blocksMap.has(r)) blocksMap.set(r, []); blocksMap.get(r).push(i); });
    const blocks = [...blocksMap.values()];
    const blockOf = new Array(n);
    blocks.forEach((b, bi) => b.forEach((i) => { blockOf[i] = bi; }));
    const maxCap = Math.max(...caps);
    const apart = cls.constraints.filter((c) => c.type === 'apart').map((c) => ({ c, a: index.get(c.a), b: index.get(c.b) }));
    const impossible = new Set();
    for (const x of apart) if (blockOf[x.a] === blockOf[x.b]) { issues.push({ type: 'conflict', a: x.c.a, b: x.c.b }); impossible.add(x.c.id); }
    for (const b of blocks) if (b.length > maxCap) issues.push({ type: 'blockTooBig', members: b.map((i) => students[i].id), size: b.length, max: maxCap });

    // 2. Équilibre : coût = Σ groupes Σ valeurs (n × effectif - total_valeur × capacité)², en entiers.
    const values = settings.balance ? [...new Set(students.map((s) => s.attr).filter(Boolean))].sort() : [];
    const vIndex = new Map(values.map((v, i) => [v, i]));
    const totals = values.map((v) => students.filter((s) => s.attr === v).length);
    const counts = caps.map(() => values.map(() => 0));
    const blockVals = blocks.map((b) => { const c = values.map(() => 0); for (const i of b) { const v = vIndex.get(students[i].attr); if (v !== undefined) c[v] += 1; } return c; });
    const groupCost = (g, cnt) => cnt.reduce((acc, x, v) => { const d = n * x - totals[v] * caps[g]; return acc + d * d; }, 0);

    // 3. Placement glouton des blocs (mélangés par la graine, les plus gros d'abord).
    const rand = rng(settings.seed);
    const order = shuffle(blocks.map((_, i) => i), rand).map((bi, pos) => ({ bi, pos })).sort((x, y) => blocks[y.bi].length - blocks[x.bi].length || x.pos - y.pos).map((x) => x.bi);
    const groupOf = new Array(n).fill(-1);
    const sizes = caps.map(() => 0);
    const apartOf = students.map(() => []);
    for (const x of apart) { apartOf[x.a].push(x.b); apartOf[x.b].push(x.a); }
    const clashes = (bi, g) => blocks[bi].reduce((acc, i) => acc + apartOf[i].filter((j) => groupOf[j] === g && blockOf[j] !== bi).length, 0);
    for (const bi of order) {
      const size = blocks[bi].length;
      let best = null;
      for (let g = 0; g < k; g += 1) {
        const over = Math.max(0, sizes[g] + size - caps[g]);
        const delta = values.length ? groupCost(g, counts[g].map((x, v) => x + blockVals[bi][v])) - groupCost(g, counts[g]) : 0;
        const key = [over, clashes(bi, g), delta, sizes[g] - caps[g], g];
        if (!best || lexLess(key, best.key)) best = { g, key };
      }
      for (const i of blocks[bi]) groupOf[i] = best.g;
      sizes[best.g] += size;
      blockVals[bi].forEach((x, v) => { counts[best.g][v] += x; });
    }

    // 4. Échanges de blocs de même taille entre groupes : on garde un échange seulement s'il baisse le coût
    //    (violations « séparer » d'abord, déséquilibre ensuite). Coût calculé localement (deux groupes, deux blocs).
    const apartIdx = students.map(() => []);
    apart.forEach((x, ci) => { apartIdx[x.a].push(ci); apartIdx[x.b].push(ci); });
    const touches = blocks.map((b) => [...new Set(b.flatMap((i) => apartIdx[i]))]);
    const local = (gx, gy, x, y) => {
      const cs = new Set([...touches[x], ...touches[y]]);
      let v = 0; for (const ci of cs) if (groupOf[apart[ci].a] === groupOf[apart[ci].b]) v += 1;
      return [v, values.length ? groupCost(gx, counts[gx]) + groupCost(gy, counts[gy]) : 0]; // violations d'abord
    };
    const move = (from, to, bi) => { for (const i of blocks[bi]) groupOf[i] = to; blockVals[bi].forEach((c, v) => { counts[from][v] -= c; counts[to][v] += c; }); };
    for (let pass = 0; pass < LIMITS.passes; pass += 1) {
      let improved = false;
      for (let x = 0; x < blocks.length; x += 1) {
        for (let y = x + 1; y < blocks.length; y += 1) {
          const gx = groupOf[blocks[x][0]], gy = groupOf[blocks[y][0]];
          if (gx === gy || blocks[x].length !== blocks[y].length) continue;
          if (!values.length && !touches[x].length && !touches[y].length) continue; // rien à gagner
          const before = local(gx, gy, x, y);
          move(gx, gy, x); move(gy, gx, y);
          if (lexLess(local(gx, gy, x, y), before)) improved = true; else { move(gy, gx, x); move(gx, gy, y); }
        }
      }
      if (!improved) break;
    }

    // 5. Rapport : contraintes non satisfaites, débordements, équilibre.
    for (const x of apart) if (!impossible.has(x.c.id) && groupOf[x.a] === groupOf[x.b]) issues.push({ type: 'apart', a: x.c.a, b: x.c.b, group: groupOf[x.a] + 1 });
    sizes.forEach((s, g) => { if (s > caps[g]) issues.push({ type: 'overflow', group: g + 1, size: s, cap: caps[g] }); });
    const groups = caps.map((cap, g) => ({ index: g + 1, cap, members: students.filter((_, i) => groupOf[i] === g).map((s) => s.id) }));
    const balance = values.map((v, vi) => { const per = counts.map((c) => c[vi]); return { value: v, total: totals[vi], min: Math.min(...per), max: Math.max(...per), perGroup: per }; });
    return { groups, issues, caps, balance };
  }

  // --- Export CSV : une ligne par étudiant. `texts` fournit les en-têtes et le nom des groupes.
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = { head: ['Groupe', 'Étudiant', 'Attribut'], group: (n) => `Groupe ${n}`, delimiter: ';' };
  function csv(cls, result, texts = DEFAULT_TEXTS) {
    const d = texts.delimiter === ',' ? ',' : ';';
    const byId = new Map(cls.students.map((s) => [s.id, s]));
    const rows = result.groups.flatMap((g) => g.members.map((id) => [texts.group(g.index), byId.get(id).name, byId.get(id).attr]));
    return '﻿' + [texts.head, ...rows].map((r) => r.map(csvCell).join(d)).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'groupallocator' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'classes']) || !Array.isArray(data.classes)) fail('err.backup');
    if (data.classes.length > LIMITS.classes) fail('err.tooManyClasses', { max: LIMITS.classes });
    const classes = data.classes.map((c) => {
      if (!isObj(c) || !keysAre(c, ['id', 'name', 'students', 'constraints', 'settings']) || !Array.isArray(c.students) || !Array.isArray(c.constraints)) fail('err.backup');
      if (!isObj(c.settings) || !keysAre(c.settings, ['mode', 'value', 'balance', 'seed', 'attrName']) || typeof c.settings.value !== 'number' || typeof c.settings.seed !== 'string') fail('err.backup');
      for (const s of c.students) if (!isObj(s) || !keysAre(s, ['id', 'name', 'attr'])) fail('err.backup');
      for (const x of c.constraints) if (!isObj(x) || !keysAre(x, ['id', 'type', 'a', 'b'])) fail('err.backup');
      return makeClass(c);
    });
    if (new Set(classes.map((c) => c.id)).size !== classes.length) fail('err.backup');
    return classes;
  }
  function backup(classes) { return JSON.stringify({ app: 'groupallocator', version: VERSION, classes: validateBackup({ app: 'groupallocator', version: VERSION, classes }) }, null, 2); }

  root.GroupCore = Object.freeze({ VERSION, LIMITS, hashSeed, rng, makeStudent, makeSettings, makeConstraint, makeClass, parseCSV, parseRoster, capacities, allocate, csv, csvCell, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GroupCore;
})(typeof window === 'undefined' ? globalThis : window);
