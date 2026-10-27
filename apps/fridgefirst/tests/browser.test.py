"""End-to-end Chrome: isolated local HTTP server, no internet/API needed."""
import os
import http.server
import json
import pathlib
import socketserver
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt, *args):
        pass

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def add(page, name, expiration, qty='1', category=None):
    page.locator('#open-add').click()
    page.locator('#item-name').fill(name)
    page.locator('#item-quantity').fill(str(qty))
    page.locator('#item-expiry').fill(expiration)
    if category:
        page.locator('#item-category').select_option(label=category)
    page.locator('#submit-item').click()
    page.locator('#item-dialog').wait_for(state='hidden')


def run():
    srv = Server(('127.0.0.1', 0), Quiet)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{srv.server_port}/'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'), args=['--no-sandbox','--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width':390,'height':844}, locale='fr-FR', timezone_id='Europe/Paris', accept_downloads=True)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda error:errors.append(str(error)))
        try:
            page.goto(base, wait_until='domcontentloaded')
            assert 'FridgeFirst' in page.title()
            assert page.locator('#stat-stock').inner_text() == '0'
            # All dates are set relative to the real test date, not to a fixed wall clock.
            today = page.evaluate('FridgeCore.todayLocal()')
            tomorrow = page.evaluate('FridgeCore.addDays(FridgeCore.todayLocal(),1)')
            later = page.evaluate('FridgeCore.addDays(FridgeCore.todayLocal(),8)')
            old = page.evaluate('FridgeCore.addDays(FridgeCore.todayLocal(),-1)')
            add(page, 'Tomates', tomorrow)
            add(page, 'Œufs', tomorrow, '3')
            add(page, 'Oignon', later)
            assert page.locator('#stat-stock').inner_text()=='3'
            assert page.locator('#stat-urgent').inner_text()=='2'
            page.reload(wait_until='domcontentloaded')
            page.locator('.food-row').first.wait_for()
            assert page.locator('.food-row').count()==3
            # Recipe with available ingredients (aliases: tomates, œufs)
            page.locator('[data-view="recettes"]').click()
            target=page.locator('[data-recipe="omelette"]')
            target.wait_for()
            assert 'Tout est en stock' in target.inner_text()
            # Add one that needs ingredients to the shopping list
            need=page.locator('[data-recipe="rizpoulet"]')
            if need.count()==0:
                # One onion in stock qualifies: rice/poultry missing.
                raise AssertionError('Expected rizpoulet from onion')
            need.locator('[data-recipe-add]').click()
            assert page.locator('#view-courses').is_visible()
            assert page.locator('#shopping-list input[type="checkbox"]').count()>=2
            page.locator('#shopping-name').fill('Citron')
            page.locator('#shopping-form button[type="submit"]').click()
            assert page.get_by_text('Citron', exact=True).count()==1
            page.locator('#shopping-list input[type="checkbox"]').first.check()
            # Editing an item and marking consumed
            page.locator('[data-view="inventaire"]').click()
            page.locator('#search').fill('tomat')
            assert page.locator('.food-row').count()==1
            page.locator('.food-row [data-action="edit"]').click()
            page.locator('#item-quantity').fill('2')
            page.locator('#submit-item').click()
            assert page.locator('.food-row .quantity').inner_text().startswith('2')
            page.locator('.food-row [data-action="consume"]').click()
            page.locator('#confirm-yes').click()
            assert page.locator('.food-row').count()==0
            page.locator('#search').fill('')
            assert page.locator('#stat-stock').inner_text()=='2'
            page.locator('[data-view="bilan"]').click()
            assert page.locator('#stat-consumed').inner_text()=='1'
            # Past date: visible and not silently treated as food-safe
            page.locator('[data-view="inventaire"]').click()
            add(page, 'Poisson', old)
            assert page.locator('#stat-expired').inner_text()=='1'
            page.locator('#search').fill('Poisson')
            page.locator('.food-row [data-action="discard"]').click()
            page.locator('#confirm-yes').click()
            assert page.locator('#stat-expired').inner_text()=='0'
            page.locator('[data-view="bilan"]').click()
            assert page.locator('#stat-wasted').inner_text()=='1'
            # Backup download before destructive restore
            with page.expect_download() as download_info:
                page.locator('#export-btn').click()
            download = download_info.value
            with tempfile.TemporaryDirectory() as td:
                filename=pathlib.Path(td)/download.suggested_filename
                download.save_as(str(filename))
                obj=json.loads(filename.read_text(encoding='utf-8'))
                assert obj['version']==1 and len(obj['items'])==2
                assert len(obj['history'])==2
                # Invalid imports never erase stock
                bad=pathlib.Path(td)/'bad.json'
                bad.write_text(json.dumps({'version':1,'items':[{'id':'x'}],'history':[],'shopping':[]}),encoding='utf-8')
                page.locator('#import-input').set_input_files(str(bad))
                assert page.locator('#stat-bilan-stock').inner_text()=='2'
                # Valid backup, confirmation required
                page.locator('[data-view="inventaire"]').click()
                page.locator('#search').fill('')
                page.locator('.food-row [data-action="remove"]').first.click()
                page.locator('#confirm-yes').click()
                assert page.locator('#stat-stock').inner_text()=='1'
                page.locator('#import-input').set_input_files(str(filename))
                page.locator('#confirm-dialog').wait_for(state='visible')
                page.locator('#confirm-yes').click()
                assert page.locator('#stat-stock').inner_text()=='2'
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#stat-stock').inner_text()=='2'
            # PWA cached shell should reload without network after SW ready.
            page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)", timeout=15000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#stat-stock').inner_text()=='2'
            context.set_offline(False)
            assert not errors, f'Unexpected JS page errors: {errors}'
            assert page.locator('body').evaluate('(node)=>node.scrollWidth <= innerWidth+2')
            print('BROWSER PASS: stock, urgency, recipes, shopping, edit, consume, discard, export/import, offline PWA, mobile 390px')
        finally:
            browser.close()
            srv.shutdown();srv.server_close()

if __name__=='__main__':run()