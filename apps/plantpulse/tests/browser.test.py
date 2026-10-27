"""PlantPulse dans Chromium : validation, plantes, échéances, retards, « Fait », saisons, historique, .ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-plantpulse-v1'
# Débordement horizontal : nomme les éléments fautifs (des deux côtés, pour l'arabe).
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; })
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def day(offset=0):
    return (datetime.date.today() + datetime.timedelta(days=offset)).isoformat()


def plant(page, name, tasks, place=''):
    page.locator('#plant-form [name=name]').fill(name)
    page.locator('#plant-form [name=place]').fill(place)
    for kind in ['water', 'feed', 'repot']:
        every, since = tasks.get(kind, ('', ''))
        page.locator(f'[name=every-{kind}]').fill(every)
        page.locator(f'[name=since-{kind}]').fill(since)
    page.locator('#save-plant').click()


def card(page, name):
    return page.locator('#plants > li').filter(has=page.locator('.txt > b', has_text=name))


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
            expect(page.locator('#due li.empty')).to_have_text('Ajoutez une plante (plus bas) ou chargez l\'exemple.')
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : menu de langue seul
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save-plant').click()
            expect(page.locator('#plant-status')).to_have_text('Nom de la plante obligatoire')
            plant(page, 'Ficus', {})
            expect(page.locator('#plant-status')).to_have_text('Indiquez la fréquence d\'au moins un soin')
            plant(page, 'Ficus', {'water': ('0', '')})
            expect(page.locator('#plant-status')).to_have_text('Arrosage : nombre entier de jours, de 1 à 3650')
            plant(page, 'Ficus', {'water': ('7', day(3))})
            expect(page.locator('#plant-status')).to_have_text('Le dernier soin ne peut pas être dans le futur')

            # Ficus : arrosé il y a 9 jours tous les 7 jours -> 2 jours de retard ; engrais dans 25 jours.
            plant(page, 'Ficus', {'water': ('7', day(-9)), 'feed': ('30', day(-5))}, 'Salon')
            expect(page.locator('#plant-status')).to_have_text('Plante « Ficus » enregistrée.')
            expect(page.locator('#due > li')).to_have_count(1)
            expect(page.locator('#due > li')).to_contain_text('Arrosage — Ficus')
            expect(page.locator('#due > li')).to_contain_text('2 jours de retard')
            expect(page.locator('#k-late')).to_have_text('1')
            expect(card(page, 'Ficus').locator('.task.late')).to_contain_text('tous les 7 jours')
            expect(card(page, 'Ficus').locator('.task').nth(1)).to_contain_text('dans 25 jours')
            page.get_by_role('button', name="Arrosage de Ficus fait aujourd'hui").first.click()
            expect(page.locator('#due-status')).to_contain_text('Arrosage de Ficus noté.')
            expect(page.locator('#due li.empty')).to_have_text("Aucun soin à faire aujourd'hui.")
            expect(card(page, 'Ficus').locator('.task').first).to_contain_text('dans 7 jours')
            expect(page.locator('#k-late')).to_have_text('0')

            # Saison : coefficient 200 % sur le mois courant -> intervalle doublé.
            page.locator('#plant-form [name=name]').fill('Cactus')
            page.locator('[name=every-water]').fill('10')
            page.locator('#season-on').check()
            month = str(datetime.date.today().month)
            page.locator(f'#months input[value="{month}"]').check()
            page.locator('[name=pct]').fill('1000')
            page.locator('#save-plant').click()
            expect(page.locator('#plant-status')).to_have_text('Coefficient : entier de 25 à 400 %')
            page.locator('[name=pct]').fill('200')
            page.locator('#save-plant').click()
            expect(page.locator('#plant-status')).to_have_text('Plante « Cactus » enregistrée.')
            expect(card(page, 'Cactus')).to_contain_text('saison : 200 %')
            expect(card(page, 'Cactus').locator('.task')).to_contain_text('tous les 20 jours')
            expect(card(page, 'Cactus').locator('.task')).to_contain_text('dans 20 jours')
            expect(page.locator('#season-box')).to_be_hidden()  # formulaire remis à zéro

            # Historique : soin non suivi refusé, soin passé noté, filtre, suppression.
            page.locator('#care-form [name=plant]').select_option(label='Cactus')
            page.locator('#care-form [name=kind]').select_option('feed')
            page.locator('#add-care').click()
            expect(page.locator('#care-status')).to_have_text('Ce soin n\'est pas suivi pour cette plante')
            page.locator('#care-form [name=plant]').select_option(label='Ficus (Salon)')
            page.locator('#care-form [name=date]').fill(day(-2))
            page.locator('#care-form [name=note]').fill('demi-dose')
            page.locator('#add-care').click()
            expect(page.locator('#care-status')).to_contain_text('Engrais de Ficus noté le')
            expect(page.locator('#history > li')).to_have_count(2)
            expect(card(page, 'Ficus').locator('.task').nth(1)).to_contain_text('dans 28 jours')
            page.locator('#h-filter').select_option(label='Cactus')
            expect(page.locator('#history li.empty')).to_have_text('Aucun soin noté.')
            page.locator('#h-filter').select_option(label='Ficus')
            expect(page.locator('#history > li')).to_have_count(2)
            page.locator('#history > li').filter(has_text='demi-dose').get_by_role('button').click()
            expect(page.locator('#care-status')).to_have_text('Soin retiré de l\'historique.')
            expect(page.locator('#history > li')).to_have_count(1)
            expect(card(page, 'Ficus').locator('.task').nth(1)).to_contain_text('dans 25 jours')

            # Modification.
            page.get_by_role('button', name='Modifier Ficus').click()
            expect(page.locator('#save-plant')).to_have_text('Mettre à jour la plante')
            expect(page.locator('[name=since-water]')).to_have_value(day(0))
            page.locator('#plant-form [name=name]').fill('Ficus lyrata')
            page.locator('#save-plant').click()
            expect(page.locator('#plant-status')).to_have_text('Plante « Ficus lyrata » mise à jour.')
            expect(page.locator('#plants > li')).to_have_count(2)

            # Export agenda .ics sur 30 jours.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_bytes().decode('utf-8')
            assert ics.startswith('BEGIN:VCALENDAR\r\n'), ics[:40]
            assert 'SUMMARY:Arrosage — Ficus lyrata' in ics, ics
            assert f"DTSTART;VALUE=DATE:{day(7).replace('-', '')}" in ics
            assert f"DTSTART;VALUE=DATE:{day(20).replace('-', '')}" in ics  # cactus, intervalle doublé
            expect(page.locator('#ics-status')).to_contain_text('Agenda téléchargé : 6 échéances.')  # 4 arrosages + 1 engrais du ficus, 1 arrosage du cactus

            # Sauvegarde, stockage corrompu (après enregistrement), restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde téléchargée.')
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['plants']) == 2
            assert json.loads(page.evaluate(f"() => localStorage.getItem('{KEY}')"))['plants'][0]['name'] in ('Ficus lyrata', 'Cactus')
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            plant(page, 'Menthe', {'water': ('2', '')})
            expect(page.locator('#backup-status')).to_have_text('Stockage illisible : restaurez une sauvegarde valide avant de modifier.')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == '{abîmé'
            bad = json.loads(backup); bad['history'][0]['kind'] = 'repot'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 plantes.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#plants > li')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#plants > li')).to_have_count(2)
            context.set_offline(False)

            # Suppression (avec confirmation) : l'historique de la plante part avec elle.
            page.get_by_role('button', name='Supprimer Ficus lyrata').click()
            expect(page.locator('#plant-status')).to_have_text('Plante « Ficus lyrata » supprimée.')
            expect(page.locator('#history li.empty')).to_be_visible()
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Every plant at its own pace, nothing forgotten.')
            ip.locator('#sample').click()
            expect(ip.locator('#due-status')).to_have_text('Example loaded: 3 plants (demo values, not recommendations).')
            expect(ip.locator('#plants > li')).to_have_count(3)
            expect(ip.locator('#due > li').first).to_contain_text('Watering — Fern')
            expect(ip.locator('#due > li').first).to_contain_text('1 day overdue')
            ip.locator('#plant-form [name=name]').fill('Draft plant')
            ip.locator('[name=every-water]').fill('5')
            ip.locator('#season-on').check()
            ip.locator('#months input[value="1"]').check()
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#plants > li')).to_have_count(3)
                assert ip.locator('#plant-form [name=name]').input_value() == 'Draft plant'
                assert ip.locator('[name=every-water]').input_value() == '5'
                assert ip.locator('#months input[value="1"]').is_checked()
                expect(ip.locator('#season-box')).to_be_visible()
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Jede Pflanze in ihrem Takt, nichts vergessen.')
            expect(ip.locator('#due > li').first).to_contain_text('1 Tag überfällig')
            expect(ip.locator('#months label').first).to_contain_text('Jan')
            ip.locator('#plant-form [name=name]').fill('')
            ip.locator('#save-plant').click()
            expect(ip.locator('#plant-status')).to_have_text('Name der Pflanze erforderlich')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-today')).to_have_text('اليوم')
            ip.locator('#sample').click()
            expect(ip.locator('#plants > li').filter(has_text='ريحان')).to_have_count(1)  # exemple dans la langue affichée
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PlantPulse: validation, plants, due dates, overdue, done, seasonal factor, history, edit/delete, ICS, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
