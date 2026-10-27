"""SeatArrange dans Chromium : invités, tables et rangées, contraintes, placement automatique, ajustement manuel,
rapport, CSV, impression, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-seatarrange-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def stored(page):
    return page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")


def seat_of(page, name):
    """« T1:2 » pour l'invité donné, d'après le stockage."""
    ev = stored(page)['events'][0]
    gid = next(g['id'] for g in ev['guests'] if g['name'] == name)
    place = ev['seating'].get(gid)
    if not place:
        return None
    zone = next(z['name'] for z in ev['zones'] if z['id'] == place[0])
    return f'{zone}:{place[1] + 1}'


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
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#plan')).to_have_text('Ajoutez au moins une table ou une rangée.')

            # Invités : validation puis ajout en liste.
            page.locator('#guest-form button').click()
            expect(page.locator('#guest-status')).to_have_text("Nom de l'invité obligatoire")
            page.locator('#f-guests').fill('Amina ; Famille\nYoussef ; Famille\nLéa ; Amis\nHugo\nSara\nTom\namina')
            page.locator('#guest-form button').click()
            expect(page.locator('#guest-status')).to_contain_text('Invité déjà présent : amina')
            page.locator('#f-guests').fill('Amina ; Famille\nYoussef ; Famille\nLéa ; Amis\nHugo\nSara\nTom')
            page.locator('#guest-form button').click()
            expect(page.locator('#guest-status')).to_have_text('6 invités ajoutés.')
            expect(page.locator('#guests li')).to_have_count(6)
            expect(page.locator('#guest-count')).to_have_text('6')

            # Tables et rangées.
            page.locator('#f-capacity').fill('0')
            page.locator('#zone-form button').click()
            expect(page.locator('#zone-status')).to_have_text('Places : nombre entier de 1 à 40')
            page.locator('#f-capacity').fill('3')
            page.locator('#zone-form button').click()
            expect(page.locator('#zone-status')).to_have_text('Ajouté : Table 1.')
            page.locator('#f-kind').select_option('row')
            page.locator('#f-zone-name').fill('Rang A')
            page.locator('#zone-form button').click()
            expect(page.locator('#zones li')).to_have_count(2)
            expect(page.locator('#seat-count')).to_have_text('6 places')

            # Contraintes.
            page.locator('#f-ctype').select_option('together')
            page.locator('#f-a').select_option(label='Amina')
            page.locator('#f-b').select_option(label='Youssef')
            page.locator('#cons-form button').click()
            expect(page.locator('#cons-status')).to_have_text('Règle ajoutée.')
            page.locator('#f-ctype').select_option('apart')
            page.locator('#f-a').select_option(label='Youssef')
            page.locator('#f-b').select_option(label='Amina')
            page.locator('#cons-form button').click()
            expect(page.locator('#cons-status')).to_contain_text('Règle contradictoire')
            page.locator('#f-a').select_option(label='Amina')
            page.locator('#f-b').select_option(label='Léa')
            page.locator('#cons-form button').click()
            page.locator('#f-ctype').select_option('fixed')
            expect(page.locator('#field-b')).to_be_hidden()
            page.locator('#f-a').select_option(label='Tom')
            page.locator('#f-zone').select_option(label='Rang A')
            page.locator('#f-seat').fill('3')
            page.locator('#cons-form button').click()
            expect(page.locator('#constraints li')).to_have_count(3)
            expect(page.locator('#constraints')).to_contain_text('Tom à Rang A, place 3')

            # Placement automatique : tout est respecté, plan déterministe.
            page.locator('#auto').click()
            expect(page.locator('#plan-status')).to_have_text('Placement terminé : toutes les contraintes sont respectées.')
            expect(page.locator('#report')).to_have_text('6 invités placés sur 6 (6 places). Toutes les contraintes sont respectées.')
            expect(page.locator('#constraints .tag.good')).to_have_count(3)
            assert seat_of(page, 'Tom') == 'Rang A:3'
            assert seat_of(page, 'Amina').split(':')[0] == seat_of(page, 'Youssef').split(':')[0]
            assert seat_of(page, 'Amina').split(':')[0] != seat_of(page, 'Léa').split(':')[0]
            first = stored(page)['events'][0]['seating']
            page.locator('#auto').click()  # confirmation acceptée : même plan
            expect(page.locator('#plan-status')).to_contain_text('toutes les contraintes')
            assert stored(page)['events'][0]['seating'] == first
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile (plan) : {wide}'

            # Ajustement manuel : choisir Léa puis la place d'Amina -> échange ; le rapport signale la règle non respectée.
            amina_zone, amina_seat = seat_of(page, 'Amina').split(':')
            page.locator('.seat', has_text='Léa').click()
            expect(page.locator('#pick-label')).to_have_text('Choisi : Léa')
            page.locator(f'.seat[aria-label="{amina_zone}, place {amina_seat} : Amina"]').click()
            expect(page.locator('#plan-status')).to_have_text('Léa et Amina ont échangé leurs places.')
            assert seat_of(page, 'Léa') == f'{amina_zone}:{amina_seat}'
            expect(page.locator('#report')).to_contain_text('1 point à revoir')
            expect(page.locator('#issues li')).to_have_count(1)
            expect(page.locator('#issues li').first).to_have_text('Amina et Youssef devraient être ensemble.')
            expect(page.locator('#constraints .tag.bad')).to_have_count(1)
            # Retirer du plan au clavier, puis Échap.
            page.locator('.seat', has_text='Sara').focus()
            page.keyboard.press('Enter')
            expect(page.locator('#pick-bar')).to_be_visible()
            page.keyboard.press('Escape')
            expect(page.locator('#pick-bar')).to_be_hidden()
            page.locator('.seat', has_text='Sara').click()
            page.locator('#unseat').click()
            expect(page.locator('#unplaced li')).to_have_count(1)
            expect(page.locator('#issues')).to_contain_text('1 invité sans place.')
            page.locator('#unplaced button').click()
            page.locator('.seat', has_text='libre').first.click()
            expect(page.locator('#unplaced-box')).to_be_hidden()

            # Export CSV avec en-têtes traduits.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').splitlines()
            assert csv[0] == '"Table ou rangée","Type","Place","Invité","Groupe"', csv[0]
            assert '"Rang A","Rangée","3","Tom",""' in csv and len(csv) == 7, csv
            # Impression : le titre de l'événement et le plan seulement.
            page.emulate_media(media='print')
            expect(page.locator('#print-title')).to_be_visible()
            expect(page.locator('#guest-form')).to_be_hidden()
            page.emulate_media(media='screen')

            # Supprimer un invité retire ses règles.
            page.locator('#guests li', has_text='Tom').locator('button').click()
            expect(page.locator('#constraints li')).to_have_count(2)

            # Exemple : nouvel événement, libellés dans la langue affichée.
            page.locator('#sample').click()
            expect(page.locator('#event-select option')).to_have_count(2)
            expect(page.locator('#event-select')).to_contain_text("Dîner de fin d'année")
            expect(page.locator('#guests li')).to_have_count(12)
            expect(page.locator('#guests')).to_contain_text('Collègues')
            page.locator('#auto').click()
            expect(page.locator('#report')).to_contain_text('Toutes les contraintes sont respectées.')

            # Sauvegarde puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['events']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[[[')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#new-event')).to_be_disabled()
            expect(page.locator('#f-guests')).to_be_disabled()
            page.locator('#sample').click(force=True)
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[[['
            tampered = json.loads(backup)
            ev0 = tampered['events'][0]
            ids = list(ev0['seating'])
            ev0['seating'][ids[1]] = ev0['seating'][ids[0]]  # deux invités sur la même chaise
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': json.dumps(tampered).encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 événements.')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#event-select option')).to_have_count(2)
            expect(page.locator('.seat.taken')).to_have_count(12)  # dernier événement affiché
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-GB')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('.hero h1')).to_have_text('Who sits where, without upsetting anyone?')
            ip.locator('#sample').click()
            expect(ip.locator('#event-select')).to_contain_text('End-of-year dinner')
            ip.locator('#auto').click()
            ip.locator('#f-guests').fill('Nour ; Voisins')  # saisie en cours
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#f-guests')).to_have_value('Nour ; Voisins')
                expect(ip.locator('.seat.taken')).to_have_count(12)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-plan')).to_have_text('المخطط')
            expect(ip.locator('#report')).to_contain_text('كل القيود محترمة.')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#report')).to_have_text('12 von 12 Gästen platziert (14 Plätze). Alle Regeln sind erfüllt.')
            ip.locator('#guest-form button').click()
            expect(ip.locator('#guest-status')).to_have_text('1 Gast hinzugefügt.')
            expect(ip.locator('#issues')).to_contain_text('1 Gast ohne Platz.')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS SeatArrange: guests (bulk, duplicates), tables/rows, constraints (contradiction refused), deterministic auto seating, manual swap/unseat/keyboard, unmet-constraint report, CSV, print view, backup/restore (double-booked seat refused), corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
