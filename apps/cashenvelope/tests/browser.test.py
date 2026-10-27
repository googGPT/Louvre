"""CashEnvelope dans Chromium : enveloppes, dépenses, report, alertes, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import re
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-cashenvelope-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_envelope(page, name, budget, rollover=False):
    page.locator('#env-form [name=name]').fill(name)
    page.locator('#env-form [name=budget]').fill(budget)
    if rollover:
        page.locator('#env-form [name=rollover]').check()
    page.locator('#env-form button[type=submit]').click()
    expect(page.locator('#env-status')).to_contain_text(name)


def add_expense(page, envelope, amount, note=''):
    page.locator('#exp-form [name=envelope]').select_option(label=envelope)
    page.locator('#exp-form [name=amount]').fill(amount)
    page.locator('#exp-form [name=note]').fill(note)
    page.locator('#add-exp').click()
    expect(page.locator('#exp-status')).to_contain_text(envelope)


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')


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
            expect(page.locator('#add-exp')).to_be_disabled()  # aucune enveloppe : pas de dépense possible

            # Validation : nom obligatoire, montant ambigu, seuil hors limites.
            page.locator('#env-form button[type=submit]').click()
            expect(page.locator('#env-status')).to_have_text("Nom de l'enveloppe obligatoire")
            page.locator('#env-form [name=name]').fill('Courses')
            page.locator('#env-form [name=budget]').fill('12,345')
            page.locator('#env-form button[type=submit]').click()
            expect(page.locator('#env-status')).to_have_text('Budget invalide (ex. 300)')
            page.locator('#settings-form [name=income]').fill('2000')
            page.locator('#settings-form [name=alertPct]').fill('150')
            page.locator('#settings-form button[type=submit]').click()
            expect(page.locator('#settings-status')).to_contain_text('Seuil d\'alerte')
            page.locator('#settings-form [name=alertPct]').fill('80')
            page.locator('#settings-form button[type=submit]').click()
            expect(page.locator('#settings-status')).to_have_text('Réglages enregistrés.')

            # Parcours : deux enveloppes, dépenses, alerte au seuil, report sur le mois suivant.
            add_envelope(page, 'Courses', '400', rollover=True)
            add_envelope(page, 'Loisirs', '100')
            expect(page.locator('#kpis')).to_contain_text(re.compile(r'1\s500,00'))  # non réparti : 2 000 - 500
            add_expense(page, 'Courses', '350', 'marché')
            expect(page.locator('#exp-status')).to_contain_text('50,00')
            add_expense(page, 'Loisirs', '85')
            expect(page.locator('#alerts')).to_contain_text('Loisirs : 85 % déjà utilisés')
            expect(page.locator('#exp-list li')).to_have_count(2)
            page.locator('#exp-form [name=amount]').fill('-5')
            page.locator('#add-exp').click()
            expect(page.locator('#exp-status')).to_have_text('Montant invalide (ex. 12,50)')

            page.locator('#next').click()
            expect(page.locator('#envs')).to_contain_text('report +50,00')
            expect(page.locator('#exp-list .empty')).to_be_visible()
            add_expense(page, 'Courses', '500')
            expect(page.locator('#alerts')).to_contain_text('Courses : dépassement de 50,00')
            expect(page.locator('#envs li.over')).to_have_count(1)
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert len(saved['envelopes']) == 2 and len(saved['expenses']) == 3, saved

            # Exports CSV (en-têtes traduits, devise indiquée).
            summary = download_text(page, '#csv-summary')
            assert summary.splitlines()[0] == '"Enveloppe";"Budget (EUR)";"Report (EUR)";"Dépensé (EUR)";"Reste (EUR)";"État"', summary
            assert '"Courses";"400.00";"50.00";"500.00";"-50.00";"dépassé"' in summary, summary
            expenses = download_text(page, '#csv-expenses')
            assert expenses.count('\n') == 2 and '"500.00"' in expenses, expenses

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['expenses']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#env-form [name=name]').fill('Test')
            page.locator('#env-form [name=budget]').fill('10')
            page.locator('#env-form button[type=submit]').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            raw = download_text(page, '#export-raw')
            assert raw == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"cashenvelope","version":1}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()  # la protection reste active
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 enveloppes')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#settings-form [name=income]')).to_have_value('2000.00')

            # Hors ligne : rechargement servi par le service worker.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#env-list li')).to_have_count(2)
            context.set_offline(False)
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Every expense in its envelope')  # navigateur anglais -> anglais
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#env-list li')).to_have_count(6)
            expect(ip.locator('#env-list')).to_contain_text('Groceries')  # exemple généré dans la langue affichée
            expect(ip.locator('#kpis')).to_contain_text('$2,400.00')
            expect(ip.locator('#alerts')).to_contain_text('Eating out: overspent by US$15.00')
            ip.locator('#exp-form [name=amount]').fill('12.34')
            ip.locator('#exp-form [name=note]').fill('brouillon')
            titles = {'fr': 'Enveloppes', 'en': 'Envelopes', 'es': 'Sobres', 'ar': 'المغلفات', 'pt': 'Envelopes', 'de': 'Umschläge', 'it': 'Buste'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-envelopes')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                if lang == 'ar':  # aucun élément ne déborde à gauche non plus
                    assert ip.evaluate("() => [...document.querySelectorAll('body *')].every((e) => e.getBoundingClientRect().left >= -2)")
                expect(ip.locator('#envs li')).to_have_count(6)
                expect(ip.locator('#alerts li')).to_have_count(3)  # logement à 100 %, loisirs à 95 %, restaurants dépassés
                expect(ip.locator('#exp-form [name=amount]')).to_have_value('12.34')
                expect(ip.locator('#exp-form [name=note]')).to_have_value('brouillon')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # Devise et langue mémorisées ; erreur du moteur traduite.
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#louvre-currency').select_option('CHF')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Jede Ausgabe in ihren Umschlag')
            expect(ip.locator('#kpis')).to_contain_text('CHF')
            expect(ip.locator('.cur').first).to_have_text('CHF')
            ip.locator('#env-form button[type=submit]').click()
            expect(ip.locator('#env-status')).to_have_text('Name des Umschlags erforderlich')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS CashEnvelope: validation, envelopes, expenses, alert threshold, rollover, overspending, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
