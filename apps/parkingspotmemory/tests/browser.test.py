"""ParkingSpotMemory dans Chromium : emplacement, validation, photo réduite, GPS avec consentement, guidage, minuterie et alertes (horloge simulée), .ics, habitudes, historique, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import re
import struct
import threading
import zlib
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-parkingspotmemory-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
CAR = {'latitude': 44.837847, 'longitude': -0.57918}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def png(width, height):
    """Image PNG unie (générée ici, sans fichier externe)."""
    raw = b''.join(b'\x00' + bytes((40, 160, 120)) * width for _ in range(height))
    chunk = lambda tag, data: struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def fill_spot(page, place='', level='', zone='', spot='', landmarks='', duration=''):
    f = page.locator('#spot-form')
    for name, value in [('place', place), ('level', level), ('zone', zone), ('spot', spot), ('landmarks', landmarks), ('duration', duration)]:
        f.locator(f'[name={name}]').fill(value)


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='fr-FR', timezone_id='Europe/Paris',
                                          geolocation=CAR, permissions=['geolocation'])
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            expect(page.locator('#current')).to_be_hidden()
            expect(page.locator('#hist-stats')).to_have_text('')
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : menu de langue seul
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save-spot').click()
            expect(page.locator('#car-status')).to_have_text('Notez au moins un repère : parking, niveau, zone, place, repère, photo ou position')
            fill_spot(page, place='Parking Gare', duration='abc')
            page.locator('#save-spot').click()
            expect(page.locator('#car-status')).to_have_text('Durée invalide : ex. 90, 1h30 ou 2h (au plus 10080 minutes)')

            # Position GPS (sur action, avec permission) et photo réduite à 640 px.
            page.locator('#gps').click()
            expect(page.locator('#car-status')).to_have_text('Position ajoutée.')
            expect(page.locator('#gps-draft')).to_contain_text('44.83785')
            page.locator('#photo-input').set_input_files({'name': 'p.png', 'mimeType': 'image/png', 'buffer': png(1600, 1200)})
            expect(page.locator('#car-status')).to_contain_text('Photo réduite et prête')
            expect(page.locator('#photo-preview')).to_be_visible()
            assert page.evaluate("() => document.getElementById('photo-preview').naturalWidth") == 640
            page.locator('#photo-input').set_input_files({'name': 'x.txt', 'mimeType': 'text/plain', 'buffer': b'hello'})
            expect(page.locator('#car-status')).to_have_text('Image illisible ou trop lourde')
            expect(page.locator('#photo-preview')).to_be_visible()  # la photo précédente reste

            # Enregistrement avec minuterie.
            fill_spot(page, place='Parking Gare', level='-2', zone='B', spot='214', landmarks="près de l'ascenseur", duration='1h30')
            page.locator('#save-spot').click()
            expect(page.locator('#car-status')).to_have_text('Emplacement enregistré.')
            expect(page.locator('#current')).to_be_visible()
            expect(page.locator('#spot-form')).to_be_hidden()
            expect(page.locator('#spot-main')).to_have_text('Parking Gare')
            expect(page.locator('#spot-sub')).to_contain_text('niveau -2 · zone B · place 214')
            expect(page.locator('#spot-photo')).to_be_visible()
            expect(page.locator('#countdown')).to_contain_text('Il reste 1:29:')
            expect(page.locator('#timer-end')).to_contain_text('Fin prévue à')
            href = page.locator('#map-link').get_attribute('href')
            assert href.startswith('https://www.openstreetmap.org/?mlat=44.837847&mlon=-0.579180'), href

            # Guidage : position actuelle ~240 m au nord de la voiture -> direction sud.
            context.set_geolocation({'latitude': 44.84, 'longitude': -0.57918})
            page.locator('#find').click()
            expect(page.locator('#guide')).to_contain_text('Le véhicule est à 239 m, direction sud (180°)')
            context.set_geolocation({'latitude': 44.83786, 'longitude': -0.57918})
            page.locator('#find').click()
            expect(page.locator('#guide')).to_contain_text('Vous y êtes presque')

            # Minuterie : prolongation, arrêt, nouveau réglage, rappel .ics.
            page.locator('#plus15').click()
            expect(page.locator('#car-status')).to_have_text('Stationnement prolongé.')
            expect(page.locator('#countdown')).to_contain_text('Il reste 1:44:')
            page.locator('#timer-clear').click()
            expect(page.locator('#countdown')).to_have_text('Aucune minuterie.')
            expect(page.locator('#timer-ics')).to_be_disabled()
            page.locator('#timer-set').click()
            expect(page.locator('#car-status')).to_have_text('Indiquez une durée ou une heure de fin')
            page.locator('#timer-duration').fill('45')
            page.locator('#timer-set').click()
            expect(page.locator('#car-status')).to_have_text('Minuterie réglée.')
            expect(page.locator('#countdown')).to_contain_text('Il reste 0:44:')
            with page.expect_download() as d:
                page.locator('#timer-ics').click()
            ics = pathlib.Path(d.value.path()).read_bytes().decode('utf-8')
            assert 'SUMMARY:Fin du stationnement' in ics and 'TRIGGER:-PT10M' in ics and 'GEO:44.837847;-0.579180' in ics, ics
            expect(page.locator('#car-status')).to_have_text('Rappel téléchargé : alerte 10 minutes avant la fin.')

            # Modification : la photo et la position sont conservées.
            page.locator('#edit').click()
            expect(page.locator('#spot-form [name=spot]')).to_have_value('214')
            expect(page.locator('#save-spot')).to_have_text('Enregistrer les modifications')
            page.locator('#spot-form [name=spot]').fill('215')
            page.locator('#save-spot').click()
            expect(page.locator('#car-status')).to_have_text('Emplacement modifié.')
            expect(page.locator('#spot-sub')).to_contain_text('place 215')
            expect(page.locator('#spot-photo')).to_be_visible()
            expect(page.locator('#countdown')).to_contain_text('Il reste 0:44:')

            # Réglage du préavis.
            page.locator('#set-form [name=warnMinutes]').fill('abc')
            expect(page.locator('#backup-status')).to_have_text('Minutes avant la fin : nombre entier de 0 à 120')
            page.locator('#set-form [name=warnMinutes]').fill('15')
            expect(page.locator('#backup-status')).to_have_text('Réglage enregistré.')

            # Départ -> historique ; habitudes du parking.
            page.locator('#leave').click()
            expect(page.locator('#car-status')).to_contain_text('Bonne route ! Stationnement de 0 min')
            expect(page.locator('#history > li')).to_have_count(1)
            expect(page.locator('#hist-stats')).to_contain_text('1 stationnement, durée moyenne 0 min. Le plus fréquent : Parking Gare (1 fois).')
            expect(page.locator('#spot-form')).to_be_visible()
            page.locator('#spot-form [name=place]').fill('parking gare')
            expect(page.locator('#habit')).to_be_visible()
            expect(page.locator('#habit-text')).to_contain_text('niveau -2 · zone B · place 215')
            page.locator('#habit-use').click()
            expect(page.locator('#spot-form [name=level]')).to_have_value('-2')
            expect(page.locator('#spot-form [name=spot]')).to_have_value('215')
            expect(page.locator('#spot-form [name=place]')).to_have_value('Parking Gare')  # orthographe mémorisée reprise
            page.locator('#save-spot').click()
            expect(page.locator('#car-status')).to_have_text('Emplacement enregistré.')

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            parsed = json.loads(backup)
            assert parsed['current']['spot'] == '215' and len(parsed['history']) == 1 and parsed['history'][0]['photo'].startswith('data:image/jpeg;base64,')
            assert json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['settings']['warnMinutes'] == 15  # enregistré avant de corrompre
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'nope')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            fill_spot(page, place='Ailleurs')
            page.locator('#save-spot').click()
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'nope'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'nope'
            bad = json.loads(backup); bad['current']['photo'] = 'data:text/html;base64,AAAA'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Image illisible ou trop lourde')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text("Sauvegarde restaurée : 1 stationnement dans l'historique.")
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#spot-sub')).to_contain_text('place 215')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#spot-main')).to_have_text('Parking Gare')
            expect(page.locator('#history > li')).to_have_count(1)
            context.set_offline(False)

            # Suppression d'une entrée d'historique.
            page.locator('#history > li').first.get_by_role('button', name='Supprimer').click()
            expect(page.locator('#hist-status')).to_have_text('Entrée supprimée.')
            expect(page.locator('#history .empty')).to_be_visible()
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Alertes de fin (horloge simulée) : préavis puis dépassement, prolongation qui les efface.
            clock_ctx = browser.new_context(viewport={'width': 390, 'height': 844}, locale='fr-FR', timezone_id='Europe/Paris')
            cp = clock_ctx.new_page()
            cp.on('pageerror', lambda e: errors.append(str(e)))
            cp.clock.install(time=datetime.datetime(2026, 10, 27, 8, 0, tzinfo=datetime.timezone.utc))  # 09:00 à Paris (un nombre serait lu en secondes)
            cp.goto(origin)
            fill_spot(cp, place='Rue Sainte-Catherine', duration='20')
            cp.locator('#save-spot').click()
            expect(cp.locator('#countdown')).to_have_text(re.compile(r'^Il reste 0:(20:00|19:[0-5]\d)$'))  # l'horloge simulée continue d'avancer
            expect(cp.locator('#alarm')).to_be_hidden()
            cp.clock.fast_forward('11:00')
            expect(cp.locator('#alarm')).to_have_text('Plus que 9 minutes de stationnement !')
            expect(cp.locator('#timer-box')).to_have_class('timer state-warn')
            cp.clock.fast_forward('10:00')
            expect(cp.locator('#alarm')).to_have_text("Le stationnement s'est terminé à 09:20.")
            expect(cp.locator('#countdown')).to_contain_text('Dépassé de 0:01:')
            assert cp.title().startswith('⏰'), cp.title()
            cp.locator('#plus15').click()
            expect(cp.locator('#alarm')).to_be_hidden()
            expect(cp.locator('#timer-box')).to_have_class('timer state-running')
            clock_ctx.close()

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Parked. Noted. Found.')
            ip.locator('#sample').click()
            expect(ip.locator('#car-status')).to_contain_text('Example added to the history')
            expect(ip.locator('#history > li')).to_have_count(3)
            expect(ip.locator('#hist-stats')).to_contain_text('3 parkings, average duration 2 h 05.')
            expect(ip.locator('#habit-text')).to_contain_text('level -2 · zone blue · bay 188')
            ip.locator('#spot-form [name=place]').fill('Draft park')
            ip.locator('#spot-form [name=level]').fill('P3')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#history > li')).to_have_count(3)
                assert ip.locator('#spot-form [name=place]').input_value() == 'Draft park'
                assert ip.locator('#spot-form [name=level]').input_value() == 'P3'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Geparkt. Notiert. Gefunden.')
            expect(ip.locator('#hist-stats')).to_contain_text('3 Parkvorgänge')
            ip.locator('#spot-form [name=duration]').fill('x')
            ip.locator('#save-spot').click()
            expect(ip.locator('#car-status')).to_have_text('Ungültige Dauer: z. B. 90, 1h30 oder 2h (höchstens 10080 Minuten)')
            ip.locator('#spot-form [name=duration]').fill('2h')
            ip.locator('#save-spot').click()
            expect(ip.locator('#countdown')).to_contain_text('Noch 1:59:')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#countdown')).to_contain_text('المتبقي')
            assert ip.evaluate(WIDE) == [], ip.evaluate(WIDE)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS ParkingSpotMemory: spot, validation, shrunk photo, consented GPS, guidance, timer + alerts (simulated clock), ICS, edit, habits, history, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
