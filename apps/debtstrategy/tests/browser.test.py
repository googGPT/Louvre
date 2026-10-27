"""DebtStrategy dans Chromium : dettes, budget, comparaison avalanche / boule de neige, budget insuffisant, échéancier, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-debtstrategy-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_debt(page, name, balance, rate, minimum):
    page.locator('#debt-form [name=name]').fill(name)
    page.locator('#debt-form [name=balance]').fill(balance)
    page.locator('#debt-form [name=rate]').fill(rate)
    page.locator('#debt-form [name=min]').fill(minimum)
    page.locator('#debt-form button[type=submit]').click()
    expect(page.locator('#debt-status')).to_contain_text(name)


def set_budget(page, budget, start='2026-11'):
    page.locator('#plan-form [name=budget]').fill(budget)
    page.locator('#plan-form [name=start]').fill(start)
    page.locator('#plan-form button[type=submit]').click()


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
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'
            expect(page.locator('#compare')).to_contain_text('Ajoutez au moins une dette')
            expect(page.locator('#csv')).to_be_disabled()

            # Validation des saisies.
            page.locator('#debt-form button[type=submit]').click()
            expect(page.locator('#debt-status')).to_have_text('Nom de la dette obligatoire')
            page.locator('#debt-form [name=name]').fill('Carte')
            page.locator('#debt-form [name=balance]').fill('1000')
            page.locator('#debt-form [name=rate]').fill('120')
            page.locator('#debt-form [name=min]').fill('100')
            page.locator('#debt-form button[type=submit]').click()
            expect(page.locator('#debt-status')).to_contain_text('Taux invalide')

            # Une dette : 1 000 à 12 %, 300 par mois -> 4 mois, 22,48 d'intérêts, fin en février 2027.
            add_debt(page, 'Carte', '1000', '12', '100')
            expect(page.locator('#compare')).to_contain_text('Indiquez le total')
            set_budget(page, '0')
            expect(page.locator('#plan-status')).to_contain_text('Budget mensuel invalide')
            set_budget(page, '300')
            expect(page.locator('#plan-status')).to_have_text('Budget enregistré.')
            first = page.locator('#compare .card').first
            expect(first).to_contain_text('4 mois')
            expect(first).to_contain_text('22,48')
            expect(first).to_contain_text('février 2027')
            expect(page.locator('#sched tbody tr')).to_have_count(4)
            expect(page.locator('#compare .verdict')).to_contain_text('Les deux ordres coûtent autant')

            # Deux dettes : l'avalanche (carte à 12 %) coûte moins d'intérêts que la boule de neige (prêt à 5 %, plus petit).
            add_debt(page, 'Prêt', '500', '5', '25')
            expect(page.locator('#compare .card.best')).to_have_count(1)
            expect(page.locator('#compare .card.best h3')).to_contain_text('Avalanche')
            expect(page.locator('#compare .verdict')).to_contain_text("L'avalanche coûte")
            gap = page.evaluate('''() => { const s = JSON.parse(localStorage.getItem('louvre-debtstrategy-v1'));
              return DebtCore.compare(s.debts, s.budgetCents, s.startMonth).interestGapCents; }''')
            assert gap > 0, gap
            expect(page.locator('#compare .card').nth(1).locator('.payoffs li').first).to_contain_text('Prêt')

            # Budget insuffisant : les minimums (125) ne sont pas couverts.
            set_budget(page, '100')
            expect(page.locator('#compare .alert')).to_contain_text(re.compile(r'demandent déjà 125,00\s€'))
            expect(page.locator('#sched .empty')).to_be_visible()
            set_budget(page, '300')

            # Échéancier : bascule vers la boule de neige, choix mémorisé ; export CSV.
            n_aval = page.locator('#sched tbody tr').count()
            page.locator('#strategy').select_option('snowball')
            expect(page.locator('#sched tr.done').first).to_contain_text('Prêt')
            assert page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}')).strategy") == 'snowball'
            csv = download_text(page, '#csv')
            lines = csv.strip().splitlines()
            assert lines[0] == '"Mois";"Dette";"Intérêts (EUR)";"Payé (EUR)";"Restant dû (EUR)"', lines[0]
            assert lines[1].startswith('"2026-11";'), lines[1]
            assert n_aval >= 5

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['debts']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add_try = page.locator('#debt-form [name=name]')
            add_try.fill('X'); page.locator('#debt-form [name=balance]').fill('1'); page.locator('#debt-form [name=rate]').fill('1'); page.locator('#debt-form [name=min]').fill('1')
            page.locator('#debt-form button[type=submit]').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            assert download_text(page, '#export-raw') == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('"snowball"', '"hasard"').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 dettes')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#plan-form [name=budget]')).to_have_value('300.00')
            expect(page.locator('#strategy')).to_have_value('snowball')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#debt-list li')).to_have_count(2)
            expect(page.locator('#compare .card')).to_have_count(2)
            context.set_offline(False)
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Which debt should you pay off first?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#debt-list li')).to_have_count(4)
            expect(ip.locator('#debt-list')).to_contain_text('Credit card')  # exemple dans la langue affichée
            expect(ip.locator('#compare .verdict')).to_contain_text('The avalanche costs')
            expect(ip.locator('#compare .verdict')).to_contain_text('$')
            ip.locator('#debt-form [name=name]').fill('draft')
            ip.locator('#debt-form [name=balance]').fill('123')
            titles = {'fr': 'Vos dettes', 'en': 'Your debts', 'es': 'Tus deudas', 'ar': 'ديونك', 'pt': 'As suas dívidas', 'de': 'Ihre Schulden', 'it': 'I tuoi debiti'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-debts')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#compare .card')).to_have_count(2)
                expect(ip.locator('#compare .card.best')).to_have_count(1)
                expect(ip.locator('#debt-form [name=name]')).to_have_value('draft')
                expect(ip.locator('#debt-form [name=balance]')).to_have_value('123')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#louvre-currency').select_option('GBP')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Welche Schuld zuerst tilgen?')
            expect(ip.locator('#compare .verdict')).to_contain_text('£')
            expect(ip.locator('.cur').first).to_have_text('£')
            ip.locator('#debt-form [name=name]').fill('Test')
            ip.locator('#debt-form [name=balance]').fill('abc')
            ip.locator('#debt-form button[type=submit]').click()
            expect(ip.locator('#debt-status')).to_have_text('Ungültiger Saldo: positiver Betrag (z. B. 2400)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS DebtStrategy: validation, one debt exact schedule, avalanche vs snowball, insufficient budget, strategy switch, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
