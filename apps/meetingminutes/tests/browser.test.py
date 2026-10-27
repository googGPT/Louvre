"""MeetingMinutes dans Chromium : ordre du jour minuté, chronomètre, notes, décisions, actions, suivi d'une réunion à l'autre,
exports .md/.ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-meetingminutes-v1'
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
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent
            expect(page.locator('#m-title')).to_have_value('Nouvelle réunion')

            # Validation.
            page.locator('#add-item').click()
            expect(page.locator('#agenda-status')).to_have_text('Intitulé du point obligatoire')
            page.locator('#item-title').fill('Budget'); page.locator('#item-minutes').fill('0')
            page.locator('#add-item').click()
            expect(page.locator('#agenda-status')).to_have_text('Durée du point : nombre entier de 1 à 480 minutes')
            page.locator('#m-duration').fill('2'); page.locator('#m-duration').press('Tab')
            expect(page.locator('#meeting-status')).to_contain_text('Durée de la réunion')

            # Réunion : intitulé, date, heure, durée (enregistrés sans quitter le champ, en différé).
            page.locator('#m-title').fill('Comité projet')
            page.locator('#m-date').fill('2026-03-02')
            page.locator('#m-start').fill('09:30')
            page.locator('#m-duration').fill('30')
            page.wait_for_function(f"() => JSON.parse(localStorage.getItem('{KEY}')).meetings[0].duration === 30")
            m = stored(page)['meetings'][0]
            assert (m['title'], m['date'], m['start']) == ('Comité projet', '2026-03-02', '09:30'), m

            # Ordre du jour minuté : dépassement de l'ordre du jour sur la durée prévue.
            for title, mins in [('Budget', '20'), ('Planning', '15')]:
                page.locator('#item-title').fill(title); page.locator('#item-minutes').fill(mins)
                page.locator('#add-item').click()
                expect(page.locator('#agenda-status')).to_contain_text('Point ajouté : ' + title)
            items = page.locator('#agenda li')
            expect(items).to_have_count(2)
            expect(items.nth(1)).to_contain_text('09:50–10:05')
            expect(page.locator('#k-planned')).to_have_text('35 / 30 min')
            expect(page.locator('#k-margin')).to_have_text('−5 min')
            expect(page.locator('#agenda-alert')).to_have_text("L'ordre du jour dépasse de 5 min la durée prévue.")

            # Participants et présence ; doublon refusé.
            for name in ['Ana', 'Bo']:
                page.locator('#person-name').fill(name); page.locator('#person-form button').click()
                expect(page.locator('#people-status')).to_have_text(f'Participant ajouté : {name}.')
            page.locator('#person-name').fill('ana'); page.locator('#person-form button').click()
            expect(page.locator('#people-status')).to_have_text('Ce participant est déjà inscrit')
            page.locator('#people li', has_text='Bo').locator('select').select_option('excused')

            # Notes du premier point ; la dernière frappe est enregistrée même si l'on change de point aussitôt.
            expect(page.locator('#notes-for')).to_have_text('Point sélectionné : Budget')
            page.locator('#notes').fill('Hausse de 3 %.')
            items.nth(1).get_by_role('button', name='Notes').click()
            expect(page.locator('#notes-for')).to_have_text('Point sélectionné : Planning')
            assert stored(page)['meetings'][0]['items'][0]['notes'] == 'Hausse de 3 %.'
            expect(page.locator('#notes')).to_have_value('')
            items.nth(0).get_by_role('button', name='Notes').click()
            expect(page.locator('#notes')).to_have_value('Hausse de 3 %.')

            # Chronomètre : démarrer, arrêter, temps enregistré.
            run = items.nth(0).locator('[data-key^=run-]')
            run.click()
            expect(run).to_have_attribute('aria-pressed', 'true')
            page.wait_for_timeout(1300)
            run.click()
            expect(page.locator('#agenda-status')).to_have_text('Chronomètre arrêté, temps enregistré.')
            assert stored(page)['meetings'][0]['items'][0]['spentSec'] >= 1
            # Temps saisi à la main : 25 min pour 20 prévues -> dépassement du point.
            page.locator('#spent').fill('25'); page.locator('#spent').press('Tab')
            expect(page.locator('#notes-status')).to_have_text('Temps passé enregistré.')
            expect(items.nth(0)).to_contain_text('+5:00')
            expect(page.locator('#k-end')).to_have_text('10:10')

            # Décision et action rattachées au point.
            page.locator('#decision-text').fill('Budget validé'); page.locator('#decision-form button').click()
            expect(page.locator('#decisions li')).to_contain_text('Budget validé')
            page.locator('#action-form button').click()
            expect(page.locator('#notes-status')).to_have_text("Texte de l'action obligatoire")
            page.locator('#action-text').fill('Envoyer le devis'); page.locator('#action-owner').fill('Ana'); page.locator('#action-due').fill('2026-03-06')
            page.locator('#action-form button').click()
            expect(page.locator('#actions li')).to_contain_text('Ana · pour le 6 mars 2026 · Budget')

            # Réordonner au clavier : le focus reste sur le bouton.
            down = items.nth(0).locator('[data-key^=down-]')
            down.focus(); page.keyboard.press('Enter')
            expect(items.nth(0)).to_contain_text('1. Planning')
            assert page.evaluate('() => document.activeElement.dataset.key.startsWith("up-")'), 'focus perdu après déplacement'
            page.keyboard.press('Enter')  # le même bouton, au clavier : Budget remonte
            expect(items.nth(0)).to_contain_text('1. Budget')
            page.keyboard.press('Enter')
            expect(items.nth(0)).to_contain_text('1. Planning')
            expect(items.nth(1)).to_contain_text('09:45–10:05')

            # Compte rendu Markdown.
            with page.expect_download() as d:
                page.locator('#export-md').click()
            assert d.value.suggested_filename == 'compte-rendu-2026-03-02.md'
            md = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert md.startswith('# Comité projet\n'), md[:200]
            assert '- **Présents** : Ana\n- **Excusés** : Bo' in md, md
            assert '### 2. Budget' in md and 'Hausse de 3 %.' in md and '- Budget validé' in md, md
            assert '| Envoyer le devis | Ana | 6 mars 2026 | À faire |' in md, md

            # Réunion suivante : l'action ouverte réapparaît dans le suivi, en retard, et se solde d'ici.
            page.locator('#next-meeting').click()
            expect(page.locator('#meeting-status')).to_have_text('Réunion suivante préparée pour le 9 mars 2026.')
            expect(page.locator('#m-date')).to_have_value('2026-03-09')
            expect(page.locator('#agenda li')).to_have_count(2)
            pending = page.locator('#pending li')
            expect(pending).to_have_count(1)
            expect(pending).to_contain_text('Comité projet (2 mars 2026)')
            expect(pending).to_contain_text('en retard')
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 1 and 'DTSTART;VALUE=DATE:20260306' in ics and 'Envoyer le devis — Ana' in ics, ics
            pending.locator('input[type=checkbox]').click()
            expect(page.locator('#pending li')).to_have_text('Aucune action ouverte des réunions précédentes.')
            page.locator('#export-ics').click()
            expect(page.locator('#export-status')).to_have_text('Aucune action ouverte avec échéance à exporter')
            assert [m['actions'][0]['done'] for m in stored(page)['meetings'] if m['actions']] == [True]

            # Sauvegarde JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['meetings']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'corrompu')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            expect(page.locator('#item-title')).to_be_disabled()
            page.locator('#new-meeting').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"meetingminutes","version":1,"meetings":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 réunions')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#item-title')).to_be_enabled()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#meeting-select option')).to_have_count(2)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue, saisie conservée, 7 langues sans débordement.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Besprechung gehalten, Protokoll fertig.')
            ip.locator('#sample').click()
            expect(ip.locator('#meeting-status')).to_contain_text('Beispiel hinzugefügt')
            expect(ip.locator('#meeting-select')).to_contain_text('Wöchentliche Teambesprechung')
            expect(ip.locator('#pending li')).to_contain_text('Seminarraum reservieren')
            expect(ip.locator('#agenda li')).to_have_count(4)
            ip.locator('#notes').fill('Notiz läuft')  # saisie en cours
            ip.locator('#person-name').fill('Zoé')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#notes')).to_have_value('Notiz läuft')
                expect(ip.locator('#person-name')).to_have_value('Zoé')
                expect(ip.locator('#agenda li')).to_have_count(4)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-agenda')).to_have_text('جدول الأعمال الموقّت')
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#h-agenda')).to_have_text('Timed agenda')
            expect(ip.locator('#md-preview')).to_contain_text('## Follow-up from previous meetings')
            ip.reload()  # la saisie en cours a été enregistrée
            expect(ip.locator('#notes')).to_have_value('Notiz läuft')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS MeetingMinutes: validation, timed agenda, overrun, timer, notes flush, decisions, actions, keyboard reorder, follow-up across meetings, .md/.ics export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
