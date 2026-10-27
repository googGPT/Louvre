"""EventCount 2: browser-integrated RSVP/budget regression, using local HTTP only."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading, json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*args):pass

def run():
    srv=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            exe=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium') if os.path.exists(os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')) else None
            b=p.chromium.launch(headless=True,executable_path=exe,args=['--no-sandbox'])
            ctx=b.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=ctx.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{srv.server_port}/',wait_until='domcontentloaded')
            page.locator('[name=event]').wait_for()
            assert 'EventCount' in page.title()
            def create(event,guest,reply,seats,cost):
                page.locator('[name=event]').fill(event)
                page.locator('[name=guest]').fill(guest)
                page.locator('[name=reply]').select_option(reply)
                page.locator('[name=seats]').fill(str(seats))
                page.locator('[name=cost]').fill(str(cost))
                page.locator('#save-button').click()
            create('Anniversaire','Alice','oui',2,20)
            page.wait_for_function('document.querySelectorAll(".guest").length===1')
            assert '40' in page.locator('#budget-range').inner_text()
            create('Anniversaire','Bob','peut-être',3,12.35)
            page.wait_for_function('document.querySelectorAll(".guest").length===2')
            page.locator('[name=event]').fill('  ANNIVERSAIRE  ')
            page.locator('[name=guest]').fill(' alice ')
            page.locator('#save-button').click()
            assert 'déjà' in page.locator('#status').inner_text()
            assert page.locator('.guest').count()==2
            create('Mariage','Alice','non',5,100)
            page.wait_for_function('document.querySelectorAll(".guest").length===3')
            page.locator('#event-filter').select_option('anniversaire')
            page.wait_for_function('document.querySelectorAll(".guest").length===2')
            assert page.locator('#budget-range').inner_text().count('€')==2
            assert page.locator('#summary').inner_text().find('5') != -1
            page.locator('#search').fill('bob')
            assert page.locator('.guest').count()==1
            page.locator('#search').fill('')
            page.locator('.guest').filter(has_text='Bob').get_by_role('button',name='✓ Confirmer').click()
            page.wait_for_function("document.querySelector('#budget-caption').textContent.includes('5 confirmé')")
            with page.expect_download() as dl:
                page.locator('#export-csv').click()
            csv=Path(dl.value.path()).read_text(encoding='utf-8-sig')
            assert 'Bob' in csv and 'Mariage' not in csv
            with page.expect_download() as dl:
                page.locator('#export').click()
            backup=json.loads(Path(dl.value.path()).read_text())
            assert len(backup['records'])==3
            page.locator('#event-filter').select_option('all')
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('document.querySelectorAll(".guest").length===3')
            page.on('dialog',lambda d:d.accept())
            page.locator('.guest').filter(has_text='Bob').get_by_role('button',name='Supprimer').click()
            page.wait_for_function('document.querySelectorAll(".guest").length===2')
            page.locator('#import').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
            page.wait_for_function('document.querySelectorAll(".guest").length===3')
            page.locator('#import').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{broken'})
            assert page.locator('.guest').count()==3
            assert 'refusée' in page.locator('#status').inner_text()
            page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller !== null',timeout=20000)
            ctx.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('document.querySelectorAll(".guest").length===3')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
            assert not errors,errors
            b.close()
            print('BROWSER PASS: RSVP and budgets, normalization, duplicate prevention, event isolation, quick reply, CSV, JSON, rejected import, mobile 390px, PWA offline')
    finally:
        srv.shutdown();srv.server_close()
if __name__=='__main__':run()