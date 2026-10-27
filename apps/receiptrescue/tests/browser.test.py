"""Browser acceptance checks (CI only; no app runtime dependencies).

Requires: python package playwright and a locally installed Chrome/Chromium.
"""
import datetime
import contextlib
import http.server
import json
import os
import pathlib
import shutil
import socketserver
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass

class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    chrome = os.environ.get('LOUVRE_CHROMIUM') or shutil.which('google-chrome') or shutil.which('google-chrome-stable') or shutil.which('chromium')
    if not chrome:
        raise RuntimeError('Chrome or Chromium required for browser acceptance check')
    with Server(('127.0.0.1', 0), Handler) as srv:
        thread = threading.Thread(target=srv.serve_forever,daemon=True)
        thread.start()
        address = f'http://127.0.0.1:{srv.server_address[1]}/apps/receiptrescue/'
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox'])
            with tempfile.TemporaryDirectory() as temp:
                page = browser.new_page(viewport={'width':1360,'height':850},accept_downloads=True,locale='fr-FR')
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(address)
                page.locator('#empty-state:not([hidden])').wait_for()
                page.click('#add-top')
                page.locator('input[name="item"]').fill('Casque audio')
                page.locator('input[name="merchant"]').fill('Boutique ABC')
                page.locator('input[name="amount"]').fill('59,90')
                day=datetime.date.today()
                page.locator('input[name="purchasedOn"]').fill(day.isoformat())
                page.locator('input[name="returnBy"]').fill((day + datetime.timedelta(days=5)).isoformat())
                page.locator('input[name="warrantyUntil"]').fill((day + datetime.timedelta(days=16)).isoformat())
                png=pathlib.Path(temp)/'ticket.png'
                import base64
                png.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/ggAAAABJRU5ErkJggg=='))
                page.locator('input[name="photo"]').set_input_files(str(png))
                page.click('#save-purchase')
                page.locator('.purchase-card').wait_for()
                assert page.locator('.card-name').inner_text()=='Casque audio'
                assert page.locator('.card-actions a').count()==1
                assert page.locator('#total-count').inner_text()=='1'
                assert page.locator('#upcoming-list .deadline-row').count()==2
                assert page.locator('#analytics-list .category-row').count()==1
                assert '59,90' in page.locator('#analytics-list').inner_text()
                with page.expect_download() as cal_event:
                    page.click('#export-calendar')
                calendar=pathlib.Path(temp)/'echeances.ics'
                cal_event.value.save_as(str(calendar))
                assert calendar.read_text().count('BEGIN:VEVENT')==2
                assert 'DTSTART;VALUE=DATE:' in calendar.read_text()

                page.reload()
                page.locator('.purchase-card').wait_for()
                assert page.locator('.card-name').inner_text()=='Casque audio'
                page.locator('#search-input').fill('sans-resultat')
                assert page.locator('#empty-state').is_visible()
                page.locator('#search-input').fill('Boutique')
                assert page.locator('.purchase-card').count()==1
                page.locator('#search-input').fill('')
                page.click('#nav-backup')
                with page.expect_download() as event:
                    page.click('#export-backup')
                backup=pathlib.Path(temp)/'backup.json'
                event.value.save_as(str(backup))
                contents=json.loads(backup.read_text())
                assert len(contents['records'])==1
                assert contents['records'][0]['photoData'].startswith('data:image/png;base64,')
                page.locator('[data-close="backup-dialog"]').click()
                page.on('dialog',lambda dialog:dialog.accept())
                page.locator('.remove').click()
                page.locator('#empty-state:not([hidden])').wait_for()
                page.click('#nav-backup')
                page.locator('#import-file').set_input_files(str(backup))
                page.locator('.purchase-card').wait_for()
                assert page.locator('.card-actions a').count()==1
                # A true PWA offline reload must retain the app shell and IndexedDB receipts.
                page.evaluate("navigator.serviceWorker.ready")
                page.reload()
                page.locator('.purchase-card').wait_for()
                page.context.set_offline(True)
                page.reload()
                page.locator('.purchase-card').wait_for()
                assert page.locator('#total-count').inner_text()=='1'
                page.context.set_offline(False)
                assert not errors,errors
                mobile=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR')
                mobile_errors=[]
                mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
                mobile.goto(address)
                mobile.locator('#empty-state:not([hidden])').wait_for()
                assert mobile.evaluate('document.documentElement.scrollWidth')<=390
                assert not mobile_errors,mobile_errors
                page.close();mobile.close()

                # --- Langues : détection du navigateur, 7 langues complètes, arabe de droite à gauche, devise au choix.
                intl=browser.new_context(viewport={'width':390,'height':844},locale='es-MX',accept_downloads=True)
                ip=intl.new_page()
                intl_errors=[]
                ip.on('pageerror',lambda e:intl_errors.append(str(e)))
                ip.on('dialog',lambda d:d.accept())
                ip.goto(address)
                ip.locator('#empty-state:not([hidden])').wait_for()
                assert ip.locator('h1').inner_text().startswith('Tus compras.'), ip.locator('h1').inner_text()  # navigateur espagnol -> espagnol
                assert ip.evaluate('() => LouvreI18n.currency')=='MXN'  # Mexique -> peso proposé
                ip.click('#add-top')
                assert ip.locator('#cur-symbol').inner_text()=='MXN', ip.locator('#cur-symbol').inner_text()
                ip.locator('#save-purchase').click()
                assert 'Indica un precio positivo' in ip.locator('#form-error').inner_text()  # erreur traduite
                ip.locator('input[name="item"]').fill('Auriculares')
                ip.locator('input[name="merchant"]').fill('Tienda')
                ip.locator('input[name="amount"]').fill('89.90')
                ip.locator('select[name="category"]').select_option('Électronique')  # valeur stockée inchangée
                ip.locator('input[name="returnBy"]').fill((day + datetime.timedelta(days=5)).isoformat())
                ip.click('#save-purchase')
                ip.locator('.purchase-card').wait_for()
                assert 'MXN' in ip.locator('.card-amount').inner_text(), ip.locator('.card-amount').inner_text()
                assert 'Electrónica' in ip.locator('.card-meta').first.inner_text()
                ip.locator('#search-input').fill('Auri')  # saisie en cours : conservée au changement de langue
                expected={'fr':'Vos achats.','en':'Your purchases.','es':'Tus compras.','ar':'مشترياتك.','pt':'As suas compras.','de':'Ihre Einkäufe.','it':'I tuoi acquisti.'}
                for lang in ['fr','en','es','ar','pt','de','it']:
                    ip.locator('#louvre-lang').select_option(lang)
                    assert ip.evaluate('() => document.documentElement.lang')==lang
                    assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                    wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                      [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                        .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                    assert not wide, f'débordement en {lang} : {wide}'
                    assert ip.locator('h1').inner_text().startswith(expected[lang]), (lang, ip.locator('h1').inner_text())
                    assert ip.locator('.purchase-card').count()==1 and ip.locator('#search-input').input_value()=='Auri'
                    assert ip.locator('#upcoming-list .deadline-row').count()==1
                missing=ip.evaluate('() => LouvreI18n.missing()')
                assert missing==[], missing
                ip.locator('#louvre-lang').select_option('de')
                ip.locator('#louvre-currency').select_option('CHF')
                assert 'CHF' in ip.locator('.card-amount').inner_text()
                assert 'Elektronik' in ip.locator('.card-meta').first.inner_text()
                assert 'Rückgabe' in ip.locator('#upcoming-list').inner_text()
                with ip.expect_download() as cal_event:
                    ip.click('#export-calendar')
                ics=pathlib.Path(cal_event.value.path()).read_text(encoding='utf-8')
                assert 'SUMMARY:Rückgabe: Auriculares' in ics and '-retour-' in ics, ics[:500]
                assert not intl_errors,intl_errors
                intl.close()
                print('BROWSER PASS: photo, restore, upcoming deadlines, ICS, monthly stats, PWA offline reload; mobile 390px; 7 languages, RTL, currency, translated ICS')
            browser.close()
        srv.shutdown()


if __name__=='__main__':
    main()