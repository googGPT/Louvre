"""HabitSteps dans Chromium : création, pointage, séries, grille, objectif hebdo, archivage, sauvegarde, hors ligne, mobile."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-habitsteps-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


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
            page.on('dialog', lambda d: d.accept('Lire 10 pages') if d.type == 'prompt' else d.accept())
            page.goto(origin)
            expect(page.locator('#empty')).to_be_visible()
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Création d'une habitude quotidienne et pointage du jour.
            page.locator('#add').click()
            expect(page.locator('#form-status')).to_contain_text('obligatoire')
            page.locator('[name=name]').fill('Lire')
            page.locator('#add').click()
            card = page.locator('.habit', has_text='Lire')
            expect(card).to_have_count(1)
            check = card.locator('.check')
            expect(check).to_have_attribute('aria-pressed', 'false')
            check.click()
            expect(card.locator('.check')).to_have_attribute('aria-pressed', 'true')
            expect(card.locator('.mini')).to_contain_text('1 jour')

            # Rattrapage d'hier via la grille : la série passe à 2 jours.
            yesterday = page.evaluate('() => HabitCore.addDays(HabitCore.dayKey(), -1)')
            idx = page.evaluate(f"() => HabitCore.grid({{checks: [], goal: {{type: 'daily'}}}}, HabitCore.dayKey(), 12).flat().findIndex(c => c.day === '{yesterday}')")
            card.locator('.heat button').nth(idx).click()
            expect(card.locator('.mini')).to_contain_text('2 jours')
            # Un second appui sur aujourd'hui annule le pointage, la série reste « en jeu » à 1 jour (hier).
            card.locator('.check').click()
            expect(card.locator('.check')).to_have_attribute('aria-pressed', 'false')
            expect(card.locator('.mini')).to_contain_text('1 jour')

            # Objectif hebdomadaire : 2 fois par semaine, progression affichée.
            page.locator('[name=name]').fill('Sport')
            page.locator('[name=type]').select_option('weekly')
            page.locator('[name=times]').select_option('2')
            page.locator('#add').click()
            sport = page.locator('.habit', has_text='Sport')
            expect(sport).to_contain_text('2 fois par semaine')
            sport.locator('.check').click()
            expect(sport).to_contain_text('Cette semaine : 1 / 2')

            # Renommer, archiver (masquée), réafficher.
            card.locator('button', has_text='Renommer').click()
            expect(page.locator('.habit', has_text='Lire 10 pages')).to_have_count(1)
            page.locator('.habit', has_text='Lire 10 pages').locator('button', has_text='Archiver').click()
            expect(page.locator('.habit')).to_have_count(1)
            page.locator('#show-archived').check()
            expect(page.locator('.habit')).to_have_count(2)

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert len(data['habits']) == 2 and data['habits'][0]['archived'] is True
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'oups')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('[name=name]').fill('X')
            page.locator('#add').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'oups'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 habitudes')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('.habit', has_text='Sport')).to_have_count(1)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, 7 langues complètes, arabe RTL, saisie conservée, pas de menu devise.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Un piccolo passo ogni giorno, una serie che cresce.')
            assert ip.locator('#louvre-currency').count() == 0
            ip.locator('#sample').click()
            expect(ip.locator('.habit')).to_have_count(2)
            expect(ip.locator('.habit').nth(1)).to_contain_text('3 volte a settimana')
            ip.locator('[name=name]').fill('Bozza')
            heads = {'fr': 'Nouvelle habitude', 'en': 'New habit', 'es': 'Nuevo hábito', 'ar': 'عادة جديدة', 'pt': 'Novo hábito', 'de': 'Neue Gewohnheit', 'it': 'Nuova abitudine'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#h-form')).to_have_text(heads[lang])
                expect(ip.locator('.habit')).to_have_count(2)
                assert ip.locator('[name=name]').input_value() == 'Bozza'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('.habit').nth(1)).to_contain_text('3 times a week')
            expect(ip.locator('.habit').first.locator('.mini')).to_contain_text('Best streak')
            ip.locator('#louvre-lang').select_option('pt')
            ip.locator('[name=name]').fill('')
            ip.locator('#add').click()
            expect(ip.locator('#form-status')).to_have_text('Nome do hábito obrigatório')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS HabitSteps: create, check/uncheck, catch-up via grid, streaks, weekly goal, rename, archive, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
