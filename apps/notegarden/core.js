/* NoteGarden — logique pure : notes, étiquettes, liens [[Titre]], rétroliens, recherche, exports.
   Sécurité : le texte d'une note est découpé en un arbre de nœuds connus (texte, gras, code, lien interne…) ;
   aucun HTML saisi n'est interprété. L'interface construit l'affichage avec createElement/textContent.
   Les liens et le renommage utilisent le même découpage (scanLinks) : ce qui s'affiche comme lien est
   exactement ce qui est compté comme rétrolien et réécrit lors d'un renommage. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ notes: 500, title: 120, body: 50000, tags: 20, tag: 40, query: 200 });
  const ID = /^[a-z0-9-]{6,64}$/i;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }

  // --- Titres : espaces réduits, pas de crochets ni de barre (ils serviraient à fermer un lien).
  function normTitle(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function titleKey(s) { return normTitle(s).normalize('NFC').toLowerCase(); } // « Projet » et « projet » = même note
  function cleanTitle(v) {
    if (typeof v !== 'string') fail('err.titleRequired');
    const s = normTitle(v);
    if (!s) fail('err.titleRequired');
    if ([...s].length > MAX.title) fail('err.titleLong', { max: MAX.title });
    if (/[[\]|\u0000-\u001f\u007f]/.test(s)) fail('err.titleChars');
    return s;
  }

  // --- Étiquettes : « projet, idée #lecture » -> ['projet', 'idée', 'lecture'] (minuscules, sans doublon).
  function parseTags(input) {
    if (Array.isArray(input)) input = input.join(' ');
    if (typeof input !== 'string') fail('err.tag', { tag: '' });
    const out = [];
    for (const raw of input.split(/[\s,;،、]+/)) {
      const tag = raw.replace(/^#+/, '').normalize('NFC').toLowerCase();
      if (!tag) continue;
      if ([...tag].length > MAX.tag || !/^[\p{L}\p{N}_-]+$/u.test(tag)) fail('err.tag', { tag: raw.slice(0, 40) });
      if (!out.includes(tag)) out.push(tag);
    }
    if (out.length > MAX.tags) fail('err.tooManyTags', { max: MAX.tags });
    return out;
  }

  function checkDay(s) {
    if (typeof s !== 'string' || !DAY.test(s)) fail('err.date');
    const [y, m, d] = s.split('-').map(Number), dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) fail('err.date');
    return s;
  }

  function makeNote(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (typeof input.body !== 'string') fail('err.body');
    if (input.body.length > MAX.body) fail('err.bodyLong', { max: MAX.body });
    const created = checkDay(input.created), updated = checkDay(input.updated);
    if (updated < created) fail('err.date');
    return { id, title: cleanTitle(input.title), body: input.body.replace(/\r\n?/g, '\n'), tags: parseTags(input.tags || ''), created, updated };
  }

  // --- Découpage d'une ligne : code en ligne, liens internes, puis texte (l'emphase est traitée ensuite).
  const LINK = /\[\[([^[\]\n]{1,300})\]\]/y;
  function tokenizeLine(line) {
    const out = [];
    let buf = '', bufStart = 0, i = 0;
    const flush = () => { if (buf) out.push({ t: 'text', v: buf, start: bufStart }); buf = ''; };
    while (i < line.length) {
      const c = line[i];
      if (c === '`') { // code en ligne sur la même ligne : son contenu n'est jamais un lien
        const end = line.indexOf('`', i + 1);
        if (end > i + 1) { flush(); out.push({ t: 'code', v: line.slice(i + 1, end), start: i }); i = end + 1; bufStart = i; continue; }
      }
      if (c === '[' && line[i + 1] === '[') {
        LINK.lastIndex = i;
        const m = LINK.exec(line);
        if (m) {
          const bar = m[1].indexOf('|');
          const target = normTitle(bar > -1 ? m[1].slice(0, bar) : m[1]);
          const label = bar > -1 ? m[1].slice(bar + 1).trim() : '';
          if (target && [...target].length <= MAX.title && !/[\u0000-\u001f]/.test(target)) {
            flush();
            out.push({ t: 'link', target, label, start: i, end: i + m[0].length });
            i += m[0].length; bufStart = i; continue;
          }
        }
      }
      if (!buf) bufStart = i;
      buf += c; i++;
    }
    flush();
    return out;
  }
  const FENCE = /^ {0,3}(`{3,}|~{3,})/;
  // Parcourt le corps ligne par ligne en sautant les blocs de code ; renvoie les liens avec leur position absolue.
  function scanLinks(body) {
    const links = [];
    let fence = null, pos = 0;
    for (const line of String(body).split('\n')) {
      const f = FENCE.exec(line);
      if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(f[0].length).trim()) fence = null; }
      else if (f) fence = f[1];
      else for (const tok of tokenizeLine(line)) if (tok.t === 'link') links.push({ target: tok.target, label: tok.label, start: pos + tok.start, end: pos + tok.end });
      pos += line.length + 1;
    }
    return links;
  }

  // --- Emphase sur les morceaux de texte : **gras** et *penché* (profondeur limitée).
  function emph(s, depth = 0) {
    const out = [];
    let buf = '', i = 0;
    const flush = () => { if (buf) out.push({ t: 'text', v: buf }); buf = ''; };
    while (i < s.length) {
      if (depth < 3 && s.startsWith('**', i) && s[i + 2] && s[i + 2] !== ' ') {
        const j = s.indexOf('**', i + 2);
        if (j > i + 2 && s[j - 1] !== ' ') { flush(); out.push({ t: 'strong', c: emph(s.slice(i + 2, j), depth + 1) }); i = j + 2; continue; }
      }
      if (depth < 3 && s[i] === '*' && s[i + 1] && s[i + 1] !== ' ' && s[i + 1] !== '*') {
        const j = s.indexOf('*', i + 1);
        if (j > i + 1 && s[j - 1] !== ' ' && s[j + 1] !== '*') { flush(); out.push({ t: 'em', c: emph(s.slice(i + 1, j), depth + 1) }); i = j + 1; continue; }
      }
      buf += s[i]; i++;
    }
    flush();
    return out;
  }
  function parseInline(line) {
    const out = [];
    for (const tok of tokenizeLine(line)) {
      if (tok.t === 'text') out.push(...emph(tok.v));
      else if (tok.t === 'code') out.push({ t: 'code', v: tok.v });
      else out.push({ t: 'link', target: tok.target, label: tok.label || tok.target });
    }
    return out;
  }

  // --- Blocs : titres (#), listes (- ou *), citations (>), blocs de code (```), paragraphes.
  function parse(body) {
    if (typeof body !== 'string') fail('err.body');
    const lines = body.replace(/\r\n?/g, '\n').split('\n'), blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m = FENCE.exec(line);
      if (m) {
        const fence = m[1], text = [];
        i++;
        while (i < lines.length) {
          const f = FENCE.exec(lines[i]);
          if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !lines[i].slice(f[0].length).trim()) { i++; break; }
          text.push(lines[i++]);
        }
        blocks.push({ t: 'code', text: text.join('\n') });
        continue;
      }
      if ((m = /^(#{1,3})[ \t]+(.*)$/.exec(line))) { blocks.push({ t: 'h', level: m[1].length, c: parseInline(m[2]) }); i++; continue; }
      if (/^[-*][ \t]+/.test(line)) {
        const items = [];
        while (i < lines.length && (m = /^[-*][ \t]+(.*)$/.exec(lines[i]))) { items.push(parseInline(m[1])); i++; }
        blocks.push({ t: 'ul', items });
        continue;
      }
      if (/^>[ \t]?/.test(line)) {
        const qs = [];
        while (i < lines.length && (m = /^>[ \t]?(.*)$/.exec(lines[i]))) { qs.push(parseInline(m[1])); i++; }
        blocks.push({ t: 'quote', lines: qs });
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !/^(#{1,3})[ \t]+/.test(lines[i]) && !/^[-*][ \t]+/.test(lines[i]) && !/^>/.test(lines[i])) para.push(parseInline(lines[i++].trim()));
      blocks.push({ t: 'p', lines: para });
    }
    return blocks;
  }

  // --- Index des notes, liens, rétroliens, orphelines
  function byKey(notes) { const map = new Map(); for (const n of notes) map.set(titleKey(n.title), n); return map; }
  function resolve(notes, target) { return byKey(notes).get(titleKey(target)) || null; }
  // Liens sortants d'une note : cible, note trouvée (ou null = note à créer).
  function outgoing(notes, note) {
    const map = byKey(notes), seen = new Map();
    for (const l of scanLinks(note.body)) {
      const k = titleKey(l.target);
      if (!seen.has(k)) seen.set(k, { target: l.target, note: map.get(k) || null, count: 0 });
      seen.get(k).count++;
    }
    return [...seen.values()];
  }
  function lineAt(body, pos) {
    const a = body.lastIndexOf('\n', pos - 1) + 1, b = body.indexOf('\n', pos);
    const line = body.slice(a, b === -1 ? body.length : b).trim();
    return [...line].length > 140 ? [...line].slice(0, 139).join('') + '…' : line;
  }
  // Notes qui pointent vers « note » (hors elle-même), avec le nombre de liens et la ligne du premier.
  function backlinks(notes, note) {
    const k = titleKey(note.title), out = [];
    for (const n of notes) {
      if (n.id === note.id) continue;
      const hits = scanLinks(n.body).filter((l) => titleKey(l.target) === k);
      if (hits.length) out.push({ note: n, count: hits.length, context: lineAt(n.body, hits[0].start) });
    }
    return out;
  }
  // Nombre de liens entrants (depuis d'autres notes) pour chaque note.
  function incomingCounts(notes) {
    const map = byKey(notes), counts = new Map(notes.map((n) => [n.id, 0]));
    for (const n of notes) {
      const done = new Set();
      for (const l of scanLinks(n.body)) {
        const target = map.get(titleKey(l.target));
        if (target && target.id !== n.id && !done.has(target.id)) { done.add(target.id); counts.set(target.id, counts.get(target.id) + 1); }
      }
    }
    return counts;
  }
  // Orpheline : aucune autre note n'y renvoie.
  function orphans(notes) { const c = incomingCounts(notes); return notes.filter((n) => c.get(n.id) === 0); }
  // Liens vers des notes qui n'existent pas encore, avec le nombre de notes qui les citent.
  function wanted(notes) {
    const map = byKey(notes), out = new Map();
    for (const n of notes) {
      const done = new Set();
      for (const l of scanLinks(n.body)) {
        const k = titleKey(l.target);
        if (map.has(k) || done.has(k)) continue;
        done.add(k);
        if (!out.has(k)) out.set(k, { target: l.target, count: 0 });
        out.get(k).count++;
      }
    }
    return [...out.values()];
  }

  // --- Création, renommage (avec mise à jour des liens), suppression
  function addNote(notes, input, id) {
    if (notes.length >= MAX.notes) fail('err.tooManyNotes', { max: MAX.notes });
    const note = makeNote(input, id);
    if (resolve(notes, note.title)) fail('err.titleTaken', { title: note.title });
    return [...notes, note];
  }
  function updateNote(notes, id, patch, day) {
    const cur = notes.find((n) => n.id === id);
    if (!cur) fail('err.noNote');
    const next = makeNote({ ...cur, body: patch.body !== undefined ? patch.body : cur.body, tags: patch.tags !== undefined ? patch.tags : cur.tags, updated: day < cur.created ? cur.created : day }, id);
    return notes.map((n) => (n.id === id ? next : n));
  }
  function rewriteLinks(body, oldKey, newTitle) {
    const hits = scanLinks(body).filter((l) => titleKey(l.target) === oldKey);
    let out = body;
    for (const l of hits.reverse()) out = out.slice(0, l.start) + (l.label ? `[[${newTitle}|${l.label}]]` : `[[${newTitle}]]`) + out.slice(l.end);
    return { body: out, count: hits.length };
  }
  // Renomme une note et réécrit tous les liens [[Ancien]] et [[Ancien|libellé]] dans toutes les notes.
  function renameNote(notes, id, newTitle, day) {
    const cur = notes.find((n) => n.id === id);
    if (!cur) fail('err.noNote');
    const title = cleanTitle(newTitle);
    const other = resolve(notes, title);
    if (other && other.id !== id) fail('err.titleTaken', { title });
    if (title === cur.title) return { notes, links: 0, changed: 0 };
    const oldKey = titleKey(cur.title);
    let links = 0, changed = 0;
    const next = notes.map((n) => {
      const r = rewriteLinks(n.body, oldKey, title);
      if (r.body.length > MAX.body) fail('err.bodyLong', { max: MAX.body });
      if (r.count) { links += r.count; changed++; }
      if (n.id === id) return { ...n, title, body: r.body, updated: day < n.created ? n.created : day };
      return r.count ? { ...n, body: r.body, updated: day < n.created ? n.created : day } : n;
    });
    return { notes: next, links, changed };
  }
  function deleteNote(notes, id) { return notes.filter((n) => n.id !== id); }

  // --- Recherche plein texte : insensible à la casse et aux accents ; « #étiquette » filtre par étiquette.
  function fold(s) {
    let text = '';
    const map = [];
    let i = 0;
    for (const ch of String(s)) {
      const f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      for (let k = 0; k < f.length; k++) map.push(i);
      text += f;
      i += ch.length;
    }
    return { text, map, len: i };
  }
  function count(hay, needle) { let n = 0, p = hay.indexOf(needle); while (p > -1 && n < 50) { n++; p = hay.indexOf(needle, p + needle.length); } return n; }
  function parseQuery(q) {
    if (typeof q !== 'string') return { terms: [], tags: [] };
    const terms = [], tags = [];
    for (const raw of q.slice(0, MAX.query).split(/\s+/)) {
      if (!raw) continue;
      if (raw.startsWith('#') && raw.length > 1) tags.push(fold(raw.slice(1)).text);
      else terms.push(fold(raw).text);
    }
    return { terms: terms.filter(Boolean), tags };
  }
  function search(notes, query) {
    const { terms, tags } = parseQuery(query);
    if (!terms.length && !tags.length) return [];
    const out = [];
    for (const n of notes) {
      const ntags = n.tags.map((x) => fold(x).text);
      if (!tags.every((tg) => ntags.includes(tg))) continue;
      const ft = fold(n.title).text, fb = fold(n.body), ftag = ntags.join(' ');
      if (!terms.every((term) => ft.includes(term) || fb.text.includes(term) || ftag.includes(term))) continue;
      let score = 0;
      for (const term of terms) score += count(ft, term) * 10 + (ftag.includes(term) ? 5 : 0) + Math.min(count(fb.text, term), 20);
      let snippet = null;
      for (const term of terms) {
        const at = fb.text.indexOf(term);
        if (at === -1) continue;
        const a = fb.map[at], b = at + term.length < fb.map.length ? fb.map[at + term.length] : fb.len;
        const from = Math.max(0, a - 40), to = Math.min(n.body.length, Math.max(b, a + 1) + 60);
        snippet = { before: (from > 0 ? '…' : '') + n.body.slice(from, a).replace(/\s+/g, ' '), match: n.body.slice(a, Math.max(b, a + 1)), after: n.body.slice(Math.max(b, a + 1), to).replace(/\s+/g, ' ') + (to < n.body.length ? '…' : '') };
        break;
      }
      out.push({ note: n, score, snippet });
    }
    return out.sort((x, y) => y.score - x.score || (x.note.updated < y.note.updated ? 1 : x.note.updated > y.note.updated ? -1 : 0));
  }
  // Étiquettes utilisées, avec leur nombre de notes.
  function tagCounts(notes) {
    const m = new Map();
    for (const n of notes) for (const tg of n.tags) m.set(tg, (m.get(tg) || 0) + 1);
    return [...m.entries()].map(([tag, n]) => ({ tag, n }));
  }

  // --- Exports Markdown
  function fileBase(title) {
    const base = String(title).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
    return base || 'note';
  }
  // Une note en Markdown avec un en-tête YAML (titre entre guillemets JSON, valide en YAML).
  function noteMarkdown(n) {
    return `---\ntitle: ${JSON.stringify(n.title)}\ntags: [${n.tags.map((x) => JSON.stringify(x)).join(', ')}]\ncreated: ${n.created}\nupdated: ${n.updated}\n---\n\n${n.body.replace(/\s+$/, '')}\n`;
  }
  // Tout dans un seul fichier : un titre de niveau 1 par note, séparées par une règle horizontale.
  function combinedMarkdown(notes) {
    return notes.map((n) => `# ${n.title}\n\n${n.tags.length ? n.tags.map((x) => '#' + x).join(' ') + '\n\n' : ''}${n.body.replace(/\s+$/, '')}\n`).join('\n---\n\n');
  }
  // Un fichier .md par note, noms uniques (« projet.md », « projet-2.md »…).
  function noteFiles(notes) {
    const used = new Set();
    return notes.map((n) => {
      const base = fileBase(n.title);
      let name = `${base}.md`, k = 2;
      while (used.has(name)) name = `${base}-${k++}.md`;
      used.add(name);
      return { name, text: noteMarkdown(n), day: n.updated };
    });
  }

  // --- Archive ZIP minimale (méthode « stockée », sans compression), noms en UTF-8.
  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const [y, m, d] = (f.day && DAY.test(f.day) ? f.day : '2000-01-01').split('-').map(Number);
      const dosDate = ((Math.max(1980, y) - 1980) << 9) | (m << 5) | d, dosTime = 12 << 11;
      const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
      const local = Uint8Array.from([...u32(0x04034b50), ...common]);
      parts.push(local, name, data);
      central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  // --- Sauvegarde
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'notegarden' || data.version !== VERSION || !Array.isArray(data.notes)) fail('err.notBackup');
    if (keys(data) !== 'app,notes,version') fail('err.backup');
    if (data.notes.length > MAX.notes) fail('err.tooManyNotes', { max: MAX.notes });
    const notes = data.notes.map((n) => {
      if (keys(n) !== 'body,created,id,tags,title,updated' || !Array.isArray(n.tags) || !n.tags.every((x) => typeof x === 'string')) fail('err.backup');
      const note = makeNote(n, n.id);
      if (note.tags.join('\n') !== n.tags.join('\n') || note.title !== n.title) fail('err.backup'); // valeurs déjà normalisées attendues
      return note;
    });
    if (new Set(notes.map((n) => n.id)).size !== notes.length) fail('err.backup');
    if (new Set(notes.map((n) => titleKey(n.title))).size !== notes.length) fail('err.backup');
    return notes;
  }
  function backup(notes) { return JSON.stringify({ app: 'notegarden', version: VERSION, notes: validateBackup({ app: 'notegarden', version: VERSION, notes }) }, null, 2); }

  root.NoteCore = Object.freeze({
    VERSION, MAX, normTitle, titleKey, cleanTitle, parseTags, checkDay, makeNote, tokenizeLine, scanLinks, parseInline, parse,
    resolve, outgoing, backlinks, incomingCounts, orphans, wanted, addNote, updateNote, renameNote, deleteNote,
    fold, search, tagCounts, fileBase, noteMarkdown, combinedMarkdown, noteFiles, crc32, zip, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NoteCore;
})(typeof window === 'undefined' ? globalThis : window);
