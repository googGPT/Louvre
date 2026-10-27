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
        exe=next((n for n in [os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),'/usr/bin/google-chrome'] if os.path.isfile(n)),None)
        kwargs={'headless':True,'args':['--no-sandbox']}
        if exe:kwargs['executable_path']=exe
        browser=p.chromium.launch(**kwargs)
        context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
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
        page.wait_for_function('() => (document.querySelector("#count").textContent==="0")')
        # Reject a malformed imported archive; existing zero records must not be overwritten.
        invalid=ROOT/'tests'/'_invalid_temp.json'
        try:
            invalid.write_text('{"app":"wrong","version":1,"records":[]}',encoding='utf-8')
            page.locator('#import').set_input_files(str(invalid))
            page.get_by_text('Import refusé',exact=False).wait_for(timeout=10000)
        finally:invalid.unlink(missing_ok=True)
        page.locator('#import').set_input_files(j.value.path())
        page.wait_for_function('() => (document.querySelector("#count").textContent==="1")')
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
        page.wait_for_function('() => (navigator.serviceWorker.ready)')
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('() => (!!navigator.serviceWorker.controller)')
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded',timeout=14000)
        page.get_by_text('Ancienne tâche',exact=True).wait_for(timeout=10000)
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2')
        assert not errors,errors
        context.set_offline(False)

        # --- Languages: 7 complete languages, RTL Arabic, no overflow, translated exports, typed form kept.
        intl=browser.new_context(viewport={'width':390,'height':844},locale='pt-BR',accept_downloads=True)
        ip=intl.new_page()
        ip.on('pageerror',lambda e:errors.append(str(e)))
        ip.on('dialog',lambda d:d.accept())
        ip.goto(url,wait_until='domcontentloaded')
        assert ip.locator('h1 em').inner_text()=='Mais tempo para si.'  # Portuguese browser -> Portuguese
        assert ip.locator('#louvre-currency').count()==0  # no money: language menu only
        ip.locator('#example').click()
        ip.wait_for_function('() => document.querySelector("#count").textContent==="3"')
        titles={'fr':'Mes tâches','en':'My chores','es':'Mis tareas','ar':'مهامي','pt':'As minhas tarefas','de':'Meine Aufgaben','it':'Le mie faccende'}
        for lang in ['fr','en','es','ar','pt','de','it']:
            ip.locator('#louvre-lang').select_option(lang)
            assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
            wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
              [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
            assert not wide,f'débordement en {lang} : {wide}'
            assert ip.locator('.board h2 span').first.inner_text()==titles[lang],lang
            assert ip.locator('.task').count()==3
        assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
        # Open form keeps what was typed when the language changes; core errors are translated.
        ip.locator('#louvre-lang').select_option('en')
        ip.locator('#add').click();ip.locator('[name="chore"]').fill('   ');ip.locator('[name="person"]').fill('Zoé')
        assert ip.locator('#editor-title').inner_text()=='Add a chore'
        ip.evaluate("() => LouvreI18n.setLang('de')")
        assert ip.locator('#editor-title').inner_text()=='Aufgabe hinzufügen'
        assert ip.locator('[name="person"]').input_value()=='Zoé'
        ip.locator('#save').click()
        assert ip.locator('#form-error').inner_text()=='Aufgabe ungültig (höchstens 100 Zeichen)',ip.locator('#form-error').inner_text()
        ip.locator('#cancel').click()
        with ip.expect_download() as d:ip.locator('#export-csv').click()
        assert d.value.path().read_text(encoding='utf-8-sig').startswith('"Aufgabe";"Zuständig"')
        ip.locator('#louvre-lang').select_option('en')
        with ip.expect_download() as d:ip.locator('#export-ics').click()
        assert 'DESCRIPTION:Room: Cozinha' in d.value.path().read_text(encoding='utf-8')
        assert 'Next due:' in ip.locator('.task .meta').nth(1).inner_text()
        assert not errors,errors
        browser.close()
        print('BROWSER PASS: create, complete, reload, edit, search, JSON, CSV, ICS, delete, invalid and legacy import, PWA offline, mobile 390px, 7 languages, RTL, translated CSV/ICS')
finally:
    server.shutdown();server.server_close()