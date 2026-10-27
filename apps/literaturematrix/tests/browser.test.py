"""LiteratureMatrix dans Chromium : saisie, colonnes, filtres, tri, cellules vides, exports, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-literaturematrix-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_paper(page, authors, year, journal='', cells=None):
    page.locator('[name=authors]').fill(authors)
    page.locator('[name=year]').fill(year)
    page.locator('[name=journal]').fill(journal)
    for col, value in (cells or {}).items():
        page.locator(f'textarea[data-col="{col}"]').fill(value)
    page.locator('#save-paper').click()


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
            page.on('dialog', lambda d: d.accept('Cadre théorique') if d.type == 'prompt' else d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'
            expect(page.locator('#matrix-scroll .empty')).to_be_visible()

            # Validation : auteurs obligatoires, année et DOI contrôlés.
            page.locator('#save-paper').click()
            expect(page.locator('#form-status')).to_have_text('Indiquez au moins un auteur')
            fill_paper(page, 'Fama, E. F.', '93')
            expect(page.locator('#form-status')).to_have_text('Année invalide (4 chiffres, de 1500 à 2100)')
            page.locator('[name=doi]').fill('pas un doi')
            fill_paper(page, 'Fama, E. F.', '1993')
            expect(page.locator('#form-status')).to_contain_text('DOI invalide')
            page.locator('[name=doi]').fill('')

            # Deux articles, puis une colonne personnalisée.
            fill_paper(page, 'Fama, E. F.; French, K. R.', '1993', 'Journal of Financial Economics', {'question': 'Facteurs communs de rendement', 'method': 'Régressions en séries temporelles'})
            expect(page.locator('#form-status')).to_have_text('Fama & French (1993) ajouté.')
            page.locator('#col-label').fill('Pays')
            page.locator('#add-col').click()
            expect(page.locator('#col-status')).to_have_text('Colonne « Pays » ajoutée.')
            page.locator('#col-label').fill('pays')
            page.locator('#add-col').click()
            expect(page.locator('#col-status')).to_have_text('Une colonne porte déjà ce nom')
            assert page.locator('#cell-fields textarea').count() == 6
            fill_paper(page, 'Ammari, A.', '2024', 'Revue X', {'question': 'Risque climatique', 'method': 'Panel', 'data': 'REIT mondiales', 'results': 'Effet négatif', 'limits': 'Période courte'})
            # Le dernier champ « Pays » (colonne personnalisée) reste vide : 1 cellule vide pour Ammari, 4 pour Fama & French.
            rows = page.locator('#matrix tbody tr')
            expect(rows).to_have_count(2)
            expect(page.locator('#k-empty')).to_have_text('5')
            expect(page.locator('#k-complete')).to_have_text('58,3 %')
            expect(page.locator('#matrix .gap-tag')).to_have_count(5)

            # Filtres : cellules vides dans « Données », recherche sans accents, années.
            page.locator('#flt-gap').select_option(label='Vide : Données (1)')
            expect(rows).to_have_count(1)
            expect(rows.first).to_contain_text('Fama & French (1993)')
            expect(page.locator('#filter-status')).to_have_text('1 article affiché sur 2.')
            page.locator('#flt-gap').select_option('')
            page.locator('#flt-q').fill('regressions')
            expect(rows).to_have_count(1)
            page.locator('#flt-q').fill('')
            page.locator('#flt-from').fill('2030')
            page.locator('#flt-to').fill('2000')
            expect(page.locator('#filter-status')).to_have_text("L'année de début dépasse l'année de fin")
            page.locator('#flt-from').fill('2000')
            page.locator('#flt-to').fill('')
            expect(rows).to_have_count(1)
            expect(rows.first).to_contain_text('Ammari')
            page.locator('#flt-from').fill('')
            expect(rows).to_have_count(2)

            # Tri : année croissante par défaut, puis décroissante d'un clic.
            expect(rows.first).to_contain_text('Fama')
            page.get_by_role('button', name='Trier par Année').click()
            expect(page.locator('#matrix th[aria-sort="descending"]')).to_have_count(1)
            expect(rows.first).to_contain_text('Ammari')

            # Modification : le formulaire est prérempli, l'article est remplacé.
            rows.filter(has_text='Fama').get_by_role('button', name='Modifier').click()
            expect(page.locator('[name=authors]')).to_have_value('Fama, E. F.; French, K. R.')
            page.locator('textarea[data-col="data"]').fill('Actions NYSE, AMEX, NASDAQ')
            page.locator('#save-paper').click()
            expect(page.locator('#form-status')).to_have_text('Fama & French (1993) mis à jour.')
            expect(page.locator('#k-empty')).to_have_text('4')

            # Renommer la colonne personnalisée (la boîte de dialogue répond « Cadre théorique »).
            page.get_by_role('button', name='Renommer la colonne Pays').click()
            expect(page.locator('#cols')).to_contain_text('Cadre théorique')

            # Exports CSV et Markdown (en-têtes traduits).
            csv = download_text(page, '#export-csv')
            assert csv.startswith('﻿Auteurs,Année,Titre,Revue,DOI,Question,Méthode,Données,Résultats,Limites,Cadre théorique\r\n'), csv[:200]
            assert '"Fama, E. F.; French, K. R.",1993' in csv
            page.locator('#csv-sep').select_option(';')
            csv2 = download_text(page, '#export-csv')
            assert csv2.startswith('﻿Auteurs;Année;'), csv2[:80]
            md = download_text(page, '#export-md')
            assert md.startswith('# Matrice de revue de littérature\n\n| Auteurs | Année |'), md[:120]
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert len(saved['papers']) == 2 and saved['columns'][0]['label'] == 'Cadre théorique'

            # Sauvegarde, stockage corrompu : rien n'est écrasé, puis restauration.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['papers']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            fill_paper(page, 'X, Y.', '2020')
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"autre"}'})
            expect(page.locator('#backup-status')).to_contain_text("n'est pas une sauvegarde LiteratureMatrix")
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 articles.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(rows).to_have_count(2)

            # Suppression d'un article.
            rows.filter(has_text='Ammari').get_by_role('button', name='Supprimer').click()
            expect(rows).to_have_count(1)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#matrix tbody tr')).to_have_count(1)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue affichée, 7 langues sans débordement, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-ES')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Toda su revisión de la literatura en una sola tabla')
            assert ip.evaluate('() => LouvreI18n.lang') == 'es'
            ip.locator('#sample').click()
            expect(ip.locator('#matrix tbody tr')).to_have_count(3)
            expect(ip.locator('#matrix')).to_contain_text('(Ficticio) ESG y coste del capital')
            ip.locator('[name=authors]').fill('Borrador, B.')
            ip.locator('textarea[data-col="method"]').fill('MCO')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#matrix tbody tr')).to_have_count(3)
                expect(ip.locator('[name=authors]')).to_have_value('Borrador, B.')
                expect(ip.locator('textarea[data-col="method"]')).to_have_value('MCO')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent : pas de menu devise
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#matrix th').nth(3)).to_have_text('Method')
            expect(ip.locator('#k-complete')).to_have_text('66.7 %')
            ip.locator('#louvre-lang').select_option('de')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Ihr ganzes Literaturreview in einer Tabelle')
            ip.locator('[name=authors]').fill('Test')
            ip.locator('[name=year]').fill('1234')
            ip.locator('#save-paper').click()
            expect(ip.locator('#form-status')).to_have_text('Ungültiges Jahr (4 Ziffern, 1500 bis 2100)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS LiteratureMatrix: validation, custom columns, gaps, filters, sorting, edit, CSV/Markdown export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
