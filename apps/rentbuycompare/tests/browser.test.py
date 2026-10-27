"""RentBuyCompare dans Chromium : validation, calcul location/achat, point d'équilibre, tableau annuel, graphique, CSV, SVG, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-rentbuycompare-v1'
FIELDS = ['price', 'down', 'fees', 'loanRate', 'loanYears', 'appreciation', 'charges', 'maintenance', 'costGrowth', 'rent', 'rentGrowth', 'invest', 'horizon']
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill(page, **values):
    for name in FIELDS:
        if name in values:
            page.locator(f'#form [name={name}]').fill(values[name])


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
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            expect(page.locator('.hyp')).to_contain_text('pas une prévision ni un conseil financier')
            expect(page.locator('#result')).to_contain_text('Saisissez au moins le prix')
            expect(page.locator('#csv')).to_be_disabled()

            # Validation (messages traduits avec le nom du champ).
            page.locator('#form button[type=submit]').click()
            expect(page.locator('#form-status')).to_have_text('Prix du bien : champ obligatoire')
            fill(page, price='abc')
            expect(page.locator('#form-status')).to_have_text('Prix du bien : montant invalide (ex. 1500 ou 1500,50)')
            fill(page, price='100000', down='200000', loanYears='10', rent='500', horizon='10')
            expect(page.locator('#form-status')).to_have_text("L'apport dépasse le prix plus les frais d'achat")
            fill(page, horizon='41')
            expect(page.locator('#form-status')).to_contain_text("Horizon de comparaison (années) : nombre entier d'années, de 1 à 40")
            fill(page, loanRate='25')
            expect(page.locator('#form-status')).to_contain_text('Taux du prêt (% par an) : taux invalide, de 0 à 20 %')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") is None  # rien d'invalide n'est enregistré

            # Taux nuls, sans frais : acheter ne coûte rien, louer coûte 60 000 sur 10 ans ; équilibre dès l'année 1.
            fill(page, loanRate='', down='20000', horizon='10')
            expect(page.locator('#form-status')).to_contain_text('hypothèses enregistrées')
            expect(page.locator('#result .verdict')).to_contain_text(re.compile(r'Sur 10 ans, acheter coûterait 60\s000,00\s€ de moins que louer'))
            expect(page.locator('#result .be')).to_contain_text("à partir de l'année 1")
            expect(page.locator('#result .card.buy')).to_contain_text(re.compile(r'80\s000,00'))  # montant emprunté
            expect(page.locator('#result .card.buy')).to_contain_text(re.compile(r'666,67\s€ / mois'))
            expect(page.locator('#years tbody tr')).to_have_count(11)  # années 0 à 10
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['params']['priceCents'] == 10000000 and saved['params']['horizonYears'] == 10, saved

            # Location nettement moins chère : pas de point d'équilibre.
            fill(page, fees='30000', down='50000', rent='200', loanRate='5', horizon='5')
            expect(page.locator('#result .verdict')).to_contain_text('louer coûterait')
            expect(page.locator('#result .be')).to_contain_text("Pas de point d'équilibre sur 5 ans")

            # Exemple (valeurs d'illustration) : point d'équilibre à l'année 8, graphique et tableau.
            page.locator('#sample').click()
            expect(page.locator('#form-status')).to_contain_text('simples illustrations')
            expect(page.locator('#result .be')).to_contain_text("à partir de l'année 8")
            expect(page.locator('#chart polyline')).to_have_count(2)
            expect(page.locator('#legend')).to_contain_text("Point d'équilibre (année 8)")
            expect(page.locator('#years tbody tr')).to_have_count(26)
            expect(page.locator('#years tr.be-row td').first).to_have_text('8')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile avec résultats : {wide}'

            # Exports CSV et SVG.
            csv = download_text(page, '#csv').strip().splitlines()
            assert len(csv) == 27, len(csv)
            assert csv[0].startswith('"Année";"Loyers (cumul) (EUR)";"Apport placé (EUR)"'), csv[0]
            assert csv[1].startswith('"0";"0.00";"50000.00";"0.00";"0.00"'), csv[1]
            svg = download_text(page, '#svg')
            assert svg.startswith('<?xml') and svg.count('<polyline') == 2 and '<title>' in svg, svg[:200]

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert json.loads(backup)['params']['horizonYears'] == 25
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            fill(page, price='120000', down='10000', loanYears='15', rent='600', horizon='12')
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            assert download_text(page, '#export-raw') == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('"horizonYears": 25', '"horizonYears": 99').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Sauvegarde restaurée')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#form [name=price]')).to_have_value('250000')
            expect(page.locator('#form [name=loanRate]')).to_have_value('3.5')
            expect(page.locator('#result .be')).to_contain_text("l'année 8")

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#years tbody tr')).to_have_count(26)
            expect(page.locator('#form [name=horizon]')).to_have_value('25')
            context.set_offline(False)
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Rent or buy: which costs less?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#result .be')).to_contain_text('from year 8')
            expect(ip.locator('#result .verdict')).to_contain_text('$')
            fill(ip, maintenance='1500x')  # brouillon invalide : conservé et message retraduit
            expect(ip.locator('#form-status')).to_contain_text('Maintenance (per year): invalid amount')
            titles = {'fr': 'Vos hypothèses', 'en': 'Your assumptions', 'es': 'Tus hipótesis', 'ar': 'افتراضاتك', 'pt': 'As suas hipóteses', 'de': 'Ihre Annahmen', 'it': 'Le tue ipotesi'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-form')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#years tbody tr')).to_have_count(26)
                expect(ip.locator('#chart polyline')).to_have_count(2)
                expect(ip.locator('#form [name=maintenance]')).to_have_value('1500x')
                expect(ip.locator('#form [name=price]')).to_have_value('250000')
                expect(ip.locator('#form-status')).to_have_class(re.compile('error'))
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#louvre-currency').select_option('CHF')
            expect(ip.locator('#form-status')).to_contain_text('Instandhaltung (pro Jahr): ungültiger Betrag')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Mieten oder kaufen: Was kostet weniger?')
            expect(ip.locator('#result .verdict')).to_contain_text('CHF')
            expect(ip.locator('.cur').first).to_have_text('CHF')
            expect(ip.locator('#form [name=maintenance]')).to_have_value('1500')  # le brouillon invalide n'a pas été enregistré
            assert not errors, errors
            browser.close()
        print('BROWSER PASS RentBuyCompare: validation, zero-rate case, no break-even, sample break-even, chart, yearly table, CSV, SVG, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
