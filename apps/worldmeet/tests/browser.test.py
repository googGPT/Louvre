"""WorldMeet v2 end-to-end on real Chromium (no paid service)."""
import json
import pathlib
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kw):
        super().__init__(*args, directory=str(ROOT), **kw)
    def log_message(self, *_):
        pass
server = ThreadingHTTPServer(('127.0.0.1',0), Quiet)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        executable = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium') if os.path.isfile(os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')) else None
        browser = p.chromium.launch(headless=True, executable_path=executable,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
        page.set_default_timeout(16000)
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        assert page.title().startswith('WorldMeet')
        assert page.get_by_text('Louvre ↗').count()==0
        def fill(meeting,participant,zone,utc):
            page.locator('[name=meeting]').fill(meeting)
            page.locator('[name=participant]').fill(participant)
            page.locator('[name=zone]').select_option(zone)
            page.locator('[name=utc]').fill(utc)
        fill('Projet Global','Bordeaux','Europe/Paris','2026-11-10T14:00')
        assert '15:00' in page.locator('#local-preview').inner_text()
        page.locator('#save-button').click()
        page.wait_for_function("() => (document.querySelectorAll('#items .item').length === 1)")
        page.locator('#add-attendee').click()
        assert page.locator('[name=meeting]').input_value()=='Projet Global'
        assert page.locator('[name=utc]').input_value()=='2026-11-10T14:00'
        page.locator('[name=participant]').fill('New York')
        page.locator('[name=zone]').select_option('America/New_York')
        assert '09:00' in page.locator('#local-preview').inner_text()
        page.locator('#save-button').click()
        page.wait_for_function("() => (document.querySelectorAll('#comparison .attendee').length === 2)")
        assert page.locator('#count-meetings').inner_text()=='1'
        assert page.locator('#count-zones').inner_text()=='2'
        assert '15:00' in page.locator('#comparison').inner_text()
        assert '09:00' in page.locator('#comparison').inner_text()
        # Two participants are covered by local 09:00–18:00 for this timestamp.
        assert page.locator('.flag.good').count()==2
        # No accidental duplicates even with altered case.
        fill('PROJET GLOBAL','bordeaux','Europe/Paris','2026-11-10T14:00')
        page.locator('#save-button').click()
        assert 'déjà' in page.locator('#status').inner_text()
        assert page.locator('#items .item').count()==2
        # Duration changes should affect eligibility.
        page.locator('#duration').select_option('120')
        assert page.locator('.flag.good').count()==2
        with page.expect_download() as ics_dl: page.locator('#ics-export').click()
        content=pathlib.Path(ics_dl.value.path()).read_text()
        assert 'DTSTART:20261110T140000Z' in content
        assert 'DTEND:20261110T160000Z' in content
        page.locator('#duration').select_option('60')
        # Export+restore preserves the legacy v1 record schema.
        with page.expect_download() as json_dl:page.locator('#export').click()
        data=json.loads(pathlib.Path(json_dl.value.path()).read_text())
        assert data['version']==1 and len(data['records'])==2
        assert all(set(row)=={'id','meeting','participant','zone','utc'} for row in data['records'])
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function("() => (document.querySelectorAll('#items .item').length === 2)")
        # Search / edit / delete
        page.locator('#search').fill('New York')
        assert page.locator('#items .item').count()==1
        page.locator('#search').fill('')
        page.locator('#items .item .item-actions button').first.click()
        assert page.locator('#save-button').inner_text()=='Mettre à jour'
        page.locator('#cancel-edit').click()
        page.on('dialog',lambda d:d.accept())
        page.locator('#items .item .item-actions button').nth(1).click()
        page.wait_for_function("() => (document.querySelectorAll('#items .item').length === 1)")
        page.locator('#import').set_input_files({'name':'worldmeet.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
        page.wait_for_function("() => (document.querySelectorAll('#items .item').length === 2)")
        # Invalid import cannot corrupt existing local records.
        page.locator('#import').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':b'{"app":"WorldMeet"}'})
        assert page.locator('#items .item').count()==2
        assert 'Import refusé' in page.locator('#status').inner_text()
        page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',timeout=25000)
        page.context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function("() => (document.querySelectorAll('#items .item').length === 2)")
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2')
        assert not errors,errors
        browser.close()
        print('BROWSER PASS: UTC preview, 2-zone comparison, duplicate prevention, duration, ICS, JSON export/import, search/edit/delete, PWA offline, mobile 390px')
finally:
    server.shutdown()
    server.server_close()