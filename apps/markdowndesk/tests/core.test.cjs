// Tests métier de MarkdownDesk : analyseur, rendu échappé, neutralisation des injections, documents, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const html = (md) => C.toHtml(C.parse(md));

test('titres, paragraphes, emphase, code, barré', () => {
  assert.equal(html('# Titre\n\nUn *mot* et **gras**, `code` et ~~barré~~.'), '<h1>Titre</h1>\n<p>Un <em>mot</em> et <strong>gras</strong>, <code>code</code> et <del>barré</del>.</p>');
  assert.equal(html('### Trois ###'), '<h3>Trois</h3>');
  assert.equal(html('####### sept'), '<p>####### sept</p>');
  assert.equal(html('***fort et penché***'), '<p><strong><em>fort et penché</em></strong></p>');
  assert.equal(html('snake_case_name et 2 * 3 * 4'), '<p>snake_case_name et 2 * 3 * 4</p>');
  assert.equal(html('\\*pas d\'emphase\\*'), '<p>*pas d&#39;emphase*</p>');
  assert.equal(html('ligne un  \nligne deux\nsuite'), '<p>ligne un<br>ligne deux suite</p>');
  assert.equal(html('`` a ` b ``'), '<p><code>a ` b</code></p>');
});

test('listes, sous-listes, listes numérotées, citations, séparateur', () => {
  assert.equal(html('- un\n- deux\n  - deux a\n- trois'), '<ul><li>un</li><li>deux<ul><li>deux a</li></ul></li><li>trois</li></ul>');
  assert.equal(html('3. trois\n4. quatre'), '<ol start="3"><li>trois</li><li>quatre</li></ol>');
  assert.equal(html('> cité\n> **fort**\n>\n> > imbriqué'), '<blockquote><p>cité <strong>fort</strong></p>\n<blockquote><p>imbriqué</p></blockquote></blockquote>');
  assert.equal(html('a\n\n---\n\nb'), '<p>a</p>\n<hr>\n<p>b</p>');
});

test('blocs de code : contenu brut, jamais interprété', () => {
  assert.equal(html('```js\nconst a = "<b>" && 1;\n**pas gras**\n```'), '<pre><code class="language-js">const a = &quot;&lt;b&gt;&quot; &amp;&amp; 1;\n**pas gras**</code></pre>');
  assert.equal(html('~~~\nnon fermé'), '<pre><code>non fermé</code></pre>');
});

test('tableaux simples avec alignement', () => {
  const out = html('| Pays | Capitale | Pop. |\n|:-----|:-------:|-----:|\n| France | Paris | 68 |\n| Pipe \\| échappé | x |');
  assert.equal(out, '<table><thead><tr><th style="text-align:left">Pays</th><th style="text-align:center">Capitale</th><th style="text-align:right">Pop.</th></tr></thead>'
    + '<tbody><tr><td style="text-align:left">France</td><td style="text-align:center">Paris</td><td style="text-align:right">68</td></tr>'
    + '<tr><td style="text-align:left">Pipe | échappé</td><td style="text-align:center">x</td><td style="text-align:right"></td></tr></tbody></table>');
});

test('liens : seuls http(s) et mailto sont acceptés', () => {
  assert.equal(html('[Louvre](https://example.org/a?b=1&c=2)'), '<p><a href="https://example.org/a?b=1&amp;c=2" rel="noopener noreferrer">Louvre</a></p>');
  assert.equal(html('<mailto:moi@example.org>'), '<p><a href="mailto:moi@example.org" rel="noopener noreferrer">moi@example.org</a></p>');
  assert.equal(html('[écrire](mailto:a@b.fr)'), '<p><a href="mailto:a@b.fr" rel="noopener noreferrer">écrire</a></p>');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox', '//evil.example', 'page.html', 'https://ok.org" onmouseover="alert(1)', 'javascript&#58;alert(1)', 'https:/x', 'file:///etc/passwd']) {
    assert.equal(C.safeUrl(bad), null, bad);
  }
  assert.equal(html('[clic](javascript:alert(1))'), '<p>clic</p>'); // texte gardé, lien supprimé
  assert.equal(html('<javascript:alert(1)>'), '<p>&lt;javascript:alert(1)&gt;</p>');
});

