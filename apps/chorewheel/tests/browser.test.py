"""Full Chrome integration for ChoreWheel v2, localhost only, no paid services."""
import json
import os
import pathlib
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        exe=next((n for n in ['/usr/bin/chromium','/usr/bin/google-chrome'] if os.path.isfile(n)),None)
        kwargs={'headless':True,'args':['--no-sandbox']}
        if exe:kwargs['executable_path']=exe
        browser=p.chromium.launch(**kwargs)
        context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        url=f'http://127.0.0.1:{server.server_address[1]}/'
        page.goto(url,wait_until='domcontentloaded',timeout=15000)
        assert page.locator('a[href="../../"]').count()==0
        page.locator('#add').click();page.locator('[name="chore"]').fill('Nettoyer la cuisine')
        page.locator('[name="person"]').fill('Alice');page.locator('[name="room"]').fill('Cuisine')
        page.locator('[name="last"]').fill('2026-10-20');page.locator('[name="every"]').fill('1')
        page.locator('[name="minutes"]').fill('25');page.locator('#save').click()
        page.locator('.task h3').filter(has_text='Nettoyer la cuisine').wait_for(timeout=10000)
        assert page.locator('#count').inner_text()=='1'
        page.reload(wait_until='domcontentloaded')
        page.locator('.task').wait_for(timeout=10000)
        assert page.locator('#count').inner_text()=='1'
        # Task completed today in the actual browser local timezone, next occurrence should change.
        page.locator('button[data-action="done"]').click()
        assert page.locator('#completed').inner_text()=='1'
        page.reload(wait_until='domcontentloaded')
        assert page.locator('#completed').inner_text()=='1'
        page.locator('#search').fill('inconnu-abcd');assert page.locator('.task').count()==0
        page.locator('#search').fill('cuisine');assert page.locator('.task').count()==1
        page.locator('button[data-action="edit"]').click()
        assert page.locator('#editor-title').inner_text()=='Modifier une tâche'
        page.locator('[name="minutes"]').fill('35');page.locator('#save').click()
        assert '35 min' in page.locator('.task .meta').first.inner_text()
        with page.expect_download() as j:page.locator('#export').click()
        raw=json.loads(j.value.path().read_text(encoding='utf-8'))
        assert raw['app']=='chorewheel' and raw['version']==1
        assert raw['records'][0]['history']
        with page.expect_download() as d:page.locator('#export-csv').click()
        assert 'Nettoyer la cuisine' in d.value.path().read_text(encoding='utf-8-sig')
        with page.expect_download() as ical:page.locator('#export-ics').click()
        assert 'RRULE:FREQ=DAILY;INTERVAL=1' in ical.value.path().read_text(encoding='utf-8')
        page.on('dialog',lambda dialog:dialog.accept())
        page.locator('button[data-action="delete"]').click()
        page.wait_for_function('document.querySelector("#count").textContent==="0"')
        # Reject a malformed imported archive; existing zero records must not be overwritten.
        invalid=ROOT/'tests'/'_invalid_temp.json'
        try:
            invalid.write_text('{"app":"wrong","version":1,"records":[]}',encoding='utf-8')
            page.locator('#import').set_input_files(str(invalid))
            page.get_by_text('Import refusé',exact=False).wait_for(timeout=10000)
        finally:invalid.unlink(missing_ok=True)
        page.locator('#import').set_input_files(j.value.path())
        page.wait_for_function('document.querySelector("#count").textContent==="1"')
        # Explicitly test old backups without room/history migration data.
        legacy=ROOT/'tests'/'_legacy_temp.json'
        try:
            legacy.write_text(json.dumps({'app':'chorewheel','version':1,'records':[{'id':'legacy0001','chore':'Ancienne tâche','person':'Bob','last':'2026-10-20','every':7,'minutes':15}]}),encoding='utf-8')
            page.locator('#import').set_input_files(str(legacy))
            # A persisted search filter must not be mistaken for a failed restore.
            page.locator('#search').fill('')
            page.locator('.task h3').filter(has_text='Ancienne tâche').wait_for(timeout=10000)
            assert page.locator('#count').inner_text()=='1'
        finally:legacy.unlink(missing_ok=True)
        page.wait_for_function('navigator.serviceWorker.ready')
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('!!navigator.serviceWorker.controller')
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded',timeout=14000)
        page.get_by_text('Ancienne tâche',exact=True).wait_for(timeout=10000)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2')
        assert not errors,errors
        context.set_offline(False);browser.close()
        print('BROWSER PASS: create, complete, reload, edit, search, JSON, CSV, ICS, delete, invalid and legacy import, PWA offline, mobile 390px')
finally:
    server.shutdown();server.server_close()