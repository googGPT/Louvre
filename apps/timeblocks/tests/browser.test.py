"""TimeBlocks dans Chromium : blocs, validation, chevauchements, clavier, glisser, modification, réglages, modèles,
export .ics, impression, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-timeblocks-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_block(page, title, start, end, cat='focus'):
    page.locator('[name=title]').fill(title)
    page.locator('[name=start]').fill(start)
    page.locator('[name=end]').fill(end)
    page.locator('[name=cat]').select_option(cat)
    page.locator('#submit').click()


def block(page, title):
    return page.locator('#timeline .blk').filter(has_text=title)


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
            expect(page.locator('#timeline .empty')).to_be_visible()
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : langue seulement
            page.locator('#day').fill('2026-10-27')
            expect(page.locator('#day-label')).to_have_text('mardi 27 octobre 2026')  # majuscule initiale par CSS
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Validation : titre vide, fin avant début, minute hors pas.
            fill_block(page, '', '09:00', '10:00')
            expect(page.locator('#form-status')).to_have_text('Intitulé obligatoire')
            fill_block(page, 'X', '11:00', '10:00')
            expect(page.locator('#form-status')).to_have_text('La fin doit venir après le début')
            fill_block(page, 'X', '10:02', '10:30')
            expect(page.locator('#form-status')).to_have_text('Les heures vont par pas de 5 minutes')
            page.locator('#work-start').fill('18:00')
            expect(page.locator('#day-status')).to_have_text('La plage de travail doit finir après son début')
            expect(page.locator('#work-start')).to_have_value('09:00')  # réglage refusé, valeur rétablie

            # Deux blocs qui se chevauchent : signalés et posés côte à côte.
            fill_block(page, 'Rapport', '09:00', '10:30')
            expect(page.locator('#form-status')).to_contain_text('Ajouté : Rapport, ')
            fill_block(page, 'Réunion', '10:00', '11:00', 'meeting')
            expect(page.locator('#form-status')).to_contain_text('chevauche un autre bloc')
            expect(page.locator('#clashes')).to_contain_text('1 chevauchement')
            expect(page.locator('#clashes')).to_contain_text('« Rapport » et « Réunion » se chevauchent sur 30 min.')
            expect(page.locator('#timeline .blk.clash')).to_have_count(2)
            expect(page.locator('#kpis')).to_contain_text('2 h')  # 09:00-11:00, chevauchement compté une fois

            # Clavier : ↓ déplace d'un pas (15 min), Maj+↓ allonge.
            block(page, 'Réunion').focus()
            page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown')
            expect(page.locator('#agenda-status')).to_contain_text('Réunion : ')
            expect(page.locator('#agenda-status')).to_contain_text('10:30–11:30')
            expect(page.locator('#clashes')).to_be_hidden()  # 10:30 touche la fin de « Rapport » : plus de chevauchement
            page.keyboard.press('Shift+ArrowDown')
            expect(page.locator('#agenda-status')).to_contain_text('10:30–11:45')
            expect(block(page, 'Réunion')).to_be_focused()

            # Glisser à la souris : 32 px = 30 min, arrondi au pas.
            box = block(page, 'Rapport').bounding_box()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 20)
            page.mouse.down()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 36, steps=4)
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 52, steps=4)
            page.mouse.up()
            expect(page.locator('#agenda-status')).to_contain_text('Rapport : ')
            expect(page.locator('#agenda-status')).to_contain_text('09:30–11:00')
            expect(page.locator('#clashes')).to_contain_text('sur 30 min')

            # Toucher sans glisser : modification dans le formulaire.
            block(page, 'Rapport').click()
            expect(page.locator('#h-block')).to_have_text('Modifier le bloc')
            expect(page.locator('[name=start]')).to_have_value('09:30')
            page.locator('[name=title]').fill('Rapport annuel')
            page.locator('[name=end]').fill('10:30')
            page.locator('#submit').click()
            expect(page.locator('#form-status')).to_contain_text('Modifié : Rapport annuel')
            expect(page.locator('#h-block')).to_have_text('Nouveau bloc')
            expect(page.locator('#clashes')).to_be_hidden()

            # Réglages : pas de 5 minutes, plage modifiée.
            page.locator('#step').select_option('5')
            expect(page.locator('#day-status')).to_contain_text('pas de 5 min')
            block(page, 'Réunion').focus()
            page.keyboard.press('Alt+ArrowUp')
            expect(page.locator('#agenda-status')).to_contain_text('10:25–11:45')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['settings'] == {'workStart': 540, 'workEnd': 1080, 'step': 5}, saved['settings']
            assert [(b['title'], b['start'], b['end']) for b in saved['days'][0]['blocks']] == [('Rapport annuel', 570, 630), ('Réunion', 625, 705)]

            # Modèle : enregistré, appliqué au lendemain.
            page.locator('#tpl-save').click()
            expect(page.locator('#tpl-status')).to_have_text('Modèle « Journée type 1 » enregistré.')
            page.locator('#next-day').click()
            expect(page.locator('#day')).to_have_value('2026-10-28')
            page.locator('#tpl-replace').click()
            expect(page.locator('#timeline .blk')).to_have_count(2)
            page.locator('#tpl-merge').click()
            expect(page.locator('#timeline .blk')).to_have_count(4)
            expect(page.locator('#clashes')).to_contain_text('6 chevauchements')  # chaque copie recouvre l'original et l'autre bloc (5 min)

            # Export .ics de tous les jours : heures locales flottantes.
            page.locator('#ics-scope').select_option('all')
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_bytes().decode('utf-8')  # garde les fins de ligne CRLF
            lines = ics.split('\r\n')
            assert d.value.suggested_filename == 'timeblocks.ics'
            assert ics.count('BEGIN:VEVENT') == 6, ics
            assert 'DTSTART:20261027T093000' in lines and 'DTEND:20261027T103000' in lines, ics
            assert 'DTSTART:20261028T102500' in lines, ics
            assert 'SUMMARY:Rapport annuel' in lines and 'CATEGORIES:Réunion' in lines, ics
            assert 'TZID' not in ics and not any(l.startswith('DTSTART') and l.endswith('Z') for l in lines), ics
            expect(page.locator('#backup-status')).to_contain_text('6 blocs')

            # Impression : les commandes disparaissent, l'agenda reste.
            page.emulate_media(media='print')
            expect(page.locator('#block-form')).to_be_hidden()
            expect(page.locator('#tpl-save')).to_be_hidden()
            expect(page.locator('#timeline .blk').first).to_be_visible()
            page.emulate_media(media='screen')

            # Exemple : une journée type dans la langue affichée (confirmation acceptée).
            page.locator('#sample').click()
            expect(page.locator('#form-status')).to_have_text('Exemple ajouté : une journée de travail type.')
            expect(page.locator('#timeline .blk')).to_have_count(7)
            expect(block(page, 'Pause café')).to_have_count(1)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Sauvegarde, stockage corrompu (rien n'est écrasé), restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert [len(x['blocks']) for x in data['days']] == [2, 7] and len(data['templates']) == 1
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('[name=title]').fill('Essai'); page.locator('[name=start]').fill('09:00'); page.locator('[name=end]').fill('10:00')
            page.locator('#block-form').evaluate('(f) => f.requestSubmit()')  # bouton désactivé : on force l'envoi
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            bad = {**data, 'days': [{**data['days'][0], 'blocks': [{**data['days'][0]['blocks'][0], 'end': 10}]}]}
            page.locator('#import').set_input_files({'name': 'faux.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée : La fin doit venir après le début')
            expect(page.locator('#warning')).to_be_visible()  # la protection reste
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 jours planifiés')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            page.locator('#day').fill('2026-10-27')
            expect(page.locator('#timeline .blk')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Jede Stunde hat ihren Platz.')  # navigateur allemand -> allemand
            ip.locator('#sample').click()
            expect(block(ip, 'Kaffeepause')).to_have_count(1)  # exemple dans la langue affichée
            ip.locator('[name=title]').fill('Entwurf')  # saisie en cours, non envoyée
            summary = {'fr': 'Bilan de la journée', 'en': 'Day summary', 'es': 'Resumen del día', 'ar': 'حصيلة اليوم',
                       'pt': 'Balanço do dia', 'de': 'Tagesbilanz', 'it': 'Bilancio della giornata'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-sum')).to_have_text(summary[lang])
                expect(ip.locator('#timeline .blk')).to_have_count(7)
                expect(ip.locator('#bars li')).to_have_count(5)
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('[name=title]').input_value() == 'Entwurf'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # Erreur du moteur traduite, choix de langue mémorisé.
            ip.locator('#louvre-lang').select_option('it')
            ip.locator('[name=start]').fill('12:00'); ip.locator('[name=end]').fill('11:00')
            ip.locator('#submit').click()
            expect(ip.locator('#form-status')).to_have_text("La fine deve venire dopo l'inizio")
            ip.reload()
            expect(ip.locator('#h-sum')).to_have_text('Bilancio della giornata')
            expect(ip.locator('#timeline .blk')).to_have_count(7)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS TimeBlocks: validation, overlaps, keyboard move/resize, drag, edit, step, templates, ics export, print, sample, backup, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
