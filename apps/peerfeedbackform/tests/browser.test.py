"""PeerFeedbackForm dans Chromium : grille, validation, étudiants, saisie, agrégation, WebPA, note individuelle, CSV,
sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-peerfeedbackform-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_field(locator, value):
    """Remplit un champ puis déclenche « change » (comme quand on quitte le champ)."""
    locator.fill(value)
    locator.dispatch_event('change')


def rate(page, rater, scores):
    """Saisit les notes de l'évaluateur : {évalué: (critère 1, critère 2)}."""
    page.locator('#rater').select_option(label=rater)
    for ratee, values in scores.items():
        row = page.locator('#entry tr[data-ratee]').filter(has_text=ratee)
        for i, v in enumerate(values):
            row.locator('select').nth(i).select_option(str(v))
            expect(page.locator('#entry-status')).to_have_text(f'Enregistré : {rater} → {ratee}.')


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
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Grille : validation, critères, échelle.
            page.locator('#add-crit').click()
            expect(page.locator('#grid-status')).to_have_text('Nom du critère obligatoire')
            for name in ['Implication', 'Qualité']:
                page.locator('#c-name').fill(name)
                page.locator('#add-crit').click()
                expect(page.locator('#grid-status')).to_have_text(f'Critère ajouté : {name}.')
            expect(page.locator('#criteria li.crit')).to_have_count(2)
            set_field(page.locator('#s-max'), 'abc')
            expect(page.locator('#grid-status')).to_have_text('Note maximale : entier de 1 à 100')
            expect(page.locator('#s-max')).to_have_attribute('aria-invalid', 'true')
            set_field(page.locator('#s-max'), '5')
            expect(page.locator('#grid-status')).to_have_text('Grille enregistrée.')

            # Étudiants et équipes.
            page.locator('#add-student').click()
            expect(page.locator('#students-status')).to_have_text("Nom de l'étudiant obligatoire")
            for name, team in [('Ana', 'T1'), ('Ben', 'T1'), ('Cleo', 'T1'), ('Dan', 'T2')]:
                page.locator('#st-name').fill(name)
                page.locator('#st-team').fill(team)
                page.locator('#add-student').click()
                expect(page.locator('#students-status')).to_have_text(f'Ajouté : {name} ({team}).')
            page.locator('#st-name').fill('ana')
            page.locator('#st-team').fill('T1')
            page.locator('#add-student').click()
            expect(page.locator('#students-status')).to_have_text('Cet étudiant existe déjà dans cette équipe')
            expect(page.locator('#students .team')).to_have_count(2)

            # Saisie : chacun note ses deux coéquipiers (auto-évaluation exclue des calculs).
            rate(page, 'Ana', {'Ben': (4, 4), 'Cleo': (2, 2)})
            expect(page.locator('#rater-progress')).to_have_text('Fiches complètes : 2/2')
            rate(page, 'Ben', {'Ana': (5, 5), 'Cleo': (5, 5)})
            rate(page, 'Cleo', {'Ana': (3, 3), 'Ben': (3, 3)})
            expect(page.locator('#entry tr.self')).to_contain_text('auto-évaluation (exclue des calculs)')

            # Résultats : moyennes, écart-type, coefficients WebPA 1 / 1,167 / 0,833.
            t1 = page.locator('.team-result').filter(has_text='T1')
            rows = t1.locator('tbody tr')
            expect(rows).to_have_count(3)
            expect(rows.nth(0)).to_contain_text('Ana')
            expect(rows.nth(0).locator('td').nth(1)).to_have_text('4')  # moyenne (5 + 3) / 2
            expect(rows.nth(0).locator('td').nth(2)).to_have_text('1,41')  # écart-type n − 1
            expect(rows.nth(1).locator('td.factor')).to_have_text('1,167')
            expect(rows.nth(2).locator('td.factor')).to_have_text('0,833')
            expect(t1.locator('.hint')).to_have_text('Évaluateurs retenus : 3/3')
            mark = t1.locator('input[data-team]')
            set_field(mark, '25')
            expect(page.locator('#results-status')).to_have_text("Note d'équipe invalide (ex. 14,5 ; 20 au plus)")
            expect(mark).to_have_attribute('aria-invalid', 'true')
            set_field(mark, '15')
            expect(page.locator('#results-status')).to_have_text('Note enregistrée pour T1.')
            expect(rows.nth(1).locator('td').last).to_have_text('17,5 / 20')
            expect(rows.nth(2).locator('td').last).to_have_text('12,5 / 20')
            # Un évaluateur incomplet est écarté (correction N / S).
            page.locator('#rater').select_option(label='Cleo')
            page.locator('#entry tr[data-ratee]').filter(has_text='Ben').locator('select').nth(1).select_option('')
            expect(t1.locator('.hint')).to_contain_text('Évaluateurs retenus : 2/3')
            expect(t1.locator('.hint')).to_contain_text('Cleo : évaluations incomplètes')
            expect(rows.nth(0).locator('td.factor')).to_have_text('0,75')
            page.locator('#entry tr[data-ratee]').filter(has_text='Ben').locator('select').nth(1).select_option('3')
            expect(t1.locator('.hint')).to_have_text('Évaluateurs retenus : 3/3')
            # Auto-évaluation comptée : il faut alors aussi se noter soi-même.
            page.locator('#s-self').select_option('include')
            expect(t1.locator('.hint')).to_contain_text('Évaluateurs retenus : 0/3')
            page.locator('#s-self').select_option('exclude')
            expect(t1.locator('.hint')).to_have_text('Évaluateurs retenus : 3/3')
            # Échelle réduite refusée : des notes saisies en sortiraient.
            set_field(page.locator('#s-max'), '4')
            expect(page.locator('#grid-status')).to_have_text('Des notes déjà saisies sortiraient de cette échelle')
            set_field(page.locator('#s-max'), '5')

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').strip().splitlines()
            assert csv[0] == '"Équipe";"Étudiant";"Évaluations reçues";"Moyenne";"Écart-type";"Implication";"Qualité";"Auto-évaluation";"Évaluations données";"Coefficient WebPA";"Note équipe";"Note individuelle"', csv[0]
            assert csv[2] == '"T1";"Ben";"2";"3,5";"0,71";"3,5";"3,5";"";"2/2";"1,167";"15";"17,5"', csv[2]
            assert csv[4].startswith('"T2";"Dan";"0"'), csv[4]

            # Sauvegarde, puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert data['app'] == 'peerfeedbackform' and len(data['ratings']) == 6 and data['teamMarks'] == {'T1': 1500}
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#c-name').fill('X')
            page.locator('#add-crit').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            bad = dict(data, ratings=[{'rater': data['students'][0]['id'], 'ratee': data['students'][3]['id'], 'scores': {data['criteria'][0]['id']: 3}}])
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text("Restauration refusée : On n'évalue que les membres de sa propre équipe")
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 4 étudiants.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('.team-result').filter(has_text='T1').locator('tbody tr').nth(1).locator('td').last).to_have_text('17,5 / 20')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#criteria li.crit')).to_have_count(2)
            expect(page.locator('.team-result')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Chi ha davvero portato avanti il progetto?')  # navigateur italien
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('.team-result').first).to_contain_text('Gruppo 1')  # exemple dans la langue affichée
            expect(ip.locator('.team-result').nth(1).locator('.hint')).to_contain_text('Paolo')  # le dernier n'a pas répondu
            ip.locator('#st-name').fill('Zed')  # saisie en cours, non validée
            set_field(ip.locator('.team-result').first.locator('input[data-team]'), 'x')  # valeur invalide en cours
            titles = {'fr': 'Résultats', 'en': 'Results', 'es': 'Resultados', 'ar': 'النتائج', 'pt': 'Resultados', 'de': 'Ergebnisse', 'it': 'Risultati'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-results')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('.team-result')).to_have_count(2)
                expect(ip.locator('#st-name')).to_have_value('Zed')
                expect(ip.locator('.team-result').first.locator('input[data-team]')).to_have_value('x')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            set_field(ip.locator('#s-min'), '12')
            expect(ip.locator('#grid-status')).to_have_text('Lowest score: whole number from 0 to 10')  # erreur du moteur traduite
            expect(ip.locator('.team-result').first.locator('tbody tr')).to_have_count(4)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PeerFeedbackForm: validation, criteria, students and teams, rating entry, aggregation, WebPA (complete, incomplete, self-assessment), individual mark, scale conflict, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
