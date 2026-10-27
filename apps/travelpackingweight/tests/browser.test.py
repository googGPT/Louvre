"""TravelPackingWeight dans Chromium : limites, bagages, objets, dépassement, déplacements proposés et appliqués, unités, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-travelpackingweight-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_bag(page, name, kind, tare):
    page.locator('#bag-form [name=name]').fill(name)
    page.locator('#bag-form [name=type]').select_option(kind)
    page.locator('#bag-form [name=tare]').fill(tare)
    page.locator('#add-bag').click()


def add_item(page, name, weight, unit, qty, bag, fixed=False):
    f = page.locator('#item-form')
    f.locator('[name=name]').fill(name)
    f.locator('[name=weight]').fill(weight)
    f.locator('[name=unit]').select_option(unit)
    f.locator('[name=qty]').fill(qty)
    f.locator('[name=bag]').select_option(label=bag)
    f.locator('[name=fixed]').set_checked(fixed)
    page.locator('#add-item').click()


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
            expect(page.locator('#add-item')).to_be_disabled()
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : menu de langue seul

            # Validation.
            add_bag(page, '', 'cabin', '')
            expect(page.locator('#bag-status')).to_have_text('Nom obligatoire')
            page.locator('#limits-form [name=cabin]').fill('sept')
            page.locator('#save-limits').click()
            expect(page.locator('#limits-status')).to_have_text('Limite invalide (nombre positif ou vide)')

            # Limites, bagages, objets.
            page.locator('#limits-form [name=cabin]').fill('7')
            page.locator('#limits-form [name=checked]').fill('23')
            page.locator('#save-limits').click()
            expect(page.locator('#limits-status')).to_have_text('Limites enregistrées.')
            add_bag(page, 'Cabine', 'cabin', '2')
            expect(page.locator('#bag-status')).to_have_text('Bagage ajouté : Cabine.')
            add_bag(page, 'Valise', 'checked', '4')
            add_item(page, 'Ordinateur', '2,5', 'kg', '1', 'Cabine', fixed=True)
            expect(page.locator('#item-status')).to_have_text('Ajouté : Ordinateur (2,5 kg).')
            add_item(page, 'Livre', '500', 'g', '6', 'Cabine')
            add_item(page, 'Pull', 'abc', 'kg', '1', 'Valise')
            expect(page.locator('#item-status')).to_contain_text('Poids invalide')
            cards = page.locator('#bag-cards .bag')
            expect(cards).to_have_count(2)
            expect(cards.nth(0)).to_have_class('bag over')
            expect(cards.nth(0)).to_contain_text('Limite 7 kg : dépassée de 0,5 kg.')
            expect(cards.nth(1)).to_contain_text('il reste 19 kg')
            expect(page.locator('#k-total')).to_have_text('11,5 kg')
            expect(page.locator('#k-over')).to_have_text('1 bagage, +0,5 kg')

            # Proposition : un livre vers la valise (l'ordinateur « à garder » ne bouge pas), puis application.
            expect(page.locator('#moves li')).to_have_text(['1 × Livre (0,5 kg) de « Cabine » vers « Valise »'])
            page.locator('#apply-moves').click()
            expect(page.locator('#moves-status')).to_have_text('1 objet déplacé.')
            expect(page.locator('#moves .verdict')).to_have_text('Tous les bagages respectent leurs limites.')
            expect(page.locator('#k-over')).to_have_text('Aucun')
            expect(cards.nth(0)).to_contain_text('Livre × 5')
            expect(cards.nth(1)).to_contain_text('Livre')

            # Affichage en livres.
            page.locator('#display-unit').select_option('lb')
            expect(page.locator('#k-total')).to_have_text('25,4 lb')
            page.locator('#display-unit').select_option('kg')

            # Export CSV (en-têtes traduits, poids en grammes).
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert '"Bagage";"Type";"Objet";"Quantité";"Poids unitaire (g)"' in csv and '"Cabine";"Cabine";"Livre";"5";"500";"2500";""' in csv and '"Cabine";"Cabine";"TOTAL";"";"";"7000";"limite 7000 g"' in csv, csv

            # Export JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['trips'][0]['limits']['cabin'] == 7000
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[[')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add_bag(page, 'Sac', 'personal', '')
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[['
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"travelpackingweight","version":1,"trips":[{"id":"bad"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 voyage')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-total')).to_have_text('11,5 kg')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#bag-cards .bag')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Sem surpresas no balcão de check-in.')
            ip.locator('#sample').click()
            expect(ip.locator('#trip-status')).to_have_text('Exemplo adicionado: a mala de cabine está demasiado pesada.')
            expect(ip.locator('#moves li')).to_have_count(1)
            expect(ip.locator('#moves li')).to_contain_text('Sapatos')
            ip.locator('#item-form [name=name]').fill('Guarda-chuva')  # saisie en cours
            ip.locator('#limits-form [name=personal]').fill('5')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#bag-cards .bag')).to_have_count(3)
                expect(ip.locator('#moves li')).to_have_count(1)
                assert ip.locator('#item-form [name=name]').input_value() == 'Guarda-chuva', lang
                assert ip.locator('#limits-form [name=personal]').input_value() == '5', lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-moves')).to_have_text('ماذا تنقل؟')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#h-moves')).to_have_text('Was umpacken?')
            expect(ip.locator('#moves li')).to_contain_text('Sapatos')  # données saisies : gardées telles quelles (créées en portugais)
            expect(ip.locator('#moves li')).to_contain_text(' von ')
            ip.locator('#item-form [name=weight]').fill('-1')
            ip.locator('#add-item').click()
            expect(ip.locator('#item-status')).to_have_text('Ungültiges Gewicht (positive Zahl, höchstens 100 kg)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS TravelPackingWeight: validation, limits, bags, items, overweight, suggested moves, apply, lb display, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
