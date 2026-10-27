// Tests métier de NoteGarden : titres, étiquettes, liens [[…]], rétroliens, renommage, recherche, exports, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const D = '2026-10-01';
let n = 0;
const id = () => `note-${String(++n).padStart(4, '0')}`;
function garden(...specs) { // [titre, corps, étiquettes]
  let notes = [];
  for (const [title, body = '', tags = ''] of specs) notes = C.addNote(notes, { title, body, tags, created: D, updated: D }, id());
  return notes;
}
const byTitle = (notes, t) => notes.find((x) => x.title === t);

test('titres : espaces réduits, caractères de lien refusés, unicité sans tenir compte de la casse', () => {
  assert.equal(C.cleanTitle('  Mon   projet '), 'Mon projet');
  assert.equal(C.titleKey('Été'), C.titleKey('ÉTÉ'));
  for (const bad of ['', '   ', 'a[b', 'a]b', 'a|b', 'x'.repeat(121)]) assert.throws(() => C.cleanTitle(bad), /^Error: err\.title/);
  const notes = garden(['Projet']);
  assert.throws(() => C.addNote(notes, { title: 'projet', body: '', created: D, updated: D }, id()), /err\.titleTaken/);
});

test('étiquettes : séparateurs souples, # facultatif, minuscules, doublons retirés, limites', () => {
  assert.deepEqual(C.parseTags('Projet, idée #Lecture  projet'), ['projet', 'idée', 'lecture']);
  assert.deepEqual(C.parseTags(''), []);
  assert.throws(() => C.parseTags('bad!tag'), /err\.tag/);
  assert.throws(() => C.parseTags('x'.repeat(41)), /err\.tag/);
  assert.throws(() => C.parseTags(Array.from({ length: 21 }, (_, i) => 't' + i).join(' ')), /err\.tooManyTags/);
});

test('liens : [[Titre]] et [[Titre|libellé]], ignorés dans le code en ligne et les blocs de code', () => {
  const body = 'Voir [[Projet]] et [[  Lecture   en cours |mes lectures]].\n`[[Pas un lien]]`\n```\n[[Code]]\n```\n[[]] [[a\nb]] [[Fin]]';
  const links = C.scanLinks(body);
  assert.deepEqual(links.map((l) => [l.target, l.label]), [['Projet', ''], ['Lecture en cours', 'mes lectures'], ['Fin', '']]);
  for (const l of links) assert.ok(body.slice(l.start, l.end).startsWith('[[') && body.slice(l.start, l.end).endsWith(']]'));
  // Bloc de code non fermé : tout le reste est du code.
  assert.deepEqual(C.scanLinks('[[A]]\n~~~\n[[B]]'), [{ target: 'A', label: '', start: 0, end: 5 }]);
});

test('rendu : arbre de nœuds connus, le HTML reste du texte', () => {
  const blocks = C.parse('# Titre <b>\n\nDu **gras**, du *penché*, `<script>` et [[Note|lien]].\n- un\n- deux\n> cité\n```\n<img onerror=x>\n```');
  assert.deepEqual(blocks.map((b) => b.t), ['h', 'p', 'ul', 'quote', 'code']);
  assert.deepEqual(blocks[0].c, [{ t: 'text', v: 'Titre <b>' }]);
  const p = blocks[1].lines[0];
  assert.deepEqual(p.map((x) => x.t), ['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text']);
  assert.deepEqual(p[7], { t: 'link', target: 'Note', label: 'lien' });
  assert.equal(p[5].v, '<script>');
  assert.equal(blocks[4].text, '<img onerror=x>');
  // Emphase non fermée ou pathologique : texte brut, en temps raisonnable.
  assert.deepEqual(C.parseInline('2 * 3 * 4'), [{ t: 'text', v: '2 * 3 * 4' }]);
  const t0 = Date.now(); C.parse('*a '.repeat(15000) + '[['.repeat(5000)); assert.ok(Date.now() - t0 < 5000);
});

