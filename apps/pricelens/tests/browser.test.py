"""PriceLens dans Chromium : saisie, classement, lots, comparaisons multiples, sauvegarde, hors ligne, mobile."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-pricelens-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add(page, name, price, qty, unit, count='1'):
    page.locator('[name=name]').fill(name)
    page.locator('[name=price]').fill(price)
    page.locator('[name=qty]').fill(qty)
    page.locator('[name=unit]').select_option(unit)
    page.locator('[name=count]').fill(count)
    page.locator('#add').click()
    expect(page.locator('#form-status')).to_contain_text('Ajouté : ' + name)


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
            page.on('dialog', lambda d: d.accept(d.default_value or 'Boissons') if d.type == 'prompt' else d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Saisie invalide refusée.
            page.locator('#add').click()
            expect(page.locator('#form-status')).to_contain_text('Nom du produit obligatoire')

            # Trois formats : le lot de 4 × 125 g est le plus cher au kilo, le 1 kg le moins cher.
            add(page, 'Riz 500 g', '1,29', '500', 'g')
            add(page, 'Riz 1 kg', '2,19', '1', 'kg')
            add(page, 'Sachets', '1,89', '125', 'g', '4')
            rows = page.locator('#groups tbody tr')
            expect(rows).to_have_count(3)
            expect(rows.nth(0)).to_contain_text('Riz 1 kg')
            expect(rows.nth(0)).to_contain_text('meilleur prix')
            expect(rows.nth(2)).to_contain_text('Sachets')
            expect(page.locator('#verdict')).to_contain_text('Riz 1 kg')
            expect(page.locator('#verdict')).to_contain_text('42,1 %')  # (3,78 - 2,19) / 3,78

            # Retirer un produit met à jour le classement.
            rows.nth(2).locator('button').click()
            expect(rows).to_have_count(2)

            # Une deuxième comparaison, en litres, séparée de la première.
            page.locator('#new-list').click()
            expect(page.locator('#list-select')).to_contain_text('Comparaison 2')
            add(page, 'Soda 1,5 L', '1,49', '1.5', 'l')
            add(page, 'Soda 6 × 33 cl', '3,60', '33', 'cl', '6')
            expect(page.locator('#groups tbody tr').nth(0)).to_contain_text('Soda 1,5 L')
            expect(page.locator('#groups th').nth(4)).to_have_text('€/L')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert [len(l['items']) for l in saved['lists']] == [2, 2]

            # Export puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['lists']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('[name=name]').fill('X'); page.locator('[name=price]').fill('1'); page.locator('[name=qty]').fill('1')
            page.locator('#add').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 comparaisons')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#groups tbody tr')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : les 7 langues sont complètes, sans débordement ; l'arabe s'affiche de droite à gauche.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Is the big pack really cheaper?')  # navigateur anglais -> anglais
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'  # région US -> dollar proposé
            ip.locator('#sample').click()
            expect(ip.locator('#verdict')).to_contain_text('$1.98/kg')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                assert ip.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), f'débordement en {lang}'
                expect(ip.locator('#groups tbody tr')).to_have_count(4)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # Le choix de langue et de devise est mémorisé (pour toutes les applis Louvre).
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#louvre-currency').select_option('CHF')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Ist die Großpackung wirklich günstiger?')
            expect(ip.locator('#verdict')).to_contain_text('CHF')
            # Erreur du moteur traduite.
            ip.locator('[name=name]').fill('Test'); ip.locator('[name=price]').fill('abc'); ip.locator('[name=qty]').fill('1')
            ip.locator('#add').click()
            expect(ip.locator('#form-status')).to_have_text('Ungültiger Preis (z. B. 2,49)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PriceLens: validation, ranking, packs, remove, multiple comparisons, litres, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
