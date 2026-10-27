"""TeachingAttendance dans Chromium : liste, import, séances, appel, taux, seuil, règles, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-teachingattendance-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_field(locator, value):
    """Remplit un champ puis déclenche « change » (comme quand on quitte le champ)."""
    locator.fill(value)
    locator.dispatch_event('change')


def add_session(page, date, label):
    page.locator('#session-form [name=date]').fill(date)
    page.locator('#session-form [name=label]').fill(label)
    page.locator('#session-form button').click()
    expect(page.locator('#session-status')).to_contain_text(label)


def mark(page, name, status):
    page.locator('#roll > li').filter(has_text=name).locator(f'.opt.{status}').click()
    expect(page.locator('#roll > li').filter(has_text=name)).to_have_class(f'st-{status}')


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

            # Étudiants : nom obligatoire, doublon (même nom, même numéro) refusé, import avec en-tête.
            page.locator('#student-form button').click()
            expect(page.locator('#student-status')).to_have_text("Nom de l'étudiant obligatoire")
            page.locator('#student-form [name=name]').fill('Ana')
            page.locator('#student-form [name=ref]').fill('2026001')
            page.locator('#student-form button').click()
            expect(page.locator('#student-status')).to_have_text('Ajouté : Ana.')
            page.locator('#student-form [name=name]').fill('ana')
            page.locator('#student-form [name=ref]').fill('2026001')
            page.locator('#student-form button').click()
            expect(page.locator('#student-status')).to_contain_text('« ana » figure déjà dans la liste')
            page.locator('#import-box summary').click()
            page.locator('#roster-text').fill('Nom;Numéro\nBob;2026002\n"Cléo";2026003\n')
            page.locator('#roster-header').check()
            page.locator('#roster-import').click()
            expect(page.locator('#student-status')).to_have_text('2 étudiants ajoutés.')
            expect(page.locator('#students li')).to_have_count(3)

            # Séances : date obligatoire, puis quatre séances (triées par date).
            page.locator('#session-form [name=date]').fill('')
            page.locator('#session-form button').click()
            expect(page.locator('#session-status')).to_have_text('Date invalide')
            add_session(page, '2026-09-14', 'TD 2')
            add_session(page, '2026-09-07', 'TD 1')
            add_session(page, '2026-09-21', 'TD 3')
            add_session(page, '2026-09-28', 'TD 4')
            expect(page.locator('#session-select option')).to_have_count(4)
            expect(page.locator('#session-select option').nth(0)).to_contain_text('TD 1')

            # Appel. TD 1 : tous présents ; TD 2 : P / E / A ; TD 3 : R / P / A ; TD 4 : A / P / (Cléo non saisie).
            page.locator('#session-select').select_option(index=0)
            page.locator('#all-present').click()
            expect(page.locator('#session-stats')).to_have_text('Présents 3 · retards 0 · absents 0 · excusés 0 · non saisis 0')
            plan = [('Ana', 'present', 'late', 'absent'), ('Bob', 'excused', 'present', 'present'), ('Cléo', 'absent', 'absent', None)]
            for k in range(1, 4):
                page.locator('#session-select').select_option(index=k)
                for row in plan:
                    if row[k]:
                        mark(page, row[0], row[k])
            expect(page.locator('#session-stats')).to_have_text('Présents 1 · retards 0 · absents 1 · excusés 0 · non saisis 1')

            # Bilan (seuil 80 %, retard = présent, excusé neutre) : Ana 75 %, Bob 100 %, Cléo 33,3 % ; alertes en tête.
            rows = page.locator('#summary tbody tr')
            expect(rows).to_have_count(3)
            expect(rows.nth(0)).to_contain_text('Ana')
            expect(rows.nth(0)).to_contain_text('75 %')
            expect(rows.nth(0)).to_contain_text('sous le seuil')
            expect(rows.nth(1)).to_contain_text('33,3 %')
            expect(rows.nth(2)).to_contain_text('100 %')
            expect(page.locator('#kpis')).to_contain_text('Sous 80 %2')
            set_field(page.locator('#threshold'), '120')
            expect(page.locator('#settings-status')).to_have_text('Seuil : pourcentage de 0 à 100 (une décimale au plus)')
            set_field(page.locator('#threshold'), '70')
            expect(page.locator('#kpis')).to_contain_text('Sous 70 %1')
            page.locator('#late-counts').uncheck()
            expect(page.locator('#summary tbody tr').filter(has_text='Ana')).to_contain_text('50 %')
            expect(page.locator('#formula')).to_contain_text('Taux = présences ÷ (séances saisies − absences excusées)')
            page.locator('#late-counts').check()

            # Exports CSV.
            with page.expect_download() as d:
                page.locator('#export-absences').click()
            absences = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').strip().splitlines()
            assert absences[0] == '"Étudiant";"Numéro";"Date";"Séance";"Statut"', absences[0]
            assert absences[1:] == ['"Ana";"2026001";"21/09/2026";"TD 3";"Retard"', '"Ana";"2026001";"28/09/2026";"TD 4";"Absent"',
                                    '"Bob";"2026002";"14/09/2026";"TD 2";"Excusé"', '"Cléo";"2026003";"14/09/2026";"TD 2";"Absent"',
                                    '"Cléo";"2026003";"21/09/2026";"TD 3";"Absent"'], absences
            with page.expect_download() as d:
                page.locator('#export-summary').click()
            summary = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').strip().splitlines()
            assert '"Cléo";"2026003";"3";"1";"0";"2";"0";"33,3";"oui"' in summary, summary

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert len(data['classes'][0]['sessions']) == 4 and data['classes'][0]['settings']['threshold'] == 700
            page.evaluate(f"() => localStorage.setItem('{KEY}', JSON.stringify({{app: 'teachingattendance', version: 1, classes: [{{id: 'x'}}]}}))")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            corrupted = page.evaluate(f"() => localStorage.getItem('{KEY}')")
            page.locator('#student-form [name=name]').fill('Zoé')
            page.locator('#student-form button').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == corrupted
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"teachingattendance","version":2,"classes":[]}'})
            expect(page.locator('#backup-status')).to_contain_text("Ce fichier n'est pas une sauvegarde TeachingAttendance")
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 classe')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#summary tbody tr')).to_have_count(3)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#roll > li')).to_have_count(3)
            expect(page.locator('#session-select option')).to_have_count(4)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text("L'appello con un gesto, la frequenza a colpo d'occhio.")  # navigateur italien
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('#roll > li')).to_have_count(12)
            expect(ip.locator('#session-select option').first).to_contain_text('Esercitazione 1')  # exemple dans la langue affichée
            ip.locator('#student-form [name=name]').fill('Bozza')  # saisie en cours, non validée
            ip.locator('#session-form [name=label]').fill('Recupero')
            titles = {'fr': 'Assiduité', 'en': 'Attendance', 'es': 'Asistencia', 'ar': 'المواظبة', 'pt': 'Assiduidade', 'de': 'Anwesenheit', 'it': 'Frequenza'}
            labels = {'fr': 'Présent', 'en': 'Present', 'es': 'Presente', 'ar': 'حاضر', 'pt': 'Presente', 'de': 'Anwesend', 'it': 'Presente'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-summary')).to_have_text(titles[lang])
                expect(ip.locator('#roll > li').first.locator('.opt.present')).to_have_text(labels[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#summary tbody tr')).to_have_count(12)
                expect(ip.locator('#student-form [name=name]')).to_have_value('Bozza')
                expect(ip.locator('#session-form [name=label]')).to_have_value('Recupero')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            set_field(ip.locator('#threshold'), 'abc')
            expect(ip.locator('#settings-status')).to_have_text('Threshold: percentage from 0 to 100 (one decimal at most)')  # erreur du moteur traduite
            expect(ip.locator('#threshold')).to_have_value('abc')
            set_field(ip.locator('#threshold'), '80')
            with ip.expect_download() as d:
                ip.locator('#export-absences').click()
            head = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').splitlines()[0]
            assert head == '"Student","Student ID","Date","Session","Status"', head
            assert not errors, errors
            browser.close()
        print('BROWSER PASS TeachingAttendance: validation, duplicates, CSV roster, sessions, roll call, rates, threshold, rules, CSV exports, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
