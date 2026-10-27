"""PaintEstimator dans Chromium : saisie, validation, ouvertures, combinaison de pots, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-paintestimator-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill(page, form, **values):
    for name, value in values.items():
        page.locator(f'#{form} [name={name}]').fill(value)


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
            page.on('dialog', lambda d: d.accept(d.default_value or 'Projet') if d.type == 'prompt' else d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'
            expect(page.locator('#result-empty')).to_be_visible()

            # Validation : nom de pièce vide, rendement absent, ouverture trop grande.
            page.locator('#add-room').click()
            expect(page.locator('#room-status')).to_have_text('Nom obligatoire')
            fill(page, 'settings-form', coats='2', coverage='', margin='0')
            page.locator('#save-settings').click()
            expect(page.locator('#settings-status')).to_contain_text('Rendement invalide')

            # Parcours principal : réglages, deux pots, une pièce et sa porte.
            fill(page, 'settings-form', coats='2', coverage='10', margin='0')
            page.locator('#save-settings').click()
            expect(page.locator('#settings-status')).to_have_text('Réglages enregistrés.')
            fill(page, 'can-form', volume='2,5', price='25')
            page.locator('#add-can').click()
            expect(page.locator('#can-status')).to_contain_text('2,5 L')
            fill(page, 'can-form', volume='10', price='80')
            page.locator('#add-can').click()
            expect(page.locator('#can-list li')).to_have_count(2)
            fill(page, 'can-form', volume='10', price='70')
            page.locator('#add-can').click()
            expect(page.locator('#can-status')).to_have_text('Cette contenance existe déjà')
            fill(page, 'room-form', name='Chambre', perimeter='14', height='2,5', ceiling='')
            page.locator('#add-room').click()
            expect(page.locator('#room-status')).to_have_text('Pièce ajoutée : Chambre.')
            expect(page.locator('#k-area')).to_have_text('35 m²')
            fill(page, 'opening-form', width='1', height='2', count='1')
            page.locator('#add-opening').click()
            expect(page.locator('#k-area')).to_have_text('33 m²')
            expect(page.locator('#k-liters')).to_have_text('6,6 L')  # 33 m² × 2 couches ÷ 10 m²/L
            expect(page.locator('#k-cost')).to_have_text('75,00 €')  # 3 × 2,5 L (75 €) plutôt que 10 L (80 €)
            expect(page.locator('#combo')).to_contain_text('3 pots de 2,5 L')
            expect(page.locator('#singles li')).to_have_count(2)
            fill(page, 'opening-form', width='10', height='2', count='5')
            page.locator('#add-opening').click()
            expect(page.locator('#opening-status')).to_contain_text('dépassent la surface des murs')
            expect(page.locator('#k-area')).to_have_text('33 m²')

            # Marge de 10 % : 7,26 L -> 3 × 2,5 L toujours.
            fill(page, 'settings-form', margin='10')
            page.locator('#save-settings').click()
            expect(page.locator('#k-liters')).to_have_text('7,26 L')

            # Export CSV (en-têtes traduits, nombres à la française).
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert '"Pièce";"Murs (m²)"' in csv and '"Chambre";"35";"2";"0";"33"' in csv and '"Coût total (EUR)";"";"";"75"' in csv, csv

            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['app'] == 'paintestimator' and len(saved['projects'][0]['rooms']) == 1

            # Export JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['projects'][0]['cans'][0]['priceCents'] == 2500
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            fill(page, 'room-form', name='Bureau', perimeter='12', height='2,5')
            page.locator('#add-room').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            # Une sauvegarde invalide est refusée et la protection reste active.
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"paintestimator","version":1,"projects":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 projet')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-cost')).to_have_text('75,00 €')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#k-area')).to_have_text('33 m²')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, 7 langues complètes, sans débordement, RTL, devise, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('The right amount of paint, at the best price.')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#project-status')).to_have_text('Example added.')
            expect(ip.locator('#project-select option')).to_have_text('Example: living room and bedroom')
            expect(ip.locator('#k-cost')).to_have_text('US$248.70')  # 10 L + 3 × 2,5 L (en-GB affiche « US$ »)
            ip.locator('#room-form [name=name]').fill('Atelier')  # saisie en cours
            ip.locator('#settings-form [name=coverage]').fill('12')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#room-list > li')).to_have_count(2)
                expect(ip.locator('#combo .combo-line')).to_have_count(4)
                assert ip.locator('#room-form [name=name]').input_value() == 'Atelier', lang
                assert ip.locator('#settings-form [name=coverage]').input_value() == '12', lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-result')).to_have_text('التقدير')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#h-result')).to_have_text('Schätzung')
            ip.locator('#louvre-currency').select_option('CHF')
            expect(ip.locator('#k-cost')).to_contain_text('CHF')
            expect(ip.locator('#cur-symbol')).to_have_text('CHF')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Die richtige Farbmenge zum besten Preis.')
            ip.locator('#can-form [name=volume]').fill('abc'); ip.locator('#can-form [name=price]').fill('1')
            ip.locator('#add-can').click()
            expect(ip.locator('#can-status')).to_have_text('Ungültiger Inhalt (in Litern, z. B. 2,5)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PaintEstimator: validation, rooms, openings, coats, coverage, margin, best can mix, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
