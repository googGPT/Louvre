import os
import functools, http.server, pathlib, threading
from playwright.sync_api import sync_playwright
BASE = pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def start_server():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server

def offline(page,context):
    page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)",timeout=12000)
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    assert page.locator('main').count()==1
    context.set_offline(False)

def run():
    server=start_server()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True, executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'), args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            assert page.title().startswith('LoanSim')
            page.locator('#principal').fill('1200');page.locator('#apr').fill('0');page.locator('#months').fill('12');page.locator('#extra').fill('0');page.locator('#fees').fill('0');page.locator('#form button[type=submit]').click()
            assert '100,00' in page.locator('#payment').inner_text()
            assert page.locator('#schedule tr').count()==12
            page.locator('#extra').fill('100');page.locator('#form button[type=submit]').click()
            assert page.locator('#schedule tr').count()==6
            assert '6 mois' in page.locator('#saved-months').inner_text()
            with page.expect_download() as d:page.locator('#csv').click()
            text=pathlib.Path(d.value.path()).read_text();assert 'Mois,Mensualité' in text
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            offline(page,context)
            assert '100,00' in page.locator('#payment').inner_text()
            assert not errors,errors
            browser.close()
        print('BROWSER PASS LoanSim: comparison, correct amortization, CSV, offline, mobile')
    finally: server.shutdown()

if __name__=='__main__':run()
