"""PetCareLog dans Chromium : animaux, soins récurrents, retards, rendez-vous, poids et courbe SVG, dépenses, CSV, .ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues et devises."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-petcarelog-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def day(offset=0):
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


def open_details(page, sel):
    if page.locator(sel).get_attribute('open') is None:
        page.locator(sel + ' summary').click()


def care(page, ctype, every, unit, last, label=''):
    open_details(page, '#care-add')
    page.locator('#care-type').select_option(ctype)
    page.locator('#care-form [name=label]').fill(label)
    page.locator('#care-form [name=every]').fill(every)
    page.locator('#care-unit').select_option(unit)
    page.locator('#care-form [name=last]').fill(last)
    page.locator('#save-care').click()


def weight(page, date, value, unit='kg'):
    page.locator('#weight-form [name=date]').fill(date)
    page.locator('#weight-form [name=value]').fill(value)
    page.locator('#weight-form [name=unit]').select_option(unit)
    page.locator('#weight-form button').click()


def expense(page, pet, cat, amount, date=''):
    page.locator('#exp-pet').select_option(label=pet)
    page.locator('#exp-cat').select_option(cat)
    page.locator('#exp-form [name=amount]').fill(amount)
    page.locator('#exp-form [name=date]').fill(date)
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
            expect(page.locator('#pet-tabs .empty')).to_have_text("Ajoutez votre premier animal ou chargez l'exemple.")
            expect(page.locator('#pet-area')).to_be_hidden()
            assert page.evaluate('() => LouvreI18n.currency') == 'EUR'
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Animaux.
            page.locator('#save-pet').click()
            expect(page.locator('#pet-status')).to_have_text("Nom de l'animal obligatoire")
            page.locator('#pet-form [name=name]').fill('Rex')
            page.locator('#pet-form [name=species]').fill('Chien')
            page.locator('#save-pet').click()
            expect(page.locator('#pet-status')).to_have_text('Rex ajouté.')
            expect(page.locator('#pet-area')).to_be_visible()
            expect(page.locator('#who-care')).to_have_text('— Rex')

            # Soins : validation, retard, « Fait ».
            care(page, 'deworm', '0', 'day', day(-35))
            expect(page.locator('#care-status')).to_have_text('Récurrence : nombre entier de 1 à 120')
            care(page, 'deworm', '30', 'day', day(3))
            expect(page.locator('#care-status')).to_have_text('Le dernier soin ne peut pas être dans le futur')
            care(page, 'deworm', '30', 'day', day(-35))
            expect(page.locator('#care-status')).to_contain_text('Vermifuge ajouté.')
            care(page, 'vaccine', '1', 'year', day(-100), 'Rage')
            expect(page.locator('#cares > li')).to_have_count(2)
            late = page.locator('#cares > li.state-late')
            expect(late).to_contain_text('5 jours de retard')
            expect(late).to_contain_text('récurrence : 30 jours')
            expect(page.locator('#cares > li').nth(1)).to_contain_text('Vaccin · Rage')
            late.get_by_role('button', name="Vermifuge fait aujourd'hui").click()
            expect(page.locator('#care-status')).to_contain_text('Vermifuge noté. Prochain :')
            expect(page.locator('#cares > li.state-late')).to_have_count(0)
            expect(page.locator('#cares > li').filter(has_text='Vermifuge')).to_contain_text('dans 30 jours')

            # Rendez-vous.
            open_details(page, '#appt-add')
            page.locator('#appt-form button').click()
            expect(page.locator('#appt-status')).to_have_text('Objet du rendez-vous obligatoire')
            page.locator('#appt-form [name=title]').fill('Contrôle')
            page.locator('#appt-form [name=date]').fill(day(12))
            page.locator('#appt-form [name=time]').fill('09:30')
            page.locator('#appt-form button').click()
            expect(page.locator('#appts > li')).to_contain_text('dans 12 jours')
            expect(page.locator('#appts > li')).to_contain_text('09:30')

            # Poids et courbe.
            weight(page, day(0), 'abc')
            expect(page.locator('#weight-status')).to_have_text('Poids invalide (ex. 12,4 kg ou 850 g)')
            weight(page, day(-60), '12')
            expect(page.locator('#chart .empty')).to_have_text('La courbe apparaît à partir de deux pesées.')
            weight(page, day(-30), '12,5')
            weight(page, day(0), '13000', 'g')
            expect(page.locator('#weight-status')).to_contain_text('13 kg noté le')
            expect(page.locator('#chart circle')).to_have_count(3)
            expect(page.locator('#weight-kpis')).to_contain_text('+1 kg (+8,3 %)')
            expect(page.locator('#weights > li')).to_have_count(3)

            # Deuxième animal : affichage séparé.
            page.locator('#pet-form [name=name]').fill('Mia')
            page.locator('#save-pet').click()
            expect(page.locator('#who-weight')).to_have_text('— Mia')
            expect(page.locator('#weights .empty')).to_be_visible()
            page.locator('#pet-tabs').get_by_role('button', name='Rex').click()
            expect(page.locator('#chart circle')).to_have_count(3)

            # Dépenses : centimes exacts, par animal et par catégorie.
            expense(page, 'Rex', 'food', 'abc')
            expect(page.locator('#exp-status')).to_have_text('Montant invalide (ex. 24,90)')
            expense(page, 'Rex', 'food', '0,10')
            expense(page, 'Rex', 'food', '0,20', day(-1))
            expense(page, 'Mia', 'vet', '45')
            expect(page.locator('#exp-status')).to_have_text('45,00 € ajouté pour Mia.')
            expect(page.locator('#exp-total')).to_have_text('Total : 45,30 € (3 dépenses)')
            expect(page.locator('#by-cat li').first).to_contain_text('Vétérinaire')
            expect(page.locator('#by-cat li').nth(1)).to_contain_text('0,30 €')
            page.locator('#exp-filter').select_option(label='Rex')
            expect(page.locator('#exp-total')).to_have_text('Total : 0,30 € (2 dépenses)')
            page.locator('#exp-filter').select_option('')

            # Exports CSV et .ics.
            with page.expect_download() as d:
                page.locator('#export-exp').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Date;Animal;Catégorie;Précision;Montant (EUR)\r\n'), csv[:80]
            assert f'{day(0)};Rex;Alimentation;;0,10\r\n' in csv, csv
            with page.expect_download() as d:
                page.locator('#export-weights').click()
            wcsv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert f'{day(-30)};Rex;12,500\r\n' in wcsv, wcsv
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_bytes().decode('utf-8')
            assert 'SUMMARY:Vermifuge — Rex' in ics and f"DTSTART:{day(12).replace('-', '')}T093000" in ics, ics
            expect(page.locator('#export-status')).to_contain_text('Agenda téléchargé : 3 événements.')  # vermifuge à J+30 et J+60, rendez-vous à J+12 (90 jours)

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['expenses']) == 3
            assert len(json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['expenses']) == 3  # enregistré avant de corrompre
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#pet-form [name=name]').fill('Nouveau')
            page.locator('#save-pet').click()
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[abîmé'
            bad = json.loads(backup); bad['expenses'][0]['cents'] = 10.5
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 animaux.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#exp-total')).to_have_text('Total : 45,30 € (3 dépenses)')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#pet-tabs .tab')).to_have_count(2)
            context.set_offline(False)

            # Suppression d'un animal (confirmée) : ses dépenses partent avec lui.
            page.locator('#pet-tabs').get_by_role('button', name='Mia').click()
            page.locator('#delete-pet').click()
            expect(page.locator('#pet-status')).to_have_text('Mia supprimé.')
            expect(page.locator('#exp-total')).to_have_text('Total : 0,30 € (2 dépenses)')
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues et devises
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Vaccines, appointments, weight and spending in one place.')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#pet-status')).to_have_text('Example loaded: 2 pets (demo values, not recommendations).')
            expect(ip.locator('#exp-total')).to_have_text('Total: US$200.39 (5 expenses)')
            expect(ip.locator('#cares > li.state-late')).to_contain_text('5 days overdue')
            ip.locator('#pet-form [name=name]').fill('Draft pet')
            ip.locator('#exp-form [name=amount]').fill('12.34')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#pet-tabs .tab')).to_have_count(2)
                expect(ip.locator('#chart circle')).to_have_count(4)
                assert ip.locator('#pet-form [name=name]').input_value() == 'Draft pet'
                assert ip.locator('#exp-form [name=amount]').input_value() == '12.34'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Impfungen, Termine, Gewicht und Ausgaben an einem Ort.')
            ip.locator('#louvre-currency').select_option('CHF')
            expect(ip.locator('#exp-total')).to_contain_text('CHF')
            expect(ip.locator('#cur-symbol')).to_have_text('CHF')
            expect(ip.locator('#cares > li.state-late')).to_contain_text('5 Tage überfällig')
            ip.locator('#exp-form [name=amount]').fill('x')
            ip.locator('#add-exp').click()
            expect(ip.locator('#exp-status')).to_have_text('Ungültiger Betrag (z. B. 24,90)')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#sample').click()
            expect(ip.locator('#pet-tabs .tab').filter(has_text='فلفل')).to_have_count(1)  # exemple dans la langue affichée
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PetCareLog: pets, recurring care, overdue, done, appointments, weight + SVG curve, spending per pet/category, CSV, ICS, backup/restore, protected mode, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
