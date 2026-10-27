"""BankFeeLens dans Chromium : usage, offres (ajout, modification, suppression), coût ligne par ligne, classement, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-bankfeelens-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
OFFER_FIELDS = ['name', 'account', 'card', 'withdrawalFee', 'freeWithdrawals', 'transferFee', 'overdraftRate', 'foreignFixed', 'foreignPct']


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def profile(page, **values):
    for k, v in values.items():
        page.locator(f'#profile-form [name={k}]').fill(v)


def offer(page, submit=True, **values):
    for k in OFFER_FIELDS:
        page.locator(f'#offer-form [name={k}]').fill(values.get(k, ''))
    if submit:
        page.locator('#offer-submit').click()


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
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            expect(page.locator('.hyp')).to_contain_text("pas un conseil financier")
            expect(page.locator('#ranking')).to_contain_text("Décrivez d'abord votre usage")
            expect(page.locator('#csv')).to_be_disabled()

            # Validation de l'usage et des offres.
            profile(page, overdraftDays='30')
            expect(page.locator('#profile-status')).to_have_text('Indiquez le découvert moyen (des jours à découvert sont saisis)')
            profile(page, withdrawals='1.25')
            expect(page.locator('#profile-status')).to_have_text('Retraits hors réseau (par mois) : nombre moyen par mois, de 0 à 500, une décimale au plus')
            offer(page)
            expect(page.locator('#offer-status')).to_have_text("Nom de l'offre obligatoire")
            offer(page, name='X', overdraftRate='45')
            expect(page.locator('#offer-status')).to_have_text('Taux du découvert (% par an) : taux invalide, de 0 à 30 %, 2 décimales au plus')

            # Usage valide, deux offres : coût ligne par ligne et classement.
            profile(page, withdrawals='4', transfers='2', foreignOps='3', foreignAmount='50', overdraftDays='30', overdraftAmount='300')
            expect(page.locator('#profile-status')).to_have_text('Usage enregistré.')
            expect(page.locator('#ranking')).to_contain_text('Ajoutez au moins une offre')
            offer(page, name='Agence', account='2', card='45', withdrawalFee='1', freeWithdrawals='3', overdraftRate='16', foreignFixed='0,50', foreignPct='2')
            expect(page.locator('#offer-status')).to_contain_text('Offre « Agence » ajoutée')
            offer(page, name='En ligne')
            rows = page.locator('#ranking tbody tr')
            expect(rows).to_have_count(2)
            expect(rows.nth(0)).to_contain_text('En ligne')
            expect(rows.nth(0)).to_contain_text('la moins chère')
            expect(rows.nth(1)).to_contain_text(re.compile(r'138,95\s€'))
            expect(page.locator('#ranking .verdict')).to_contain_text(re.compile(r'En ligne, 0,00\s€ par an, soit 138,95\s€ de moins'))
            card = page.locator('#detail .card').nth(1)
            for label, amount in [('Tenue de compte', '24,00'), ('Carte', '45,00'), ('Retraits hors réseau', '12,00'), ('Découvert (intérêts)', '3,95'), ("Opérations à l'étranger", '54,00'), ('Total sur un an', '138,95')]:
                expect(card.locator('dl > div').filter(has_text=label).first).to_contain_text(amount)

            # Modification puis suppression d'une offre.
            page.locator('#offer-list li').filter(has_text='En ligne').get_by_role('button', name='Modifier').click()
            expect(page.locator('#offer-submit')).to_have_text('Enregistrer les modifications')
            expect(page.locator('#offer-form [name=name]')).to_have_value('En ligne')
            page.locator('#offer-form [name=card]').fill('20')
            page.locator('#offer-submit').click()
            expect(page.locator('#offer-status')).to_contain_text('Offre « En ligne » modifiée')
            expect(page.locator('#offer-submit')).to_have_text("Ajouter l'offre")
            expect(page.locator('#ranking .verdict')).to_contain_text(re.compile(r'20,00\s€ par an, soit 118,95\s€'))
            offer(page, name='Temporaire', card='999')
            expect(page.locator('#ranking tbody tr')).to_have_count(3)
            page.locator('#offer-list li').filter(has_text='Temporaire').get_by_role('button', name='Supprimer l\'offre Temporaire').click()
            expect(page.locator('#ranking tbody tr')).to_have_count(2)
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert len(saved['offers']) == 2 and saved['profile']['withdrawalsTenths'] == 40, saved

            # Export CSV.
            csv = download_text(page, '#csv').strip().splitlines()
            assert len(csv) == 3, csv
            assert csv[0] == '"Rang";"Offre";"Tenue de compte (EUR)";"Carte (EUR)";"Retraits hors réseau (EUR)";"Virements (EUR)";"Découvert (intérêts) (EUR)";"Opérations à l\'étranger (EUR)";"Total sur un an (EUR)";"Écart (EUR)"', csv[0]
            assert csv[2] == '"2";"Agence";"24.00";"45.00";"12.00";"0.00";"3.95";"54.00";"138.95";"118.95"', csv[2]

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['offers']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            offer(page, name='Essai')
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            profile(page, transfers='3')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            assert download_text(page, '#export-raw') == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('"overdraftDays": 30', '"overdraftDays": 500').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Sauvegarde restaurée : 2 offres')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#profile-form [name=foreignAmount]')).to_have_value('50')
            expect(page.locator('#ranking tbody tr')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#ranking tbody tr')).to_have_count(2)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile avec résultats : {wide}'
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Que oferta bancária lhe custa menos?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'BRL'
            ip.locator('#sample').click()
            expect(ip.locator('#ranking tbody tr')).to_have_count(3)
            expect(ip.locator('#offer-list')).to_contain_text('Banco online (exemplo)')  # exemple dans la langue affichée
            expect(ip.locator('#ranking .verdict')).to_contain_text('R$')
            offer(ip, submit=False, name='rascunho', card='12')  # brouillon non envoyé
            ip.locator('#offer-form [name=foreignPct]').fill('11')
            ip.locator('#offer-submit').click()
            expect(ip.locator('#offer-status')).to_contain_text('taxa inválida')
            titles = {'fr': 'Offres à comparer', 'en': 'Offers to compare', 'es': 'Ofertas que comparar', 'ar': 'العروض المراد مقارنتها', 'pt': 'Ofertas a comparar', 'de': 'Zu vergleichende Angebote', 'it': 'Offerte da confrontare'}
            errs = {'fr': 'taux invalide', 'en': 'invalid rate', 'es': 'tipo no válido', 'ar': 'معدل غير صالح', 'pt': 'taxa inválida', 'de': 'ungültiger Satz', 'it': 'tasso non valido'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-offer')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#ranking tbody tr')).to_have_count(3)
                expect(ip.locator('#offer-form [name=name]')).to_have_value('rascunho')
                expect(ip.locator('#offer-form [name=foreignPct]')).to_have_value('11')
                expect(ip.locator('#offer-status')).to_contain_text(errs[lang])
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('it')
            ip.locator('#louvre-currency').select_option('CHF')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Quale offerta bancaria ti costa meno?')
            expect(ip.locator('#ranking .verdict')).to_contain_text('CHF')
            expect(ip.locator('.cur').first).to_have_text('CHF')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS BankFeeLens: validation, usage profile, line-by-line cost, ranking, edit, delete, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
