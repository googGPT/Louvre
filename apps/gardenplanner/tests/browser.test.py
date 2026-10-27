"""GardenPlanner dans Chromium : parcelles, grille, cultures placées, dates ou délais, chevauchements, successions, rotation, calendrier, .ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-gardenplanner-v1'
Y = datetime.date.today().year
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def bed(page, name, cols, rows, cell='30'):
    if page.locator('#bed-add').get_attribute('open') is None:
        page.locator('#bed-summary').click()
    page.locator('#bed-form [name=name]').fill(name)
    page.locator('#bed-form [name=cols]').fill(cols)
    page.locator('#bed-form [name=rows]').fill(rows)
    page.locator('#bed-form [name=cellCm]').fill(cell)
    page.locator('#save-bed').click()


def step(page, name, mode, value=''):
    page.locator(f'[name={name}-mode]').select_option(mode)
    if mode != 'none':
        page.locator(f'[name={name}-{mode}]').fill(value)


def crop(page, name, family, x, y, w, h, sow, plant, harvest, end=('none', '')):
    page.locator('#crop-form [name=name]').fill(name)
    page.locator('#family').select_option(family)
    for k, v in zip('xywh', (x, y, w, h)):
        page.locator(f'#crop-form [name={k}]').fill(v)
    page.locator('#crop-form [name=sow]').fill(sow)
    step(page, 'plant', *plant)
    step(page, 'harvest', *harvest)
    step(page, 'harvestEnd', *end)
    page.locator('#save-crop').click()


def cropitem(page, name):
    return page.locator('#crops > li').filter(has=page.locator('.txt > b', has_text=name))


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
            expect(page.locator('#no-bed')).to_be_visible()
            expect(page.locator('#crop-panel')).to_be_hidden()
            assert page.locator('#louvre-currency').count() == 0
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Parcelle : validation puis création.
            bed(page, '', '4', '3')
            expect(page.locator('#bed-status')).to_have_text('Nom de la parcelle obligatoire')
            bed(page, 'Carré', '25', '3')
            expect(page.locator('#bed-status')).to_have_text('Colonnes et rangées : entier de 1 à 20')
            bed(page, 'Carré', '4', '3')
            expect(page.locator('#bed-status')).to_have_text('Parcelle « Carré » créée.')
            expect(page.locator('#garden .cell')).to_have_count(12)
            expect(page.locator('#bed-meta')).to_contain_text('1,08 m²')

            # Une case choisie dans la grille remplit le formulaire.
            page.locator('#garden .cell').nth(1).click()
            expect(page.locator('#crop-status')).to_have_text('Case choisie : colonne 2, rangée 1.')
            expect(page.locator('#crop-form [name=x]')).to_have_value('2')

            # Culture : validation, délais et dates.
            page.locator('#save-crop').click()
            expect(page.locator('#crop-status')).to_have_text('Nom de la culture obligatoire')
            crop(page, 'Tomate', 'solanaceae', '2', '1', '4', '1', f'{Y}-03-01', ('days', '60'), ('days', '140'))
            expect(page.locator('#crop-status')).to_have_text('La culture dépasse de la parcelle (4 colonnes × 3 rangées)')
            crop(page, 'Tomate', 'solanaceae', '1', '1', '2', '1', f'{Y}-03-01', ('days', '60'), ('days', '50'))
            expect(page.locator('#crop-status')).to_have_text('La récolte doit venir après la plantation')
            crop(page, 'Tomate', 'solanaceae', '1', '1', '2', '1', f'{Y}-03-01', ('days', '60'), ('date', f'{Y}-07-19'))
            expect(page.locator('#crop-status')).to_have_text('Culture « Tomate » placée.')
            expect(page.locator('#garden .cell.fam-solanaceae')).to_have_count(2)
            expect(cropitem(page, 'Tomate')).to_contain_text('Plantation 30 avr.')
            expect(cropitem(page, 'Tomate')).to_contain_text('Récolte 19 juil.')

            # Mêmes cases en même temps : refusé ; succession plus tôt dans l'année : acceptée.
            crop(page, 'Poivron', 'solanaceae', '2', '1', '1', '1', f'{Y}-03-15', ('days', '30'), ('days', '120'))
            expect(page.locator('#crop-status')).to_have_text('Ces cases sont déjà occupées par « Tomate » pendant cette période')
            crop(page, 'Radis', 'brassicaceae', '2', '1', '1', '1', f'{Y}-02-01', ('none', ''), ('days', '30'))
            expect(page.locator('#crop-status')).to_have_text('Culture « Radis » placée.')
            expect(page.locator('#garden .cell').nth(1).locator('sup')).to_have_text('2')

            # Rotation : pomme de terre l'année précédente sur la même case.
            page.locator('#year-prev').click()
            expect(page.locator('#year-label')).to_have_text(str(Y - 1))
            expect(page.locator('#crops .empty')).to_be_visible()
            crop(page, 'Pomme de terre', 'solanaceae', '1', '1', '1', '1', f'{Y - 1}-04-01', ('none', ''), ('days', '100'))
            expect(page.locator('#crop-status')).to_have_text('Culture « Pomme de terre » placée.')
            page.locator('#year-next').click()
            expect(cropitem(page, 'Tomate').locator('.warn')).to_have_text(f'Rotation : Pomme de terre occupait déjà ces cases en {Y - 1}.')
            expect(cropitem(page, 'Radis').locator('.warn')).to_have_count(0)

            # Modification : les délais sont repris.
            page.get_by_role('button', name='Modifier Tomate').click()
            expect(page.locator('[name=plant-days]')).to_have_value('60')
            expect(page.locator('[name=harvest-days]')).to_have_value('140')
            page.locator('#crop-form [name=name]').fill('Tomate cerise')
            page.locator('#save-crop').click()
            expect(page.locator('#crop-status')).to_contain_text('Culture « Tomate cerise » mise à jour.')
            expect(page.locator('#crop-status')).to_contain_text('Attention à la rotation : Pomme de terre')

            # Calendrier : mars, semis coché.
            for _ in range(24):
                if (page.locator('#month-label').text_content() or '').startswith(f'mars {Y}'):
                    break
                page.locator('#month-prev' if datetime.date.today().month > 3 else '#month-next').click()
            expect(page.locator('#month-label')).to_have_text(f'mars {Y}')
            task = page.locator('#tasks > li').filter(has_text='Tomate cerise')
            expect(task).to_contain_text('Semis : Tomate cerise')
            task.locator('input').check()
            expect(page.locator('#task-status')).to_have_text('Semis de Tomate cerise : fait.')
            expect(page.locator('#tasks > li.done')).to_have_count(1)

            # Agenda .ics de l'année : tâches non faites.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_bytes().decode('utf-8')
            assert 'SUMMARY:Plantation — Tomate cerise (Carré)' in ics, ics
            expect(page.locator('#ics-status')).to_have_text('Agenda téléchargé : 4 tâches.')  # plantation + récolte tomate, semis + récolte radis

            # Réduire la parcelle sous une culture : refusé.
            page.locator('#edit-bed').click()
            page.locator('#bed-form [name=cols]').fill('1')
            page.locator('#save-bed').click()
            expect(page.locator('#bed-status')).to_have_text("Des cultures sortiraient de la parcelle : déplacez-les d'abord")
            page.locator('#cancel-bed').click()

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['crops']) == 3
            assert json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['crops'][0]['done'] == ['sow']
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            bed(page, 'Autre', '2', '2')
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            bad = json.loads(backup); bad['crops'][1]['x'] = 1; bad['crops'][1]['harvestDays'] = 200  # chevauche la tomate
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée : Ces cases sont déjà occupées')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 parcelle.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#crops > li')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#garden .cell')).to_have_count(12)
            context.set_offline(False)

            # Suppressions confirmées.
            page.get_by_role('button', name='Supprimer Radis').click()
            expect(page.locator('#crop-status')).to_have_text('Culture « Radis » supprimée.')
            page.locator('#delete-bed').click()
            expect(page.locator('#bed-status')).to_have_text('Parcelle « Carré » supprimée.')
            expect(page.locator('#no-bed')).to_be_visible()
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Every square of the garden has its crop and its calendar.')
            ip.locator('#sample').click()
            expect(ip.locator('#bed-status')).to_have_text('Example loaded: 2 beds (demo dates, not recommendations).')
            expect(ip.locator('#garden .cell')).to_have_count(24)
            expect(cropitem(ip, 'Tomato').locator('.warn')).to_contain_text('Rotation: Potato already grew in these squares')
            ip.locator('#crop-form [name=name]').fill('Draft crop')
            ip.locator('[name=plant-mode]').select_option('date')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#garden .cell')).to_have_count(24)
                assert ip.locator('#crop-form [name=name]').input_value() == 'Draft crop'
                assert ip.locator('[name=plant-mode]').input_value() == 'date'
                expect(ip.locator('[name=plant-date]')).to_be_visible()
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Jedes Feld im Garten hat seine Kultur und seinen Kalender.')
            expect(ip.locator('#family option').first).to_have_text('Nachtschattengewächse (Tomate, Kartoffel…)')
            ip.locator('#crop-form [name=name]').fill('')
            ip.locator('#save-crop').click()
            expect(ip.locator('#crop-status')).to_have_text('Name der Kultur erforderlich')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#sample').click()
            expect(cropitem(ip, 'طماطم')).to_have_count(1)  # exemple dans la langue affichée
            assert not errors, errors
            browser.close()
        print('BROWSER PASS GardenPlanner: beds, grid, placed crops, dates or delays, overlap, successions, rotation, edit, monthly tasks, ICS, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
