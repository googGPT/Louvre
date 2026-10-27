"""LaundryLoad dans Chromium : réglages, saisie, regroupement en charges expliquées, panier, écart de température, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-laundryload-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add(page, name, color, material, care, max_c, weight, tumble=False, delicate=False):
    f = page.locator('#garment-form')
    f.locator('[name=name]').fill(name)
    f.locator('[name=color]').select_option(color)
    f.locator('[name=material]').select_option(material)
    f.locator('[name=care]').select_option(care)
    if care == 'machine':
        f.locator('[name=maxC]').select_option(str(max_c))
    f.locator('[name=weight]').fill(weight)
    f.locator('[name=tumble]').set_checked(tumble)
    f.locator('[name=delicate]').set_checked(delicate)
    page.locator('#save').click()
    expect(page.locator('#form-status')).to_have_text(f'« {name} » ajouté.')


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
            expect(page.locator('#loads li.empty')).to_have_text('Saisissez la capacité de votre machine pour obtenir des charges.')
            expect(page.locator('#garments li.empty')).to_have_text("Aucun vêtement pour l'instant.")
            assert page.locator('#louvre-currency').count() == 0
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('Nom du vêtement obligatoire')
            page.locator('#garment-form [name=name]').fill('Draps')
            page.locator('#garment-form [name=weight]').fill('lourd')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text("Poids invalide : plus de 0, jusqu'à 20 kg")
            page.locator('#capacity').fill('0,5')
            page.locator('#capacity').dispatch_event('change')
            expect(page.locator('#settings-status')).to_have_text('Capacité invalide : de 1 à 30 kg')
            page.locator('#capacity').fill('7')
            page.locator('#capacity').dispatch_event('change')
            expect(page.locator('#settings-status')).to_have_text('Capacité enregistrée : 7 kg.')
            expect(page.locator('#loads li.empty')).to_have_text('Le panier est vide.')

            # Vêtements et charges.
            add(page, 'Draps', 'white', 'cotton', 'machine', 60, '1,2', tumble=True)
            add(page, 'T-shirt blanc', 'white', 'cotton', 'machine', 40, '0,2')
            add(page, 'Jean', 'dark', 'cotton', 'machine', 40, '0,8')
            add(page, 'Blouse', 'color', 'silk', 'machine', 30, '0,15')
            add(page, 'Gilet', 'light', 'wool', 'hand', 0, '0,4')
            expect(page.locator('#list-count')).to_have_text('5 vêtements enregistrés, 5 au panier.')
            loads = page.locator('#loads li.load')
            expect(loads).to_have_count(3)
            expect(loads.nth(0)).to_contain_text('Blancs')
            expect(loads.nth(0)).to_contain_text('40 °C max')
            expect(loads.nth(0)).to_contain_text('40 °C : la température la plus basse de la charge, imposée par T-shirt blanc. Lavés sous leur maximum : Draps.')
            expect(loads.nth(0)).to_contain_text("Sèche-linge : Draps. À l'air : T-shirt blanc.")
            expect(loads.nth(0)).to_contain_text('1,4 kg sur 7 kg (20 %)')
            expect(loads.nth(1)).to_contain_text('Programme délicat')
            expect(loads.nth(2)).to_contain_text('Foncés seulement.')
            expect(page.locator('#excluded')).to_have_text('À laver à la main, hors machine : Gilet.')
            expect(page.locator('#kpis .kpi').nth(1)).to_contain_text('3')

            # Écart de température : même température seulement.
            page.locator('#gap').select_option('0')
            expect(page.locator('#settings-status')).to_have_text('Écart de température limité à 0 °C par charge.')
            expect(loads).to_have_count(4)
            expect(loads.nth(0)).to_contain_text('Partie 1 sur 2 de ce groupe')
            page.locator('#gap').select_option('')
            expect(loads).to_have_count(3)

            # Panier : retirer un vêtement.
            page.get_by_label('« Jean » dans le panier à linge').uncheck()
            expect(page.locator('#list-count')).to_have_text('5 vêtements enregistrés, 4 au panier.')
            expect(loads).to_have_count(2)

            # Modifier : un jean trop lourd pour la machine est signalé.
            page.get_by_role('button', name='Modifier « Jean »').click()
            expect(page.locator('#garment-form [name=name]')).to_have_value('Jean')
            page.locator('#garment-form [name=weight]').fill('9')
            page.locator('#garment-form [name=inBasket]').check()
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('« Jean » mis à jour.')
            expect(loads).to_have_count(3)
            expect(page.locator('#loads .alert')).to_contain_text('« Jean » dépasse à lui seul la capacité')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['settings'] == {'capacityG': 7000, 'mergeLight': False, 'tempGapC': None, 'gentleFillPct': 100}, saved['settings']
            assert [g['weightG'] for g in saved['garments'] if g['name'] == 'Jean'] == [9000]

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Charge;Couleurs;Programme;Température max (°C);Vêtement;Poids (kg);Sèche-linge\r\n'), csv[:120]
            assert '1;Blancs;Normal;40;Draps;1,2;oui\r\n' in csv, csv
            assert '3;Foncés;Normal;40;Jean;9;non\r\n' in csv, csv

            # Supprimer.
            page.get_by_role('button', name='Supprimer « T-shirt blanc »').click()
            expect(page.locator('#list-status')).to_have_text('« T-shirt blanc » supprimé.')
            expect(page.locator('#garments li.g')).to_have_count(4)

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['garments']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#garment-form [name=name]').fill('Chaussettes')
            page.locator('#garment-form [name=weight]').fill('0,1')
            page.locator('#save').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            bad = json.loads(backup); bad['garments'][0]['color'] = 'rose'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Couleur inconnue')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 4 vêtements.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#capacity')).to_have_value('7')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#garments li.g')).to_have_count(4)
            expect(loads).to_have_count(3)
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
            expect(ip.locator('h1')).to_have_text('How many washes, and which ones?')
            ip.locator('#sample').click()
            expect(ip.locator('#form-status')).to_contain_text('Example loaded: 11 garments')
            iloads = ip.locator('#loads li.load')
            expect(iloads).to_have_count(6)
            expect(iloads.nth(0)).to_contain_text('Bath towels')
            expect(iloads.nth(0)).to_contain_text('Part 1 of 2 of this group: temperature gap limited to 20 °C, then capacity.')
            expect(ip.locator('#excluded')).to_contain_text('Cashmere cardigan')
            expect(ip.locator('#capacity')).to_have_value('7')
            ip.locator('#garment-form [name=name]').fill('Socks')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(iloads).to_have_count(6)
                expect(ip.locator('#garments li.g')).to_have_count(11)
                assert ip.locator('#garment-form [name=name]').input_value() == 'Socks'
                assert ip.locator('#capacity').input_value() == '7'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Wie viele Maschinen, und welche?')
            expect(iloads.nth(0).locator('.pill').first).to_have_text('Weißes und Helles')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#garment-form [name=name]').fill('')
            ip.locator('#save').click()
            expect(ip.locator('#form-status')).to_have_text('اسم القطعة مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS LaundryLoad: validation, capacity, garments, compatible loads, explanations, temperature gap, basket, oversize item, edit, CSV, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
