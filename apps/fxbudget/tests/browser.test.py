"""FXBudget dans Chromium : voyage, taux saisis, conversions exactes, restes par catégorie et par jour, protections, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-fxbudget-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
SP = '[\\s\\u00a0\\u202f]'  # espaces insécables des formats français


def money(text):
    """Motif tolérant aux espaces insécables : '2 000,00 €' -> regex."""
    return re.compile(re.escape(text).replace('\\ ', SP))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def day(offset=0):
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


def trip(page, name, start, end, budget, food=''):
    page.locator('#trip-form [name=name]').fill(name)
    page.locator('#trip-form [name=start]').fill(start)
    page.locator('#trip-form [name=end]').fill(end)
    page.locator('#trip-form [name=budget]').fill(budget)
    if food:
        if page.locator('#cat-budgets').get_attribute('open') is None:
            page.locator('#cat-budgets summary').click()
        page.locator('[name=cat-food]').fill(food)
    page.locator('#save-trip').click()


def rate(page, cur, direction, value, date):
    page.locator('#rate-form [name=currency]').fill(cur)
    page.locator('#rate-dir').select_option(direction)
    page.locator('#rate-form [name=value]').fill(value)
    page.locator('#rate-form [name=date]').fill(date)
    page.locator('#rate-form button').click()


def expense(page, cur, amount, cat='food', date=None, label=''):
    page.locator('#exp-form [name=date]').fill(date or day(0))
    page.locator('#exp-cat').select_option(cat)
    page.locator('#exp-cur').select_option(cur)
    page.locator('#exp-form [name=amount]').fill(amount)
    page.locator('#exp-form [name=label]').fill(label)
    page.locator('#add-exp').click()


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
            expect(page.locator('#trip-area')).to_be_hidden()
            assert page.locator('#louvre-currency').count() == 0  # la devise de référence est une donnée du voyage
            expect(page.locator('#ref')).to_have_value('EUR')
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Voyage : validation puis création.
            trip(page, '', day(-2), day(7), '2000')
            expect(page.locator('#trip-status')).to_have_text('Nom du voyage obligatoire')
            trip(page, 'Japon', day(-2), day(7), 'abc')
            expect(page.locator('#trip-status')).to_have_text('Budget total invalide (ex. 2000)')
            trip(page, 'Japon', day(7), day(-2), '2000')
            expect(page.locator('#trip-status')).to_have_text('Le retour ne peut pas précéder le départ')
            trip(page, 'Japon', day(-2), day(7), '2000', '400')
            expect(page.locator('#trip-status')).to_have_text('Voyage « Japon » enregistré : ajoutez vos taux puis vos dépenses.')
            expect(page.locator('#trip-area')).to_be_visible()
            expect(page.locator('#k-budget')).to_have_text(money('2 000,00 €'))

            # Taux saisis.
            rate(page, 'XYZ', 'fromRef', '1', day(-10))
            expect(page.locator('#rate-status')).to_have_text('Code de devise inconnu (3 lettres, ex. USD)')
            rate(page, 'EUR', 'fromRef', '1', day(-10))
            expect(page.locator('#rate-status')).to_have_text("Inutile : c'est la devise de référence")
            rate(page, 'JPY', 'fromRef', '0', day(-10))
            expect(page.locator('#rate-status')).to_have_text('Taux invalide : nombre positif, 8 décimales au plus')
            rate(page, 'jpy', 'fromRef', '162,35', day(-10))
            expect(page.locator('#rate-status')).to_contain_text('Taux ajouté : 1 EUR = 162,35 JPY')
            rate(page, 'USD', 'toRef', '0,9234', day(-10))
            expect(page.locator('#rates > li')).to_have_count(2)

            # Dépenses : décimales propres à la devise, conversion exacte et arrondie.
            expense(page, 'JPY', '15.5')
            expect(page.locator('#exp-status')).to_have_text('Montant invalide (décimales autorisées pour cette devise : 0)')
            page.locator('#exp-form [name=amount]').fill('1500')
            page.locator('#exp-form [name=amount]').dispatch_event('input')
            expect(page.locator('#preview')).to_have_text(re.compile(f'≈ 9,24{SP}€ au taux du .* \\(1 EUR = 162,35 JPY\\)'))
            expense(page, 'JPY', '1500', 'food', day(0), 'Ramen')
            expect(page.locator('#exp-status')).to_have_text(re.compile(f'1{SP}500{SP}JPY ajouté, soit 9,24{SP}€\\.'))
            expense(page, 'USD', '12,50', 'transport')
            expense(page, 'EUR', '450', 'lodging', day(-2))
            expect(page.locator('#expenses > li')).to_have_count(3)
            expect(page.locator('#k-spent')).to_have_text(money('470,78 €'))  # 9,24 + 11,54 + 450
            expect(page.locator('#k-left')).to_have_text(money('1 529,22 €'))
            expect(page.locator('#k-day')).to_have_text(money('191,15 €'))  # 1 529,22 € / 8 jours restants, au centime inférieur
            expect(page.locator('#k-day-note')).to_have_text('sur 8 jours restants')
            food = page.locator('#cat-table tr').filter(has_text='Repas')
            expect(food).to_contain_text(money('390,76 €'))
            expect(page.locator('#days li').first).to_contain_text(money('450,00 €'))
            expect(page.locator('#days li.over')).to_have_count(1)  # 450 € > 200 € prévus par jour

            # Protections : taux utilisé, devise verrouillée.
            page.locator('#rates > li').filter(has_text='JPY').get_by_role('button').click()
            expect(page.locator('#rate-status')).to_have_text('Des dépenses en JPY utilisent ce taux : supprimez-les ou ajoutez un autre taux avant')
            expect(page.locator('#ref')).to_be_disabled()

            # CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Date;Catégorie;Libellé;Montant;Devise;Taux appliqué;Date du taux;Montant converti;Devise de référence\r\n'), csv[:120]
            assert f'{day(0)};Repas;Ramen;1500;JPY;1 EUR = 162.35 JPY;{day(-10)};9,24;EUR\r\n' in csv, csv
            assert f'{day(0)};Transport;;12,50;USD;1 USD = 0.9234 EUR;{day(-10)};11,54;EUR\r\n' in csv, csv

            # Suppression d'une dépense.
            page.locator('#expenses > li').filter(has_text='USD').get_by_role('button').click()
            expect(page.locator('#k-spent')).to_have_text(money('459,24 €'))

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['rates'][0]['value'] == '162.35'
            assert len(json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['expenses']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{\"app\":\"fxbudget\"')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            trip(page, 'Autre', day(0), day(3), '100')
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{"app":"fxbudget"'
            bad = json.loads(backup); bad['rates'][0]['value'] = 162.35
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 dépenses.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-spent')).to_have_text(money('459,24 €'))

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#expenses > li')).to_have_count(2)
            context.set_offline(False)

            # Nouveau voyage (confirmé).
            page.locator('#reset').click()
            expect(page.locator('#trip-status')).to_have_text('Voyage effacé.')
            expect(page.locator('#trip-area')).to_be_hidden()
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Spend in yen, dollars or dirhams, count in your own currency.')
            expect(ip.locator('#ref')).to_have_value('USD')  # proposition selon la région
            ip.locator('#sample').click()
            expect(ip.locator('#trip-status')).to_have_text('Example loaded (demo rates, not real market rates).')
            expect(ip.locator('#k-spent')).to_have_text('€533.38')  # 480 + 20 + 9,38 + 12,50 + 11,50
            ip.locator('#exp-form [name=amount]').fill('777')
            ip.locator('#exp-form [name=label]').fill('Draft')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#expenses > li')).to_have_count(5)
                assert ip.locator('#exp-form [name=amount]').input_value() == '777'
                assert ip.locator('#exp-form [name=label]').input_value() == 'Draft'
                expect(ip.locator('#k-spent')).to_contain_text('533')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('In Yen, Dollar oder Dirham ausgeben, in der eigenen Währung rechnen.')
            expect(ip.locator('#k-spent')).to_have_text(money('533,38 €'))
            ip.locator('#rate-form [name=currency]').fill('QQQ')
            ip.locator('#rate-form button').click()
            expect(ip.locator('#rate-status')).to_have_text('Unbekannter Währungscode (3 Buchstaben, z. B. USD)')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#sample').click()
            expect(ip.locator('#trip-form [name=name]')).to_have_value('طوكيو وكيوتو')  # exemple dans la langue affichée
            assert not errors, errors
            browser.close()
        print('BROWSER PASS FXBudget: trip, user rates, exact conversions, category and per-day remaining, protections, CSV, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
