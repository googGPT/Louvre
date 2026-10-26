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
            assert page.title().startswith('GradePilot')
            page.locator('#label').fill('Finance');page.locator('#grade').fill('10');page.locator('#weight').fill('2');page.locator('#save').click()
            page.wait_for_function("document.querySelectorAll('.grade-row').length===1")
            assert page.locator('#average').inner_text().startswith('10,00')
            page.locator('#target').fill('12');page.locator('#nextweight').fill('2')
            assert '14.00' in page.locator('#required').inner_text()
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelectorAll('.grade-row').length===1")
            page.get_by_role('button',name='Modifier').click();page.locator('#grade').fill('16');page.locator('#save').click()
            page.wait_for_function("document.querySelector('#average').textContent.includes('16,00')")
            with page.expect_download() as d:page.locator('#export').click()
            content=pathlib.Path(d.value.path()).read_bytes();import json
            assert json.loads(content)['grades'][0]['score']==16
            page.on('dialog',lambda dlg:dlg.accept())
            page.get_by_role('button',name='Supprimer').click()
            page.wait_for_function("document.querySelectorAll('.grade-row').length===0")
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':content})
            page.wait_for_function("document.querySelectorAll('.grade-row').length===1")
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            offline(page,context)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS GradePilot: grades, forecast, edit, delete, JSON restore, offline, mobile')
    finally: server.shutdown()

if __name__=='__main__':run()
