"""HomePulse Chromium smoke test; no paid service. Run from anywhere."""
import http.server, functools, threading, socket, pathlib, json, base64, struct, zlib, time
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass

def tiny_png():
    def chunk(tag,data): return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
    w=h=16
    pixels=b''.join(b'\x00'+b'\xe0\xec\xd0'*w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            ctx.set_default_timeout(12000)
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda err: errors.append(str(err)))
            page.goto(url,wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#add-equipment').disabled === false")
            assert page.title().startswith('HomePulse')
            page.locator('#add-equipment').click()
            page.locator('#equipment-name').fill('Filtre lave-linge')
            page.locator('#category').select_option('Buanderie')
            page.locator('#room').select_option('Garage')
            page.locator('#next-due').fill('2026-11-08')
            page.locator('#frequency').fill('42')
            page.locator('#notes').fill('Test pompe')
            page.locator('#photo').set_input_files({'name':'test.png','mimeType':'image/png','buffer':tiny_png()})
            page.locator('#save-equipment').click()
            page.wait_for_function("document.querySelector('#count-all').textContent === '1'")
            assert page.get_by_text('Filtre lave-linge',exact=True).count()>=1
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#count-all').textContent === '1'")
            assert page.locator('.eq-photo').count()==1
            page.locator('.equipment-item button',has_text='Modifier').click()
            page.locator('#equipment-name').fill('Filtre corrigé')
            page.locator('#save-equipment').click()
            page.wait_for_function("document.querySelector('.equipment-item strong').textContent === 'Filtre corrigé'")
            page.locator('.equipment-item button',has_text='Effectué').click()
            page.locator('#done-date').fill('2026-10-25')
            page.locator('#done-cost').fill('12.50')
            page.locator('#done-note').fill('Nettoyé')
            page.locator('#done-form button[type="submit"]').click()
            page.wait_for_function("document.querySelector('#count-cost').textContent.includes('12,50')")
            assert page.locator('.history-row').count()==1
            with page.expect_download() as dl:page.locator('#export-json').click()
            backup=dl.value
            body=json.loads(pathlib.Path(backup.path()).read_text())
            assert body['equipment'][0]['name']=='Filtre corrigé'
            assert body['history'][0]['costCents']==1250
            with page.expect_download() as cal:page.locator('#export-ics').click()
            ics=pathlib.Path(cal.value.path()).read_text()
            assert 'BEGIN:VEVENT' in ics and 'Filtre corrigé' in ics
            page.on('dialog',lambda dialog:dialog.accept())
            page.locator('.equipment-item button',has_text='Supprimer').click()
            page.wait_for_function("document.querySelector('#count-all').textContent === '0'")
            page.locator('#import-file').set_input_files({'name':'homepulse.json','mimeType':'application/json','buffer':json.dumps(body).encode()})
            page.wait_for_function("document.querySelector('#count-all').textContent === '1'")
            page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null",timeout=14000)
            ctx.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#count-all').textContent === '1'")
            assert page.locator('.equipment-item').count()==1
            assert not errors,errors
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'), 'mobile overflow'
            browser.close()
            print('BROWSER PASS: equipment, photo, edit, completion, costs, history, backup, restore, ICS, offline PWA, 390px mobile')
    finally:server.shutdown()
if __name__=='__main__':run()