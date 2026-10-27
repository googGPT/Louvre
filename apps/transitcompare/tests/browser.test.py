"""TransitCompare dans Chromium : itinéraires et segments, validation, pondérations, classement expliqué, bascule, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues et devises."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-transitcompare-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_route(page, name):
    page.locator('#route-form [name=name]').fill(name)
    page.locator('#add-route').click()


def add_seg(page, route, mode, minutes, wait='', cost='', label=''):
    page.locator('#seg-route').select_option(label=route)
    page.locator('#seg-mode').select_option(mode)
    page.locator('#seg-form [name=minutes]').fill(minutes)
    page.locator('#seg-form [name=wait]').fill(wait)
    page.locator('#seg-form [name=cost]').fill(cost)
    page.locator('#seg-form [name=label]').fill(label)
    page.locator('#add-seg').click()


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
            expect(page.locator('#ranking .empty')).to_have_text("Le classement apparaît dès qu'un itinéraire a au moins un segment.")
            assert page.evaluate('() => LouvreI18n.currency') == 'EUR'
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation des itinéraires et des segments.
            add_route(page, '')
            expect(page.locator('#route-status')).to_have_text("Nom de l'itinéraire obligatoire")
            expect(page.locator('#add-seg')).to_be_disabled()
            add_route(page, 'Bus')
            expect(page.locator('#route-status')).to_have_text('Itinéraire « Bus » ajouté : décrivez maintenant ses segments.')
            add_route(page, 'bus')
            expect(page.locator('#route-status')).to_have_text('Un itinéraire porte déjà ce nom')
            add_seg(page, 'Bus', 'bus', 'abc')
            expect(page.locator('#route-status')).to_have_text('Durée : nombre entier de minutes, de 1 à 1440')
            add_seg(page, 'Bus', 'bus', '20', '5', '1,999')
            expect(page.locator('#route-status')).to_have_text('Prix invalide (ex. 1,90 ; vide ou 0 si gratuit)')
            add_seg(page, 'Bus', 'bus', '20', '5', '1,90', '12')
            expect(page.locator('#route-status')).to_have_text('Segment Bus ajouté à « Bus ».')
            add_route(page, 'Vélo')
            add_seg(page, 'Vélo', 'bike', '30')
            expect(page.locator('#routes > li.route')).to_have_count(2)
            expect(page.locator('#routes > li.route').first).to_contain_text('25 min · 1,90 € · 0 correspondance')

            # Valeur du temps nulle : le vélo gratuit est en tête ; bascule calculée (190 × 600 / 50 = 22,80 €/h).
            rows = page.locator('#ranking > li')
            expect(rows).to_have_count(2)
            expect(rows.first).to_contain_text('Vélo')
            expect(page.locator('#verdict')).to_contain_text('En tête : Vélo')
            expect(page.locator('#verdict')).to_contain_text('1,90 € moins cher')
            expect(page.locator('#pivot')).to_have_text("Le classement s'inverse au profit de Bus si votre temps vaut plus de 22,80 € de l'heure.")

            # Pondérations : saisie invalide refusée, saisie valide enregistrée et classement recalculé.
            page.locator('#prefs-form [name=walkWeight]').fill('9')
            expect(page.locator('#prefs-status')).to_have_text('Poids invalide : nombre de 0 à 5, une décimale au plus (ex. 1,5)')
            page.locator('#prefs-form [name=walkWeight]').fill('1,5')
            page.locator('#prefs-form [name=vot]').fill('30')
            expect(page.locator('#prefs-status')).to_have_text('Pondérations enregistrées.')
            expect(rows.first).to_contain_text('Bus')
            expect(rows.first.locator('.score strong')).to_have_text('14,40 €')  # 1,90 + 30 €/h × 25 min
            expect(rows.nth(1).locator('.delta')).to_contain_text('+0,60 €')
            expect(page.locator('#pivot')).to_contain_text('moins de 22,80 €')
            saved = json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))
            assert saved['prefs'] == {'votCents': 3000, 'walkWeight': 15, 'waitWeight': 10, 'transferMinutes': 0}, saved['prefs']

            # Segments : ajout, déplacement, retrait ; persistance après rechargement.
            add_seg(page, 'Bus', 'walk', '4')
            segs = page.locator('#routes > li.route').first.locator('.seg')
            expect(segs).to_have_count(2)
            segs.nth(1).get_by_role('button', name='Monter le segment 2 (Marche)').click()
            expect(segs.first).to_contain_text('Marche · 4 min')
            expect(rows.first).to_contain_text('Vélo')  # 4 min de marche × 1,5 : le bus repasse derrière
            segs.first.get_by_role('button', name='Retirer le segment 1 (Marche)').click()
            expect(segs).to_have_count(1)
            page.reload()
            expect(page.locator('#prefs-form [name=vot]')).to_have_value('30')
            expect(page.locator('#prefs-form [name=walkWeight]')).to_have_value('1,5')
            expect(page.locator('#ranking > li').first).to_contain_text('Bus')

            # Export CSV du classement.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Rang;Itinéraire;Durée totale (min);En véhicule (min);Marche (min);Attente (min);Correspondances;Prix (EUR);Valeur du temps (EUR);Coût généralisé (EUR)\r\n'), csv[:200]
            assert '1;Bus;25;20;0;5;0;1,90;12,50;14,40\r\n' in csv, csv
            expect(page.locator('#rank-status')).to_have_text('Classement exporté (CSV).')

            # Nouveau trajet (invite) puis exemple : les pondérations personnelles ne changent pas.
            page.locator('#new-trip').click()
            expect(page.locator('#trip-status')).to_have_text('Trajet « Trajet 2 » créé.')
            expect(page.locator('#routes .empty')).to_be_visible()
            page.locator('#sample').click()
            expect(page.locator('#trip-status')).to_have_text("Exemple ajouté (durées et prix fictifs). Vos pondérations n'ont pas changé.")
            expect(page.locator('#ranking > li')).to_have_count(4)
            expect(page.locator('#trip-select option:checked')).to_have_text('Domicile → travail (4)')

            # Sauvegarde, stockage corrompu (mode protégé), restauration refusée puis acceptée.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['trips']) == 3
            assert len(json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['trips']) == 3  # enregistré avant de corrompre
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            add_route(page, 'Nouveau')
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == '{abîmé'
            bad = json.loads(backup); bad['trips'][0]['routes'][0]['segments'][0]['minutes'] = 2.5
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 3 trajets.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#trip-select option')).to_have_count(3)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#trip-select option')).to_have_count(3)
            expect(page.locator('#ranking > li').first).to_be_visible()
            context.set_offline(False)

            # Suppression d'un itinéraire (confirmée).
            page.locator('#trip-select').select_option(label='Domicile → travail (4)')
            page.get_by_role('button', name="Supprimer l'itinéraire Voiture").click()
            expect(page.locator('#route-status')).to_have_text('Itinéraire « Voiture » supprimé.')
            expect(page.locator('#ranking > li')).to_have_count(3)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues et devises
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Faster, cheaper or simpler?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#trip-status')).to_contain_text('with example weights')
            expect(ip.locator('#ranking > li')).to_have_count(4)
            expect(ip.locator('#verdict')).to_contain_text('In the lead: Bike')
            expect(ip.locator('#pivot')).to_have_text('The ranking flips in favour of Car if your time is worth more than US$82.29 an hour.')
            expect(ip.locator('#prefs-form [name=walkWeight]')).to_have_value('1.5')
            ip.locator('#route-form [name=name]').fill('Draft route')
            ip.locator('#seg-form [name=minutes]').fill('17')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#ranking > li')).to_have_count(4)
                expect(ip.locator('#routes > li.route')).to_have_count(4)
                assert ip.locator('#route-form [name=name]').input_value() == 'Draft route'
                assert ip.locator('#seg-form [name=minutes]').input_value() == '17'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Schneller, günstiger oder einfacher?')
            ip.locator('#louvre-currency').select_option('CHF')
            expect(ip.locator('#pivot')).to_contain_text('CHF')
            expect(ip.locator('.cur').first).to_have_text('CHF')
            ip.locator('#seg-form [name=minutes]').fill('x')
            ip.locator('#add-seg').click()
            expect(ip.locator('#route-status')).to_have_text('Dauer: ganze Minuten von 1 bis 1440')
            with ip.expect_download() as d:
                ip.locator('#export-csv').click()
            assert pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig').startswith('Rang;Route;Gesamtdauer (min)')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#sample').click()
            expect(ip.locator('#trip-select option:checked')).to_contain_text('المنزل ← العمل')  # exemple dans la langue affichée
            assert ip.evaluate(WIDE) == [], ip.evaluate(WIDE)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS TransitCompare: routes, segments, validation, weights, explained ranking, break-even value of time, move/remove, CSV, backup/restore, protected mode, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
