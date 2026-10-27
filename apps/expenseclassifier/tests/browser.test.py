"""ExpenseClassifier dans Chromium : import CSV (Windows-1252, débit/crédit), règles, priorité, totaux, exports, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-expenseclassifier-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''

# Relevé « à la française » : point-virgule, virgule décimale, colonnes Débit / Crédit, accents en Windows-1252, une ligne abîmée.
STATEMENT = ('Date opération;Libellé;Débit;Crédit\r\n'
             '02/10/2026;PRLV LOYER OCTOBRE;700,00;\r\n'
             '03/10/2026;CB SUPERMARCHÉ 02/10;45,20;\r\n'
             '05/10/2026;VIR SALAIRE;;2 100,00\r\n'
             '31/09/2026;LIGNE ABÎMÉE;1,00;\r\n'
             '07/10/2026;CB SUPERMARCHÉ AVOIR;;12,00\r\n'
             '09/10/2026;RETRAIT DAB;40,00;\r\n').encode('cp1252')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_rule(page, cat, kind, value, sign='any'):
    page.locator('#rule-cat').select_option(label=cat)
    page.locator('#rule-kind').select_option(kind)
    page.locator('#rule-value').fill(value)
    page.locator('#rule-sign').select_option(sign)
    page.locator('#rule-form button[type=submit]').click()


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
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation : rien à analyser, règle sans catégorie, catégorie en double.
            page.locator('#analyze').click()
            expect(page.locator('#import-status')).to_have_text("Choisissez un fichier ou collez le contenu d'un relevé.")
            page.locator('#rule-value').fill('loyer')
            page.locator('#rule-form button[type=submit]').click()
            expect(page.locator('#rule-status')).to_have_text("Créez d'abord une catégorie")

            # Import : encodage, séparateur, décimale, en-tête et colonnes débit / crédit détectés.
            page.locator('#file').set_input_files({'name': 'releve.csv', 'mimeType': 'text/csv', 'buffer': STATEMENT})
            expect(page.locator('#settings')).to_be_visible()
            assert page.locator('#delim').input_value() == ';'
            assert page.locator('#decimal').input_value() == 'comma'
            assert page.locator('#datefmt').input_value() == 'dmy'
            assert page.locator('#has-header').is_checked()
            assert page.locator('#amount-mode').input_value() == 'split'
            expect(page.locator('#preview')).to_contain_text('CB SUPERMARCHÉ 02/10')  # accents Windows-1252 bien lus
            expect(page.locator('#do-import')).to_have_text('Importer 6 lignes')
            page.locator('#do-import').click()
            expect(page.locator('#import-status')).to_contain_text('5 opérations importées ; 1 ligne(s) ignorée(s)')
            expect(page.locator('#row-errors')).to_contain_text('Ligne 5 : date illisible')
            expect(page.locator('#kpis')).to_contain_text('785,20')  # débits : 700 + 45,20 + 40
            expect(page.locator('#kpis')).to_contain_text('112,00')

            # Catégories et règles ; doublon refusé.
            for name in ['Logement', 'Courses', 'Revenus']:
                page.locator('#cat-name').fill(name)
                page.locator('#cat-form button').click()
                expect(page.locator('#rule-status')).to_have_text(f'Catégorie « {name} » ajoutée.')
            page.locator('#cat-name').fill(' logement ')
            page.locator('#cat-form button').click()
            expect(page.locator('#rule-status')).to_have_text('Cette catégorie existe déjà')
            add_rule(page, 'Logement', 'keyword', 'LOYER', 'out')
            expect(page.locator('#rule-status')).to_have_text('Règle ajoutée : elle classe 1 opération.')
            add_rule(page, 'Courses', 'pattern', 'cb supermarche*')  # sans accent : correspond quand même
            expect(page.locator('#rule-status')).to_have_text('Règle ajoutée : elle classe 2 opérations.')
            add_rule(page, 'Revenus', 'keyword', 'vir', 'in')
            cat_rows = page.locator('#by-cat tbody tr')
            expect(cat_rows).to_have_count(4)
            expect(cat_rows.nth(0)).to_contain_text('Logement')
            expect(cat_rows.nth(1)).to_contain_text('-33,20')  # Courses : -45,20 + 12,00
            expect(cat_rows.nth(3)).to_contain_text('Non classé')
            expect(page.locator('#kpis')).to_contain_text('80 %')

            # Priorité : une règle « * » placée en tête capte tout ; remise en bas, elle ne capte que le reste.
            add_rule(page, 'Courses', 'pattern', '*')
            expect(page.locator('#rules li')).to_have_count(4)
            expect(cat_rows).to_have_count(3)  # plus de « Non classé »
            for _ in range(3):
                page.locator('#rules li').nth(3 - _).locator('button').first.click()
            expect(page.locator('#rules li').first).to_contain_text('motif « * »')
            expect(cat_rows).to_have_count(1)  # tout va dans Courses
            page.locator('#rules li').first.locator('button').nth(2).click()  # supprime la règle « * »
            expect(cat_rows).to_have_count(4)

            # Raccourci « + règle » sur une ligne non classée, filtre des opérations.
            page.locator('#filter').select_option('none')
            expect(page.locator('#lines tbody tr')).to_have_count(1)
            page.locator('#lines tbody tr').first.locator('button').click()
            assert page.locator('#rule-value').input_value() == 'RETRAIT DAB'
            assert page.locator('#rule-sign').input_value() == 'out'

            # Export CSV classé (en-têtes traduits, virgule décimale).
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Date;Libellé;Montant;Catégorie;Mois\r\n'), csv[:80]
            assert '2026-10-02;PRLV LOYER OCTOBRE;-700,00;Logement;2026-10' in csv, csv
            assert '2026-10-09;RETRAIT DAB;-40,00;Non classé;2026-10' in csv, csv

            # Sauvegarde, stockage corrompu (mode protégé), restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['rules']) == 3
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"pricelens","version":1}'})
            expect(page.locator('#backup-status')).to_contain_text("Ce fichier n'est pas une sauvegarde ExpenseClassifier")
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#cat-name').fill('Test')
            page.locator('#cat-form button').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'pas du json'
            bad = json.loads(backup); bad['transactions'][0]['date'] = '2026-02-30'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()  # le mode protégé reste actif
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 5 opérations.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#by-cat tbody tr')).to_have_count(4)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#rules li')).to_have_count(3)
            context.set_offline(False)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue affichée, 7 langues sans débordement, devise, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Where does your money go, line by line?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#import-status')).to_have_text('Example loaded: 14 transactions over two months.')
            expect(ip.locator('#cats')).to_contain_text('Groceries')
            expect(ip.locator('#by-cat tbody tr')).to_have_count(6)
            expect(ip.locator('#by-cat tbody tr').last).to_contain_text('Uncategorised')
            expect(ip.locator('#kpis')).to_contain_text('$')
            ip.locator('#cat-name').fill('Draft category')
            ip.locator('#csv-text').fill('kept text')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#by-cat tbody tr')).to_have_count(6)
                assert ip.locator('#cat-name').input_value() == 'Draft category'
                assert ip.locator('#csv-text').input_value() == 'kept text'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Wohin fließt Ihr Geld, Zeile für Zeile?')
            expect(ip.locator('#by-cat tbody tr').last).to_contain_text('Nicht zugeordnet')
            ip.locator('#louvre-currency').select_option('GBP')
            expect(ip.locator('#kpis')).to_contain_text('£')
            with ip.expect_download() as d:
                ip.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Datum;Buchungstext;Betrag;Kategorie;Monat'), csv[:60]
            # Un exemple chargé en allemand est généré en allemand.
            ip.locator('#sample').click()
            expect(ip.locator('#cats')).to_contain_text('Lebensmittel')
            expect(ip.locator('#import-status')).to_have_text('Beispiel geladen: 14 Buchungen über zwei Monate.')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#rule-value').fill('')
            ip.locator('#rule-form button[type=submit]').click()
            expect(ip.locator('#rule-status')).to_have_text('الكلمة المفتاحية أو النمط مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS ExpenseClassifier: validation, CSV import (cp1252, debit/credit), rules, priority, totals, CSV export, backup/restore, protected mode, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
