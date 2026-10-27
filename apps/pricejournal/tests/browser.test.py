"""PriceJournal dans Chromium : relevés, prix unitaire, évolution, variation, meilleur prix, plusieurs produits, graphique, CSV, SVG, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-pricejournal-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add(page, product, store, date, price, qty, unit, count='1', ok=True):
    f = '#entry-form '
    page.locator(f + '[name=product]').fill(product)
    page.locator(f + '[name=store]').fill(store)
    page.locator(f + '[name=date]').fill(date)
    page.locator(f + '[name=price]').fill(price)
    page.locator(f + '[name=qty]').fill(qty)
    page.locator(f + '[name=unit]').select_option(unit)
    page.locator(f + '[name=count]').fill(count)
    page.locator(f + 'button[type=submit]').click()
    if ok:
        expect(page.locator('#form-status')).to_contain_text('Relevé ajouté : ' + product)


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
            expect(page.locator('#summary')).to_contain_text('Aucun relevé')
            assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', page.locator('#entry-form [name=date]').input_value())  # date du jour proposée
            expect(page.locator('#csv')).to_be_disabled()

            # Validation.
            page.locator('#entry-form button[type=submit]').click()
            expect(page.locator('#form-status')).to_have_text('Nom du produit obligatoire')
            add(page, 'Café', 'Super A', '2024-01-01', 'abc', '250', 'g', ok=False)
            expect(page.locator('#form-status')).to_have_text('Prix invalide (ex. 2,49)')

            # Quatre relevés hors ordre : évolution chronologique, variation +15 %, meilleur prix 11,00 €/kg.
            add(page, 'Café', 'Marché', '2024-03-01', '3,30', '250', 'g')
            add(page, 'Café', 'Super A', '2024-01-01', '3,00', '250', 'g')
            add(page, 'café', 'Super A', '2024-02-01', '5,50', '500', 'g', ok=False)
            expect(page.locator('#form-status')).to_contain_text('Relevé ajouté : Café,')  # nom du premier relevé conservé
            add(page, 'Café', 'Super A', '2024-04-01', '3,45', '250', 'g')
            kpis = page.locator('#summary .kpi')
            expect(kpis.nth(0)).to_contain_text(re.compile(r'13,80\s€/kg'))
            expect(kpis.nth(1)).to_contain_text(re.compile(r'\+15\s%'))
            expect(kpis.nth(2)).to_contain_text(re.compile(r'11,00\s€/kg'))
            expect(kpis.nth(2)).to_contain_text('Super A, 1 févr. 2024')
            expect(kpis.nth(3)).to_contain_text('4')
            expect(page.locator('#summary .verdict')).to_contain_text(re.compile(r'25,5\s%'))
            expect(page.locator('#summary .note')).to_contain_text(re.compile(r'Marché 13,20\s€/kg · Super A 13,80\s€/kg'))
            expect(page.locator('#chart polyline')).to_have_count(1)  # une ligne (Super A) ; le Marché n'a qu'un point
            expect(page.locator('#chart circle')).to_have_count(5)  # 4 relevés + anneau du meilleur prix
            rows = page.locator('#entries tbody tr')
            expect(rows).to_have_count(4)
            expect(rows.nth(0)).to_contain_text('01/04/2024')  # le plus récent d'abord
            expect(page.locator('#entries tr.best')).to_contain_text('01/02/2024')
            expect(page.locator('#product-select option')).to_have_count(1)  # « café » regroupé avec « Café »

            # Unité incompatible refusée ; second produit en litres.
            add(page, 'Café', 'Super A', '2024-05-01', '2', '1', 'piece', ok=False)
            expect(page.locator('#form-status')).to_have_text("Ce produit est déjà relevé en masse (g, kg) : gardez la même sorte d'unité.")
            add(page, 'Lait', 'Super A', '2024-01-05', '6,30', '1', 'l', '6')
            expect(page.locator('#summary .kpi').nth(0)).to_contain_text(re.compile(r'1,05\s€/L'))
            expect(page.locator('#summary .kpi').nth(1)).to_contain_text('un seul relevé')
            expect(page.locator('#product-select option')).to_have_count(2)
            page.locator('#product-select').select_option(label='Café (4)')
            expect(page.locator('#entries tbody tr')).to_have_count(4)

            # Suppression d'un relevé.
            page.locator('#entries tbody tr').nth(0).locator('button').click()
            expect(page.locator('#entries tbody tr')).to_have_count(3)
            expect(page.locator('#summary .kpi').nth(1)).to_contain_text(re.compile(r'\+10\s%'))  # 13,20 / 12,00
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert len(saved['entries']) == 4 and {e['product'] for e in saved['entries']} == {'Café', 'Lait'}, saved

            # Exports CSV et SVG.
            csv = download_text(page, '#csv').strip().splitlines()
            assert len(csv) == 5, csv
            assert csv[0] == '"Date";"Produit";"Magasin";"Prix (EUR)";"Contenance";"Unité";"Nb d\'unités";"Prix unitaire (EUR)";"Par"', csv[0]
            assert csv[2] == '"2024-01-05";"Lait";"Super A";"6.30";"1";"L";"6";"1.05";"L"', csv[2]
            svg = download_text(page, '#svg')
            assert svg.startswith('<?xml') and '<circle' in svg and '<title>' in svg, svg[:200]

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['entries']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[1,2')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add(page, 'Pain', 'B', '2024-06-01', '1', '1', 'piece', ok=False)
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[1,2'
            assert download_text(page, '#export-raw') == '[1,2'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('2024-01-05', '2024-02-31').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée : Date invalide')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Sauvegarde restaurée : 4 relevés')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#product-select option')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#product-select option')).to_have_count(2)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile avec données : {wide}'
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Steigen die Preise wirklich?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'EUR'
            ip.locator('#sample').click()
            expect(ip.locator('#product-select')).to_contain_text('Gemahlener Kaffee')  # exemple dans la langue affichée
            expect(ip.locator('#entries tbody tr')).to_have_count(6)
            ip.locator('#entry-form [name=product]').fill('Entwurf')
            ip.locator('#entry-form [name=price]').fill('4,20')
            titles = {'fr': 'Nouveau relevé', 'en': 'New price record', 'es': 'Nuevo registro', 'ar': 'تسجيل سعر جديد', 'pt': 'Novo registo', 'de': 'Neuer Preiseintrag', 'it': 'Nuova rilevazione'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-form')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#entries tbody tr')).to_have_count(6)
                expect(ip.locator('#chart polyline')).to_have_count(2)
                expect(ip.locator('#entry-form [name=product]')).to_have_value('Entwurf')
                expect(ip.locator('#entry-form [name=price]')).to_have_value('4,20')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('es')
            ip.locator('#louvre-currency').select_option('MXN')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('¿De verdad suben los precios?')
            expect(ip.locator('#summary .kpi').first).to_contain_text('MXN')
            expect(ip.locator('.cur').first).to_have_text('MXN')
            ip.locator('#entry-form [name=product]').fill('Prueba')
            ip.locator('#entry-form [name=store]').fill('X')
            ip.locator('#entry-form [name=price]').fill('1')
            ip.locator('#entry-form [name=qty]').fill('0')
            ip.locator('#entry-form button[type=submit]').click()
            expect(ip.locator('#form-status')).to_have_text('Contenido no válido (3 decimales como máximo)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PriceJournal: validation, unit price, chronology, variation, best price, per-store latest, unit mismatch, two products, delete, chart, CSV, SVG, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
