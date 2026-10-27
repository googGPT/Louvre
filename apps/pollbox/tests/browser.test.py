"""PollBox dans Chromium : brouillon, ouverture, isoloir et écran « Au suivant », vote blanc, limite de votants,
code organisateur, clôture et résultats, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-pollbox-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def stored(page):
    return page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")


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
            errors, external, answers = [], [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept(answers.pop(0) if answers else d.default_value) if d.type == 'prompt' else d.accept())
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#no-poll')).to_be_visible()

            # Exemple dans la langue affichée, puis validation du brouillon.
            page.locator('#sample').click()
            expect(page.locator('#f-question')).to_have_value("Où organiser la sortie d'équipe ?")
            expect(page.locator('#f-options')).to_have_value('Musée\nRandonnée\nRestaurant\nBowling')
            page.locator('#f-options').fill('Musée')
            expect(page.locator('#edit-status')).to_have_text('Au moins 2 options')
            page.locator('#f-options').fill('Musée\nRandonnée\nRestaurant\nmusée')
            expect(page.locator('#edit-status')).to_have_text('Option en double : « musée »')
            page.locator('#f-options').fill('Musée\nRandonnée\nRestaurant')
            expect(page.locator('#save-state')).to_have_text('Brouillon enregistré sur cet appareil')
            assert [o['label'] for o in stored(page)['polls'][0]['options']] == ['Musée', 'Randonnée', 'Restaurant']

            # Enregistrement différé forcé avant de créer un autre scrutin.
            page.locator('#f-question').fill('Sortie de printemps ?')
            page.locator('#new-poll').click()
            expect(page.locator('#poll-select option')).to_have_count(2)
            assert stored(page)['polls'][0]['question'] == 'Sortie de printemps ?'
            page.locator('#poll-select').select_option(index=0)
            expect(page.locator('#f-question')).to_have_value('Sortie de printemps ?')

            # Paramètres : 4 votants attendus, code organisateur ; ouverture.
            page.locator('#f-max-ballots').fill('4')
            page.locator('#f-pin').fill('2468')
            expect(page.locator('#save-state')).to_have_text('Brouillon enregistré · code organisateur actif')
            page.locator('#open-poll').click()
            expect(page.locator('#state-tag')).to_have_text('vote en cours')
            expect(page.locator('#participation')).to_have_text('0 bulletin déposé sur 4')
            expect(page.locator('#hidden-note')).to_be_visible()
            expect(page.locator('#results')).to_be_hidden()
            expect(page.locator('#editor')).to_be_hidden()

            # Isoloir : tout le reste est masqué ; « Au suivant » efface le choix.
            page.locator('#start-booth').click()
            expect(page.locator('#booth')).to_be_visible()
            expect(page.locator('header.top')).to_be_hidden()
            expect(page.locator('#organizer')).to_be_hidden()
            expect(page.locator('#booth-q')).to_have_text('Sortie de printemps ?')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement isoloir : {wide}'
            page.locator('#cast').click()
            expect(page.locator('#booth-status')).to_have_text('Choisissez une option avant de voter')
            page.locator('.choice', has_text='Restaurant').click()
            page.locator('#cast').click()
            expect(page.locator('#booth-done')).to_be_visible()
            expect(page.locator('#done-title')).to_be_focused()
            assert page.locator('#choices input').count() == 0  # le choix n'existe plus dans la page
            assert page.locator('#booth').inner_text().find('Restaurant') == -1
            data = stored(page)['polls'][0]
            assert data['counts'] == [0, 0, 1] and data['ballots'] == 1
            assert set(data) == {'allowBlank', 'ballots', 'blank', 'counts', 'id', 'lock', 'maxBallots', 'maxChoices', 'mode', 'options', 'question', 'status'}
            page.locator('#next').click()
            expect(page.locator('#choices input')).to_have_count(3)
            assert page.locator('#choices input:checked').count() == 0
            page.locator('#cast-blank').click()
            expect(page.locator('#booth-done')).to_be_visible()
            for choice in ['Musée', 'Restaurant']:
                page.locator('#next').click()
                page.locator('.choice', has_text=choice).click()
                page.locator('#cast').click()
                expect(page.locator('#booth-done')).to_be_visible()
            page.locator('#next').click()
            expect(page.locator('#booth-full')).to_be_visible()  # 4 votants attendus
            # Sortie protégée par le code.
            answers.append('0000')
            page.locator('#exit-booth').click()
            expect(page.locator('#booth-status')).to_have_text('Code organisateur incorrect')
            expect(page.locator('#booth')).to_be_visible()
            answers.append('2468')
            page.locator('#exit-booth').click()
            expect(page.locator('#organizer')).to_be_visible()
            expect(page.locator('#participation')).to_have_text('4 bulletins déposés sur 4')
            expect(page.locator('#start-booth')).to_be_disabled()
            assert page.locator('#result-rows li').count() == 0  # toujours rien avant la clôture

            # Clôture avec le code, résultats.
            answers.append('1111')
            page.locator('#close-poll').click()
            expect(page.locator('#sum-status')).to_have_text('Code organisateur incorrect')
            answers.append('2468')
            page.locator('#close-poll').click()
            expect(page.locator('#state-tag')).to_have_text('clos')
            expect(page.locator('#winner')).to_have_text('En tête : Restaurant, 2 voix (66,7 %).')
            expect(page.locator('#result-rows li')).to_have_count(3)
            expect(page.locator('#result-rows li').first).to_contain_text('1. Restaurant')
            expect(page.locator('#results-note')).to_contain_text('4 bulletins au total. Dont 1 blanc (25,0 %).')
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').splitlines()
            assert csv[0] == '"Question","Sortie de printemps ?"' and csv[1] == '"Option","Voix","Pourcentage","Rang"', csv
            assert csv[2] == '"Restaurant","2","66,7","1"' and csv[-1] == '"Bulletins","4","",""', csv

            # Dupliquer : nouveau brouillon sans votes.
            page.locator('#dup-poll').click()
            expect(page.locator('#f-question')).to_have_value('Sortie de printemps ?')
            expect(page.locator('#poll-select option')).to_have_count(3)

            # Sauvegarde puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['polls']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#new-poll')).to_be_disabled()
            page.locator('#sample').click(force=True)
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'abîmé'
            tampered = json.loads(backup)
            tampered['polls'][0]['counts'] = [9, 0, 2]  # totaux incohérents
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': json.dumps(tampered).encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 3 scrutins.')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#poll-select option')).to_have_count(3)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-MX')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Un dispositivo, una urna, resultados al final.')
            ip.locator('#sample').click()
            expect(ip.locator('#f-question')).to_have_value('¿Adónde vamos en la salida del equipo?')
            ip.locator('#f-options').press('End')
            ip.locator('#f-options').type('\nCine')  # saisie en cours
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#f-options').input_value().endswith('Bolera\nCine'), lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-privacy')).to_have_text('السرية: ما هو مضمون وما ليس مضمونًا')
            ip.locator('#open-poll').click()
            expect(ip.locator('#participation')).to_have_text('لم تُودَع أي ورقة')
            ip.locator('#start-booth').click()
            expect(ip.locator('#cast')).to_have_text('صوّت')
            wide = ip.evaluate(WIDE)
            assert not wide, f'débordement isoloir ar : {wide}'
            ip.locator('.choice', has_text='Cine').click()
            ip.locator('#cast').click()
            expect(ip.locator('#next')).to_have_text('التالي')
            ip.locator('#exit-booth').click()
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#close-poll').click()
            expect(ip.locator('#winner')).to_have_text('Vorne: Cine, 1 Stimme (100,0 %).')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PollBox: draft validation, debounce flush, open, voting booth hides page, next-voter screen clears choice, blank vote, expected voters limit, organiser code, results only after closing, CSV, duplicate, backup/restore (incoherent totals refused), corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
