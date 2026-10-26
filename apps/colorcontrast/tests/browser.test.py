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
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null",timeout=12000)
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    assert page.locator('main').count()==1
    context.set_offline(False)

def run():
    server=start_server()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            assert page.title().startswith('ColorContrast')
            page.locator('#foreground').fill('#000000');page.locator('#foreground').dispatch_event('change')
            page.locator('#background').fill('#FFFFFF');page.locator('#background').dispatch_event('change')
            page.wait_for_function("document.querySelector('#ratio').textContent.includes('21.00')")
            assert 'Conforme' in page.locator('#aaa-normal').inner_text()
            page.locator('#save-pair').click()
            assert page.locator('.saved').count()==1
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelectorAll('.saved').length===1")
            with page.expect_download() as d:page.locator('#export').click()
            content=pathlib.Path(d.value.path()).read_bytes()
            page.locator('.saved .remove').click()
            assert page.locator('.saved').count()==0
            page.on('dialog',lambda dlg:dlg.accept())
            page.locator('#import-file').set_input_files({'name':'palette.json','mimeType':'application/json','buffer':content})
            page.wait_for_function("document.querySelectorAll('.saved').length===1")
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            offline(page,context)
            assert not errors,errors
            browser.close()
        print('BROWSER PASS ColorContrast: WCAG, palettes, persistence, restore, offline, mobile')
    finally: server.shutdown()

if __name__=='__main__':run()
