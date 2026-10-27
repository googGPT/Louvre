"""FlightTimeMath dans Chromium : validation, seuil, vols avec escale, J+1, correspondance courte, modification, .ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-flighttimemath-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_seg(page, flight, frm, from_zone, depart, to, to_zone, arrive):
    f = page.locator('#seg-form')
    f.locator('[name=flight]').fill(flight)
    f.locator('[name=from]').fill(frm)
    f.locator('[name=fromZone]').fill(from_zone)
    f.locator('[name=depart]').fill(depart)
    f.locator('[name=to]').fill(to)
    f.locator('[name=toZone]').fill(to_zone)
    f.locator('[name=arrive]').fill(arrive)
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
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : menu de langue seul
            expect(page.locator('#res-empty')).to_be_visible()

            # Validation.
            page.locator('#add-seg').click()
            expect(page.locator('#seg-status')).to_have_text("Lieu de départ et d'arrivée obligatoires")
            fill_seg(page, '', 'Paris', 'Mars/Base', '2026-11-10T21:30', 'Dubaï', 'Asia/Dubai', '2026-11-11T06:35')
            expect(page.locator('#seg-status')).to_have_text('Fuseau inconnu (ex. Europe/Paris)')
            fill_seg(page, '', 'Paris', 'Europe/Paris', '2026-03-29T02:30', 'Lyon', 'Europe/Paris', '2026-03-29T04:00')
            expect(page.locator('#seg-status')).to_have_text("L'heure 02:30 n'existe pas ce jour-là dans ce fuseau (passage à l'heure d'été)")
            fill_seg(page, '', 'Paris', 'Europe/Paris', '2026-11-10T10:00', 'Tokyo', 'Asia/Tokyo', '2026-11-10T17:00')
            expect(page.locator('#seg-status')).to_contain_text("L'arrivée doit être après le départ")
            page.locator('#conn-form [name=min]').fill('une heure')
            page.locator('#save-conn').click()
            expect(page.locator('#conn-status')).to_have_text('Seuil invalide : minutes (ex. 90) ou h:mm, 1440 min au plus')

            # Seuil et deux vols : vol de nuit (J+1) puis correspondance de 45 min.
            page.locator('#conn-form [name=min]').fill('1:00')
            page.locator('#save-conn').click()
            expect(page.locator('#conn-status')).to_have_text('Seuil enregistré : 1 h.')
            fill_seg(page, 'XY 101', 'Paris (CDG)', 'europe/paris', '2026-11-10T21:30', 'Dubaï', 'Asia/Dubai', '2026-11-11T06:35')
            expect(page.locator('#seg-status')).to_have_text('Vol ajouté : XY 101 · Paris (CDG) → Dubaï (6 h 05).')
            assert page.locator('#seg-form [name=from]').input_value() == 'Dubaï'  # prérempli pour le vol suivant
            assert page.locator('#seg-form [name=fromZone]').input_value() == 'Asia/Dubai'
            fill_seg(page, 'XY 202', 'Dubaï', 'Asia/Dubai', '2026-11-11T07:20', 'Singapour', 'Asia/Singapore', '2026-11-11T18:40')
            segs, conns = page.locator('#timeline li.seg'), page.locator('#timeline li.conn')
            expect(segs).to_have_count(2)
            expect(conns).to_have_count(1)
            expect(conns.nth(0)).to_have_class('conn short')
            expect(conns.nth(0)).to_contain_text('Correspondance trop courte à Dubaï : 45 min (seuil 1 h)')
            expect(segs.nth(0)).to_contain_text('J+1')
            expect(segs.nth(0)).to_contain_text('Europe/Paris · UTC+1')
            expect(segs.nth(0)).to_contain_text("Décalage horaire à l'arrivée : +3 h")
            expect(page.locator('#k-journey')).to_have_text('14 h 10')
            expect(page.locator('#k-air')).to_have_text('13 h 25')
            expect(page.locator('#k-ground')).to_have_text('45 min')
            expect(page.locator('#k-arrival')).to_have_text('18:40 J+1')
            expect(page.locator('#verdict')).to_have_text('1 correspondance à revoir.')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile (itinéraire) : {wide}'

            # Modification du second vol : la correspondance devient suffisante.
            segs.nth(1).get_by_role('button', name='Modifier XY 202 · Dubaï → Singapour').click()
            expect(page.locator('#add-seg')).to_have_text('Enregistrer le vol')
            page.locator('#seg-form [name=depart]').fill('2026-11-11T08:00')
            page.locator('#seg-form [name=arrive]').fill('2026-11-11T19:20')
            page.locator('#add-seg').click()
            expect(page.locator('#seg-status')).to_have_text('Vol modifié : XY 202 · Dubaï → Singapour.')
            expect(page.locator('#add-seg')).to_have_text('Ajouter le vol')
            expect(conns.nth(0)).to_have_class('conn ok')
            expect(conns.nth(0)).to_have_text('Escale à Dubaï : 1 h 25')
            expect(page.locator('#verdict')).to_have_text('Toutes les correspondances respectent votre seuil de 1 h.')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['trips'][0]['minConnection'] == 60 and len(saved['trips'][0]['segments']) == 2
            assert saved['trips'][0]['segments'][0]['fromZone'] == 'Europe/Paris'  # nom IANA normalisé

            # Export agenda.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 2 and 'DTSTART:20261110T203000Z' in ics and 'DTEND:20261111T112000Z' in ics, ics
            assert 'SUMMARY:XY 101 · Paris (CDG) → Dubaï' in ics, ics
            expect(page.locator('#res-status')).to_have_text('Fichier agenda téléchargé.')

            # Export JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['trips'][0]['segments'][1]['depart'] == '2026-11-11T08:00'
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            fill_seg(page, '', 'A', 'UTC', '2026-11-10T10:00', 'B', 'UTC', '2026-11-10T11:00')
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == '{abîmé'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"flighttimemath","version":1,"trips":[{"id":"bad"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 voyage.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#timeline li.seg')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#timeline li.seg')).to_have_count(2)
            expect(page.locator('#k-journey')).to_have_text('14 h 50')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Wie lange dauert diese Reise wirklich?')
            ip.locator('#sample').click()
            expect(ip.locator('#trip-status')).to_have_text('Beispiel hinzugefügt: Nachtflug und knapper Anschluss.')
            expect(ip.locator('#timeline li.conn')).to_have_count(1)
            ip.locator('#seg-form [name=flight]').fill('LH 9')  # saisie en cours
            ip.locator('#conn-form [name=min]').fill('75')
            expected = {'fr': '1 correspondance à revoir.', 'en': '1 connection to review.', 'es': '1 conexión por revisar.',
                        'ar': 'رحلة موصلة واحدة تحتاج إلى مراجعة.', 'pt': '1 ligação a rever.', 'de': '1 Anschluss prüfen.', 'it': '1 coincidenza da rivedere.'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#verdict')).to_have_text(expected[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#timeline li.seg')).to_have_count(2)
                assert ip.locator('#seg-form [name=flight]').input_value() == 'LH 9', lang
                assert ip.locator('#conn-form [name=min]').input_value() == '75', lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-res')).to_have_text('خط السير')
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#timeline li.seg').nth(0)).to_contain_text('+1 day')
            expect(ip.locator('#timeline li.conn').nth(0)).to_contain_text('Connection too tight in Dubai (DXB): 45 min (threshold 1h)')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#timeline li.seg').nth(0)).to_contain_text('Dubai (DXB)')  # données saisies gardées telles quelles
            ip.locator('#seg-form [name=from]').fill('Berlin')
            ip.locator('#seg-form [name=fromZone]').fill('Berlin')
            ip.locator('#add-seg').click()
            expect(ip.locator('#seg-status')).to_have_text('Unbekannte Zeitzone (z. B. Europe/Berlin)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS FlightTimeMath: validation, DST gap, threshold, layover, next-day arrival, tight connection, edit, ics, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
