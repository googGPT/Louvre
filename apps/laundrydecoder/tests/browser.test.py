"""LaundryDecoder dans Chromium : sélection de symboles, consignes, conflits, étiquettes enregistrées, dictionnaire, SVG, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-laundrydecoder-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def pick(page, *ids):
    for i in ids:
        page.locator(f'#palette .tile[data-sym="{i}"]').click()


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
            expect(page.locator('#palette .tile')).to_have_count(38)
            expect(page.locator('#saved li.empty')).to_have_text('Aucune étiquette enregistrée.')
            expect(page.locator('#disclaimer')).to_contain_text("n'est affiliée à aucun organisme")
            assert page.locator('#louvre-currency').count() == 0
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save').click()
            expect(page.locator('#label-status')).to_have_text('Sélectionnez au moins un symbole')
            pick(page, 'w40')
            page.locator('#save').click()
            expect(page.locator('#label-status')).to_have_text('Nom du vêtement obligatoire')

            # Étiquette sans conflit : consignes résumées et familles absentes.
            pick(page, 'boxy', 'tlow', 'i150', 'dP')
            expect(page.locator('#palette .tile[data-sym="w40"]')).to_have_attribute('aria-pressed', 'true')
            expect(page.locator('#summary li')).to_have_count(5)
            expect(page.locator('#summary li[data-family="wash"]')).to_contain_text('Lavage en machine, 40 °C max')
            expect(page.locator('#summary li[data-family="bleach"]')).to_contain_text('Blanchiment oxygéné seulement')
            expect(page.locator('#summary li[data-family="iron"]')).to_contain_text('semelle 150 °C max')
            expect(page.locator('#issues')).to_contain_text("Non indiqué sur l'étiquette : Séchage naturel, Nettoyage à l'eau professionnel.")
            expect(page.locator('#issues .ok')).to_have_text('Aucun conflit entre les symboles.')

            # Conflit : deux températures, la plus prudente est retenue ; retrait par la puce.
            pick(page, 'w60g')
            expect(page.locator('#issues .conflict')).to_contain_text('Plusieurs symboles « Lavage »')
            expect(page.locator('#summary li[data-family="wash"]')).to_contain_text('Lavage en machine délicat, 40 °C max')
            page.get_by_role('button', name='Retirer le symbole : Lavage en machine délicat, 60 °C max').click()
            expect(page.locator('#issues .conflict')).to_have_count(0)
            expect(page.locator('#chosen .chip')).to_have_count(5)

            # Enregistrer, puis une deuxième étiquette contradictoire.
            page.locator('#label-form [name=name]').fill('Chemise bleue')
            page.locator('#save').click()
            expect(page.locator('#label-status')).to_have_text('Étiquette « Chemise bleue » enregistrée.')
            expect(page.locator('#save')).to_have_text("Mettre à jour l'étiquette")
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['labels'][0]['symbols'] == ['w40', 'boxy', 'tlow', 'i150', 'dP'], saved
            page.locator('#clear').click()
            expect(page.locator('#chosen .empty')).to_have_text('Aucun symbole sélectionné.')
            pick(page, 'wno', 'dno', 'wwno', 'tno')
            expect(page.locator('#issues .conflict')).to_contain_text("l'étiquette se contredit")
            expect(page.locator('#issues .warn')).to_contain_text('aucun mode de séchage naturel')
            page.locator('#label-form [name=name]').fill('Pull')
            page.locator('#save').click()
            expect(page.locator('#saved li')).to_have_count(2)
            expect(page.locator('#saved li').nth(1)).to_contain_text('1 conflit')

            # Modifier une étiquette enregistrée.
            page.get_by_role('button', name="Ouvrir l'étiquette « Chemise bleue »").click()
            expect(page.locator('#summary li')).to_have_count(5)
            expect(page.locator('#label-form [name=name]')).to_have_value('Chemise bleue')
            pick(page, 'nlineShade')
            page.locator('#save').click()
            expect(page.locator('#label-status')).to_have_text('Étiquette « Chemise bleue » mise à jour.')
            expect(page.locator('#saved li')).to_have_count(2)

            # Dictionnaire.
            expect(page.locator('#dict li')).to_have_count(38)
            page.locator('#search').fill('CHLORE')
            expect(page.locator('#dict li')).to_have_count(3)
            expect(page.locator('#dict-status')).to_have_text('3 symboles trouvés.')
            page.locator('#search').fill('a plat')
            expect(page.locator('#dict li')).to_have_count(3)
            page.locator('#search').fill('150')
            expect(page.locator('#dict li')).to_have_count(1)
            expect(page.locator('#dict li')).to_contain_text('Fer moyen')
            page.locator('#search').fill('piano')
            expect(page.locator('#dict-status')).to_have_text('Aucun symbole ne correspond.')
            page.locator('#search').fill('')

            # Image SVG d'une étiquette.
            with page.expect_download() as d:
                page.get_by_role('button', name="Télécharger l'étiquette « Chemise bleue » en SVG").click()
            svg = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert d.value.suggested_filename == 'chemise-bleue.svg', d.value.suggested_filename
            assert svg.startswith('<?xml') and 'Chemise bleue' in svg and 'Lavage : Lavage en machine, 40 °C max' in svg, svg[:300]
            assert "Séchage naturel : Séchage sur fil, à l'ombre" in svg.replace('&apos;', "'"), svg

            # Supprimer.
            page.get_by_role('button', name="Supprimer l'étiquette « Pull »").click()
            expect(page.locator('#saved li')).to_have_count(1)

            # Sauvegarde, stockage corrompu, restauration refusée puis réussie.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['labels']) == 1
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{\"app\":\"laundrydecoder\"')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            pick(page, 'w30')
            page.locator('#label-form [name=name]').fill('Test')
            page.locator('#save').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{"app":"laundrydecoder"'
            bad = json.loads(backup); bad['labels'][0]['symbols'].append('zz')
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Symbole inconnu ou en double')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 étiquette.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#saved li')).to_have_count(1)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#saved li')).to_have_count(1)
            expect(page.locator('#palette .tile')).to_have_count(38)
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
            expect(ip.locator('h1')).to_have_text('What does this label mean?')
            ip.locator('#sample').click()
            expect(ip.locator('#label-status')).to_have_text('Example added: three labels, one of them with two washing temperatures.')
            expect(ip.locator('#issues .conflict')).to_contain_text('Several "Washing" symbols')
            expect(ip.locator('#summary li[data-family="wash"]')).to_contain_text('Machine wash, 30 °C max')
            expect(ip.locator('#label-form [name=name]')).to_have_value('Jeans (ambiguous label)')
            ip.locator('#search').fill('chlorine')
            expect(ip.locator('#dict li')).to_have_count(3)
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#saved li')).to_have_count(3)
                expect(ip.locator('#chosen .chip')).to_have_count(7)
                expect(ip.locator('#issues .conflict')).to_have_count(1)
                assert ip.locator('#label-form [name=name]').input_value() == 'Jeans (ambiguous label)'
                assert ip.locator('#search').input_value() == 'chlorine'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Was bedeutet dieses Etikett?')
            expect(ip.locator('#summary li[data-family="tumble"]')).to_contain_text('Nicht im Trockner trocknen')
            ip.locator('#search').fill('Schatten')
            expect(ip.locator('#dict li')).to_have_count(2)
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#summary li[data-family="wash"]')).to_contain_text('غسل في الغسالة')
            ip.locator('#clear').click()
            pick(ip, 'w40')
            ip.locator('#save').click()
            expect(ip.locator('#label-status')).to_have_text('اسم قطعة الملابس مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS LaundryDecoder: validation, symbol selection, summary, conflicts, warnings, saved labels, edit, dictionary search, SVG export, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