test('rétroliens, liens sortants, notes à créer et orphelines', () => {
  const notes = garden(
    ['Accueil', 'Voir [[Projet]] et [[Lecture]] puis [[projet]].'],
    ['Projet', 'Lié à [[Accueil]] et à [[Idées futures]]. Lien vers soi : [[Projet]].'],
    ['Lecture', 'Rien ici.'],
    ['Isolée', 'Aucun lien, mais vers [[Idées futures]].'],
  );
  const projet = byTitle(notes, 'Projet');
  const back = C.backlinks(notes, projet);
  assert.deepEqual(back.map((b) => [b.note.title, b.count]), [['Accueil', 2]]); // le lien vers soi ne compte pas
  assert.match(back[0].context, /^Voir \[\[Projet\]\]/);
  const out = C.outgoing(notes, byTitle(notes, 'Accueil'));
  assert.deepEqual(out.map((o) => [o.target, o.note && o.note.title, o.count]), [['Projet', 'Projet', 2], ['Lecture', 'Lecture', 1]]);
  assert.deepEqual(C.orphans(notes).map((x) => x.title), ['Isolée']);
  assert.deepEqual(C.wanted(notes), [{ target: 'Idées futures', count: 2 }]);
});

test('renommage : tous les liens suivent, libellés conservés, collisions refusées', () => {
  const notes = garden(
    ['Projet', 'Moi-même : [[projet]]'],
    ['Accueil', '[[Projet]], [[PROJET|le projet]], `[[Projet]]` et [[Projets]]'],
    ['Autre', 'Sans lien'],
  );
  const pid = byTitle(notes, 'Projet').id;
  const r = C.renameNote(notes, pid, 'Chantier 2027', '2026-10-05');
  assert.equal(r.links, 3); assert.equal(r.changed, 2);
  assert.equal(byTitle(r.notes, 'Accueil').body, '[[Chantier 2027]], [[Chantier 2027|le projet]], `[[Projet]]` et [[Projets]]');
  assert.equal(byTitle(r.notes, 'Chantier 2027').body, 'Moi-même : [[Chantier 2027]]');
  assert.equal(byTitle(r.notes, 'Accueil').updated, '2026-10-05');
  assert.equal(byTitle(r.notes, 'Autre').updated, D); // note non touchée
  assert.deepEqual(C.backlinks(r.notes, byTitle(r.notes, 'Chantier 2027')).map((b) => b.count), [2]);
  assert.throws(() => C.renameNote(notes, pid, 'autre', D), /err\.titleTaken/);
  assert.throws(() => C.renameNote(notes, pid, 'a|b', D), /err\.titleChars/);
  // Changer seulement la casse est permis.
  assert.equal(byTitle(C.renameNote(notes, pid, 'PROJET', D).notes, 'Accueil').body.startsWith('[[PROJET]]'), true);
  assert.equal(C.renameNote(notes, pid, 'Projet', D).links, 0);
});

test('recherche : accents et casse ignorés, ET entre les mots, filtre #étiquette, extrait', () => {
  const notes = garden(
    ['Café du matin', 'Notes sur le café éthiopien et la mouture.', 'boisson'],
    ['Thé', 'Le thé vert et le CAFE sont comparés ici, longuement.', 'boisson, comparaison'],
    ['Vélo', 'Entretien de la chaîne.', 'sport'],
  );
  assert.deepEqual(C.search(notes, 'cafe').map((r) => r.note.title), ['Café du matin', 'Thé']); // le titre pèse plus
  assert.deepEqual(C.search(notes, 'cafe vert').map((r) => r.note.title), ['Thé']);
  assert.deepEqual(C.search(notes, '#comparaison').map((r) => r.note.title), ['Thé']);
  assert.deepEqual(C.search(notes, '#boisson ethiopien').map((r) => r.note.title), ['Café du matin']);
  assert.deepEqual(C.search(notes, 'CHAINE').map((r) => r.note.title), ['Vélo']);
  const s = C.search(notes, 'ethiopien')[0].snippet;
  assert.equal(s.match, 'éthiopien');
  assert.equal(s.before, 'Notes sur le café ');
  assert.deepEqual(C.search(notes, '   '), []);
  assert.deepEqual(C.search(notes, 'introuvable'), []);
  assert.deepEqual(C.tagCounts(notes).find((x) => x.tag === 'boisson'), { tag: 'boisson', n: 2 });
});

