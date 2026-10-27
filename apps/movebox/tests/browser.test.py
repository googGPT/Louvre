"""MoveBox dans Chromium : saisie, numéros, recherche, limite de poids, suivi, changement groupé, étiquettes, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-movebox-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def box(page, room, items, weight='', fragile=False, number=None):
    f = page.locator('#box-form')
    if number is not None:
        f.locator('[name=number]').fill(number)
    f.locator('[name=room]').fill(room)
    f.locator('[name=items]').fill(items)
    f.locator('[name=weight]').fill(weight)
    f.locator('[name=fragile]').set_checked(fragile)
    page.locator('#save').click()


def card(page, n):
    return page.locator('#boxes li.card').filter(has=page.locator('.num', has_text=f'#{n}'))


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
            page.add_init_script('window.print = () => { window.__printed = (window.__printed || 0) + 1; }')  # pas de boîte d'impression en test
            page.goto(origin)
            expect(page.locator('#boxes li.empty')).to_have_text("Aucun carton pour l'instant.")
            expect(page.locator('#box-form [name=number]')).to_have_value('1')
            assert page.locator('#louvre-currency').count() == 0
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save').click()
            expect(page.locator('#box-status')).to_have_text('Pièce de destination obligatoire')
            box(page, 'Cuisine', 'Assiettes', weight='lourd')
            expect(page.locator('#box-status')).to_have_text('Poids invalide : de 0,001 à 100 kg')

            # Trois cartons ; la pièce « cuisine » rejoint « Cuisine ».
            box(page, 'Cuisine', 'Assiettes\nBouilloire', weight='12,5', fragile=True)
            expect(page.locator('#box-status')).to_have_text('Carton #1 ajouté (Cuisine).')
            expect(page.locator('#box-form [name=number]')).to_have_value('2')
            expect(page.locator('#box-form [name=room]')).to_have_value('Cuisine')
            box(page, ' cuisine ', 'Casseroles', weight='22')
            expect(page.locator('#box-status')).to_have_text('Carton #2 ajouté (Cuisine).')
            box(page, 'Salon', 'Livres; Télécommande')
            expect(page.locator('#boxes li.card')).to_have_count(3)
            expect(page.locator('#rooms-table tbody tr')).to_have_count(2)
            expect(page.locator('#rooms-table tbody tr').first).to_contain_text('34,5 kg')
            box(page, 'Bureau', 'Câbles', number='2')
            expect(page.locator('#box-status')).to_have_text('Le numéro 2 est déjà utilisé')

            # Recherche sans accents ni casse, par numéro.
            page.locator('#search').fill('BOUILLOIRE')
            expect(page.locator('#results li')).to_have_count(1)
            expect(page.locator('#results li')).to_contain_text('#1')
            page.locator('#search').fill('tele')
            expect(page.locator('#results li')).to_contain_text('#3')
            page.locator('#search').fill('#2')
            expect(page.locator('#results li')).to_have_count(1)
            expect(page.locator('#results li')).to_contain_text('Casseroles')
            page.locator('#search').fill('piano')
            expect(page.locator('#search-status')).to_have_text('Aucun carton ne correspond.')
            page.locator('#search').fill('')

            # Limite de poids choisie par l'utilisateur.
            expect(card(page, 2).locator('.pill.heavy')).to_have_count(0)
            page.locator('#max-weight').fill('20')
            page.locator('#max-weight').dispatch_event('change')
            expect(page.locator('#list-status')).to_have_text('Limite enregistrée : 20 kg par carton.')
            expect(page.locator('#weight-note')).to_contain_text('Au-dessus de votre limite de 20 kg : #2.')
            expect(page.locator('#weight-note')).to_contain_text('1 carton sans poids.')
            expect(card(page, 2).locator('.pill.heavy')).to_have_text('Lourd')

            # Suivi : statut suivant, puis changement groupé sur un filtre.
            card(page, 1).get_by_role('button', name='Marquer le carton #1 comme Chargé').click()
            expect(page.locator('#list-status')).to_have_text('Carton #1 : Chargé.')
            expect(page.locator('#kpis .kpi').nth(1)).to_contain_text('1')
            page.locator('#f-room').select_option(label='Cuisine (2)')
            expect(page.locator('#boxes li.card')).to_have_count(2)
            page.locator('#bulk-status').select_option('delivered')
            page.locator('#bulk-apply').click()
            expect(page.locator('#list-status')).to_have_text('2 cartons marqués « Livré ».')
            expect(page.locator('#kpis .kpi').nth(2)).to_contain_text('2 / 3')
            page.locator('#f-room').select_option('all')
            card(page, 3).locator('select').select_option('opened')
            expect(card(page, 3)).to_have_class('card st-opened')

            # Modifier un carton : le statut est conservé.
            card(page, 3).get_by_role('button', name='Modifier le carton #3').click()
            expect(page.locator('#box-form [name=items]')).to_have_value('Livres\nTélécommande')
            page.locator('#box-form [name=weight]').fill('5')
            page.locator('#save').click()
            expect(page.locator('#box-status')).to_have_text('Carton #3 mis à jour (Salon).')
            expect(card(page, 3)).to_have_class('card st-opened')

            # Étiquettes : rendues pour les cartons affichés, visibles seulement à l'impression.
            page.locator('#print-labels').click()
            assert page.evaluate('() => window.__printed') == 1
            expect(page.locator('#labels .label')).to_have_count(3)
            expect(page.locator('#labels .label').first).to_contain_text('#1')
            expect(page.locator('#labels .label').first).to_contain_text('FRAGILE')
            page.emulate_media(media='print')
            expect(page.locator('#labels')).to_be_visible()
            expect(page.locator('.hero')).to_be_hidden()
            page.evaluate("() => window.dispatchEvent(new Event('afterprint'))")
            expect(page.locator('#labels')).to_be_hidden()
            page.emulate_media(media='screen')

            # Export CSV de l'inventaire.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('N°;Pièce;Contenu;Fragile;Poids (kg);Statut;Notes\r\n'), csv[:80]
            assert '1;Cuisine;Assiettes | Bouilloire;oui;12,5;Livré;\r\n' in csv, csv
            assert '3;Salon;Livres | Télécommande;non;5;Ouvert;' in csv, csv

            # Supprimer.
            card(page, 3).get_by_role('button', name='Supprimer le carton #3').click()
            expect(page.locator('#boxes li.card')).to_have_count(2)

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['settings'] == {'maxWeightG': 20000}
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{\"app\":\"movebox\"')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            box(page, 'Garage', 'Outils')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{"app":"movebox"'
            bad = json.loads(backup); bad['boxes'][1]['number'] = 1
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Le numéro 1 est déjà utilisé')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 cartons.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#max-weight')).to_have_value('20')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#boxes li.card')).to_have_count(2)
            context.set_offline(False)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Which box is the kettle in?')
            ip.locator('#sample').click()
            expect(ip.locator('#box-status')).to_have_text('Example loaded: 6 boxes, 20 kg limit per box.')
            expect(ip.locator('#weight-note')).to_contain_text('Above your 20 kg limit: #3.')
            ip.locator('#search').fill('kettle')
            expect(ip.locator('#results li')).to_have_count(1)
            ip.locator('#box-form [name=room]').fill('Garage')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#boxes li.card')).to_have_count(6)
                expect(ip.locator('#results li')).to_have_count(1)
                assert ip.locator('#box-form [name=room]').input_value() == 'Garage'
                assert ip.locator('#search').input_value() == 'kettle'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('In welchem Karton ist der Wasserkocher?')
            expect(ip.locator('#results li .pill')).to_have_text('Geliefert')
            ip.locator('#sample').click()
            expect(ip.locator('#rooms-table')).to_contain_text('Küche')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#box-form [name=room]').fill('')
            ip.locator('#save').click()
            expect(ip.locator('#box-status')).to_have_text('غرفة الوجهة مطلوبة')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS MoveBox: validation, numbering, room matching, search, weight limit, status tracking, bulk update, edit, labels, CSV, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
