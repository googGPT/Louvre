"""RepairLedger dans Chromium : objets, réparations, garanties, seuil de remplacement, rappels, CSV, .ics, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues, devise."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-repairledger-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def sp(text):
    """Espaces insécables (montants, pourcentages) ramenées à des espaces simples pour comparer."""
    return re.sub(r'[  ]', ' ', text)


def has(locator, text):
    """Attend qu'un élément contienne un texte (espaces insécables tolérées)."""
    expect(locator).to_contain_text(re.compile(re.escape(text).replace('\\ ', '[\\s  ]')))


def repair(page, date, cost, provider='', work='', months='', end=''):
    f = page.locator('#repair-form')
    f.locator('[name=date]').fill(date)
    f.locator('[name=cost]').fill(cost)
    f.locator('[name=provider]').fill(provider)
    f.locator('[name=description]').fill(work)
    f.locator('[name=warrantyMonths]').fill(months)
    f.locator('[name=warrantyDate]').fill(end)
    page.locator('#save-repair').click()


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
            today = datetime.date.fromisoformat(page.evaluate('() => RepairCore.dayKey()'))
            day = lambda n: (today + datetime.timedelta(days=n)).isoformat()
            expect(page.locator('#reminders li')).to_have_text('Aucune garantie ne se termine dans les 30 prochains jours.')
            expect(page.locator('#objects .empty')).to_have_text("Aucun objet pour l'instant.")
            assert page.locator('#louvre-currency').count() == 1
            assert page.evaluate('() => LouvreI18n.currency') == 'EUR'
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save-repair').click()
            expect(page.locator('#repair-status')).to_have_text("Ajoutez d'abord un objet")
            page.locator('#save-object').click()
            expect(page.locator('#object-status')).to_have_text("Nom de l'objet obligatoire")
            page.locator('#object-form [name=name]').fill('Téléphone')
            page.locator('#object-form [name=threshold]').fill('50')
            page.locator('#save-object').click()
            expect(page.locator('#object-status')).to_have_text("Un seuil demande un prix d'achat")

            # Objet avec prix et seuil.
            page.locator('#object-form [name=price]').fill('499')
            page.locator('#object-form [name=purchaseDate]').fill(day(-700))
            page.locator('#save-object').click()
            expect(page.locator('#object-status')).to_have_text('« Téléphone » ajouté.')
            card = page.locator('#objects li.obj').first
            has(card, 'Encore 249,50 € avant votre seuil de 50 % (249,50 €).')

            # Réparations : la deuxième tombe pendant la garantie de la première.
            repair(page, day(-30), '129', 'Atelier', 'Écran', months='6')
            has(page.locator('#repair-status'), 'Réparation de « Téléphone » enregistrée : 129,00 €.')
            repair(page, day(-800), '10')
            expect(page.locator('#repair-status')).to_have_text("La réparation ne peut pas précéder la date d'achat")
            repair(page, day(-5), '79,50', 'Atelier', 'Batterie', months='3', end=day(10))
            expect(page.locator('#repair-status')).to_have_text('Indiquez la garantie en mois ou par une date de fin, pas les deux')
            repair(page, day(-5), '79,50', 'Atelier', 'Batterie', end=day(10))
            expect(page.locator('#repair-status')).to_contain_text('À vérifier : la réparation du')
            expect(page.locator('#repair-status')).to_have_class('status warn')
            expect(page.locator('#reminders li')).to_have_count(1)
            expect(page.locator('#reminders li')).to_contain_text('dans 10 jours')
            has(page.locator('#kpis .kpi').first, '208,50 €')
            has(card, '2 réparations, 208,50 € (41,8 % du prix d\'achat).')
            has(card, 'Encore 41,00 € avant votre seuil')

            # Le seuil est atteint.
            repair(page, day(0), '41', 'Atelier', 'Connecteur')
            has(card, 'Seuil de remplacement atteint : votre seuil de 50 % représente 249,50 €.')
            expect(page.locator('#kpis .kpi').nth(3)).to_contain_text('1')
            expect(page.locator('#repairs li.rep')).to_have_count(3)
            expect(page.locator('#repairs .covered')).to_have_count(2)
            expect(page.locator('#repairs li.rep').first.locator('.warranty')).to_have_text('Sans garantie de réparation')

            # Modifier puis supprimer une réparation.
            page.locator('#repairs li.rep').first.get_by_role('button', name=re.compile('^Modifier la réparation')).click()
            expect(page.locator('#repair-form [name=cost]')).to_have_value('41.00')
            page.locator('#repair-form [name=cost]').fill('40')
            page.locator('#save-repair').click()
            has(page.locator('#repair-status'), 'Réparation de « Téléphone » mise à jour : 40,00 €.')
            page.locator('#repairs li.rep').first.get_by_role('button', name=re.compile('^Supprimer la réparation')).click()
            expect(page.locator('#history-status')).to_have_text('Réparation supprimée.')
            expect(page.locator('#repairs li.rep')).to_have_count(2)
            has(card, 'Encore 41,00 €')

            # Délai de rappel choisi.
            page.locator('#reminder-days').fill('5')
            page.locator('#reminder-days').dispatch_event('change')
            expect(page.locator('#remind-status')).to_have_text('Rappel 5 jours avant la fin des garanties.')
            expect(page.locator('#reminders li')).to_have_text('Aucune garantie ne se termine dans les 5 prochains jours.')

            # Exports CSV et .ics.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Date;Objet;Catégorie;Prestataire;Travaux;Coût (EUR);Fin de garantie\r\n'), csv[:100]
            assert f'{day(-5)};Téléphone;Électronique;Atelier;Batterie;79,50;{day(10)}\r\n' in csv, csv
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 2 and 'TRIGGER:-P5D' in ics and 'Fin de garantie de réparation : Téléphone' in ics, ics[:600]
            assert f"DTSTART;VALUE=DATE:{day(10).replace('-', '')}" in ics

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            saved = json.loads(backup)
            assert [r['costCents'] for r in saved['repairs']] == [12900, 7950] and saved['settings'] == {'reminderDays': 5}, saved
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'xx')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#object-form [name=name]').fill('Montre')
            page.locator('#save-object').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'xx'
            bad = json.loads(backup); bad['repairs'][0]['objectId'] = 'obj-inconnu'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Objet inconnu')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 2 réparations, 1 objet(s).')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#reminder-days')).to_have_value('5')

            # Supprimer l'objet supprime ses réparations.
            page.get_by_role('button', name='Supprimer « Téléphone »').click()
            expect(page.locator('#repairs .empty')).to_have_text("Aucune réparation pour l'instant.")
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#repairs li.rep')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#repairs li.rep')).to_have_count(2)
            context.set_offline(False)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues et devise
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Repair again, or replace?')
            assert ip.evaluate('() => LouvreI18n.currency') == 'USD'
            ip.locator('#sample').click()
            expect(ip.locator('#remind-status')).to_have_text('Example loaded: 4 items and 7 repairs, dates counted from today.')
            expect(ip.locator('#objects li.obj')).to_have_count(4)
            expect(ip.locator('#objects li.st-reached')).to_contain_text('Coffee machine')
            expect(ip.locator('#reminders li')).to_contain_text('in 10 days')
            expect(ip.locator('#repairs .covered')).to_have_count(2)  # pompe (garantie du détartrage), roue (garantie des freins)
            expect(ip.locator('#repairs .covered').first).to_contain_text('May be covered by the warranty')
            has(ip.locator('#kpis .kpi').first, '$583.00')
            ip.locator('#object-form [name=name]').fill('Watch')
            ip.locator('#repair-form [name=provider]').fill('Jeweller')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#repairs li.rep')).to_have_count(7)
                expect(ip.locator('#reminders li')).to_have_count(1)
                assert ip.locator('#object-form [name=name]').input_value() == 'Watch'
                assert ip.locator('#repair-form [name=provider]').input_value() == 'Jeweller'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#louvre-currency').select_option('GBP')
            expect(ip.locator('h1')).to_have_text('Noch einmal reparieren oder ersetzen?')
            has(ip.locator('#kpis .kpi').first, '583,00 £')
            expect(ip.locator('#object-form .cur').first).to_have_text('£')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#object-form [name=name]').fill('')
            ip.locator('#save-object').click()
            expect(ip.locator('#object-status')).to_have_text('اسم الغرض مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS RepairLedger: validation, items, repairs, warranty months/date, covered repairs, threshold, reminders, edit/delete, CSV, ICS, backup/restore, protected mode, cascade delete, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
