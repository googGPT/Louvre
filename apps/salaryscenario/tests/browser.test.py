"""SalaryScenario dans Chromium : scénario, retenues (taux sur brut, sur net intermédiaire, fixes), décomposition, comparaison, modification, duplication, suppression, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-salaryscenario-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_scenario(page, name='', gross='', period='month', payments='12', bonus=''):
    f = '#scen-form '
    page.locator(f + '[name=name]').fill(name)
    page.locator(f + '[name=gross]').fill(gross)
    page.locator(f + '[name=period]').select_option(period)
    if period == 'month':
        page.locator(f + '[name=payments]').fill(payments)
    page.locator(f + '[name=bonus]').fill(bonus)


def add_line(page, label, kind, value, base='gross'):
    page.locator('#add-line').click()
    row = page.locator('#lines .line').last
    row.locator('.l-label').fill(label)
    row.locator('.l-kind').select_option(kind)
    row.locator('.l-value').fill(value)
    if kind == 'rate':
        row.locator('.l-base').select_option(base)
    return row


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
            expect(page.locator('.hyp')).to_contain_text("Aucun barème n'est intégré")
            expect(page.locator('#compare')).to_contain_text('Ajoutez au moins un scénario')
            expect(page.locator('#csv')).to_be_disabled()

            # Validation (avec numéro de ligne pour les retenues).
            page.locator('#scen-submit').click()
            expect(page.locator('#scen-status')).to_have_text('Nom du scénario obligatoire')
            fill_scenario(page, name='Actuel')
            page.locator('#scen-submit').click()
            expect(page.locator('#scen-status')).to_have_text('Salaire brut invalide (nombre positif, ex. 3000)')
            fill_scenario(page, name='Actuel', gross='3000', bonus='1200')
            add_line(page, 'Cotisations', 'rate', '150')
            page.locator('#scen-submit').click()
            expect(page.locator('#scen-status')).to_have_text('Ligne 1 : taux invalide, de 0 à 100 %, 2 décimales au plus')
            page.locator('#lines .line').first.locator('.l-value').fill('20')
            row2 = add_line(page, '', 'rate', '10', 'net')
            page.locator('#scen-submit').click()
            expect(page.locator('#scen-status')).to_have_text('Ligne 2 : intitulé obligatoire')
            row2.locator('.l-label').fill('Retenue')
            fixed = add_line(page, 'Mutuelle', 'fixed', '50')
            expect(fixed.locator('.l-base')).to_be_disabled()

            # 3 000 × 12 + 1 200 ; 20 % du brut ; 10 % du net intermédiaire ; 50 par mois : net 26 184,00.
            page.locator('#scen-submit').click()
            expect(page.locator('#scen-status')).to_have_text('Scénario « Actuel » ajouté.')
            expect(page.locator('#lines .line')).to_have_count(0)  # formulaire remis à zéro
            row = page.locator('#compare tbody tr').first
            expect(row).to_contain_text(re.compile(r'26\s184,00\s€'))
            expect(row).to_contain_text(re.compile(r'2\s182,00\s€'))
            card = page.locator('#detail .card').first
            expect(card.locator('tr.ded').nth(0)).to_contain_text(re.compile(r'Cotisations20\s%\sdu brut'))
            expect(card.locator('tr.ded').nth(0)).to_contain_text(re.compile(r'-7\s440,00'))
            expect(card.locator('tr.ded').nth(1)).to_contain_text(re.compile(r'-2\s976,00'))
            expect(card.locator('tr.ded').nth(2)).to_contain_text(re.compile(r'50,00\s€ / mois'))
            expect(card.locator('.note')).to_contain_text(re.compile(r'2\s111,61\s€ \(12 versements'))

            # Duplication puis ajustement : la copie (3 300) passe devant, écart 2 592,00 par an.
            page.locator('#scen-list li').first.get_by_role('button', name='Dupliquer le scénario Actuel').click()
            expect(page.locator('#scen-form [name=name]')).to_have_value('Actuel (copie)')
            expect(page.locator('#lines .line')).to_have_count(3)
            expect(page.locator('#lines .line').nth(1).locator('.l-base')).to_have_value('net')
            page.locator('#scen-form [name=gross]').fill('3300')
            page.locator('#scen-submit').click()
            expect(page.locator('#compare tbody tr')).to_have_count(2)
            expect(page.locator('#compare tbody tr').first).to_contain_text('Actuel (copie)')
            expect(page.locator('#compare .verdict')).to_contain_text(re.compile(r'2\s592,00\s€ de plus par an'))

            # Modification : 13 versements.
            page.locator('#scen-list li').filter(has_text=re.compile(r'^Actuel\d')).first.get_by_role('button', name='Modifier le scénario Actuel').click()
            expect(page.locator('#scen-submit')).to_have_text('Enregistrer les modifications')
            page.locator('#scen-form [name=payments]').fill('13')
            page.locator('#scen-submit').click()
            expect(page.locator('#scen-status')).to_have_text('Scénario « Actuel » modifié.')
            expect(page.locator('#compare tbody tr').nth(1)).to_contain_text(re.compile(r'28\s344,00'))
            expect(page.locator('#scen-list li')).to_have_count(2)

            # Brut annuel : le nombre de versements est sans objet.
            fill_scenario(page, name='Annuel', gross='30000', period='year')
            expect(page.locator('#scen-form [name=payments]')).to_be_disabled()
            page.locator('#scen-submit').click()
            expect(page.locator('#compare tbody tr')).to_have_count(3)
            expect(page.locator('#compare tbody tr').first).to_contain_text('Annuel')  # sans retenue : net = brut
            expect(page.locator('#compare tbody tr').first).to_contain_text(re.compile(r'30\s000,00'))
            page.locator('#scen-list li').filter(has_text='Annuel').get_by_role('button', name='Supprimer le scénario Annuel').click()
            expect(page.locator('#compare tbody tr')).to_have_count(2)
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert [s['payments'] for s in saved['scenarios']] == [13, 12] and len(saved['scenarios'][0]['lines']) == 3, saved

            # Export CSV (format long).
            csv = download_text(page, '#csv').strip().splitlines()
            assert csv[0] == '"Scénario";"Poste";"Par an (EUR)";"Par mois (moyenne) (EUR)"', csv[0]
            assert '"Actuel (copie)";"Net annuel";"28776.00";"2398.00"' in csv, csv
            assert '"Actuel";"Cotisations";"-8040.00";"-670.00"' in csv, csv
            assert len(csv) == 1 + 2 * 6, len(csv)

            # Export, stockage corrompu (mode protégé), restauration ratée puis réussie.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['scenarios']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'xx')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            fill_scenario(page, name='Essai', gross='1000')
            page.locator('#scen-submit').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'xx'
            assert download_text(page, '#export-raw') == 'xx'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.replace('"payments": 13', '"payments": 30').encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Sauvegarde restaurée : 2 scénarios')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#compare tbody tr')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#compare tbody tr')).to_have_count(2)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile avec données : {wide}'
            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Quanto prenderesti davvero?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'EUR'
            ip.locator('#sample').click()
            expect(ip.locator('#compare tbody tr')).to_have_count(3)
            expect(ip.locator('#scen-list')).to_contain_text('Lavoro attuale')  # exemple dans la langue affichée
            expect(ip.locator('#scen-status')).to_contain_text('semplici illustrazioni')
            fill_scenario(ip, name='bozza', gross='2500')
            add_line(ip, 'Quota', 'rate', '12,5', 'net')
            kinds = {'fr': 'Taux (%)', 'en': 'Rate (%)', 'es': 'Tipo (%)', 'ar': 'معدل (%)', 'pt': 'Taxa (%)', 'de': 'Satz (%)', 'it': 'Aliquota (%)'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#lines .line .l-kind option').first).to_have_text(kinds[lang])  # lignes dynamiques traduites
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#compare tbody tr')).to_have_count(3)
                expect(ip.locator('#scen-form [name=name]')).to_have_value('bozza')
                expect(ip.locator('#lines .line .l-value')).to_have_value('12,5')
                expect(ip.locator('#lines .line .l-base')).to_have_value('net')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#louvre-currency').select_option('MAD')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('كم ستتقاضى فعلًا؟')
            expect(ip.locator('#compare tbody tr').first).to_contain_text('د.م.')
            ip.locator('#scen-form [name=name]').fill('X')
            ip.locator('#scen-form [name=gross]').fill('abc')
            ip.locator('#scen-submit').click()
            expect(ip.locator('#scen-status')).to_have_text('راتب إجمالي غير صالح (عدد موجب، مثل 3000)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS SalaryScenario: validation, rate on gross/net, fixed deductions, breakdown, comparison, duplicate, edit, yearly gross, delete, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
