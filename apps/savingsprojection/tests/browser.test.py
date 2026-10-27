"""SavingsProjection dans Chromium : plan, scénarios, capitalisation, objectif, graphique, tableau annuel, CSV, SVG, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import re
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-savingsprojection-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_plan(page, initial='', contribution='', years='1', target='', frequency='monthly', timing='end'):
    f = '#plan-form '
    page.locator(f + '[name=initial]').fill(initial)
    page.locator(f + '[name=contribution]').fill(contribution)
    page.locator(f + '[name=frequency]').select_option(frequency)
    page.locator(f + '[name=timing]').select_option(timing)
    page.locator(f + '[name=years]').fill(years)
    page.locator(f + '[name=target]').fill(target)
    page.locator(f + 'button[type=submit]').click()


def add_scenario(page, name, rate):
    page.locator('#scen-form [name=name]').fill(name)
    page.locator('#scen-form [name=rate]').fill(rate)
    page.locator('#scen-form button[type=submit]').click()
    expect(page.locator('#scen-status')).to_contain_text(name)


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')


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
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'
            expect(page.locator('.hyp')).to_contain_text('pas une prévision')
            expect(page.locator('#cards')).to_contain_text('Remplissez votre plan')
            expect(page.locator('#csv')).to_be_disabled()

            # Validation.
            set_plan(page)
            expect(page.locator('#plan-status')).to_have_text('Indiquez un capital de départ ou un versement')
            set_plan(page, initial='100', years='61')
            expect(page.locator('#plan-status')).to_have_text("Durée : nombre entier d'années, de 1 à 60")
            page.locator('#scen-form [name=name]').fill('Trop')
            page.locator('#scen-form [name=rate]').fill('35')
            page.locator('#scen-form button[type=submit]').click()
            expect(page.locator('#scen-status')).to_contain_text('Taux invalide')

            # 100 à 12 % pendant un an, capitalisé chaque mois : 112,67 ; objectif 112 atteint au 12e mois.
            set_plan(page, initial='100', target='112')
            expect(page.locator('#plan-status')).to_contain_text('Ajoutez au moins un scénario')
            add_scenario(page, 'Douze', '12')
            card = page.locator('#cards .card').first
            expect(card).to_contain_text('112,67')
            expect(card).to_contain_text('dont intérêts')
            expect(card.locator('.goal')).to_have_text('Objectif atteint après 1 an.')
            add_scenario(page, 'Zéro', '0')
            expect(page.locator('#cards .card')).to_have_count(2)
            expect(page.locator('#cards .card').first).to_contain_text('Zéro')  # du taux le plus bas au plus haut
            expect(page.locator('#cards .card').first.locator('.goal')).to_contain_text('non atteint')
            expect(page.locator('#chart polyline')).to_have_count(4)  # 2 scénarios, versements, objectif

            # Versements mensuels sur 3 ans : tableau annuel de 3 lignes, versements cumulés exacts.
            set_plan(page, initial='1000', contribution='100', years='3')
            expect(page.locator('#years tbody tr')).to_have_count(3)
            expect(page.locator('#years tbody tr').nth(2)).to_contain_text(re.compile(r'4\s600,00'))
            expect(page.locator('#cards .card').first.locator('.big')).to_contain_text(re.compile(r'4\s600,00'))
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['plan']['contributionCents'] == 10000 and len(saved['scenarios']) == 2, saved

            # Exports CSV et SVG.
            csv = download_text(page, '#csv').strip().splitlines()
            assert len(csv) == 4, csv
            assert csv[0].startswith('"Année";"Versé, cumul (EUR)";"Zéro (0'), csv[0]
            assert csv[3].startswith('"3";"4600.00";"4600.00";'), csv[3]
            svg = download_text(page, '#svg')
            assert svg.startswith('<?xml') and '<polyline' in svg and '<title>' in svg, svg[:200]

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['scenarios']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'null-ish')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add_try = page.locator('#scen-form [name=name]')
            add_try.fill('X'); page.locator('#scen-form [name=rate]').fill('1')
            page.locator('#scen-form button[type=submit]').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'null-ish'
            assert download_text(page, '#export-raw') == 'null-ish'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('"years": 3', '"years": 99').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 scénarios')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#plan-form [name=years]')).to_have_value('3')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#cards .card')).to_have_count(2)
            context.set_offline(False)
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('What if you saved regularly?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#cards .card')).to_have_count(3)
            expect(ip.locator('#cards .card').first).to_contain_text('Low assumption')  # exemple dans la langue affichée
            expect(ip.locator('#cards .card').first.locator('.big')).to_contain_text('$')
            expect(ip.locator('#plan-status')).to_contain_text('mere illustrations')
            ip.locator('#scen-form [name=name]').fill('draft')
            ip.locator('#scen-form [name=rate]').fill('7')
            titles = {'fr': 'Scénarios de taux', 'en': 'Rate scenarios', 'es': 'Escenarios de tipo', 'ar': 'سيناريوهات المعدل', 'pt': 'Cenários de taxa', 'de': 'Zinsszenarien', 'it': 'Scenari di tasso'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-scen')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#years tbody tr')).to_have_count(15)
                expect(ip.locator('#chart polyline')).to_have_count(5)
                expect(ip.locator('#scen-form [name=name]')).to_have_value('draft')
                expect(ip.locator('#scen-form [name=rate]')).to_have_value('7')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('it')
            ip.locator('#louvre-currency').select_option('CHF')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('E se risparmiassi con regolarità?')
            expect(ip.locator('#cards .card').first.locator('.big')).to_contain_text('CHF')
            expect(ip.locator('.cur').first).to_have_text('CHF')
            ip.locator('#scen-form [name=name]').fill('Test')
            ip.locator('#scen-form [name=rate]').fill('abc')
            ip.locator('#scen-form button[type=submit]').click()
            expect(ip.locator('#scen-status')).to_have_text('Tasso non valido: da −20 a 30 %, al massimo 2 decimali (es. 2,5)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS SavingsProjection: validation, monthly compounding, scenarios, goal, chart, yearly table, CSV, SVG, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
