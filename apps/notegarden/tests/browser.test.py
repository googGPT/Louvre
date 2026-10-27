"""NoteGarden dans Chromium : liens [[…]] (création au clic), renommage qui met à jour les liens, rétroliens, orphelines,
recherche, rendu sûr, enregistrement forcé avant changement de note, exports Markdown (.zip et fichier unique), sauvegarde,
stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import io
import json
import os
import pathlib
import re
import threading
import zipfile
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-notegarden-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def stored(page):
    return page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")


def set_title(page, title):
    page.locator('#note-title').fill(title)
    page.locator('#note-title').press('Enter')


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
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent
            expect(page.locator('#note-list')).to_contain_text("Aucune note pour l'instant.")
            expect(page.locator('#no-note')).to_be_visible()

            # Validation : caractères interdits dans un titre, étiquette invalide.
            page.locator('#new-note').click()
            expect(page.locator('#note-title')).to_have_value('Note 1')
            set_title(page, 'a|b')
            expect(page.locator('#note-status')).to_have_text('Un titre ne peut pas contenir [ ] ni |')
            page.locator('#note-tags').fill('ok, bad!')
            page.locator('#note-tags').blur()
            expect(page.locator('#note-status')).to_contain_text('Étiquette invalide « bad! »')
            page.locator('#note-tags').fill('maison')

            # Parcours principal : liens vers des notes qui n'existent pas encore.
            set_title(page, 'Accueil')
            expect(page.locator('#note-status')).to_have_text('Note renommée.')
            page.locator('#note-body').fill('Voir [[Projet]] et [[Lecture|mes lectures]].\n\n`[[Pas un lien]]`')
            expect(page.locator('#preview .wikilink.missing')).to_have_count(2)
            expect(page.locator('#wanted')).to_contain_text('Projet (1)')
            expect(page.locator('#save-state')).to_have_text('Enregistré sur cet appareil')
            assert stored(page)['notes'][0]['tags'] == ['maison']

            # Clic sur un lien vers une note absente : elle est créée et ouverte.
            page.locator('#preview .wikilink', has_text='Projet').click()
            expect(page.locator('#note-title')).to_have_value('Projet')
            expect(page.locator('#note-status')).to_have_text('Note « Projet » créée depuis le lien.')
            expect(page.locator('#backlinks')).to_contain_text('Accueil')
            expect(page.locator('#backlinks')).to_contain_text('Voir [[Projet]]')
            page.locator('#note-tags').fill('travail')
            # Leçon : la dernière frappe est enregistrée même si l'on change de note aussitôt.
            page.locator('#note-body').fill('Retour à [[accueil]]. Mot rare : zéphyr.')
            page.locator('#note-list .note-btn', has_text='Accueil').click()
            expect(page.locator('#note-title')).to_have_value('Accueil')
            projet = [n for n in stored(page)['notes'] if n['title'] == 'Projet'][0]
            assert projet['body'] == 'Retour à [[accueil]]. Mot rare : zéphyr.' and projet['tags'] == ['travail'], projet
            expect(page.locator('#preview .wikilink:not(.missing)')).to_have_text('Projet')

            # Renommage : tous les liens suivent (libellés conservés).
            page.locator('#note-list .note-btn', has_text='Projet').click()
            set_title(page, 'Chantier')
            expect(page.locator('#note-status')).to_have_text('Note renommée : 1 lien mis à jour.')
            set_title(page, 'accueil')
            expect(page.locator('#note-status')).to_have_text('Une note s\'appelle déjà « accueil »')
            page.locator('#note-list .note-btn', has_text='Accueil').click()
            expect(page.locator('#note-body')).to_have_value('Voir [[Chantier]] et [[Lecture|mes lectures]].\n\n`[[Pas un lien]]`')
            assert sorted(n['title'] for n in stored(page)['notes']) == ['Accueil', 'Chantier']  # le titre refusé est abandonné
            # Renommer puis cliquer aussitôt une autre note : le renommage est enregistré ET le clic aboutit.
            page.locator('#note-list .note-btn', has_text='Chantier').click()
            page.locator('#note-title').fill('Chantier 2')
            page.locator('#note-list .note-btn', has_text='Accueil').click()
            expect(page.locator('#note-title')).to_have_value('Accueil')
            expect(page.locator('#note-body')).to_have_value(re.compile(r'^Voir \[\[Chantier 2\]\]'))
            page.locator('#note-list .note-btn', has_text='Chantier 2').click()
            set_title(page, 'Chantier')
            expect(page.locator('#note-status')).to_have_text('Note renommée : 1 lien mis à jour.')

            # Recherche (accents ignorés), filtre par étiquette, orphelines.
            page.locator('#search').fill('ZEPHYR')
            expect(page.locator('#note-list .note-btn')).to_have_count(1)
            expect(page.locator('#note-list mark')).to_have_text('zéphyr')
            page.locator('#search').fill('#maison')
            expect(page.locator('#note-list .note-btn b')).to_have_text(['Accueil'])
            page.locator('#search').fill('')
            page.locator('#tag-filter').select_option('travail')
            expect(page.locator('#note-list .note-btn')).to_have_count(1)
            expect(page.locator('#note-list .note-btn b')).to_have_text('Chantier')
            page.locator('#tag-filter').select_option('')
            page.locator('#new-note').click()
            expect(page.locator('#note-title')).to_have_value('Note 3')
            page.locator('#only-orphans').check()
            expect(page.locator('#note-list .note-btn b')).to_have_text(['Note 3'])
            page.locator('#only-orphans').uncheck()
            expect(page.locator('#summary')).to_have_text('3 notes · 1 orpheline')

            # Rendu sûr : rien n'est exécuté ni inséré comme HTML.
            page.locator('#note-body').fill('# <script>window.__pwned=1</script>\n<img src=x onerror="window.__pwned=2">\n[[<b onmouseover=x>gras</b>]] **<svg onload=alert(1)>**\n```\n<iframe src="https://evil.example"></iframe>\n```')
            expect(page.locator('#preview h3')).to_contain_text('<script>')
            page.wait_for_timeout(300)
            report = page.evaluate('''() => {
              const p = document.getElementById('preview');
              return { pwned: window.__pwned === undefined ? null : window.__pwned,
                tags: p.querySelectorAll('script,img,svg,iframe,b,style,object').length,
                onattr: [...p.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
                links: p.querySelectorAll('.wikilink').length };
            }''')
            assert report == {'pwned': None, 'tags': 0, 'onattr': 0, 'links': 1}, report
            expect(page.locator('#preview .wikilink')).to_have_text('<b onmouseover=x>gras</b>')
            page.locator('#delete-note').click()  # supprimer (confirmation acceptée)
            expect(page.locator('#note-status')).to_have_text('Note supprimée.')

            # Exports Markdown : archive .zip (un fichier par note) et fichier unique.
            with page.expect_download() as d:
                page.locator('#export-zip').click()
            assert d.value.suggested_filename == 'notegarden-notes.zip'
            z = zipfile.ZipFile(io.BytesIO(pathlib.Path(d.value.path()).read_bytes()))
            assert z.testzip() is None
            assert z.namelist() == ['accueil.md', 'chantier.md'], z.namelist()
            text = z.read('chantier.md').decode('utf-8')
            assert text.startswith('---\ntitle: "Chantier"\ntags: ["travail"]\n') and 'Retour à [[accueil]]' in text, text
            with page.expect_download() as d:
                page.locator('#export-md').click()
            md = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert md.startswith('# Accueil\n\n#maison\n\nVoir [[Chantier]]') and '\n---\n\n# Chantier\n' in md, md
            expect(page.locator('#backup-status')).to_have_text('Fichier Markdown téléchargé (2 notes).')

            # Sauvegarde JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['notes']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'corrompu')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#new-note')).to_be_disabled()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"notegarden","version":1,"notes":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 notes.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#new-note')).to_be_enabled()
            expect(page.locator('#note-list .note-btn')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#note-list .note-btn')).to_have_count(2)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue affichée, 7 langues, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Notas que conversam entre si.')
            ip.locator('#sample').click()
            expect(ip.locator('#note-title')).to_have_value('Horta 2026')
            expect(ip.locator('#wanted')).to_contain_text('Composto (1)')
            expect(ip.locator('#summary')).to_have_text('4 notas · 1 órfã')
            ip.locator('#note-body').press('End')
            ip.locator('#note-body').type(' texto em curso')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#note-body').input_value().endswith('texto em curso'), lang
                expect(ip.locator('#preview')).to_contain_text('texto em curso')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-back')).to_have_text('الروابط العكسية')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#h-back')).to_have_text('Rückverweise')
            expect(ip.locator('#save-state')).to_have_text('Auf diesem Gerät gespeichert')
            ip.locator('#note-tags').fill('nicht ok!')
            ip.locator('#note-tags').blur()
            expect(ip.locator('#note-status')).to_contain_text('Ungültiges Schlagwort')
            saved = ip.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert any(n['body'].endswith('texto em curso') for n in saved['notes'])
            assert not errors, errors
            browser.close()
        print('BROWSER PASS NoteGarden: validation, [[links]] create-on-click, backlinks, rename updates links, search, tag filter, orphans, safe rendering, flush before switching, .zip/.md export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
