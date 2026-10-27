"""MarkdownDesk dans Chromium : écriture, aperçu, injections neutralisées, documents multiples, exports .md/.html, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-markdowndesk-v1'
ATTACK = '\n'.join([
    '# Titre <script>window.__pwned = 1</script>',
    '<img src=x onerror="window.__pwned = 2">',
    '<svg onload="window.__pwned = 3"></svg>',
    '[clic](javascript:window.__pwned=4) et [ok](https://example.org)',
    '![x" onerror="window.__pwned=5](https://example.org/i.png)',
    '<a href="javascript:window.__pwned=6">lien brut</a>',
    '| <b onmouseover=x>a</b> | b |',
    '|---|---|',
    '| <iframe src="https://evil.example"></iframe> | c |',
])


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='fr-FR')
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#doc-title')).to_have_value('Sans titre')  # premier document créé
            expect(page.locator('#preview')).to_have_text("L'aperçu apparaîtra ici.")

            # Parcours principal : titre, texte, aperçu, enregistrement automatique.
            page.locator('#doc-title').fill('Notes')
            page.locator('#editor').fill('# Bonjour\n\nDu **gras**, du *penché* et `code`.\n\n- un\n- deux\n\n| A | B |\n|---|--:|\n| 1 | 2 |\n\n> cité')
            expect(page.locator('#preview h1')).to_have_text('Bonjour')
            expect(page.locator('#preview strong')).to_have_text('gras')
            expect(page.locator('#preview em')).to_have_text('penché')
            expect(page.locator('#preview li')).to_have_count(2)
            expect(page.locator('#preview td').nth(1)).to_have_css('text-align', 'end')
            expect(page.locator('#preview blockquote')).to_have_text('cité')
            expect(page.locator('#save-state')).to_have_text('Enregistré sur cet appareil')
            expect(page.locator('#stats')).to_contain_text('mots')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['docs'][0]['title'] == 'Notes' and saved['docs'][0]['body'].startswith('# Bonjour')

            # Barre d'outils : gras sur la sélection.
            page.evaluate("() => { const t = document.getElementById('editor'); t.setSelectionRange(2, 9); }")
            page.locator('[data-md=bold]').click()
            expect(page.locator('#preview h1 strong')).to_have_text('Bonjour')

            # Injection : rien n'est exécuté ni inséré comme HTML, les liens dangereux sont retirés.
            page.locator('#new-doc').click()
            expect(page.locator('#doc-select option')).to_have_count(2)
            page.locator('#doc-title').fill('Piège')
            page.locator('#editor').fill(ATTACK)
            expect(page.locator('#preview h1')).to_contain_text('<script>')  # le texte reste visible, échappé
            page.wait_for_timeout(300)
            report = page.evaluate('''() => {
              const p = document.getElementById('preview');
              return {
                pwned: window.__pwned === undefined ? null : window.__pwned,
                tags: p.querySelectorAll('script,img,svg,iframe,style,object,embed').length,
                onattr: [...p.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
                links: [...p.querySelectorAll('a')].map((a) => a.getAttribute('href')),
              };
            }''')
            assert report == {'pwned': None, 'tags': 0, 'onattr': 0, 'links': ['https://example.org']}, report
            expect(page.locator('#preview')).to_contain_text('clic')
            expect(page.locator('#preview')).to_contain_text('<img src=x onerror=')

            # Export .html autonome : aucune balise active, CSP stricte.
            with page.expect_download() as d:
                page.locator('#export-html').click()
            assert d.value.suggested_filename == 'piege.html'
            exported = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert 'href="javascript' not in exported and '<iframe' not in exported and '&lt;script&gt;' in exported, exported[:600]
            # La page exportée, ouverte dans le navigateur, n'exécute rien.
            viewer = context.new_page()
            viewer.on('pageerror', lambda e: errors.append(str(e)))
            viewer.set_content(exported)
            assert viewer.evaluate('() => window.__pwned === undefined')
            assert viewer.locator('script, img, iframe, svg').count() == 0
            viewer.close()
            with page.expect_download() as d:
                page.locator('#export-md').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == ATTACK

            # Ouvrir un .md crée un nouveau document.
            page.locator('#import-md').set_input_files({'name': 'journal.md', 'mimeType': 'text/markdown', 'buffer': '## Jour 1\n\nRien à signaler.'.encode('utf-8')})
            expect(page.locator('#docs-status')).to_have_text('Document ouvert : journal.')
            expect(page.locator('#preview h2')).to_have_text('Jour 1')
            expect(page.locator('#doc-select option')).to_have_count(3)
            # Changer de document recharge l'éditeur.
            page.locator('#doc-select').select_option(label=page.locator('#doc-select option', has_text='Notes').inner_text())
            expect(page.locator('#doc-title')).to_have_value('Notes')

            # Sauvegarde JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['docs']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'corrompu')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#editor')).to_be_disabled()
            page.locator('#new-doc').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"markdowndesk","version":1,"docs":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('3 documents')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#editor')).to_be_enabled()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#doc-select option')).to_have_count(3)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text("Tu scrivi, l'anteprima segue.")
            ip.locator('#sample').click()
            expect(ip.locator('#preview h1')).to_have_text('Verbale di riunione')
            expect(ip.locator('#preview table')).to_have_count(1)
            ip.locator('#editor').press('End')
            ip.locator('#editor').type('\n\nTesto in corso')  # saisie en cours
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#editor').input_value().endswith('Testo in corso'), lang
                expect(ip.locator('#preview')).to_contain_text('Testo in corso')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-preview')).to_have_text('المعاينة')
            ip.locator('#new-doc').click()
            expect(ip.locator('#doc-title')).to_have_value('مستند 3')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#h-preview')).to_have_text('Vorschau')
            ip.locator('#doc-title').fill('')
            ip.locator('#doc-title').fill('x' * 120)
            expect(ip.locator('#save-state')).to_have_text('Auf diesem Gerät gespeichert')
            with ip.expect_download() as d:
                ip.locator('#export-html').click()
            assert '<html lang="de" dir="ltr">' in pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS MarkdownDesk: editing, preview, toolbar, injection neutralised (script/onerror/javascript:), multiple docs, .md import, .md/.html export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
