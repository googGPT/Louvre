"""RoundPlan v2 real Chrome test (GitHub Actions). No paid APIs or external requests."""
import os
import functools
import http.server
import json
import pathlib
import threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_): pass

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            import shutil
            chrome=os.environ.get('LOUVRE_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome')
            browser=p.chromium.launch(headless=True,executable_path=chrome,args=['--no-sandbox'])
            ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            page=ctx.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(url,wait_until='domcontentloaded')
            page.wait_for_function('() => (!!document.querySelector("[name=exercise]"))')
            assert page.title().startswith('RoundPlan')
            assert page.locator('a',has_text='Louvre').count()==0
            page.locator('.preset[data-preset="1"]').click()
            assert page.locator('[name=work]').input_value()=='40'
            assert page.locator('[name=rest]').input_value()=='20'
            page.locator('[name=exercise]').fill('Burpees')
            page.locator('[name=work]').fill('3')
            page.locator('[name=rest]').fill('2')
            page.locator('[name=rounds]').fill('2')
            page.locator('#save-button').click()
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
            assert '0:08' in page.locator('#preview').inner_text() or '0:08' in page.locator('#insights').inner_text() or page.locator('.stat strong').first.inner_text()=='1 min'
            page.locator('[name=exercise]').fill('Planche')
            page.locator('[name=work]').fill('4')
            page.locator('[name=rest]').fill('0')
            page.locator('[name=rounds]').fill('1')
            page.locator('#save-button').click()
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
            page.locator('#timer-start').click()
            page.wait_for_function('() => (document.querySelector("#timer-state").textContent === "En cours")')
            page.locator('#timer-pause').click()
            page.wait_for_function('() => (document.querySelector("#timer-state").textContent === "En pause")')
            assert page.locator('#timer-skip').is_enabled()
            page.locator('#timer-skip').click()
            assert page.locator('#phase-type').inner_text() in ('RÉCUPÉRATION','EFFORT')
            page.locator('#timer-start').click()
            page.wait_for_function('() => (document.querySelector("#timer-state").textContent === "En cours")')
            page.locator('#timer-reset').click()
            assert page.locator('#timer-state').inner_text()=='Prêt'
            page.locator('#search').fill('Planche')
            assert page.locator('#items .item').count()==1
            page.locator('#search').fill('')
            with page.expect_download() as d:page.locator('#export').click()
            body=pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data=json.loads(body)
            assert len(data['records'])==2 and data['version']==1
            with page.expect_download() as d:page.locator('#export-csv').click()
            csv=pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert 'Burpees' in csv and 'Planche' in csv
            page.on('dialog',lambda dialog:dialog.accept())
            page.locator('#items .item .item-actions .danger').first.click()
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
            page.locator('#import').set_input_files({'name':'good.json','mimeType':'application/json','buffer':body.encode()})
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
            page.locator('#import').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"app":"wrong"}'})
            assert page.locator('#items .item').count()==2
            page.wait_for_function('() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)',timeout=20000)
            ctx.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
            assert not errors,errors
            ctx.set_offline(False)

            # --- Langues : détection du navigateur, 7 langues, arabe de droite à gauche, chronomètre et saisie conservés.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='de-DE')
            ip=intl.new_page()
            ip.on('pageerror',lambda e:errors.append(str(e)))
            ip.on('dialog',lambda d:d.accept())
            ip.goto(url,wait_until='domcontentloaded')
            ip.wait_for_function('() => (!!document.querySelector("[name=exercise]"))')
            assert ip.evaluate('() => LouvreI18n.lang')=='de'
            assert ip.locator('#louvre-currency').count()==0  # appli sans argent
            assert ip.title().startswith('RoundPlan — Ihr Training')
            ip.locator('.preset[data-preset="2"]').click()
            assert ip.locator('[name=exercise]').input_value()=='Mobilität'
            ip.locator('#save-button').click()
            ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
            assert json.loads(ip.evaluate("localStorage.getItem('louvre-factory:roundplan:v1')"))['records'][0]['work']==45
            ip.locator('#timer-start').click()
            ip.locator('#timer-pause').click()
            ip.wait_for_function('() => (document.querySelector("#timer-state").textContent === "Pausiert")')
            remaining=ip.locator('#timer-remaining').inner_text()
            ip.locator('[name=exercise]').fill('Entwurf')
            states={'fr':'En pause','en':'Paused','es':'En pausa','ar':'متوقف مؤقتًا','pt':'Em pausa','de':'Pausiert','it':'In pausa'}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang')==lang
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide,f'débordement en {lang} : {wide}'
                assert ip.locator('#timer-state').inner_text()==states[lang]
                assert ip.locator('#timer-remaining').inner_text()==remaining  # chronomètre en pause intact
                assert ip.locator('[name=exercise]').input_value()=='Entwurf'
                assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#phase-type').inner_text()=='SFORZO'
            assert ip.locator('#items .item-meta').inner_text().startswith('5 round · 45 s di sforzo')
            ip.locator('#louvre-lang').select_option('en')
            ip.locator('[name=work]').fill('0')
            ip.evaluate("() => document.getElementById('record-form').dispatchEvent(new Event('submit',{cancelable:true}))")  # contourne la validation native
            assert ip.locator('#status').inner_text()=='Work: whole number from 1 to 3600 required'
            assert not errors,errors
            browser.close()
            print('BROWSER PASS: presets, records, persistence, timer start/pause/skip/resume/reset, search, JSON & CSV, invalid import, offline PWA, mobile 390px, 7 languages, RTL')
    finally: server.shutdown()
if __name__=='__main__':run()