"""HomeEnergyLog dans Chromium : compteurs, relevés, baisse d'index, remplacement, mois, comparaison, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-homeenergylog-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def reading(page, day, value, reset=False):
    page.locator('#reading-form [name=day]').fill(day)
    page.locator('#reading-form [name=value]').fill(value)
    page.locator('#reading-form [name=reset]').set_checked(reset)
    page.locator('#add-reading').click()


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
            expect(page.locator('#add-reading')).to_be_disabled()

            # Validation du compteur, puis création (gaz : unités m³ ou kWh proposées).
            page.locator('#add-meter').click()
            expect(page.locator('#meter-status')).to_have_text('Nom obligatoire')
            page.locator('#meter-kind').select_option('water')
            expect(page.locator('#meter-unit option')).to_have_text(['m³', 'L'])
            page.locator('#meter-kind').select_option('electricity')
            page.locator('#meter-form [name=name]').fill('Maison')
            page.locator('#meter-form [name=price]').fill('0,25')
            page.locator('#add-meter').click()
            expect(page.locator('#meter-status')).to_have_text('Compteur créé : Maison.')
            expect(page.locator('#unit-label')).to_have_text('kWh')

            # Relevés et consommation entre relevés.
            reading(page, '2025-01-01', '1000')
            expect(page.locator('#reading-status')).to_have_text('Relevé enregistré.')
            reading(page, '2025-01-31', '1300')
            expect(page.locator('#reading-status')).to_contain_text('300 kWh depuis le précédent')
            reading(page, '2025-03-02', '1630')
            reading(page, '2025-03-02', '1700')
            expect(page.locator('#reading-status')).to_have_text('Un relevé existe déjà à cette date')
            # Index en baisse : refusé, sauf compteur remplacé.
            reading(page, '2025-04-01', '1500')
            expect(page.locator('#reading-status')).to_contain_text('Index inférieur au relevé du 2 mars 2025')
            reading(page, '', '1')
            expect(page.locator('#reading-status')).to_have_text('Date invalide')
            reading(page, '2025-04-01', '20', reset=True)
            expect(page.locator('#reading-status')).to_have_text('Relevé enregistré.')
            expect(page.locator('#history tbody tr')).to_have_count(4)
            expect(page.locator('#history tbody tr').first).to_contain_text('Compteur remplacé')
            expect(page.locator('#k-total')).to_have_text('630 kWh')
            expect(page.locator('#k-day')).to_have_text('10,5 kWh/jour')
            expect(page.locator('#k-cost')).to_have_text('157,50 €')  # 630 × 0,25
            expect(page.locator('#months tbody tr')).to_have_count(3)
            expect(page.locator('#months tbody tr').last).to_contain_text('janvier 2025')

            # Comparaison de périodes.
            f = page.locator('#compare-form')
            f.locator('[name=aFrom]').fill('2025-01-31'); f.locator('[name=aTo]').fill('2025-01-01')
            f.locator('[name=bFrom]').fill('2025-01-31'); f.locator('[name=bTo]').fill('2025-03-02')
            page.locator('#run-compare').click()
            expect(page.locator('#compare-status')).to_have_text('La fin de période doit suivre son début')
            f.locator('[name=aFrom]').fill('2025-01-01'); f.locator('[name=aTo]').fill('2025-01-31')
            page.locator('#run-compare').click()
            expect(page.locator('#compare-result .verdict')).to_have_text('La période B consomme 10 % de plus par jour que la période A.')

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert '"Compteur";"Du";"Au";"Jours";"Consommation (kWh)"' in csv and '"Maison";"2025-01-01";"2025-01-31";"30";"300";"10";"75";"Normal"' in csv, csv
            assert '"Compteur remplacé"' in csv

            # Export JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['meters'][0]['readings']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#meter-form [name=name]').fill('Autre')
            page.locator('#add-meter').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"homeenergylog","version":1,"meters":[{"id":"bad"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 compteur')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-total')).to_have_text('630 kWh')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#history tbody tr')).to_have_count(4)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Your meters, one reading at a time.')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#meter-status')).to_have_text('Example added: two meters over one year.')
            expect(ip.locator('#k-cost')).to_contain_text('US$')
            expect(ip.locator('#compare-result .verdict')).to_contain_text('Period B uses')
            ip.locator('#reading-form [name=value]').fill('99999')  # saisie en cours
            ip.locator('#meter-form [name=name]').fill('Garage')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#history tbody tr')).to_have_count(14)
                expect(ip.locator('#compare-result .verdict')).to_be_visible()
                assert ip.locator('#reading-form [name=value]').input_value() == '99999', lang
                assert ip.locator('#meter-form [name=name]').input_value() == 'Garage', lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-summary')).to_have_text('الملخص')
            ip.locator('#louvre-lang').select_option('it')
            expect(ip.locator('#h-summary')).to_have_text('Riepilogo')
            ip.locator('#louvre-currency').select_option('EUR')
            expect(ip.locator('#k-cost')).to_contain_text('€')
            expect(ip.locator('#cur-symbol')).to_have_text('€')
            ip.locator('#reading-form [name=value]').fill('1')
            ip.locator('#add-reading').click()
            expect(ip.locator('#reading-status')).to_contain_text('Esiste già una lettura')  # même date que le dernier relevé de l'exemple
            assert not errors, errors
            browser.close()
        print('BROWSER PASS HomeEnergyLog: validation, meters, units, readings, decrease, reset, per day, months, compare, cost, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
