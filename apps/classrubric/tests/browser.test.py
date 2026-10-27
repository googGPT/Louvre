"""ClassRubric dans Chromium : grille, validation, évaluation, note, CSV, impression, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-classrubric-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_field(locator, value):
    """Remplit un champ puis déclenche « change » (comme quand on quitte le champ)."""
    locator.fill(value)
    locator.dispatch_event('change')


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

            # Validation : pas de copie sans critère, pas de poids nul.
            page.locator('#student').fill('Ana')
            page.locator('#new-eval').click()
            expect(page.locator('#eval-status')).to_have_text("La grille n'a encore aucun critère")
            page.locator('#add-criterion').click()
            expect(page.locator('#criteria .crit')).to_have_count(1)
            c1 = page.locator('#criteria .crit').nth(0)
            set_field(c1.locator('[data-f=name]'), 'Contenu')
            expect(page.locator('#grid-status')).to_have_text('Enregistré : Contenu.')
            set_field(c1.locator('[data-f=weight]'), '0')
            expect(page.locator('#grid-status')).to_have_text('Poids : nombre entier de 1 à 100')
            expect(c1.locator('[data-f=weight]')).to_have_attribute('aria-invalid', 'true')
            set_field(c1.locator('[data-f=weight]'), '3')
            expect(page.locator('#grid-status')).to_have_text('Enregistré : Contenu.')
            page.locator('#add-criterion').click()
            c2 = page.locator('#criteria .crit').nth(1)
            set_field(c2.locator('[data-f=name]'), 'Forme')
            expect(page.locator('#grid-status')).to_have_text('Enregistré : Forme.')
            set_field(c2.locator('.lvl').nth(0).locator('[data-f=label]'), '')
            expect(page.locator('#grid-status')).to_have_text('Nom du niveau obligatoire')
            set_field(c2.locator('.lvl').nth(0).locator('[data-f=label]'), 'Absent')
            # Un niveau de plus, puis retiré.
            c2.locator('[data-action=add-level]').click()
            expect(page.locator('#criteria .crit').nth(1).locator('.lvl')).to_have_count(5)
            page.locator('#criteria .crit').nth(1).locator('.lvl').nth(4).locator('[data-action=remove-level]').click()
            expect(page.locator('#criteria .crit').nth(1).locator('.lvl')).to_have_count(4)

            # Évaluation : Contenu « Très bien » (3/3, poids 3), Forme niveau 1 (1/3, poids 1) -> 20 × (3 + 1/3) / 4 = 16,67 -> 16,5.
            page.locator('#new-eval').click()
            expect(page.locator('#eval-status')).to_contain_text('Copie créée : Ana')
            page.locator('.ecrit').nth(0).locator('.choice').nth(3).click()
            expect(page.locator('#score')).to_contain_text('Incomplète : 1 critère sans niveau')
            page.locator('.ecrit').nth(1).locator('.choice').nth(1).click()
            expect(page.locator('#score')).to_contain_text('16,5 / 20')
            expect(page.locator('#eval-status')).to_contain_text('Copie complète — Ana')
            page.locator('#step').select_option('0.01')
            expect(page.locator('#score')).to_contain_text('16,67 / 20')
            set_field(page.locator('#comment'), 'Très bon fond, forme à soigner.')
            expect(page.locator('#eval-status')).to_have_text('Commentaire enregistré.')
            # Deuxième copie, incomplète.
            page.locator('#student').fill('Bob')
            page.locator('#new-eval').click()
            page.locator('.ecrit').nth(0).locator('.choice').nth(0).click()
            rows = page.locator('#results tbody tr')
            expect(rows).to_have_count(2)
            expect(rows.nth(0)).to_contain_text('16,67')
            expect(rows.nth(1)).to_contain_text('1 critère manquant')
            expect(page.locator('#kpis')).to_contain_text('1 / 2')
            # Réouvrir Ana depuis le tableau.
            rows.nth(0).locator('button').click()
            expect(page.locator('#score')).to_contain_text('Ana')
            expect(page.locator('#comment')).to_have_value('Très bon fond, forme à soigner.')

            # Export CSV (en-têtes français, séparateur « ; »).
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            lines = csv.strip().splitlines()
            assert lines[0].startswith('"Étudiant";"Contenu (×3)";"Forme (×1)";"Note"'), lines[0]
            assert lines[1].startswith('"Ana";"Très bien (3/3)";"À consolider (1/3)";"16,67";"20";"complète"'), lines[1]
            assert '"Bob";"Insuffisant (0/3)";"";"";"20";"incomplète"' in lines[2], lines[2]

            # Impression de la copie : seule la zone d'impression est visible, niveau choisi coché.
            page.evaluate('() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }')
            page.locator('#print-eval').click()
            assert page.evaluate('() => window.__printed') == 1
            page.emulate_media(media='print')
            expect(page.locator('#print-area')).to_be_visible()
            expect(page.locator('#print-area')).to_contain_text('Ana')
            expect(page.locator('#print-area td.sel')).to_have_count(2)
            expect(page.locator('#h-rubric')).to_be_hidden()
            page.emulate_media(media='screen')
            expect(page.locator('#print-area')).to_be_hidden()

            # Sauvegarde, puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert data['app'] == 'classrubric' and len(data['evaluations']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#add-criterion').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            # Une sauvegarde invalide est refusée et la protection reste active.
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"classrubric","version":1,"rubrics":[{"id":"bad"}],"evaluations":[]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 grille')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#results tbody tr')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#criteria .crit')).to_have_count(2)
            expect(page.locator('#results tbody tr')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Faire Noten, Kriterium für Kriterium.')  # navigateur allemand
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('.ecrit').first.locator('legend')).to_contain_text('Inhalt')  # exemple dans la langue affichée
            expect(ip.locator('#score')).to_contain_text('/ 20')
            ip.locator('#student').fill('Zed')  # saisie en cours, non validée
            ip.locator('#criteria .crit').first.locator('summary').click()  # déplier le critère pour le modifier
            set_field(ip.locator('#criteria .crit').first.locator('[data-f=weight]'), 'x')  # valeur invalide en cours
            titles = {'fr': 'Grille', 'en': 'Rubric', 'es': 'Rúbrica', 'ar': 'شبكة التقييم', 'pt': 'Grelha', 'de': 'Raster', 'it': 'Griglia'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-rubric')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('.ecrit')).to_have_count(4)
                expect(ip.locator('#student')).to_have_value('Zed')
                expect(ip.locator('#criteria .crit').first.locator('[data-f=weight]')).to_have_value('x')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            set_field(ip.locator('#scale'), 'abc')
            expect(ip.locator('#grid-status')).to_have_text('Scale: whole number from 1 to 1000')  # erreur du moteur traduite
            expect(ip.locator('#results tbody tr')).to_have_count(3)
            expect(ip.locator('#results tbody tr').filter(has_text='Jonas')).to_contain_text('2 criteria missing')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS ClassRubric: validation, criteria editor, grading, rounding, comment, class results, CSV, print, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
