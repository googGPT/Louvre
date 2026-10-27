"""FindMyStuff real Chromium end-to-end test; no external network or paid service."""
import os
import json
import pathlib
import shutil
import socketserver
import struct
import tempfile
import threading
import zlib
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]


def png(path):
    def chunk(kind, data):
        return struct.pack('!I', len(data))+kind+data+struct.pack('!I', zlib.crc32(kind+data)&0xffffffff)
    width, height = 3, 3
    pixels = b''.join(b'\x00'+b'\x21\xa6\x68' * width for _ in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('!2I5B',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))


class QuietHTTP(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)
    def log_message(self, *_):
        pass


def run():
    with socketserver.ThreadingTCPServer(('127.0.0.1', 0), QuietHTTP) as server:
        server.daemon_threads=True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        address=f'http://127.0.0.1:{server.server_address[1]}/'
        with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
            launcher = pw.chromium
            exe = os.environ.get('LOUVRE_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser')
            args={'headless': True}
            if exe:args['executable_path']=exe
            browser=launcher.launch(**args)
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(address,wait_until='domcontentloaded')
            page.locator('#stat-total').wait_for()
            page.locator('#add-item').click()
            page.locator('#item-name').fill('Clé de sécurité')
            page.locator('#item-category').select_option('Documents')
            page.locator('#item-location').fill('Bureau')
            page.locator('#item-container').fill('Tiroir du haut')
            page.locator('#item-tags').fill('Urgent,maison')
            img=pathlib.Path(tmp)/'sample.png';png(img)
            page.locator('#item-photo').set_input_files(str(img))
            page.locator('#photo-preview').wait_for(state='visible',timeout=12000)
            page.locator('#save-item').click()
            page.locator('.item-card h3').filter(has_text='Clé de sécurité').wait_for(timeout=12000)
            page.reload(wait_until='domcontentloaded')
            page.get_by_text('Clé de sécurité',exact=True).first.wait_for()
            assert page.locator('#stat-total').inner_text() == '1'
            page.locator('#search').fill('cle bureau')
            assert page.locator('.item-card').count()==1
            page.locator('#search').fill('inconnu')
            assert page.locator('.item-card').count()==0
            page.locator('#search').fill('')
            page.locator('[data-action="loan"]').click()
            page.locator('#loan-borrower').fill('Camille')
            page.locator('#loan-date').fill('2025-10-01')
            page.locator('#loan-due').fill('2025-10-15')
            page.locator('#save-loan').click()
            page.locator('.loan-status.overdue').wait_for(timeout=12000)
            page.locator('#filter').select_option('overdue')
            assert page.locator('.item-card').count()==1
            page.locator('#filter').select_option('all')
            with page.expect_download(timeout=12000) as downloaded:
                page.locator('#export-json').click()
            data=json.loads(downloaded.value.path().read_text(encoding='utf-8'))
            assert len(data['items'])==1 and data['items'][0]['photo'].startswith('data:image/jpeg;base64,')
            assert data['items'][0]['loan']['borrower']=='Camille'
            with page.expect_download(timeout=12000) as csv_dl:
                page.locator('#export-csv').click()
            assert 'Clé de sécurité' in csv_dl.value.path().read_text(encoding='utf-8-sig')
            page.locator('[data-action="return"]').click()
            page.locator('#confirm-yes').click()
            page.locator('.loan-status').wait_for(state='detached',timeout=12000)
            page.locator('[data-action="delete"]').click()
            page.locator('#confirm-yes').click()
            page.wait_for_function("document.querySelector('#stat-total').textContent === '0'",timeout=12000)
            backup=pathlib.Path(tmp)/'good.json';backup.write_text(json.dumps(data),encoding='utf-8')
            page.locator('#import-file').set_input_files(str(backup))
            page.locator('#confirm-yes').click()
            page.get_by_text('Clé de sécurité',exact=True).first.wait_for(timeout=12000)
            assert page.locator('.photo img').count()==1
            bad=pathlib.Path(tmp)/'bad.json';bad.write_text('{"wrong":42}',encoding='utf-8')
            page.locator('#import-file').set_input_files(str(bad))
            page.get_by_text('Clé de sécurité',exact=True).first.wait_for()
            assert page.locator('#stat-total').inner_text()=='1'
            # Service worker must finish installation and control this tab before offline navigation.
            page.evaluate('navigator.serviceWorker.ready')
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('!!navigator.serviceWorker.controller',timeout=12000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded',timeout=12000)
            page.get_by_text('Clé de sécurité',exact=True).first.wait_for()
            assert page.locator('#stat-total').inner_text()=='1'
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
            assert not errors,errors
            context.set_offline(False)
            browser.close()
            print('BROWSER PASS: photo -> create -> reload -> accent search -> loan overdue -> JSON/CSV -> return -> delete -> restore -> reject bad JSON -> offline PWA; mobile 390px')
        server.shutdown()


if __name__ == '__main__':
    run()