test('mise à jour : corps et étiquettes validés, date de modification', () => {
  const notes = garden(['A', 'x']);
  const next = C.updateNote(notes, notes[0].id, { body: 'y\r\nz', tags: '#Un deux' }, '2026-10-09');
  assert.deepEqual([next[0].body, next[0].tags, next[0].updated], ['y\nz', ['un', 'deux'], '2026-10-09']);
  assert.throws(() => C.updateNote(notes, notes[0].id, { body: 'x'.repeat(50001) }, D), /err\.bodyLong/);
  assert.throws(() => C.updateNote(notes, 'note-inconnue', { body: '' }, D), /err\.noNote/);
});

test('exports Markdown : un fichier par note (noms uniques) et fichier unique', () => {
  const notes = garden(['Été 2026', 'Corps\n\n', 'vacances'], ['ete 2026!', 'B'], ['???', '']);
  const files = C.noteFiles(notes);
  assert.deepEqual(files.map((f) => f.name), ['ete-2026.md', 'ete-2026-2.md', 'note.md']);
  assert.equal(files[0].text, '---\ntitle: "Été 2026"\ntags: ["vacances"]\ncreated: 2026-10-01\nupdated: 2026-10-01\n---\n\nCorps\n');
  assert.equal(C.combinedMarkdown(notes.slice(0, 2)), '# Été 2026\n\n#vacances\n\nCorps\n\n---\n\n# ete 2026!\n\nB\n');
});

test('archive ZIP : CRC32 de référence et structure lisible', () => {
  assert.equal(C.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = C.zip([{ name: 'a.md', text: 'Bonjour', day: '2026-10-01' }, { name: 'é.md', text: '', day: '2026-10-02' }]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50); // en-tête local
  const end = z.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50); // fin du répertoire central
  assert.equal(dv.getUint16(end + 10, true), 2);
  assert.equal(dv.getUint16(6, true), 0x0800); // noms en UTF-8
  assert.equal(new TextDecoder().decode(z.slice(30 + 4, 30 + 4 + 7)), 'Bonjour');
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const notes = garden(['A', '[[B]]', 'x'], ['B', '']);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(notes))), notes);
  const ok = { app: 'notegarden', version: 1, notes };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, notes: [{ ...notes[0], extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, notes: [{ ...notes[0], tags: 'x' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, notes: [{ ...notes[0], tags: ['X'] }] }), /err\.backup/); // non normalisée
  assert.throws(() => C.validateBackup({ ...ok, notes: [{ ...notes[0], created: '2026-02-30' }] }), /err\.date/);
  assert.throws(() => C.validateBackup({ ...ok, notes: [{ ...notes[0], updated: '2025-01-01' }] }), /err\.date/);
  assert.throws(() => C.validateBackup({ ...ok, notes: [notes[0], { ...notes[1], title: 'a' }] }), /err\.backup/); // titres en double
  assert.throws(() => C.validateBackup({ ...ok, notes: [notes[0], notes[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, notes: [{ ...notes[0], id: '<x>' }] }), /err\.id/);
  assert.throws(() => C.validateBackup({ ...ok, notes: Array(501).fill(notes[0]) }), /err\.tooManyNotes/);
});

test('exemple : valide dans les 7 langues (titres, étiquettes, liens résolus, une orpheline, une note à créer)', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'messages.js'), 'utf8'), box);
  for (const [lang, m] of Object.entries(box.window.LouvreMessages)) {
    const fill = (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k]);
    const T = [1, 2, 3, 4].map((i) => m['sample.t' + i]);
    const notes = garden(
      [T[0], fill(m['sample.b1'], { a: T[1], b: T[2], c: T[3] }), m['sample.tags1']],
      [T[1], fill(m['sample.b2'], { a: T[2], b: m['sample.wanted'] }), m['sample.tags2']],
      [T[2], fill(m['sample.b3'], { a: T[1] }), m['sample.tags3']],
      [T[3], fill(m['sample.b4'], { a: T[0] }), m['sample.tags4']],
    );
    assert.deepEqual(C.orphans(notes).map((x) => x.title), [T[3]], lang);
    assert.deepEqual(C.wanted(notes).map((x) => x.target), [m['sample.wanted']], lang);
    assert.equal(notes[0].tags.length, 2, lang);
  }
});
