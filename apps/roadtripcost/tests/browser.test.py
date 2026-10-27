"""RoadTripCost dans Chromium : validation, voiture, passagers, étapes, partage, modification, unités, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues et devises."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-roadtripcost-v1'
NB, NN = ' ', ' '  # espaces insécables utilisées par Intl en français
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def eur(s):
    return s + NB + '€'


def add_person(page, name):
    page.locator('#people-form [name=name]').fill(name)
    page.locator('#add-person').click()
    expect(page.locator('#people-status')).to_have_text(f'Passager ajouté : {name}.')


def fill_stage(page, name, distance, tolls='', lodging='', meals='', uncheck=()):
    f = page.locator('#stage-form')
    f.locator('[name=name]').fill(name)
    f.locator('[name=distance]').fill(distance)
    f.locator('[name=tolls]').fill(tolls)
    f.locator('[name=lodging]').fill(lodging)
    f.locator('[name=meals]').fill(meals)
    for who in uncheck:
        f.get_by_label(who, exact=True).uncheck()
    page.locator('#add-stage').click()


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
            assert page.evaluate('() => LouvreI18n.currency') == 'EUR'

            # Validation.
            page.locator('#add-stage').click()
            expect(page.locator('#stage-status')).to_have_text("Nom de l'étape obligatoire")
            fill_stage(page, 'X', '0')
            expect(page.locator('#stage-status')).to_have_text('Distance invalide (0,1 à 5 000 km)')
            page.locator('#car-form [name=consumption]').fill('beaucoup')
            page.locator('#save-car').click()
            expect(page.locator('#car-status')).to_have_text('Consommation invalide (entre 0,5 et 50 L/100 km)')

            # Voiture, passagers, deux étapes dont une nuit à deux.
            page.locator('#car-form [name=consumption]').fill('6,5')
            page.locator('#car-form [name=price]').fill('1,859')
            page.locator('#save-car').click()
            expect(page.locator('#car-status')).to_have_text(f'Enregistré : 6,5 L/100 km, {eur("1,859")} le litre.')
            for who in ['Ana', 'Bea', 'Cid']:
                add_person(page, who)
            page.locator('#people-form [name=name]').fill('ana')
            page.locator('#add-person').click()
            expect(page.locator('#people-status')).to_have_text('Ce passager existe déjà')
            fill_stage(page, 'Bordeaux → Toulouse', '245', tolls='21,30', meals='48')
            expect(page.locator('#stage-status')).to_have_text(f'Étape ajoutée : Bordeaux → Toulouse ({eur("98,90")}).')
            fill_stage(page, 'Nuit à Carcassonne', '100', lodging='100', uncheck=['Ana', 'Bea', 'Cid'])
            expect(page.locator('#stage-status')).to_have_text('Cochez au moins un passager')
            page.locator('#stage-form').get_by_label('Ana', exact=True).check()
            page.locator('#stage-form').get_by_label('Bea', exact=True).check()
            page.locator('#add-stage').click()
            expect(page.locator('#stage-status')).to_have_text(f'Étape ajoutée : Nuit à Carcassonne ({eur("112,08")}).')
            expect(page.locator('#stage-form').get_by_label('Cid', exact=True)).to_be_checked()  # formulaire remis à « tous »
            expect(page.locator('#k-total')).to_have_text(eur('210,98'))
            expect(page.locator('#k-distance')).to_have_text('345 km')
            expect(page.locator('#k-fuel')).to_have_text(f'{eur("41,68")} · 22,4 L')
            expect(page.locator('#k-perkm')).to_have_text(eur('0,61') + '/km')
            stages = page.locator('#stage-list li.stage')
            expect(stages).to_have_count(2)
            expect(stages.nth(1)).to_contain_text(f'Partagée entre Ana, Bea : environ {eur("56,04")} chacun')
            rows = page.locator('#people-table tbody tr')
            expect(rows).to_have_count(3)
            expect(rows.nth(0)).to_have_text('Ana2' + eur('89,01'))
            expect(rows.nth(2)).to_have_text('Cid1' + eur('32,96'))
            expect(page.locator('#by-cat li').nth(0)).to_contain_text('Carburant · 19,8' + NN + '%')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile (résultats) : {wide}'

            # Modification d'une étape, puis affichage en miles.
            stages.nth(1).get_by_role('button', name='Modifier Nuit à Carcassonne').click()
            expect(page.locator('#stage-form').get_by_label('Cid', exact=True)).not_to_be_checked()
            page.locator('#stage-form [name=lodging]').fill('120')
            page.locator('#add-stage').click()
            expect(page.locator('#stage-status')).to_have_text('Étape modifiée : Nuit à Carcassonne.')
            expect(page.locator('#k-total')).to_have_text(eur('230,98'))
            expect(rows.nth(0)).to_have_text('Ana2' + eur('99,01'))
            page.locator('#display-unit').select_option('mi')
            expect(page.locator('#k-distance')).to_have_text('214,4 mi')
            expect(page.locator('#k-perkm')).to_have_text(eur('1,08') + '/mi')
            page.locator('#display-unit').select_option('km')

            # Export CSV (en-têtes traduits, devise indiquée).
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert '"Étape";"Distance (km)";"Carburant (L)";"Carburant (EUR)";"Péages (EUR)"' in csv, csv
            assert '"Total";"345";' in csv and ';"41,68";"21,30";"120,00";"48,00";"0,00";"230,98";""' in csv, csv
            assert '"Ana";"2";"99,01"' in csv and '"Cid";"1";"32,96"' in csv, csv
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            tr = saved['trips'][0]
            assert tr['consMl'] == 6500 and tr['priceMillis'] == 1859 and tr['stages'][0]['riders'] is None and len(tr['stages'][1]['riders']) == 2

            # Retirer un passager : il quitte les étapes.
            page.get_by_role('button', name='Retirer Cid').click()
            expect(rows).to_have_count(2)
            expect(rows.nth(0)).to_have_text('Ana2' + eur('115,49'))

            # Export JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['trips'][0]['passengers']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'null-ish')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#people-form [name=name]').fill('Zoé')
            page.locator('#add-person').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'null-ish'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"roadtripcost","version":1,"trips":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 voyage.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-total')).to_have_text(eur('230,98'))

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#stage-list li.stage')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues et devises
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-MX')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('¿Cuánto cuesta este viaje por carretera y a cada uno?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'MXN'  # región MX -> peso propuesto
            ip.locator('#sample').click()
            expect(ip.locator('#trip-status')).to_have_text('Ejemplo añadido: tres etapas, tres pasajeros.')
            expect(ip.locator('#k-total')).to_contain_text('360,45')
            expect(ip.locator('#k-total')).to_contain_text('MXN')
            ip.locator('#people-form [name=name]').fill('Pepe')  # saisies en cours
            ip.locator('#stage-form [name=name]').fill('Etapa X')
            ip.locator('#stage-form').get_by_label('Mateo', exact=True).uncheck()
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#stage-list li.stage')).to_have_count(3)
                expect(ip.locator('#k-total')).to_contain_text('360')
                assert ip.locator('#people-form [name=name]').input_value() == 'Pepe', lang
                assert ip.locator('#stage-form [name=name]').input_value() == 'Etapa X', lang
                assert not ip.locator('#stage-form').get_by_label('Mateo', exact=True).is_checked(), lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-res')).to_have_text('تكلفة الرحلة')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#louvre-currency').select_option('CHF')
            expect(ip.locator('#k-total')).to_contain_text('CHF')
            expect(ip.locator('#stage-form .cur').first).to_have_text('CHF')
            expect(ip.locator('#stage-list li.stage').nth(0)).to_contain_text('Madrid → Valencia')  # données saisies gardées telles quelles
            ip.locator('#car-form [name=price]').fill('abc')
            ip.locator('#save-car').click()
            expect(ip.locator('#car-status')).to_have_text('Ungültiger Kraftstoffpreis (z. B. 1,859)')
            ip.reload()
            expect(ip.locator('#k-total')).to_contain_text('CHF')  # devise mémorisée
            assert not errors, errors
            browser.close()
        print('BROWSER PASS RoadTripCost: validation, car, passengers, stages, split, edit, miles, CSV, remove passenger, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
