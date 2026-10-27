"""NoiseDiary dans Chromium : saisie, minuit, statistiques, nuits, période, modification, CSV, rapport, sauvegarde, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-noisediary-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add(page, day, start, end, kind='music', intensity='3', source='', notes=''):
    f = page.locator('#entry-form')
    f.locator('[name=day]').fill(day)
    f.locator('[name=start]').fill(start)
    f.locator('[name=end]').fill(end)
    f.locator('[name=type]').select_option(kind)
    f.locator('[name=intensity]').select_option(intensity)
    f.locator('[name=source]').fill(source)
    f.locator('[name=notes]').fill(notes)
    page.locator('#save').click()
    expect(page.locator('#form-status')).to_contain_text('Ajouté')


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
            expect(page.locator('.notice')).to_contain_text('décibels')

            # Saisies invalides refusées, rien n'est enregistré.
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('Heure de début invalide (ex. 22:30)')
            page.locator('#entry-form [name=start]').fill('22:00'); page.locator('#entry-form [name=end]').fill('22:00')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('Le début et la fin doivent être différents')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") is None

            # Quatre observations, dont une qui passe minuit.
            add(page, '2026-10-09', '23:30', '01:15', 'music', '4', 'Appartement du dessus', 'Basses, fenêtres fermées')
            add(page, '2026-10-10', '14:00', '15:30', 'works', '5', 'Chantier')
            add(page, '2026-10-10', '22:15', '22:45', 'music', '3', 'appartement du dessus')
            add(page, '2026-10-12', '07:00', '07:20', 'footsteps', '1')
            expect(page.locator('#k-count')).to_have_text('4')
            expect(page.locator('#k-total')).to_have_text('4 h 05')
            expect(page.locator('#k-nights')).to_have_text('2')
            expect(page.locator('#k-night')).to_have_text('2 h 15')
            expect(page.locator('#k-days')).to_have_text('3')
            expect(page.locator('#k-avg')).to_have_text('3,3 / 5')
            items = page.locator('#journal li')
            expect(items).to_have_count(4)
            expect(items.nth(0)).to_contain_text('lundi 12 octobre 2026')
            expect(items.nth(3)).to_contain_text('23:30 → 01:15 (lendemain)')
            expect(page.locator('#hours div')).to_have_count(24)
            expect(page.locator('#weekdays li')).to_have_count(7)
            expect(page.locator('#types li')).to_have_count(3)
            expect(page.locator('#sources li').nth(0)).to_contain_text('Appartement du dessus')
            expect(page.locator('#sources li').nth(0)).to_contain_text('2 ·')

            # Modification puis suppression.
            items.filter(has_text='14:00 → 15:30').get_by_role('button', name='Modifier').click()
            expect(page.locator('#h-form')).to_have_text('Modifier l\'observation')
            page.locator('#entry-form [name=end]').fill('16:00')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_contain_text('Modifié')
            expect(page.locator('#k-total')).to_have_text('4 h 35')
            expect(page.locator('#cancel-edit')).to_be_hidden()
            items.filter(has_text='07:00 → 07:20').get_by_role('button', name='Supprimer').click()
            expect(page.locator('#form-status')).to_have_text('Observation supprimée.')
            expect(items).to_have_count(3)

            # Plage de nuit réglable.
            page.locator('#night-start').fill('23:00'); page.locator('#night-end').fill('06:00')
            page.locator('#save-night').click()
            expect(page.locator('#night-status')).to_have_text('Plage de nuit : 23:00 → 06:00.')
            expect(page.locator('#k-night')).to_have_text('1 h 45')
            expect(page.locator('#k-nights')).to_have_text('1')
            page.locator('#night-end').fill('23:00')
            page.locator('#save-night').click()
            expect(page.locator('#night-status')).to_contain_text('doivent être différents')
            page.locator('#night-start').fill('22:00'); page.locator('#night-end').fill('07:00')
            page.locator('#save-night').click()
            expect(page.locator('#k-night')).to_have_text('2 h 15')

            # Filtrage par période.
            page.locator('#from').fill('2026-10-10'); page.locator('#from').dispatch_event('change')
            page.locator('#to').fill('2026-10-10'); page.locator('#to').dispatch_event('change')
            expect(page.locator('#k-count')).to_have_text('2')
            expect(page.locator('#journal li')).to_have_count(2)
            page.locator('#to').fill('2026-10-01'); page.locator('#to').dispatch_event('change')
            expect(page.locator('#stats-status')).to_have_text('La période commence après sa fin')
            page.locator('#p-all').click()
            expect(page.locator('#k-count')).to_have_text('3')

            # CSV : en-têtes traduits, jour de fin, minutes de nuit.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig').strip().split('\r\n')  # lignes CRLF
            assert csv[0].startswith('"Jour";"Jour de la semaine";"Début"'), csv[0]
            assert len(csv) == 4, csv
            assert csv[1].startswith('"2026-10-09";"vendredi";"23:30";"01:15";"2026-10-10";"105";"105";"Musique";"4"'), csv[1]
            expect(page.locator('#backup-status')).to_have_text('CSV téléchargé : 3 observations.')

            # Rapport imprimable (impression simulée) : visible seul à l'impression.
            page.evaluate('() => { window.print = () => { window.__printed = true; }; }')
            page.locator('#print').click()
            assert page.evaluate('() => window.__printed === true')
            expect(page.locator('#report h1')).to_have_text('Relevé des nuisances sonores observées')
            expect(page.locator('#report tbody tr')).to_have_count(3)
            expect(page.locator('#report')).to_contain_text('ne constitue pas un avis juridique')
            page.emulate_media(media='print')
            expect(page.locator('#report')).to_be_visible()
            expect(page.locator('.wrap')).to_be_hidden()
            page.emulate_media(media='screen')
            expect(page.locator('#report')).to_be_hidden()

            # Exemple généré dans la langue affichée.
            page.locator('#sample').click()
            expect(page.locator('#form-status')).to_have_text('Exemple ajouté : 8 observations.')
            expect(page.locator('#k-count')).to_have_text('11')
            expect(page.locator('#sources li').nth(0)).to_contain_text('Appartement du dessus')

            # Export puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['entries']) == 11
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#entry-form [name=start]').fill('10:00'); page.locator('#entry-form [name=end]').fill('11:00')
            page.locator('#save').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'pas du json'
            bad = json.loads(backup); bad['entries'][0]['intensity'] = 9
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée : Intensité perçue')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('11 observations')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-count')).to_have_text('11')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#journal li')).to_have_count(11)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : navigateur allemand détecté, puis les 7 langues ; la saisie en cours est conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Jedes Geräusch notieren, mit Tag und Uhrzeit')
            ip.locator('#sample').click()
            expect(ip.locator('#form-status')).to_contain_text('Beispiel hinzugefügt')
            expect(ip.locator('#sources li').nth(0)).to_contain_text('Wohnung darüber')
            ip.locator('#entry-form [name=source]').fill('Entwurf')
            ip.locator('#entry-form [name=type]').select_option('alarm')
            titles = {'fr': 'Statistiques', 'en': 'Statistics', 'es': 'Estadísticas', 'ar': 'الإحصاءات', 'pt': 'Estatísticas', 'de': 'Statistik', 'it': 'Statistiche'}
            alarms = {'fr': 'Alarme', 'en': 'Alarm', 'es': 'Alarma', 'ar': 'إنذار', 'pt': 'Alarme', 'de': 'Alarm', 'it': 'Allarme'}
            for lang, title in titles.items():
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-stats')).to_have_text(title)
                expect(ip.locator('#journal li')).to_have_count(8)
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#entry-form [name=source]').input_value() == 'Entwurf', lang
                assert ip.locator('#entry-form [name=type]').input_value() == 'alarm', lang
                expect(ip.locator('#entry-form [name=type] option:checked')).to_have_text(alarms[lang])
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent : langue seulement
            # Erreur du moteur traduite.
            ip.locator('#louvre-lang').select_option('it')
            ip.locator('#entry-form [name=start]').fill('')
            ip.locator('#save').click()
            expect(ip.locator('#form-status')).to_have_text('Ora di inizio non valida (es. 22:30)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS NoiseDiary: validation, midnight, stats, nights, period, edit/delete, csv, print report, sample, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
