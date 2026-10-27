"""StudyRecall dans Chromium : fiches, révision, boîtes, sauvegarde, stockage corrompu, hors ligne, mobile."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-studyrecall-v1'


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
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            expect(page.locator('#flash-empty')).to_contain_text('premières fiches')
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Ajout d'une fiche (validation : question obligatoire).
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_contain_text('Question obligatoire')
            page.locator('[name=front]').fill('2 + 2 ?')
            page.locator('[name=back]').fill('4')
            page.locator('[name=deck]').fill('Maths')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_contain_text('Fiche ajoutée')
            expect(page.locator('#k-due')).to_have_text('1')

            # Révision : réponse cachée puis révélée, « je savais » -> boîte 2, plus rien à réviser.
            expect(page.locator('#flash-q')).to_have_text('2 + 2 ?')
            expect(page.locator('#flash-a')).to_be_hidden()
            page.locator('#reveal').click()
            expect(page.locator('#flash-a')).to_have_text('4')
            page.locator('#known').click()
            expect(page.locator('#session-status')).to_contain_text('Prochaine révision')
            expect(page.locator('#flash-empty')).to_contain_text('plus rien à réviser')
            expect(page.locator('#k-today')).to_have_text('1')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['cards'][0]['box'] == 2 and saved['cards'][0]['reviews'] == 1

            # Exemples + raccourcis clavier : Espace puis 2 (« à revoir ») garde la fiche en boîte 1.
            page.locator('#sample').click()
            expect(page.locator('#k-due')).to_have_text('3')
            page.locator('body').click(position={'x': 5, 'y': 5})
            page.keyboard.press(' ')
            expect(page.locator('#flash-a')).to_be_visible()
            page.keyboard.press('2')
            expect(page.locator('#k-due')).to_have_text('2')

            # Recherche et modification.
            page.locator('#search').fill('canberra')
            expect(page.locator('#cards li')).to_have_count(1)
            page.locator('#cards li button', has_text='Modifier').click()
            page.locator('[name=back]').fill('Canberra (pas Sydney)')
            page.locator('#save').click()
            expect(page.locator('#cards li')).to_contain_text('pas Sydney')
            page.locator('#search').fill('')

            # Export JSON puis restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['cards']) == 4

            # Stockage corrompu : alerte, rien n'est écrasé, restauration possible.
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('[name=front]').fill('Q')
            page.locator('[name=back]').fill('R')
            page.locator('#save').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('4 fiche(s)')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#count')).to_have_text('(4)')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors
            browser.close()
        print('BROWSER PASS StudyRecall: add/validate, reveal, Leitner boxes, shortcuts, edit, export/restore, corrupted storage, offline, mobile')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
