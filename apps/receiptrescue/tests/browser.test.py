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
                page = browser.new_page(viewport={'width':1360,'height':850},accept_downloads=True)
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
                mobile=browser.new_page(viewport={'width':390,'height':844})
                mobile_errors=[]
                mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
                mobile.goto(address)
                mobile.locator('#empty-state:not([hidden])').wait_for()
                assert mobile.evaluate('document.documentElement.scrollWidth')<=390
                assert not mobile_errors,mobile_errors
                print('BROWSER PASS: photo, restore, upcoming deadlines, ICS, monthly stats, PWA offline reload; mobile 390px')
                page.close();mobile.close()
            browser.close()
        srv.shutdown()


if __name__=='__main__':
    main()