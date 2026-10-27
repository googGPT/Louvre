"""JetLagPlanner dans Chromium : validation, programme, exports .ics/SVG/JSON, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-jetlagplanner-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_plan(page, **over):
    values = {'name': 'Tokyo', 'homeZone': 'Europe/Paris', 'destZone': 'Asia/Tokyo', 'departure': '2026-11-20',
              'bedtime': '23:00', 'wake': '07:00', 'stepMin': '60', 'before': '3', 'after': '5'}
    values.update({k: v for k, v in over.items() if k != 'direction'})
    for k, v in values.items():
        page.locator(f'#plan-form [name={k}]').fill(v)
    page.locator('#plan-form [name=direction]').select_option(over.get('direction', 'auto'))


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='fr-FR', timezone_id='Europe/Paris')
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            expect(page.locator('.medical')).to_contain_text('mélatonine')

            # Saisie invalide refusée.
            page.locator('#save-plan').click()
            expect(page.locator('#form-status')).to_have_text('Nom du plan obligatoire')
            fill_plan(page, destZone='Mars/Base')
            page.locator('#save-plan').click()
            expect(page.locator('#form-status')).to_contain_text('Fuseau inconnu')
            fill_plan(page, stepMin='500')
            page.locator('#save-plan').click()
            expect(page.locator('#form-status')).to_contain_text('de 0 à 180 minutes')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") is None

            # Paris -> Tokyo, 1 h par jour, 3 jours avant et 5 après : 8 h à avancer, atteint à J+4.
            fill_plan(page)
            page.locator('#save-plan').click()
            expect(page.locator('#form-status')).to_have_text('Plan « Tokyo » enregistré.')
            expect(page.locator('#k-diff')).to_have_text('+8 h')
            expect(page.locator('#k-shift')).to_have_text('Avancer de 8 h')
            expect(page.locator('#k-reached')).to_have_text('J+4')
            rows = page.locator('#days-table tbody tr')
            expect(rows).to_have_count(9)
            expect(rows.nth(0)).to_contain_text('22:00 → 06:00')  # heure d'origine
            expect(rows.nth(0)).to_contain_text('06:00 → 14:00')  # heure de destination
            expect(rows.nth(7)).to_contain_text('23:00 → 07:00')
            expect(page.locator('#days-table td.here')).to_have_count(9)
            expect(page.locator('#chart svg rect.bar')).to_have_count(11)  # 9 nuits ; les deux qui passent minuit (heure de destination) sont coupées en deux
            expect(page.locator('#clocks .clock')).to_have_count(2)
            expect(page.locator('#summary')).to_contain_text('à partir de J+4')

            # Sens imposé et décalage nul : le programme le signale.
            fill_plan(page, stepMin='0')
            page.locator('#save-plan').click()
            expect(page.locator('#k-days')).to_have_text('∞')
            expect(page.locator('#summary')).to_contain_text('Décalage de 0 min par jour')
            fill_plan(page, direction='delay')
            page.locator('#save-plan').click()
            expect(page.locator('#k-shift')).to_have_text('Retarder de 16 h')
            fill_plan(page)
            page.locator('#save-plan').click()
            expect(page.locator('#k-reached')).to_have_text('J+4')

            # Export agenda : 9 nuits en UTC ; J-3 = coucher 22:00 à Paris le 17 novembre = 21:00 UTC.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 9, ics
            assert 'DTSTART:20261117T210000Z' in ics and 'SUMMARY:Sommeil prévu (J−3)' in ics, ics
            expect(page.locator('#res-status')).to_have_text('Agenda téléchargé : 9 nuits.')
            with page.expect_download() as d:
                page.locator('#export-svg').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8').startswith('<?xml')

            # Exemple : un second plan, généré dans la langue affichée.
            page.locator('#sample').click()
            expect(page.locator('#plan-status')).to_contain_text('Exemple ajouté')
            expect(page.locator('#plan-select option')).to_have_count(3)  # 2 plans + « nouveau plan »
            expect(page.locator('#k-diff')).to_have_text(re.compile(r'^\+[78] h$'))  # dans 3 semaines : 7 h l'été, 8 h l'hiver
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert [x['name'] for x in saved['plans']] == ['Tokyo', 'Paris → Tokyo']

            # Export puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['plans']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            fill_plan(page, name='Autre')
            page.locator('#save-plan').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'pas du json'
            # Une sauvegarde invalide est refusée et la protection reste active.
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"jetlagplanner","version":1,"plans":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 plans')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#days-table tbody tr')).to_have_count(9)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : navigateur anglais détecté, puis les 7 langues ; la saisie en cours est conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', timezone_id='America/New_York')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('When to sleep before and after the flight?')
            ip.locator('#sample').click()
            expect(ip.locator('#plan-status')).to_contain_text('Example added')
            expect(ip.locator('#k-diff')).to_have_text(re.compile(r'^\+[78] h$'))
            ip.locator('#plan-form [name=name]').fill('Draft in progress')
            titles = {'fr': 'Programme', 'en': 'Schedule', 'es': 'Programa', 'ar': 'البرنامج', 'pt': 'Programa', 'de': 'Programm', 'it': 'Programma'}
            for lang, title in titles.items():
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-res')).to_have_text(title)
                expect(ip.locator('#days-table tbody tr')).to_have_count(9)
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#plan-form [name=name]').input_value() == 'Draft in progress', lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent : langue seulement
            # Erreur du moteur traduite.
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#plan-form [name=destZone]').fill('Nowhere/City')
            ip.locator('#save-plan').click()
            expect(ip.locator('#form-status')).to_contain_text('Unbekannte Zeitzone')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS JetLagPlanner: validation, schedule, direction, zero shift, ics, svg, sample, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
