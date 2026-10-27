"""DescriptiveStats dans Chromium : saisie, séparateurs décimaux, valeurs manquantes, quartiles, CSV, histogramme, exports, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-descriptivestats-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_bytes().decode('utf-8')


def stat(page, key):
    return page.locator(f'#results tr[data-stat="{key}"] td')


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
            wide0 = page.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
          [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
            .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
            assert not wide0, f'débordement mobile : {wide0}'
            expect(page.locator('#decimal')).to_have_value(',')  # français : virgule décimale par défaut
            page.locator('#export-csv').click()
            expect(page.locator('#results-status')).to_have_text('Aucune valeur numérique à analyser')

            # Valeurs de référence (2, 4, 4, 4, 5, 5, 7, 9).
            page.locator('#values').fill('2\n4\n4\n4\n5\n5\n7\n9')
            expect(stat(page, 'n')).to_have_text('8')
            expect(stat(page, 'mean')).to_have_text('5')
            expect(stat(page, 'median')).to_have_text('4,5')
            expect(stat(page, 'sdSample')).to_have_text('2,138')
            expect(stat(page, 'sdPop')).to_have_text('2')
            expect(stat(page, 'q3')).to_have_text('5,5')
            expect(stat(page, 'skewness')).to_have_text('0,818')
            expect(stat(page, 'kurtosis')).to_have_text('0,941')
            expect(page.locator('#results tr[data-stat="q1"] th')).to_have_text('Premier quartile Q1 (type 7)')
            page.locator('#method').select_option('tukey')
            expect(stat(page, 'q3')).to_have_text('6')
            expect(page.locator('#method-help')).to_contain_text('moitiés')
            page.locator('#method').select_option('type6')
            expect(stat(page, 'q3')).to_have_text('6,5')
            page.locator('#digits').select_option('6')
            expect(stat(page, 'sdSample')).to_have_text('2,13809')

            # Valeurs manquantes et illisibles signalées ; changement de séparateur décimal.
            page.locator('#values').fill('3,5\nNA\n\n4\n1.5\nabc')
            expect(page.locator('#parse-status')).to_have_text('2 valeurs lues. 2 valeurs manquantes ignorées. 2 valeurs illisibles ignorées : « 1.5 » (ligne 5), « abc » (ligne 6).')
            expect(stat(page, 'missing')).to_have_text('2')
            expect(stat(page, 'skewness')).to_have_text('—')
            page.locator('#decimal').select_option('.')
            expect(page.locator('#parse-status')).to_contain_text('« 3,5 » (ligne 1)')
            expect(page.locator('#parse-status')).to_contain_text('2 valeurs lues.')
            expect(stat(page, 'mean')).to_have_text('2,75')
            page.locator('#decimal').select_option(',')

            # Import CSV à plusieurs colonnes : en-tête détecté, choix de la colonne.
            csv = 'Année;Rendement;Volume\n2020;1,5;100\n2021;NA;250\n2022;-2,25;175\n2023;3;\n'
            page.locator('#csv-file').set_input_files({'name': 'marche.csv', 'mimeType': 'text/csv', 'buffer': csv.encode('utf-8')})
            expect(page.locator('#data-status')).to_contain_text('« marche.csv » importé (3 colonnes)')
            expect(page.locator('#column-field')).to_be_visible()
            page.locator('#column').select_option(label='Rendement')
            expect(page.locator('#series-name')).to_have_value('Rendement')
            expect(stat(page, 'n')).to_have_text('3')
            expect(stat(page, 'mean')).to_have_text('0,75')
            page.locator('#column').select_option(label='Volume')
            expect(stat(page, 'mean')).to_have_text('175')
            expect(stat(page, 'missing')).to_have_text('1')

            # Histogramme : classes choisies, SVG téléchargeable.
            page.locator('#sample').click()
            expect(stat(page, 'n')).to_have_text('23')
            expect(stat(page, 'mean')).to_have_text('0,617391')
            page.locator('#bins').select_option('5')
            expect(page.locator('#hist svg rect[fill="#c2410c"]')).to_have_count(5)
            svg = download_text(page, '#export-svg')
            assert svg.startswith('<?xml') and 'Rendements mensuels fictifs (%)' in svg, svg[:200]
            out = download_text(page, '#export-csv')
            assert out.startswith('﻿Statistique;Valeur\r\nEffectif (n);23\r\n'), out[:80]
            assert 'Moyenne;0,6173913043478' in out, out

            # Séries enregistrées : enregistrer, recharger.
            page.locator('#save-series').click()
            expect(page.locator('#data-status')).to_have_text('Série « Rendements mensuels fictifs (%) » enregistrée.')
            page.locator('#clear').click()
            expect(page.locator('#results .empty')).to_be_visible()
            page.get_by_role('button', name='Charger Rendements mensuels fictifs (%)').click()
            expect(stat(page, 'n')).to_have_text('23')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['settings'] == {'decimal': ',', 'method': 'type6', 'bins': '5', 'digits': 6}, saved['settings']
            assert saved['series'][0]['items'][22] is None

            # Sauvegarde, stockage corrompu, restauration.
            backup = download_text(page, '#export')
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'illisible')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#values').fill('1\n2\n3')
            expect(stat(page, 'mean')).to_have_text('2')  # le calcul reste possible en mode protégé
            page.locator('#save-series').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'illisible'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"descriptivestats","version":1,"settings":{},"series":[]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 série.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#saved li')).to_have_count(1)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#saved li')).to_have_count(1)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : point décimal pour l'anglais, saisie conservée, 7 langues sans débordement.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Descriptive statistics for a series, in one paste')
            expect(ip.locator('#decimal')).to_have_value('.')
            ip.locator('#sample').click()
            expect(ip.locator('#values')).to_have_value(re.compile(r'^1\.2\n-0\.8\n'))
            expect(stat(ip, 'mean')).to_have_text('0.617')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#decimal')).to_have_value('.')  # la saisie existante garde son séparateur
                expect(stat(ip, 'n')).to_have_text('23')
                expect(ip.locator('#hist svg')).to_have_count(1)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent
            expect(stat(ip, 'mean')).to_have_text('0,617')  # italien : virgule à l'affichage
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#results tr[data-stat="sdSample"] th')).to_have_text('Standardabweichung (Stichprobe, n − 1)')
            ip.locator('#clear').click()
            ip.locator('#louvre-lang').select_option('es')
            expect(ip.locator('#decimal')).to_have_value(',')  # saisie vide : le séparateur suit la langue
            ip.locator('#values').fill('1,5\n2,5')
            expect(stat(ip, 'mean')).to_have_text('2')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS DescriptiveStats: reference values, quartile methods, decimals, missing/invalid values, CSV columns, histogram/SVG, CSV export, saved series, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
