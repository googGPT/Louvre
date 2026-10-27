"""SampleSizeCalc dans Chromium : trois calculs, formules, validation, scénarios, exports, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-samplesizecalc-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_bytes().decode('utf-8')


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
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            big = page.locator('#result .big strong')

            # Valeur classique : 95 %, ± 5 points, p = 50 % -> 385.
            expect(big.first).to_have_text('385')
            expect(page.locator('#steps')).to_contain_text('1,9600')
            expect(page.locator('#steps')).to_contain_text('384,15')
            # Marge 4 points, population 1 000, taux de réponse 40 % -> 376 réponses, 940 contacts.
            page.locator('#one-margin').fill('4')
            expect(big.first).to_have_text('601')
            page.locator('#one-population').fill('1000')
            expect(big.first).to_have_text('376')
            expect(page.locator('#steps')).to_contain_text('Correction pour population finie (Cochran)')
            page.locator('#one-response').fill('40')
            expect(big.nth(1)).to_have_text('940')
            expect(page.locator('#result')).to_contain_text('personnes à contacter (taux de réponse 40 %)')

            # Validation : proportion hors bornes, saisie illisible ; avertissement de marge trop large.
            page.locator('#one-p').fill('0')
            expect(page.locator('#calc-status')).to_have_text('Proportion attendue : strictement entre 0 et 100 %')
            expect(page.locator('#save')).to_be_disabled()
            page.locator('#one-p').fill('abc')
            expect(page.locator('#calc-status')).to_have_text('Proportion attendue : strictement entre 0 et 100 %')
            page.locator('#one-p').fill('3')
            expect(page.locator('#warns')).to_contain_text('La marge dépasse la proportion attendue')
            page.locator('#one-p').fill('50')
            expect(page.locator('#warns li')).to_have_count(0)
            page.locator('#one-confidence').fill('100')
            expect(page.locator('#calc-status')).to_have_text('Niveau de confiance : de 50 à 99,99 %')
            page.locator('#one-confidence').fill('95')
            page.locator('#save').click()
            expect(page.locator('#save-status')).to_have_text('Scénario « Proportion — 95 %, ± 4 points » enregistré.')

            # Deux proportions : 50 % contre 60 % -> 388 par groupe ; 408 avec correction ; 305 en unilatéral.
            page.locator('#tab-two').click()
            expect(page.locator('#panel-two')).to_be_visible()
            expect(big.first).to_have_text('388')
            expect(big.nth(1)).to_have_text('776')
            page.locator('#t-cc').check()
            expect(big.first).to_have_text('408')
            page.locator('#t-cc').uncheck()
            page.locator('#t-sides').select_option('1')
            expect(big.first).to_have_text('305')
            expect(page.locator('#warns')).to_contain_text('Test unilatéral')
            page.locator('#t-sides').select_option('2')
            page.locator('#t-p2').fill('50')
            expect(page.locator('#calc-status')).to_have_text('Les deux proportions doivent être différentes')
            page.locator('#t-p1').fill('40')
            page.locator('#t-p2').fill('60')
            expect(big.first).to_have_text('97')
            page.locator('#save').click()
            expect(page.locator('#scenarios li')).to_have_count(2)

            # Clavier : flèche gauche depuis l'onglet « Deux proportions » -> « Marge obtenue ».
            page.locator('#tab-two').focus()
            page.keyboard.press('ArrowLeft')
            expect(page.locator('#tab-margin')).to_have_attribute('aria-selected', 'true')
            expect(page.locator('#tab-margin')).to_be_focused()
            expect(big.first).to_have_text('± 4,9')
            expect(page.locator('#result')).to_contain_text('va de 45,1 % à 54,9 %')
            page.locator('#m-population').fill('300')
            expect(page.locator('#calc-status')).to_have_text('Plus de réponses que de personnes dans la population')
            page.locator('#m-population').fill('')

            # Charger un scénario remplit les champs et change d'onglet.
            page.get_by_role('button', name='Charger Proportion — 95 %, ± 4 points').click()
            expect(page.locator('#tab-one')).to_have_attribute('aria-selected', 'true')
            expect(page.locator('#one-population')).to_have_value('1000')
            expect(big.first).to_have_text('376')

            # Export CSV (en-têtes traduits) et sauvegarde.
            csv = download_text(page, '#export-csv').replace('\u202f', ' ').replace('\u00a0', ' ')  # espaces insécables d'Intl
            assert csv.startswith('﻿Scénario,Calcul,Hypothèses,Résultat,Personnes à contacter\r\n'), csv[:120]
            assert '"Proportion — 95 %, ± 4 points",Une proportion,' in csv and ',376 réponses complètes nécessaires,940\r\n' in csv, csv
            backup = download_text(page, '#export')
            data = json.loads(backup)
            assert [s['kind'] for s in data['scenarios']] == ['one', 'two']
            assert data['scenarios'][0]['inputs'] == {'confidence': 95, 'margin': 4, 'p': 50, 'population': 1000, 'response': 40, 'deff': 1}

            # Stockage corrompu : rien n'est écrasé ; faux fichier refusé ; restauration.
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#save').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"samplesizecalc","version":1,"scenarios":[{"id":"sc-000001","name":"x","kind":"one","inputs":{}}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 scénarios.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#scenarios li')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#scenarios li')).to_have_count(2)
            expect(big.first).to_have_text('385')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue affichée, 7 langues sans débordement, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('How many responses do you really need?')
            ip.locator('#sample').click()
            expect(ip.locator('#scenarios li')).to_have_count(3)
            expect(ip.locator('#scenarios')).to_contain_text('Student survey (12,000 enrolled)')
            ib = ip.locator('#result .big strong')
            expect(ib.first).to_have_text('373')  # 384,15 / (1 + 383,15 / 12 000) = 372,3
            expect(ib.nth(1)).to_have_text('1,066')
            ip.locator('#one-deff').fill('1.5')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#one-deff')).to_have_value('1.5')
                expect(ib.first).to_have_text('550')  # effet de plan 1,5 conservé : 576,2 / (1 + 575,2 / 12 000) = 549,9
                expect(ip.locator('#scenarios li')).to_have_count(3)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent : pas de menu devise
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#result')).to_contain_text('people to contact (response rate 35%)')
            ip.locator('#louvre-lang').select_option('de')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Wie viele Antworten braucht man wirklich?')
            ip.locator('#one-margin').fill('70')
            expect(ip.locator('#calc-status')).to_have_text('Fehlermarge: über 0 und höchstens 50 Punkte')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS SampleSizeCalc: one proportion, FPC, response rate, margin, two proportions, formulas, validation, keyboard tabs, scenarios, CSV, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
