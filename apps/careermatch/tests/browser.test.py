"""CareerMatch dans Chromium : avertissement, comparaison lexicale, réglages, expressions, plusieurs offres, export, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-careermatch-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_bytes().decode('utf-8')


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
            expect(page.locator('#notice')).to_contain_text("ni un avis de recrutement")
            expect(page.locator('#res-empty')).to_be_visible()
            expect(page.locator('#text-lang')).to_have_value('fr')

            # Première saisie : une comparaison est créée automatiquement et enregistrée.
            page.locator('#offer').fill("Analyste financier : Python, SQL, Python avancé. Modélisation financière et reporting. Anglais courant.")
            page.locator('#cv').fill('Analyste junior. Python et Excel. Reporting mensuel, modèles financiers.')
            expect(page.locator('#k-coverage')).to_have_text('40 %')
            expect(page.locator('#k-weighted')).to_have_text('45,5 %')
            expect(page.locator('#k-present')).to_have_text('4')
            expect(page.locator('#present li').first).to_contain_text('python')
            expect(page.locator('#missing li')).to_have_count(6)
            expect(page.locator('#missing')).to_contain_text('sql')
            expect(page.locator('#res-explain')).to_have_text("Votre CV contient 4 des 10 termes retenus de l'offre (40 %). La couverture pondérée tient compte du nombre de fois où chaque terme apparaît dans l'offre.")
            expect(page.locator('#cmp-select')).to_contain_text('Offre 1')
            page.wait_for_function(f"() => (JSON.parse(localStorage.getItem('{KEY}') || '{{}}').comparisons || []).length === 1")

            # Réglages : expressions, termes ignorés, pluriels.
            page.locator('#phrases').fill('modélisation financière\ngestion de projet')
            expect(page.locator('#phrases-res li')).to_have_count(2)
            expect(page.locator('#phrases-res li').first).to_contain_text('offre : oui')
            expect(page.locator('#phrases-res li').first).to_contain_text('CV : non')
            page.locator('#ignore').fill('anglais\ncourant')
            expect(page.locator('#k-coverage')).to_have_text('50 %')  # 4 sur 8
            page.locator('#fold').uncheck()
            expect(page.locator('#k-present')).to_have_text('3')  # « financiers » ne rejoint plus « financier »
            page.locator('#fold').check()
            page.locator('#top').select_option('20')

            # Validation : une expression trop longue est refusée (la saisie reste affichée).
            page.locator('#phrases').fill('x' * 61)
            expect(page.locator('#form-status')).to_have_text('Ligne trop longue (60 caractères au plus)')
            page.locator('#phrases').fill('modélisation financière')
            expect(page.locator('#form-status')).to_have_text('')

            # Export CSV des termes (en-têtes et statuts traduits).
            csv = download_text(page, '#export-csv')
            assert csv.startswith("﻿Terme,Occurrences dans l'offre,Occurrences dans le CV,Statut\r\npython,2,1,présent\r\n"), csv[:120]
            assert 'sql,1,0,absent' in csv

            # Deuxième offre : le CV est repris, l'offre est vide.
            page.locator('#new-cmp').click()
            expect(page.locator('#cmp-status')).to_have_text("Nouvelle comparaison : collez l'offre.")
            expect(page.locator('#cv')).to_have_value('Analyste junior. Python et Excel. Reporting mensuel, modèles financiers.')
            expect(page.locator('#offer')).to_have_value('')
            page.locator('#offer').fill('Data analyst Excel Python')
            expect(page.locator('#k-coverage')).to_have_text('50 %')  # excel et python sur data, analyst, excel, python
            page.locator('#cmp-select').select_option(label='Offre 1')
            expect(page.locator('#k-present')).to_have_text('4')

            # Sauvegarde, stockage corrompu, restauration.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['comparisons']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[[[')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#offer').fill('test python')
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            expect(page.locator('#k-coverage')).to_be_visible()  # l'analyse reste possible
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[[['
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"careermatch","version":1,"comparisons":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 comparaisons.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-present')).to_have_text('4')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#cmp-select option')).to_have_count(2)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : exemple dans la langue détectée, saisie conservée, 7 langues sans débordement.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text("Quali parole dell'annuncio compaiono nel tuo CV?")
            ip.locator('#sample').click()
            expect(ip.locator('#cmp-select')).to_contain_text('Esempio — Analista finanziario')
            expect(ip.locator('#text-lang')).to_have_value('it')
            expect(ip.locator('#present')).to_contain_text('python')
            coverage = ip.locator('#k-coverage').inner_text()
            ip.locator('#ignore').fill('bozza')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#ignore')).to_have_value('bozza')
                expect(ip.locator('#text-lang')).to_have_value('it')  # la langue des textes ne suit pas celle de l'interface
                expect(ip.locator('#notice')).to_be_visible()
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent
            expect(ip.locator('#k-coverage')).to_have_text(coverage)
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#notice')).to_contain_text('not hiring advice')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#notice')).to_contain_text('ليس تنبؤاً بفرصك')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#phrases').fill('y' * 61)
            expect(ip.locator('#form-status')).to_have_text('Zeile zu lang (höchstens 60 Zeichen)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS CareerMatch: disclaimer, lexical coverage, phrases, ignored terms, plurals, validation, CSV export, multiple job ads, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
