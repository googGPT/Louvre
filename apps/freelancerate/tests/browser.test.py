"""FreelanceRate dans Chromium : profil, charges, tarif cible, test d'un tarif, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-freelancerate-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_profile(page, **values):
    base = {'targetNet': '30000', 'contrib': '20', 'tax': '', 'daysPerWeek': '5', 'weeksOff': '2', 'daysOff': '0', 'billablePct': '100', 'hours': '7'}
    base.update(values)
    for name, value in base.items():
        page.locator(f'#profile-form [name={name}]').fill(value)
    page.locator('#profile-form button[type=submit]').click()


def add_charge(page, name, amount, period):
    page.locator('#charge-form [name=name]').fill(name)
    page.locator('#charge-form [name=amount]').fill(amount)
    page.locator('#charge-form [name=period]').select_option(period)
    page.locator('#charge-form button[type=submit]').click()
    expect(page.locator('#charge-status')).to_contain_text(name)


def money(text):
    """Montant français avec espace insécable éventuelle : « 45 000,00 € »."""
    return re.compile(text.replace(' ', r'\s'))


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
            expect(page.locator('.hyp')).to_contain_text("Aucun barème")
            expect(page.locator('#csv')).to_be_disabled()

            # Validation.
            page.locator('#test-form [name=rate]').fill('300')
            page.locator('#test-form button[type=submit]').click()
            expect(page.locator('#test-status')).to_have_text("Calculez d'abord votre tarif cible")
            fill_profile(page, contrib='95')
            expect(page.locator('#profile-status')).to_contain_text("Prélèvements sur le chiffre d'affaires : de 0 à 90 %")
            fill_profile(page, daysPerWeek='9')
            expect(page.locator('#profile-status')).to_have_text('Jours par semaine : nombre entier de 1 à 7')
            fill_profile(page, daysPerWeek='1', weeksOff='51', daysOff='5')
            expect(page.locator('#profile-status')).to_have_text("Il ne reste aucun jour travaillé dans l'année")

            # 30 000 net, 20 % sur le CA, 6 000 de charges, 250 jours facturés à 7 h : 45 000 de CA, 180 par jour, 25,72 de l'heure.
            add_charge(page, 'Logiciel', '250', 'month')
            add_charge(page, 'Assurance', '3000', 'year')
            expect(page.locator('#charge-total')).to_contain_text(money('6 000,00'))
            fill_profile(page)
            expect(page.locator('#profile-status')).to_contain_text('180,00')
            expect(page.locator('#result .rate').first).to_contain_text('180,00')
            expect(page.locator('#result .rate').nth(1)).to_contain_text('25,72')
            expect(page.locator('#result .facts')).to_contain_text(money('45 000,00'))
            expect(page.locator('#result tr.net')).to_contain_text(money('30 000,00'))

            # Tester un tarif : 150 par jour -> il manque 6 000 ; 200 par jour -> 4 000 de plus.
            page.locator('#test-form [name=rate]').fill('150')
            page.locator('#test-form button[type=submit]').click()
            expect(page.locator('#test-status')).to_contain_text(money('Il manque 6 000,00'))
            page.locator('#test-form [name=rate]').fill('200')
            page.locator('#test-form button[type=submit]').click()
            expect(page.locator('#test-status')).to_contain_text(money("C'est 4 000,00"))

            # Supprimer une charge met à jour le tarif.
            page.locator('#charge-list li').nth(1).locator('button').click()
            expect(page.locator('#charge-list li')).to_have_count(1)
            expect(page.locator('#result .rate').first).to_contain_text('165,00')  # (30 000 + 3 000) / 0,8 / 250

            # Export CSV.
            csv = download_text(page, '#csv').strip().splitlines()
            assert csv[0] == '"Poste";"Montant (EUR)"', csv[0]
            assert csv[1].endswith('"41250.00"'), csv[1]
            assert csv[-1] == '"Logiciel";"-3000.00"', csv[-1]

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert json.loads(backup)['profile']['contribBp'] == 2000
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[1,2')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#charge-form [name=name]').fill('X'); page.locator('#charge-form [name=amount]').fill('1')
            page.locator('#charge-form button[type=submit]').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[1,2'
            assert download_text(page, '#export-raw') == '[1,2'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('"contribBp": 2000', '"contribBp": 9900').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 charge')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#profile-form [name=contrib]')).to_have_value('20')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#result .rate').first).to_contain_text('165,00')
            context.set_offline(False)
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('How much should you charge to make a living?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#charge-list li')).to_have_count(5)
            expect(ip.locator('#charge-list')).to_contain_text('Coworking space')  # exemple dans la langue affichée
            expect(ip.locator('#profile-status')).to_contain_text('made up')
            expect(ip.locator('#result .rate').first).to_contain_text('$')
            ip.locator('#test-form [name=rate]').fill('321')
            ip.locator('#charge-form [name=name]').fill('draft')
            titles = {'fr': 'Charges professionnelles', 'en': 'Business expenses', 'es': 'Gastos profesionales', 'ar': 'المصاريف المهنية', 'pt': 'Despesas profissionais', 'de': 'Betriebskosten', 'it': 'Costi professionali'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-charges')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#result .bd tr')).to_have_count(6)
                expect(ip.locator('#test-form [name=rate]')).to_have_value('321')
                expect(ip.locator('#charge-form [name=name]')).to_have_value('draft')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('es')
            ip.locator('#louvre-currency').select_option('MXN')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('¿Cuánto facturar para vivir de tu actividad?')
            expect(ip.locator('.cur').first).to_have_text('MXN')
            ip.locator('#profile-form [name=hours]').fill('30')
            ip.locator('#profile-form button[type=submit]').click()
            expect(ip.locator('#profile-status')).to_have_text('Horas al día: de 1 a 24, máximo 2 decimales (p. ej. 7,5)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS FreelanceRate: validation, charges, target turnover, daily and hourly rate, rate test, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