test('injections HTML neutralisées : tout est échappé', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<svg onload=alert(1)>',
    '<iframe src="https://evil.example"></iframe>',
    '![x](javascript:alert(1))',
    '![x" onerror="alert(1)](https://example.org/i.png)',
    '[<img src=x onerror=alert(1)>](https://example.org)',
    '| <script>alert(1)</script> | b |\n|---|---|\n| <img onerror=alert(1)> | c |',
    '# <style>body{display:none}</style>',
    '> <script>alert(1)</script>',
    '```"><script>alert(1)</script>\nx\n```',
  ];
  for (const md of attacks) {
    const out = html(md);
    assert.ok(!/<(script|img|svg|iframe|style)\b/i.test(out), `${md} -> ${out}`);
    assert.ok(!/\son\w+=/i.test(out.replace(/&[a-z#0-9]+;/gi, (m) => (m === '&quot;' ? '' : m)).replace(/>[^<]*</g, '><')), `attribut on* : ${out}`);
    assert.ok(!/href="(?!https?:|mailto:)/i.test(out), `href dangereux : ${out}`);
  }
  assert.equal(html('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(html('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(html('![alt](https://example.org/i.png)'), '<p>alt</p>'); // aucune image externe chargée
});

test('export HTML autonome : CSP sans script, titre échappé', () => {
  const doc = C.makeDoc({ title: '</title><script>alert(1)</script>', body: '# Bonjour\n\n<script>x</script>', updated: '2026-10-27' }, 'doc-000001');
  const page = C.exportHtml(doc, { lang: 'ar', dir: 'rtl' });
  assert.ok(page.includes(`content="default-src 'none'; style-src 'unsafe-inline'"`));
  assert.ok(page.includes('<html lang="ar" dir="rtl">'));
  assert.ok(page.includes('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.equal((page.match(/<script/gi) || []).length, 0);
  assert.ok(page.includes('<h1>Bonjour</h1>'));
  assert.ok(C.exportHtml(doc, { lang: '"><script>', dir: 'x' }).includes('<html lang="fr" dir="ltr">'));
});

test('plan, statistiques, nom de fichier', () => {
  assert.deepEqual(C.outline(C.parse('# A\ntexte\n## B *c*')), [{ level: 1, text: 'A' }, { level: 2, text: 'B c' }]);
  assert.deepEqual(C.stats("L'été est là, 2026 !\nfin"), { chars: 24, words: 5, lines: 2 });
  assert.equal(C.fileName('Notes : réunion du 3/11', 'md'), 'notes-reunion-du-3-11.md');
  assert.equal(C.fileName('***', 'html'), 'document.html');
});

test('analyseur robuste : textes extrêmes sans erreur', () => {
  for (const md of ['', '\n\n', '*'.repeat(5000), '['.repeat(3000), '> '.repeat(500) + 'x', '- '.repeat(400) + 'x', '|'.repeat(100), '`'.repeat(1001), '\u0000']) {
    assert.doesNotThrow(() => html(md), md.slice(0, 20));
  }
  assert.throws(() => C.parse(null), /err\.body/);
});

test('documents et sauvegarde', () => {
  const docs = [C.makeDoc({ title: 'Notes', body: '# Hi', updated: '2026-10-27' }, 'doc-000001'), C.makeDoc({ title: 'Vide', body: '', updated: '2026-01-31' }, 'doc-000002')];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(docs))), docs);
  const ok = { app: 'markdowndesk', version: 1, docs };
  assert.throws(() => C.validateBackup({ ...ok, app: 'textdiff' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, x: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...docs[0], updated: '2026-02-30' }] }), /err\.date/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...docs[0], body: 5 }] }), /err\.body/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...docs[0], body: 'x'.repeat(200001) }] }), /err\.bodyLong/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...docs[0], title: ' ' }] }), /err\.titleRequired/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...docs[0], script: '<script>' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [docs[0], docs[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, docs: Array(101).fill(docs[1]) }), /err\.tooManyDocs/);
  assert.throws(() => C.makeDoc({ title: 'x'.repeat(121), body: '', updated: '2026-10-27' }, 'doc-000003'), /err\.titleLong/);
});
