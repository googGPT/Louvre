"""BillCalendar dans Chromium : saisie, calendrier, résumé, pause, export agenda, sauvegarde, hors ligne, mobile."""
import functools
import http.server
import json
import os
import re
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-billcalendar-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, timezone_id='Europe/Paris')
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'
            today = page.evaluate('() => BillCore.dayKey()')
            month_prefix = today[:8]

            # Saisie invalide, puis abonnement annuel : 120 € -> 10 €/mois.
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_contain_text('Nom obligatoire')
            page.locator('[name=name]').fill('Antivirus')
            page.locator('[name=amount]').fill('120')
            page.locator('[name=frequency]').select_option('yearly')
            page.locator('[name=start]').fill(month_prefix + '28')
            page.locator('[name=category]').select_option('Abonnement')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('Facture ajoutée.')
            expect(page.locator('#k-month')).to_have_text(re.compile(r'^10,00\s€$'))
            expect(page.locator('#k-year')).to_have_text(re.compile(r'^120,00\s€$'))
            expect(page.locator('#cal .chip', has_text='Antivirus')).to_have_count(1)

            # Exemples : le calendrier du mois et le total se remplissent.
            page.locator('#sample').click()
            expect(page.locator('#bills > li')).to_have_count(6)
            expect(page.locator('#month-total')).to_contain_text('Total du mois')
            expect(page.locator('#cal .chip', has_text='Loyer')).to_have_count(1)

            # Navigation : le loyer revient le mois suivant, l'antivirus annuel non.
            page.locator('#next').click()
            expect(page.locator('#cal .chip', has_text='Loyer')).to_have_count(1)
            expect(page.locator('#cal .chip', has_text='Antivirus')).to_have_count(0)
            page.locator('#prev').click()

            # Pause : le coût mensuel baisse de 10 €.
            before = page.locator('#k-month').inner_text()
            page.locator('#bills > li', has_text='Antivirus').locator('button', has_text='Pause').click()
            expect(page.locator('#k-month')).not_to_have_text(before)
            expect(page.locator('#bills > li', has_text='Antivirus')).to_contain_text('en pause')
            expect(page.locator('#k-count')).to_have_text('5 / 1')

            # Modification d'un montant.
            page.locator('#bills > li', has_text='Forfait mobile').locator('button', has_text='Modifier').click()
            page.locator('[name=amount]').fill('9,99')
            page.locator('#save').click()
            expect(page.locator('#bills > li', has_text='Forfait mobile')).to_contain_text('9,99')

            # Export agenda : 5 évènements (la facture en pause est exclue).
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 5 and 'Antivirus' not in ics

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['bills']) == 6
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[[')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#sample').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[['
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('6 facture(s)')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#bills > li')).to_have_count(6)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors
            browser.close()
        print('BROWSER PASS BillCalendar: validation, yearly->monthly, calendar, navigation, pause, edit, ICS, backup/restore, corrupted storage, offline, mobile')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
