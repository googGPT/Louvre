"""CoursePlanner dans Chromium : volume, calendrier, fermetures, séances, activités, .ics, impression, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-courseplanner-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_field(locator, value):
    """Remplit un champ puis déclenche « change » (comme quand on quitte le champ)."""
    locator.fill(value)
    locator.dispatch_event('change')


def add_session(page, title, duration):
    page.locator('#session-form [name=title]').fill(title)
    page.locator('#session-form [name=duration]').fill(duration)
    page.locator('#session-form button[type=submit]').click()
    expect(page.locator('#session-status')).to_contain_text('Séance ajoutée : ' + title)


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
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Validation des séances.
            page.locator('#session-form button[type=submit]').click()
            expect(page.locator('#session-status')).to_have_text('Titre de la séance obligatoire')
            page.locator('#session-form [name=title]').fill('Introduction')
            page.locator('#session-form [name=duration]').fill('13h')
            page.locator('#session-form button[type=submit]').click()
            expect(page.locator('#session-status')).to_have_text('Durée invalide (ex. 1h30, 45 min ou 1,5 ; 12 h au plus)')

            # Volume prévu, période, jours de cours (lundi 9:00, jeudi 14:00), une fermeture.
            add_session(page, 'Introduction', '3h')
            set_field(page.locator('#volume'), '9h')
            expect(page.locator('#course-status')).to_have_text('Volume enregistré.')
            set_field(page.locator('#start'), '2026-09-07')
            set_field(page.locator('#end'), '2026-09-01')
            expect(page.locator('#cal-status')).to_have_text('La dernière date précède la première')
            set_field(page.locator('#end'), '2026-10-02')
            expect(page.locator('#cal-status')).to_have_text('Calendrier enregistré.')
            expect(page.locator('#cal-summary')).to_contain_text('Cochez au moins un jour de cours')
            page.locator('#slots input[type=checkbox]').nth(0).check()
            expect(page.locator('#cal-summary')).to_contain_text('4 jours de cours disponibles')
            set_field(page.locator('#slots input[type=time]').nth(3), '14:00')
            page.locator('#slots input[type=checkbox]').nth(3).check()
            expect(page.locator('#cal-summary')).to_contain_text('8 jours de cours disponibles')
            page.locator('#closure-form [name=from]').fill('2026-09-21')
            page.locator('#closure-form [name=to]').fill('2026-09-25')
            page.locator('#closure-form [name=label]').fill('Pause')
            page.locator('#closure-form button').click()
            expect(page.locator('#closures li')).to_have_count(1)
            expect(page.locator('#cal-summary')).to_contain_text('6 jours de cours disponibles')
            expect(page.locator('#cal-summary')).to_contain_text('2 jours de cours sautés')

            add_session(page, 'Analyse', '3h')
            add_session(page, 'Cas', '2h30')
            add_session(page, 'Synthèse', '1:30')
            expect(page.locator('#volume-check')).to_contain_text('Séances : 10 h sur 9 h prévues')
            expect(page.locator('#volume-check')).to_contain_text('Dépassement de 1 h.')
            cards = page.locator('#sessions .sess')
            expect(cards).to_have_count(4)
            assert [cards.nth(i).get_attribute('data-date') for i in range(4)] == ['2026-09-07', '2026-09-10', '2026-09-14', '2026-09-17']
            expect(cards.nth(3).locator('summary')).to_contain_text('14:00–15:30')

            # Activités de la première séance : 1 h 30 sur 3 h.
            cards.nth(0).locator('summary').click()
            cards.nth(0).locator('[data-action=add-act]').click()
            act = page.locator('#sessions .sess').nth(0).locator('.act').nth(0)
            set_field(act.locator('[data-f=label]'), 'Cours magistral')
            set_field(page.locator('#sessions .sess').nth(0).locator('.act').nth(0).locator('[data-f=aminutes]'), '1h30')
            expect(page.locator('#sessions .sess').nth(0).locator('.act-check')).to_have_text('Activités : 1 h 30 sur 3 h — 1 h 30 non réparties.')
            set_field(page.locator('#sessions .sess').nth(0).locator('[data-f=minutes]'), '2h')
            expect(page.locator('#sessions .sess').nth(0).locator('.act-check')).to_have_text('Activités : 1 h 30 sur 2 h — 30 min non réparties.')
            expect(page.locator('#volume-check')).to_contain_text('Le volume prévu est exactement atteint.')
            # Réordonner : « Synthèse » remonte d'un cran et prend le lundi 14.
            page.locator('#sessions .sess').nth(3).locator('summary').click()
            page.locator('#sessions .sess').nth(3).locator('[data-action=up]').click()
            expect(page.locator('#sessions .sess').nth(2)).to_have_attribute('data-date', '2026-09-14')
            expect(page.locator('#sessions .sess').nth(2).locator('summary')).to_contain_text('Synthèse')

            # Agenda .ics.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 4, ics
            assert 'DTSTART:20260907T090000' in ics and 'DTEND:20260907T110000' in ics, ics
            assert 'SUMMARY:Mon cours — Séance 3 : Synthèse' in ics, ics
            assert 'Cours magistral (1 h 30)' in ics, ics

            # Impression du plan.
            page.evaluate('() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }')
            page.locator('#print-plan').click()
            assert page.evaluate('() => window.__printed') == 1
            page.emulate_media(media='print')
            expect(page.locator('#print-area')).to_be_visible()
            expect(page.locator('#print-area tbody tr')).to_have_count(4)
            expect(page.locator('#h-sessions')).to_be_hidden()
            page.emulate_media(media='screen')

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['courses'][0]['sessions']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{\"app\":\"courseplanner\"')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add_title = page.locator('#session-form [name=title]')
            add_title.fill('X'); page.locator('#session-form [name=duration]').fill('1h')
            page.locator('#session-form button[type=submit]').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{"app":"courseplanner"'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"pricelens","version":1,"lists":[]}'})
            expect(page.locator('#backup-status')).to_contain_text("Ce fichier n'est pas une sauvegarde CoursePlanner")
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 cours')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#sessions .sess')).to_have_count(4)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#sessions .sess')).to_have_count(4)
            expect(page.locator('#closures li')).to_have_count(1)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Um curso bem dividido, aulas bem datadas.')  # navigateur portugais
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('#sessions .sess')).to_have_count(6)
            expect(ip.locator('#sessions .sess').first.locator('summary')).to_contain_text('Introdução e diagnóstico financeiro')  # exemple dans la langue affichée
            ip.locator('#session-form [name=title]').fill('Rascunho')  # saisie en cours, non validée
            set_field(ip.locator('#volume'), 'zz')  # valeur invalide en cours
            titles = {'fr': 'Calendrier', 'en': 'Calendar', 'es': 'Calendario', 'ar': 'التقويم', 'pt': 'Calendário', 'de': 'Kalender', 'it': 'Calendario'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-cal')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#sessions .sess')).to_have_count(6)
                expect(ip.locator('#session-form [name=title]')).to_have_value('Rascunho')
                expect(ip.locator('#volume')).to_have_value('zz')
                expect(ip.locator('#slots input[type=checkbox]:checked')).to_have_count(2)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            set_field(ip.locator('#volume'), 'lots')
            expect(ip.locator('#course-status')).to_have_text('Invalid hours (e.g. 30h; 2000 h at most)')  # erreur du moteur traduite
            set_field(ip.locator('#volume'), '18h')
            expect(ip.locator('#volume-check')).to_contain_text('Sessions: 18 h of 18 h planned')
            ip.locator('#louvre-lang').select_option('de')
            with ip.expect_download() as d:
                ip.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert 'Sitzung 1: Introdução' in ics, ics[:600]  # libellés de l'agenda dans la langue affichée
            assert ics.count('BEGIN:VEVENT') == 6
            assert not errors, errors
            browser.close()
        print('BROWSER PASS CoursePlanner: validation, volume check, calendar, closures, sessions, activities, reorder, ics, print, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
