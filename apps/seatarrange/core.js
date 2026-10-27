/* SeatArrange — logique pure : invités, tables ou rangées (capacité), contraintes « ensemble », « séparés »
   et « place fixe », placement automatique déterministe, ajustement manuel, rapport des contraintes non satisfaites.
   Un même événement et les mêmes contraintes donnent toujours le même plan. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ events: 20, guests: 300, zones: 60, capacity: 40, constraints: 500, name: 60, group: 40 });
  const KINDS = Object.freeze(['table', 'row']);
  const TYPES = Object.freeze(['together', 'apart', 'fixed']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const ID = /^[a-z0-9-]{6,64}$/i;
  const checkId = (id) => { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; };
  const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

  // --- Éléments
  function makeGuest(input, id) {
    checkId(id);
    const name = clean(input.name), group = clean(input.group);
    if (!name) fail('err.guestName');
    if (name.length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    if (group.length > LIMITS.group) fail('err.groupLong', { max: LIMITS.group });
    return { id, name, group };
  }
  // Liste collée : un invité par ligne, « Nom » ou « Nom ; groupe » (ou tabulation).
  function parseGuestList(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, ...rest] = l.split(/[;\t]/);
      return { name: clean(name), group: clean(rest.join(' ')) };
    });
  }
  function makeZone(input, id) {
    checkId(id);
    const name = clean(input.name);
    if (!name) fail('err.zoneName');
    if (name.length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    if (!KINDS.includes(input.kind)) fail('err.kind');
    const s = String(input.capacity === undefined ? '' : input.capacity).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > LIMITS.capacity) fail('err.capacity', { max: LIMITS.capacity });
    return { id, name, kind: input.kind, capacity: Number(s) };
  }
  const key = (c) => (c.type === 'fixed' ? `fixed:${c.a}` : `pair:${[c.a, c.b].sort().join('|')}`);
  function makeConstraint(input, id, ev) {
    checkId(id);
    const type = input.type;
    if (!TYPES.includes(type)) fail('err.ctype');
    const guest = (g) => { if (!ev.guests.some((x) => x.id === g)) fail('err.unknownGuest'); return g; };
    const a = guest(input.a);
    if (type === 'fixed') {
      const zone = ev.zones.find((z) => z.id === input.zone);
      if (!zone) fail('err.unknownZone');
      const s = String(input.seat === undefined || input.seat === null ? '' : input.seat).trim();
      let seat = 0; // 0 : n'importe quelle place de cette table ou rangée
      if (s) { if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > zone.capacity) fail('err.seat', { max: zone.capacity }); seat = Number(s); }
      const c = { id, type, a, zone: zone.id, seat };
      for (const o of ev.constraints) {
        if (o.type === 'fixed' && o.a === a) fail('err.alreadyFixed');
        if (seat && o.type === 'fixed' && o.zone === zone.id && o.seat === seat) fail('err.seatTaken');
      }
      return c;
    }
    const b = guest(input.b);
    if (a === b) fail('err.sameGuest');
    const c = { id, type, a, b };
    for (const o of ev.constraints) {
      if (o.type === 'fixed') continue;
      if (key(o) === key(c)) fail(o.type === type ? 'err.dupConstraint' : 'err.contradiction');
    }
    return c;
  }
  function makeEvent(name, id) {
    checkId(id);
    const n = clean(name);
    if (!n) fail('err.eventName');
    if (n.length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    return { id, name: n, guests: [], zones: [], constraints: [], seating: {} };
  }

  // --- Modifications de l'événement (toujours une copie)
  function addGuests(ev, list, newId) {
    if (ev.guests.length + list.length > LIMITS.guests) fail('err.tooManyGuests', { max: LIMITS.guests });
    const names = new Set(ev.guests.map((g) => g.name.toLocaleLowerCase()));
    const added = list.map((g) => {
      const guest = makeGuest(g, newId());
      const k = guest.name.toLocaleLowerCase();
      if (names.has(k)) fail('err.dupGuest', { name: guest.name });
      names.add(k); return guest;
    });
    return { ...ev, guests: [...ev.guests, ...added] };
  }
  function removeGuest(ev, gid) {
    const seating = { ...ev.seating }; delete seating[gid];
    return { ...ev, guests: ev.guests.filter((g) => g.id !== gid), constraints: ev.constraints.filter((c) => c.a !== gid && c.b !== gid), seating };
  }
  function addZone(ev, zone) {
    if (ev.zones.length >= LIMITS.zones) fail('err.tooManyZones', { max: LIMITS.zones });
    if (ev.zones.some((z) => z.name.toLocaleLowerCase() === zone.name.toLocaleLowerCase())) fail('err.dupZone', { name: zone.name });
    return { ...ev, zones: [...ev.zones, zone] };
  }
  function removeZone(ev, zid) {
    const seating = {};
    for (const [g, [z, s]] of Object.entries(ev.seating)) if (z !== zid) seating[g] = [z, s];
    return { ...ev, zones: ev.zones.filter((z) => z.id !== zid), constraints: ev.constraints.filter((c) => c.zone !== zid), seating };
  }
  function addConstraint(ev, c) {
    if (ev.constraints.length >= LIMITS.constraints) fail('err.tooManyConstraints', { max: LIMITS.constraints });
    return { ...ev, constraints: [...ev.constraints, c] };
  }
  function removeConstraint(ev, cid) { return { ...ev, constraints: ev.constraints.filter((c) => c.id !== cid) }; }

  // --- Placement automatique
  const capacityOf = (ev) => ev.zones.reduce((s, z) => s + z.capacity, 0);
  function autoPlace(ev) {
    const order = new Map(ev.guests.map((g, i) => [g.id, i]));
    const zoneIdx = new Map(ev.zones.map((z, i) => [z.id, i]));
    const fixed = new Map(ev.constraints.filter((c) => c.type === 'fixed').map((c) => [c.a, c]));
    const apart = new Map(ev.guests.map((g) => [g.id, new Set()]));
    for (const c of ev.constraints) if (c.type === 'apart') { apart.get(c.a).add(c.b); apart.get(c.b).add(c.a); }
    // Groupes « ensemble » (union-find), dans l'ordre de la liste des invités.
    const parent = new Map(ev.guests.map((g) => [g.id, g.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const c of ev.constraints) if (c.type === 'together') {
      const ra = find(c.a), rb = find(c.b);
      if (ra !== rb) { if (order.get(ra) < order.get(rb)) parent.set(rb, ra); else parent.set(ra, rb); }
    }
    const clusters = new Map();
    for (const g of ev.guests) { const r = find(g.id); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(g.id); }

    const free = ev.zones.map((z) => z.capacity);
    const members = ev.zones.map(() => []); // invités par table, dans l'ordre de placement
    const zoneOf = new Map();
    const put = (gid, zi) => { members[zi].push(gid); free[zi]--; zoneOf.set(gid, zi); };
    // 1. Places fixes d'abord.
    for (const g of ev.guests) { const f = fixed.get(g.id); if (f && free[zoneIdx.get(f.zone)] > 0) put(g.id, zoneIdx.get(f.zone)); }
    // 2. Unités à placer : le reste de chaque groupe, rattaché à la table d'un membre fixé s'il y en a une.
    const maxCap = Math.max(0, ...free);
    const units = [];
    for (const list of clusters.values()) {
      const rest = list.filter((g) => !zoneOf.has(g));
      if (!rest.length) continue;
      const anchor = list.find((g) => zoneOf.has(g));
      const target = anchor === undefined ? -1 : zoneOf.get(anchor);
      if (target >= 0) {
        const fit = rest.slice(0, Math.max(0, free[target]));
        for (const g of fit) put(g, target);
        const left = rest.slice(fit.length);
        for (let k = 0; k < left.length; k += Math.max(1, maxCap)) units.push(left.slice(k, k + Math.max(1, maxCap)));
      } else for (let k = 0; k < rest.length; k += Math.max(1, maxCap)) units.push(rest.slice(k, k + Math.max(1, maxCap))); // groupe trop grand : découpé
    }
    units.sort((x, y) => y.length - x.length || order.get(x[0]) - order.get(y[0]));
    const conflicts = (unit, zi) => { let n = 0; for (const g of unit) for (const o of members[zi]) if (apart.get(g).has(o)) n++; for (let i = 0; i < unit.length; i++) for (let j = i + 1; j < unit.length; j++) if (apart.get(unit[i]).has(unit[j])) n++; return n; };
    // 3. Recherche exacte (budget limité) d'une affectation sans conflit, à défaut glouton.
    const choice = new Array(units.length).fill(-1);
    let budget = 60000, solved = false;
    (function dfs(k) {
      if (solved || --budget < 0) return;
      if (k === units.length) { solved = true; return; }
      const u = units[k];
      const cands = ev.zones.map((_, zi) => zi).filter((zi) => free[zi] >= u.length && conflicts(u, zi) === 0)
        .sort((a, b) => (free[a] - u.length) - (free[b] - u.length) || a - b); // meilleur ajustement, puis ordre des tables
      for (const zi of cands) {
        for (const g of u) members[zi].push(g); free[zi] -= u.length; choice[k] = zi;
        dfs(k + 1);
        if (solved) return;
        members[zi].length -= u.length; free[zi] += u.length; choice[k] = -1;
      }
    })(0);
    const unplaced = [];
    if (solved) units.forEach((u, k) => { for (const g of u) zoneOf.set(g, choice[k]); });
    else {
      for (const u of units) {
        const fits = ev.zones.map((_, zi) => zi).filter((zi) => free[zi] >= u.length)
          .sort((a, b) => conflicts(u, a) - conflicts(u, b) || (free[a] - u.length) - (free[b] - u.length) || a - b);
        if (fits.length) { for (const g of u) put(g, fits[0]); continue; }
        for (const g of u) { // pas de table assez grande : on répartit, puis on garde le reste hors plan
          const zs = ev.zones.map((_, zi) => zi).filter((zi) => free[zi] > 0).sort((a, b) => conflicts([g], a) - conflicts([g], b) || free[b] - free[a] || a - b);
          if (zs.length) put(g, zs[0]); else unplaced.push(g);
        }
      }
    }
    // 4. Numéros de place : places fixes, puis les autres dans l'ordre (les groupes restent côte à côte).
    const seating = {};
    ev.zones.forEach((z, zi) => {
      const taken = new Set();
      const list = members[zi];
      for (const g of list) { const f = fixed.get(g); if (f && f.zone === z.id && f.seat && !taken.has(f.seat - 1)) { seating[g] = [z.id, f.seat - 1]; taken.add(f.seat - 1); } }
      let s = 0;
      for (const g of list) {
        if (seating[g]) continue;
        while (taken.has(s)) s++;
        seating[g] = [z.id, s]; taken.add(s);
      }
    });
    return { ...ev, seating, exact: solved };
  }

  // --- Ajustement manuel : déplacer un invité vers une place ; s'il y a quelqu'un, on échange.
  function occupant(ev, zid, seat) { for (const [g, [z, s]] of Object.entries(ev.seating)) if (z === zid && s === seat) return g; return null; }
  function moveGuest(ev, gid, zid, seat) {
    if (!ev.guests.some((g) => g.id === gid)) fail('err.unknownGuest');
    const zone = ev.zones.find((z) => z.id === zid);
    if (!zone) fail('err.unknownZone');
    if (!Number.isInteger(seat) || seat < 0 || seat >= zone.capacity) fail('err.seat', { max: zone.capacity });
    const seating = { ...ev.seating };
    const other = occupant(ev, zid, seat), from = seating[gid];
    if (other === gid) return ev;
    if (other) { if (from) seating[other] = from.slice(); else delete seating[other]; }
    seating[gid] = [zid, seat];
    return { ...ev, seating };
  }
  function unseat(ev, gid) { const seating = { ...ev.seating }; delete seating[gid]; return { ...ev, seating }; }
  function clearSeating(ev) { return { ...ev, seating: {} }; }

  // --- Rapport : contraintes non satisfaites et invités sans place
  function check(ev) {
    const at = (g) => ev.seating[g] || null;
    const issues = [];
    for (const c of ev.constraints) {
      const pa = at(c.a);
      if (c.type === 'fixed') {
        if (!pa) issues.push({ id: c.id, type: 'fixed', reason: 'unplaced', a: c.a });
        else if (pa[0] !== c.zone) issues.push({ id: c.id, type: 'fixed', reason: 'zone', a: c.a });
        else if (c.seat && pa[1] !== c.seat - 1) issues.push({ id: c.id, type: 'fixed', reason: 'seat', a: c.a });
        continue;
      }
      const pb = at(c.b);
      if (!pa || !pb) { issues.push({ id: c.id, type: c.type, reason: 'unplaced', a: c.a, b: c.b }); continue; }
      if (c.type === 'together' && pa[0] !== pb[0]) issues.push({ id: c.id, type: 'together', reason: 'zone', a: c.a, b: c.b });
      if (c.type === 'apart' && pa[0] === pb[0]) issues.push({ id: c.id, type: 'apart', reason: 'zone', a: c.a, b: c.b });
    }
    const unplaced = ev.guests.filter((g) => !ev.seating[g.id]).map((g) => g.id);
    const seats = capacityOf(ev);
    return { issues, unplaced, seats, placed: ev.guests.length - unplaced.length, guests: ev.guests.length, shortage: Math.max(0, ev.guests.length - seats), ok: !issues.length && !unplaced.length };
  }
  // Voisins à une table ronde (places 1 et dernière voisines) ou dans une rangée (pas de bouclage).
  function neighbours(zone, seat) {
    const out = [];
    if (seat > 0) out.push(seat - 1); else if (zone.kind === 'table' && zone.capacity > 2) out.push(zone.capacity - 1);
    if (seat < zone.capacity - 1) out.push(seat + 1); else if (zone.kind === 'table' && zone.capacity > 2) out.push(0);
    return [...new Set(out)].filter((s) => s !== seat);
  }

  // --- Export CSV (en-têtes et libellés fournis par l'interface)
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function planCSV(ev, texts) {
    const rows = [texts.headers];
    const byId = new Map(ev.guests.map((g) => [g.id, g]));
    for (const z of ev.zones) {
      const seats = Object.entries(ev.seating).filter(([, [zid]]) => zid === z.id).sort((a, b) => a[1][1] - b[1][1]);
      for (const [gid, [, s]] of seats) rows.push([z.name, texts.kind[z.kind], s + 1, byId.get(gid).name, byId.get(gid).group]);
    }
    for (const g of ev.guests) if (!ev.seating[g.id]) rows.push([texts.unplaced, '', '', g.name, g.group]);
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : tout est revalidé, références et places comprises
  function validateEvent(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).sort().join(',') !== 'constraints,guests,id,name,seating,zones') fail('err.backup');
    if (!Array.isArray(e.guests) || !Array.isArray(e.zones) || !Array.isArray(e.constraints) || !e.seating || typeof e.seating !== 'object' || Array.isArray(e.seating)) fail('err.backup');
    let ev = makeEvent(e.name, e.id);
    if (e.guests.length > LIMITS.guests || e.zones.length > LIMITS.zones || e.constraints.length > LIMITS.constraints) fail('err.backup');
    for (const g of e.guests) {
      if (!g || typeof g !== 'object' || Object.keys(g).sort().join(',') !== 'group,id,name') fail('err.backup');
      const guest = makeGuest(g, g.id);
      if (guest.name !== g.name || guest.group !== g.group) fail('err.backup');
      if (ev.guests.some((x) => x.id === g.id || x.name.toLocaleLowerCase() === guest.name.toLocaleLowerCase())) fail('err.backup');
      ev = { ...ev, guests: [...ev.guests, guest] };
    }
    for (const z of e.zones) {
      if (!z || typeof z !== 'object' || Object.keys(z).sort().join(',') !== 'capacity,id,kind,name' || !Number.isInteger(z.capacity)) fail('err.backup');
      if (ev.zones.some((x) => x.id === z.id) || ev.guests.some((x) => x.id === z.id)) fail('err.backup');
      ev = addZone(ev, makeZone(z, z.id));
    }
    for (const c of e.constraints) {
      const k = c && c.type === 'fixed' ? 'a,id,seat,type,zone' : 'a,b,id,type';
      if (!c || typeof c !== 'object' || Object.keys(c).sort().join(',') !== k) fail('err.backup');
      if (c.type === 'fixed' && !Number.isInteger(c.seat)) fail('err.backup');
      if (ev.constraints.some((x) => x.id === c.id)) fail('err.backup');
      ev = addConstraint(ev, makeConstraint({ ...c, seat: c.type === 'fixed' && c.seat ? String(c.seat) : '' }, c.id, ev));
    }
    const used = new Set();
    for (const [gid, place] of Object.entries(e.seating)) {
      if (!ev.guests.some((g) => g.id === gid) || !Array.isArray(place) || place.length !== 2) fail('err.backup');
      const zone = ev.zones.find((z) => z.id === place[0]);
      if (!zone || !Number.isInteger(place[1]) || place[1] < 0 || place[1] >= zone.capacity) fail('err.backup');
      const k = `${place[0]}#${place[1]}`;
      if (used.has(k)) fail('err.backup'); // deux invités sur la même chaise
      used.add(k);
    }
    const seating = {}; for (const g of ev.guests) if (e.seating[g.id]) seating[g.id] = [e.seating[g.id][0], e.seating[g.id][1]];
    return { ...ev, seating };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'seatarrange' || data.version !== VERSION) fail('err.notBackup');
    if (Object.keys(data).sort().join(',') !== 'app,events,version' || !Array.isArray(data.events)) fail('err.backup');
    if (data.events.length > LIMITS.events) fail('err.tooManyEvents', { max: LIMITS.events });
    const events = data.events.map(validateEvent);
    if (new Set(events.map((e) => e.id)).size !== events.length) fail('err.backup');
    return events;
  }
  const strip = (e) => ({ id: e.id, name: e.name, guests: e.guests, zones: e.zones, constraints: e.constraints, seating: e.seating });
  function backup(events) { return JSON.stringify({ app: 'seatarrange', version: VERSION, events: validateBackup({ app: 'seatarrange', version: VERSION, events: events.map(strip) }) }, null, 2); }

  root.SeatCore = Object.freeze({ VERSION, LIMITS, KINDS, TYPES, makeGuest, parseGuestList, makeZone, makeConstraint, makeEvent, addGuests, removeGuest, addZone, removeZone, addConstraint, removeConstraint, capacityOf, autoPlace, occupant, moveGuest, unseat, clearSeating, check, neighbours, csvCell, planCSV, validateEvent, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SeatCore;
})(typeof window === 'undefined' ? globalThis : window);
