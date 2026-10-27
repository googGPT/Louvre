"""End-to-end smoke for ParkWise: Chrome, persistence, export/restore, GPS, PWA offline."""
import os
import http.server, functools, threading, pathlib, json
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,geolocation={'latitude':44.839,'longitude':-0.579},permissions=['geolocation'])
            ctx.set_default_timeout(12000)
            page=ctx.new_page();errors=[]
            page.on('pageerror',lambda e: errors.append(str(e)))
            page.goto(url,wait_until='domcontentloaded')
            assert page.title().startswith('ParkWise')
            page.locator('#new-spot').click()
            page.locator('#spot-form [name=name]').fill('Parking Test A')
            page.locator('#spot-form [name=address]').fill('Rue test')
            page.locator('#spot-form [name=rate]').fill('2.50')
            page.locator('#spot-form [name=walk]').fill('3')
            page.locator('#spot-form button[type=submit]').click()
            page.wait_for_function("document.querySelectorAll('.spot').length === 1")
            page.locator('#new-spot').click()
            page.locator('#spot-form [name=name]').fill('Parking Test B')
            page.locator('#spot-form [name=rate]').fill('1')
            page.locator('#spot-form [name=walk]').fill('15')
            page.locator('#spot-form button[type=submit]').click()
            page.wait_for_function("document.querySelectorAll('.spot').length === 2")
            page.locator('#duration').select_option('120')
            page.locator('#value-time').select_option('0')
            page.wait_for_function("document.querySelector('.result .result-title').textContent === 'Parking Test B'")
            page.locator('#value-time').select_option('20')
            page.wait_for_function("document.querySelector('.result .result-title').textContent === 'Parking Test A'")
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelectorAll('.spot').length === 2")
            page.locator('.spot').first.locator('button',has_text='Modifier').click()
            page.locator('#spot-form [name=name]').fill('Parking Test A corrige')
            page.locator('#spot-form button[type=submit]').click()
            page.wait_for_function("document.querySelectorAll('.spot').length === 2 && document.body.textContent.includes('Parking Test A corrige')")
            page.locator('#car-note').fill('Niveau B1')
            page.locator('#save-car').click()
            page.wait_for_function("document.querySelector('#car-status').textContent.includes('Niveau B1')")
            assert page.locator('#car-map').get_attribute('href').startswith('https://www.openstreetmap.org/')
            with page.expect_download() as download:page.locator('#export').click()
            blob=pathlib.Path(download.value.path()).read_text()
            backup=json.loads(blob)
            assert len(backup['spots'])==2 and backup['parkingSpot']['note']=='Niveau B1'
            page.on('dialog',lambda d:d.accept('120') if d.type=='prompt' else d.accept())
            page.locator('.spot').first.locator('button',has_text='Supprimer').click()
            page.wait_for_function("document.querySelectorAll('.spot').length === 1")
            page.locator('#import-file').set_input_files({'name':'parkwise.json','mimeType':'application/json','buffer':blob.encode()})
            page.wait_for_function("document.querySelectorAll('.spot').length === 2")
            with page.expect_download() as cal:page.locator('#calendar').click()
            assert 'BEGIN:VEVENT' in pathlib.Path(cal.value.path()).read_text()
            page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null",timeout=18000)
            ctx.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelectorAll('.spot').length === 2")
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), 'horizontal mobile overflow'
            assert not errors,errors
            browser.close()
            print('BROWSER PASS: parking costs, ranking, edit, GPS, JSON export/import, calendar, offline PWA, 390px mobile')
    finally:server.shutdown()
if __name__=='__main__':run()