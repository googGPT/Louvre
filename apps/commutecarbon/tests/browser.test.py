"""CommuteCarbon dans Chromium : facteurs saisis, trajets (km et miles), covoiturage, totaux, scénarios et comparaison,
CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-commutecarbon-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_factor(page, name, value, basis):
    page.locator('#fa-name').fill(name)
    page.locator('#fa-value').fill(value)
    page.locator('#fa-basis').select_option(basis)
    page.locator('#save-factor').click()


def fill_trip(page, name, distance, unit, mode, passengers='1', days='5', round_trip=True):
    f = page.locator('#trip-form')
    f.locator('[name=name]').fill(name)
    f.locator('[name=distance]').fill(distance)
    f.locator('[name=unit]').select_option(unit)
    f.locator('[name=factor]').select_option(label=mode)
    if f.locator('[name=passengers]').is_enabled():
        f.locator('[name=passengers]').fill(passengers)
    f.locator('[name=days]').fill(days)
    f.locator('[name=roundTrip]').set_checked(round_trip)


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
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : menu de langue seul
            expect(page.locator('#factors .empty')).to_have_text("Aucun facteur : ajoutez ceux de votre source, ou chargez l'exemple.")
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation : pas de trajet sans facteur ; facteurs mal saisis refusés.
            page.locator('#trip-form [name=name]').fill('Travail')
            page.locator('#save-trip').click()
            expect(page.locator('#trip-status')).to_have_text("Ajoutez d'abord un facteur d'émission")
            add_factor(page, '', '200', 'vehicle')
            expect(page.locator('#factor-status')).to_have_text('Nom du mode obligatoire')
            add_factor(page, 'Voiture', '2OO', 'vehicle')
            expect(page.locator('#factor-status')).to_have_text('Facteur invalide : g CO₂e/km de 0 à 5000, trois décimales au plus')

            # Facteurs saisis : voiture par véhicule-km, train par passager-km.
            add_factor(page, 'Voiture', '200', 'vehicle')
            expect(page.locator('#factor-status')).to_have_text('Facteur ajouté : Voiture.')
            add_factor(page, 'Train', '30', 'passenger')
            expect(page.locator('#factors > li')).to_have_count(2)
            expect(page.locator('#factors > li').nth(1)).to_contain_text('30 g CO₂e/km · par passager-km')
            add_factor(page, 'train', '10', 'passenger')
            expect(page.locator('#factor-status')).to_have_text('Un facteur porte déjà ce nom')

            # Trajet : distance invalide, puis 18 km aller-retour × 5 jours en voiture seul = 36 kg/semaine.
            fill_trip(page, 'Travail', '0', 'km', 'Voiture')
            page.locator('#save-trip').click()
            expect(page.locator('#trip-status')).to_have_text('Distance invalide : nombre positif de 0,1 à 1000, deux décimales au plus')
            fill_trip(page, 'Travail', '18', 'km', 'Voiture')
            page.locator('#save-trip').click()
            expect(page.locator('#trip-status')).to_have_text('Trajet ajouté : Travail, 36 kg CO₂e par semaine.')
            expect(page.locator('#k-week')).to_have_text('36 kg CO₂e')
            expect(page.locator('#k-year')).to_have_text('1,87 t CO₂e')  # 52 semaines par défaut
            expect(page.locator('#k-dist')).to_have_text('180 km')
            expect(page.locator('#scenario-select')).to_contain_text('Mon scénario (1)')
            page.locator('#weeks').fill('60')
            expect(page.locator('#trip-status')).to_have_text('Semaines par an : nombre entier de 1 à 53')
            page.locator('#weeks').fill('46')
            expect(page.locator('#trip-status')).to_have_text('Semaines par an enregistrées.')
            expect(page.locator('#k-year')).to_have_text('1,66 t CO₂e')  # 36 kg × 46
            expect(page.locator('#k-month')).to_have_text('138 kg CO₂e')  # 1 656 / 12

            # Scénario dupliqué : train 3 jours + covoiturage à 3 deux jours.
            page.locator('#dup-scenario').click()
            expect(page.locator('#trip-status')).to_have_text('Scénario créé : Copie de Mon scénario.')
            page.locator('#trips > li').first.get_by_role('button', name='Modifier').click()
            expect(page.locator('#trip-form-title')).to_have_text('Modifier le trajet')
            page.locator('#trip-form [name=factor]').select_option(label='Train')
            expect(page.locator('#trip-form [name=passengers]')).to_be_disabled()
            expect(page.locator('#passenger-hint')).to_be_visible()
            page.locator('#trip-form [name=days]').fill('3')
            page.locator('#save-trip').click()
            expect(page.locator('#trip-status')).to_have_text('Trajet modifié : Travail, 3,24 kg CO₂e par semaine.')
            fill_trip(page, 'Covoiturage', '18', 'km', 'Voiture', passengers='3', days='2')
            page.locator('#save-trip').click()
            expect(page.locator('#trip-status')).to_have_text('Trajet ajouté : Covoiturage, 4,8 kg CO₂e par semaine.')
            expect(page.locator('#trips > li').nth(1)).to_contain_text('18 km aller-retour × 2 jours/sem. · Voiture · 3 occupants')
            expect(page.locator('#k-week')).to_have_text('8,04 kg CO₂e')
            expect(page.locator('#k-year')).to_have_text('369,8 kg CO₂e')  # 369,84 kg

            # Comparaison par rapport au premier scénario.
            rows = page.locator('#compare tbody tr')
            expect(rows).to_have_count(2)
            expect(rows.nth(0)).to_contain_text('référence')
            expect(rows.nth(1)).to_contain_text('−1,29 t CO₂e (−77,7 %)')
            expect(page.locator('#verdict')).to_have_text('Le plus sobre : « Copie de Mon scénario », soit 1,29 t CO₂e de moins par an que « Mon scénario ».')
            page.locator('#ref-select').select_option(label='Copie de Mon scénario')
            expect(rows.nth(0)).to_contain_text('+1,29 t CO₂e (+347,8 %)')

            # Trajet en miles : 10 mi aller simple, 1 jour, voiture seul = 16,093 km × 200 g.
            fill_trip(page, 'Week-end', '10', 'mi', 'Voiture', days='1', round_trip=False)
            page.locator('#save-trip').click()
            expect(page.locator('#trip-status')).to_have_text('Trajet ajouté : Week-end, 3,22 kg CO₂e par semaine.')
            expect(page.locator('#trips > li').nth(2)).to_contain_text('10 mi aller simple × 1 jour/sem.')
            page.locator('#trips > li').nth(2).get_by_role('button', name='Supprimer').click()
            expect(page.locator('#trip-status')).to_have_text('Trajet supprimé : Week-end.')
            expect(page.locator('#trips > li')).to_have_count(2)

            # Facteur modifié : tous les trajets sont recalculés ; un facteur utilisé ne se supprime pas.
            page.locator('#factors > li').first.get_by_role('button', name='Modifier').click()
            expect(page.locator('#fa-value')).to_have_value('200')
            page.locator('#fa-value').fill('100')
            page.locator('#save-factor').click()
            expect(page.locator('#factor-status')).to_have_text('Facteur modifié : Voiture. Les totaux sont recalculés.')
            expect(page.locator('#k-week')).to_have_text('5,64 kg CO₂e')  # 3,24 + 2,4
            page.locator('#factors > li').first.get_by_role('button', name='Supprimer').click()
            expect(page.locator('#factor-status')).to_have_text("« Voiture » est utilisé par 2 trajets : changez d'abord leur mode.")

            # Export CSV : en-têtes en français, point-virgule, virgule décimale, ligne de total.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv_text = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')  # read_bytes : garde les fins de ligne CRLF
            lines = csv_text.strip().split('\r\n')
            assert lines[0].startswith('"Scénario";"Trajet";"Mode";"Facteur (g CO2e/km)"'), lines[0]
            assert '"Mon scénario";"Travail";"Voiture";"100";"par véhicule-km";"18";"km";"oui";"5";"1";"46";"18,000";"69,000";"828,000"' in lines, lines
            assert '"Copie de Mon scénario";"Total";"";"";"";"";"";"";"";"";"46";"5,640";"21,620";"259,440"' in lines, lines
            expect(page.locator('#compare-status')).to_have_text('Fichier CSV téléchargé.')

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            parsed = json.loads(backup)
            assert parsed['app'] == 'commutecarbon' and len(parsed['scenarios']) == 2 and parsed['factors'][0]['mgPerKm'] == 100000
            assert json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['scenarios'][0]['weeksPerYear'] == 46
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add_factor(page, 'Bus', '90', 'passenger')
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'pas du json'
            bad = json.loads(backup)
            bad['scenarios'][0]['trips'][0]['factorId'] = 'inconnu-123'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Choisissez un mode existant')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 scénarios.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-year')).to_have_text('828 kg CO₂e')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#compare tbody tr')).to_have_count(2)
            expect(page.locator('#k-year')).to_have_text('828 kg CO₂e')
            context.set_offline(False)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue affichée, 7 langues sans débordement, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('How much do your regular trips emit?')
            ip.locator('#sample').click()
            expect(ip.locator('#sample-status')).to_contain_text('Example loaded')
            expect(ip.locator('#factors > li').first).to_contain_text('Petrol car (example, replace it)')
            expect(ip.locator('#verdict')).to_have_text('Lowest emissions: "Train + car-sharing", 1.29 t CO₂e less per year than "Today".')
            ip.locator('#trip-form [name=name]').fill('Draft trip')
            ip.locator('#trip-form [name=distance]').fill('7')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#compare tbody tr')).to_have_count(2)
                assert ip.locator('#trip-form [name=name]').input_value() == 'Draft trip'
                assert ip.locator('#trip-form [name=distance]').input_value() == '7'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#k-year')).to_have_text('1.66 طن مكافئ CO₂')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Wie viel emittieren Ihre regelmäßigen Wege?')
            expect(ip.locator('#k-week')).to_have_text('36 kg CO₂e')
            ip.locator('#sample').click()  # l'exemple se régénère dans la langue affichée
            expect(ip.locator('#factors > li').first).to_contain_text('Verbrennerauto (Beispiel, bitte ersetzen)')
            ip.locator('#trip-form [name=distance]').fill('abc')
            ip.locator('#save-trip').click()
            expect(ip.locator('#trip-status')).to_have_text('Ungültige Strecke: positive Zahl von 0,1 bis 1000, höchstens zwei Dezimalstellen')
            assert ip.evaluate(WIDE) == [], ip.evaluate(WIDE)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS CommuteCarbon: validation, user factors, km/mi trips, car-sharing share, weekly/monthly/yearly totals, scenarios + comparison, factor edit, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
