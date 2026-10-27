"""RegexWorkbench dans Chromium : syntaxe, correspondances, groupes nommés, drapeaux, remplacement, explication,
Worker arrêté au-delà du délai (retour arrière catastrophique), bibliothèque, sauvegarde, stockage corrompu,
hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
import time
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-regexworkbench-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


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
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#count')).to_have_text('Saisissez une expression.')

            # Validation : syntaxe, délai.
            page.locator('#pattern').fill('(ab')
            expect(page.locator('#pattern-status')).to_contain_text('Erreur de syntaxe')
            page.locator('#timeout').fill('50')
            page.locator('#timeout').dispatch_event('change')
            expect(page.locator('#backup-status')).to_have_text('Délai : nombre entier de 100 à 10000 ms')
            expect(page.locator('#timeout')).to_have_value('1000')

            # Parcours principal : groupes nommés, positions, drapeaux, explication.
            page.locator('#pattern').fill(r'(?<y>\d{4})-(\d{2})')
            page.locator('#subject').fill('du 2026-10 au 2027-01 et 1999-1')
            expect(page.locator('#count')).to_have_text('2 correspondances · 2 groupes')
            expect(page.locator('#highlight mark')).to_have_text(['2026-10', '2027-01'])
            expect(page.locator('#matches tr')).to_have_count(2)
            expect(page.locator('#matches tr').first).to_contain_text('1 · y 2026')
            expect(page.locator('#matches tr').first).to_contain_text('3–10')
            expect(page.locator('#explain')).to_contain_text('Début du groupe « y » (n° 1)')
            expect(page.locator('#explain')).to_contain_text("Répète l'élément précédent exactement 4 fois")
            expect(page.locator('#flags-view')).to_have_text('/g')
            page.locator('#flag-g').uncheck()
            expect(page.locator('#count')).to_have_text('1 correspondance · 2 groupes')
            expect(page.locator('#flags-view')).to_have_text('/')
            page.locator('#flag-g').check()
            # Remplacement : aperçu surligné.
            page.locator('#replacement').fill('$2/$<y>')
            expect(page.locator('#replaced')).to_have_text('du 10/2026 au 01/2027 et 1999-1')
            expect(page.locator('#replaced mark.rep')).to_have_count(2)

            # Retour arrière catastrophique : le Worker est arrêté au bout du délai, la page reste réactive.
            page.locator('#timeout').fill('300')
            page.locator('#timeout').dispatch_event('change')
            expect(page.locator('#backup-status')).to_have_text('Délai maximal : 300 ms.')
            assert page.evaluate('() => document.documentElement.dataset.rwStopped || "0"') == '0'
            page.locator('#subject').fill('a' * 34 + '!')
            page.locator('#pattern').fill('^(a+)+$')
            expect(page.locator('#explain-warn')).to_be_visible()
            t0 = time.time()
            assert page.evaluate('() => 6 * 7') == 42  # le fil principal répond pendant que le Worker calcule
            assert time.time() - t0 < 10
            expect(page.locator('#timeout-alert')).to_be_visible(timeout=15000)
            expect(page.locator('#timeout-alert')).to_contain_text('300 ms')
            expect(page.locator('#pattern-status')).to_have_text('Arrêtée : délai maximal dépassé.')
            assert int(page.evaluate('() => document.documentElement.dataset.rwStopped')) >= 1  # Worker arrêté (terminate)
            # Un nouveau Worker prend le relais.
            page.locator('#pattern').fill('^a+')
            expect(page.locator('#count')).to_have_text('1 correspondance · 0 groupe')
            expect(page.locator('#timeout-alert')).to_be_hidden()

            # Bibliothèque : enregistrer, charger, supprimer.
            page.locator('#pattern').fill(r'\b\w+@\w+\.\w+\b')
            page.locator('#lib-name').fill('Courriel')
            page.locator('#lib-save').click()
            expect(page.locator('#lib-status')).to_have_text('Enregistrée : Courriel.')
            page.locator('#pattern').fill('x')
            page.locator('#library li', has_text='Courriel').get_by_role('button', name='Charger « Courriel »').click()
            expect(page.locator('#pattern')).to_have_value(r'\b\w+@\w+\.\w+\b')
            page.locator('#lib-name').fill('A effacer')
            page.locator('#lib-save').click()
            expect(page.locator('#library li')).to_have_count(2)
            page.get_by_role('button', name='Supprimer « A effacer »').click()
            expect(page.locator('#library li')).to_have_count(1)

            # Leçon : la dernière frappe est incluse dans la sauvegarde exportée aussitôt.
            page.locator('#subject').fill('contact: ana@exemple.fr')
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert data['draft']['text'] == 'contact: ana@exemple.fr' and data['timeoutMs'] == 300 and len(data['items']) == 1, data
            expect(page.locator('#count')).to_have_text('1 correspondance · 0 groupe')

            # Stockage corrompu : rien n'est écrasé ; on peut tester ; restauration possible.
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'corrompu')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#pattern').fill('o')
            page.locator('#subject').fill('foo')
            expect(page.locator('#count')).to_have_text('2 correspondances · 0 groupe')
            page.wait_for_timeout(700)
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            expect(page.locator('#lib-save')).to_be_disabled()
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"regexworkbench","version":1,"items":[],"draft":{},"timeoutMs":1000}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 expression.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#subject')).to_have_value('contact: ana@exemple.fr')
            expect(page.locator('#highlight mark')).to_have_text(['ana@exemple.fr'])

            # Hors ligne (Worker compris).
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#highlight mark')).to_have_text(['ana@exemple.fr'])
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Testen Sie einen Ausdruck, bevor Sie ihn einsetzen.')
            ip.locator('#sample').click()
            expect(ip.locator('#count')).to_have_text('4 Treffer · 3 Gruppen')
            expect(ip.locator('#replaced')).to_contain_text('03.11.2026')
            expect(ip.locator('#library li')).to_have_count(3)
            ip.locator('#pattern').press('End')
            ip.locator('#pattern').type('T')  # saisie en cours
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#pattern').input_value().endswith('})T'), lang
                assert ip.locator('#flag-g').is_checked(), lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#explain')).to_contain_text('رقم (0-9)')
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#explain')).to_contain_text('A digit (0-9)')
            expect(ip.locator('#count')).to_have_text('0 matches · 3 groups')
            ip.locator('#pattern').fill('[')
            expect(ip.locator('#pattern-status')).to_contain_text('Syntax error')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS RegexWorkbench: syntax, matches, named groups, flags, replacement preview, explanation, Worker stopped on timeout (catastrophic backtracking), library, flush before export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
