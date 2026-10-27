"""VehicleServiceLog dans Chromium : véhicules, relevés, compteur cohérent, estimation, échéances km/mois, « Fait », rappels, coûts, CSV, .ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues et devises."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-vehicleservicelog-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def day(offset=0):
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


def reading(page, date, km):
    page.locator('#read-form [name=date]').fill(date)
    page.locator('#read-form [name=km]').fill(km)
    page.locator('#add-read').click()


def schedule(page, name, every_km, every_months, base_date, base_km):
    if page.locator('#sch-add').get_attribute('open') is None:
        page.locator('#sch-add summary').click()
    f = page.locator('#sch-form')
    f.locator('[name=name]').fill(name)
    f.locator('[name=everyKm]').fill(every_km)
    f.locator('[name=everyMonths]').fill(every_months)
    f.locator('[name=baseDate]').fill(base_date)
    f.locator('[name=baseKm]').fill(base_km)
    page.locator('#add-sch').click()


def service(page, label, date, km, amount='', note=''):
    f = page.locator('#srv-form')
    f.locator('[name=label]').fill(label)
    f.locator('[name=date]').fill(date)
    f.locator('[name=km]').fill(km)
    f.locator('[name=amount]').fill(amount)
    f.locator('[name=note]').fill(note)
    page.locator('#add-srv').click()


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
            expect(page.locator('#veh-tabs .empty')).to_have_text("Ajoutez votre premier véhicule ou chargez l'exemple.")
            expect(page.locator('#veh-area')).to_be_hidden()
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Véhicule.
            page.locator('#save-veh').click()
            expect(page.locator('#veh-status')).to_have_text('Nom du véhicule obligatoire')
            page.locator('#veh-form [name=name]').fill('Clio')
            page.locator('#veh-form [name=note]').fill('diesel')
            page.locator('#save-veh').click()
            expect(page.locator('#veh-status')).to_have_text('Clio ajouté.')
            expect(page.locator('#who-odo')).to_have_text('— Clio')
            expect(page.locator('#pace-note')).to_have_text('Aucun kilométrage connu : notez un relevé du compteur ou une intervention.')

            # Relevés : le compteur ne recule pas ; estimation au rythme observé (36 400 + 6 400 × 17 / 273).
            reading(page, day(-290), '30000')
            expect(page.locator('#read-status')).to_contain_text('Relevé noté : 30 000 km')
            expect(page.locator('#pace-note')).to_contain_text('Notez au moins deux kilométrages espacés de 7 jours')
            reading(page, day(-17), '36 400')
            reading(page, day(-100), '29000')
            expect(page.locator('#read-status')).to_contain_text('Le compteur ne recule pas : 30 000 km était déjà noté le')
            reading(page, day(-100), 'abc')
            expect(page.locator('#read-status')).to_have_text('Kilométrage invalide : nombre entier de km (ex. 45200)')
            expect(page.locator('#kpis .kpi').first).to_contain_text('36 799 km')
            expect(page.locator('#kpis .kpi').nth(1)).to_contain_text('8 557 km / an')
            expect(page.locator('#pace-note')).to_contain_text('Estimation : dernier kilométrage connu 36 400 km')

            # Échéances : intervalle obligatoire, puis km et/ou mois.
            schedule(page, 'Vidange', '', '', day(-565), '20000')
            expect(page.locator('#due-status')).to_have_text('Indiquez un intervalle en km, en mois, ou les deux')
            schedule(page, 'Vidange', '15000', '12', day(-565), '20000')
            expect(page.locator('#due-status')).to_have_text('Échéance « Vidange » ajoutée.')
            schedule(page, 'Pneus', '20 000', '', day(-330), '17000')
            schedule(page, 'Contrôle', '', '24', day(-800), '10000')
            dues = page.locator('#dues > li')
            expect(dues).to_have_count(3)
            expect(page.locator('#dues > li.state-late')).to_have_count(2)  # vidange dépassée en km et en temps, contrôle en temps
            pneus = dues.filter(has_text='Pneus')
            expect(pneus).to_contain_text('encore 201 km')
            expect(pneus).to_contain_text('bientôt')
            expect(pneus).to_contain_text('Kilométrage atteint vers le')
            expect(dues.filter(has_text='Contrôle')).to_contain_text('jours de retard')

            # « Fait » : formulaire prérempli (échéance, date du jour, km estimé), puis intervention liée qui relance l'échéance.
            dues.filter(has_text='Vidange').get_by_role('button', name='Noter « Vidange » comme fait').click()
            expect(page.locator('#srv-form [name=km]')).to_have_value('36799')
            expect(page.locator('#srv-form [name=date]')).to_have_value(day(0))
            expect(page.locator('#srv-schedule option:checked')).to_have_text('Vidange')
            service(page, '', day(-200), '33000', '89,90', 'Garage')
            expect(page.locator('#srv-status')).to_have_text("« Vidange » enregistrée : l'échéance repart de cette intervention.")
            expect(dues.filter(has_text='Vidange')).to_contain_text('à jour')
            expect(dues.filter(has_text='Vidange')).to_contain_text('encore 11 201 km')
            expect(page.locator('#alerts')).to_have_text("Rappels : 1 entretien en retard ou dû aujourd'hui · 1 bientôt")

            # Intervention ponctuelle, validation, totaux et coût pour 100 km (234,90 € / 6 400 km).
            service(page, '', day(-100), '34000', '145')
            expect(page.locator('#srv-status')).to_have_text("Décrivez l'intervention ou choisissez une échéance")
            service(page, 'Plaquettes', day(-100), '37000', '145')
            expect(page.locator('#srv-status')).to_contain_text('Le compteur ne recule pas : seulement 36 400 km noté plus tard')
            service(page, 'Plaquettes', day(-100), '34000', '145')
            expect(page.locator('#srv-status')).to_have_text('Intervention « Plaquettes » enregistrée.')
            expect(page.locator('#srv-total')).to_have_text('Total : 234,90 € (2 interventions)')
            expect(page.locator('#kpis .kpi').nth(3)).to_contain_text('3,67 €')
            expect(page.locator('#services > li')).to_have_count(2)

            # Seuils de rappel.
            page.locator('#set-form [name=soonKm]').fill('abc')
            expect(page.locator('#exp-status')).to_have_text('Km avant : nombre entier de 0 à 50000')
            page.locator('#set-form [name=soonKm]').fill('100')
            page.locator('#set-form [name=soonDays]').fill('5')  # pneus : 201 km et ~9 jours au rythme observé -> plus « bientôt »
            expect(page.locator('#exp-status')).to_have_text('Seuils de rappel enregistrés.')
            expect(page.locator('#alerts')).to_have_text("Rappels : 1 entretien en retard ou dû aujourd'hui")
            page.locator('#set-form [name=soonDays]').fill('30')
            page.locator('#set-form [name=soonKm]').fill('1000')
            expect(page.locator('#alerts')).to_contain_text('1 bientôt')

            # Exports .ics et CSV.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_bytes().decode('utf-8')
            assert 'SUMMARY:Pneus — Clio' in ics and 'TRIGGER:-P30D' in ics and f"DTSTART;VALUE=DATE:{day(0).replace('-', '')}" in ics, ics
            expect(page.locator('#exp-status')).to_have_text('Agenda téléchargé : 3 échéances.')
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Date;Véhicule;Kilométrage (km);Intervention;Échéance;Coût (EUR);Remarque\r\n'), csv[:120]
            assert f'{day(-200)};Clio;33000;;Vidange;89,90;Garage\r\n' in csv, csv
            assert f'{day(-100)};Clio;34000;Plaquettes;;145,00;\r\n' in csv, csv

            # Persistance.
            page.reload()
            expect(page.locator('#services > li')).to_have_count(2)
            expect(page.locator('#set-form [name=soonKm]')).to_have_value('1000')

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['services']) == 2
            assert len(json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['readings']) == 2  # enregistré avant de corrompre
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'x{{')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#veh-form [name=name]').fill('Autre')
            page.locator('#save-veh').click()
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'x{'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'x{'
            bad = json.loads(backup); bad['services'][0]['scheduleId'] = 'sch-inconnue'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Échéance inconnue pour ce véhicule')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 véhicule.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#dues > li')).to_have_count(3)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#services > li')).to_have_count(2)
            context.set_offline(False)

            # Suppressions confirmées.
            page.get_by_role('button', name='Supprimer Plaquettes').click()
            expect(page.locator('#srv-status')).to_have_text('Intervention supprimée.')
            expect(page.locator('#services > li')).to_have_count(1)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            page.locator('#delete-veh').click()
            expect(page.locator('#veh-status')).to_have_text('Clio supprimé.')
            expect(page.locator('#veh-area')).to_be_hidden()
            assert not external, external
            assert not errors, errors

            # --- Langues et devises
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Never forget an oil change again.')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#veh-status')).to_have_text('Example loaded: made-up intervals and amounts, to replace with those from your handbook.')
            expect(ip.locator('#kpis .kpi').first).to_contain_text('36,799 km')
            expect(ip.locator('#srv-total')).to_have_text('Total: US$234.90 (2 services)')
            expect(ip.locator('#alerts')).to_have_text('Reminders: 1 item overdue or due today · 1 due soon')
            expect(ip.locator('#dues > li.state-late')).to_contain_text('Roadworthiness test')
            ip.locator('#veh-form [name=name]').fill('Draft car')
            ip.locator('#read-form [name=km]').fill('40000')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#dues > li')).to_have_count(3)
                expect(ip.locator('#services > li')).to_have_count(2)
                assert ip.locator('#veh-form [name=name]').input_value() == 'Draft car'
                assert ip.locator('#read-form [name=km]').input_value() == '40000'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Nie wieder einen Ölwechsel vergessen.')
            ip.locator('#louvre-currency').select_option('CHF')
            expect(ip.locator('#srv-total')).to_contain_text('CHF')
            expect(ip.locator('.cur').first).to_have_text('CHF')
            expect(ip.locator('#dues > li.state-late')).to_contain_text('Tage überfällig')
            ip.locator('#read-form [name=km]').fill('x')
            ip.locator('#add-read').click()
            expect(ip.locator('#read-status')).to_have_text('Ungültiger Kilometerstand: ganze Zahl in km (z. B. 45200)')
            with ip.expect_download() as d:
                ip.locator('#export-ics').click()
            assert 'SUMMARY:Roadworthiness test — Small car'  # noms enregistrés tels que saisis (exemple créé en anglais) in pathlib.Path(d.value.path()).read_bytes().decode('utf-8')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#sample').click()
            expect(ip.locator('#veh-tabs .tab').filter(has_text='سيارة صغيرة')).to_have_count(1)  # exemple dans la langue affichée
            assert ip.evaluate(WIDE) == [], ip.evaluate(WIDE)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS VehicleServiceLog: vehicles, readings, odometer consistency, pace estimate, km/months schedules (first reached), done prefill, reminders, costs, CSV, ICS, backup/restore, protected mode, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
