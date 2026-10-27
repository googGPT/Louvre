"""GradePilot v2 : tests Chromium des prévisions, transactions et protection des données."""
import os
import functools
import http.server
import json
import pathlib
import threading
from playwright.sync_api import sync_playwright

BASE=pathlib.Path(__file__).resolve().parents[1]

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

def start_server():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server

def run():
    server=start_server()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            page.locator('#grade').wait_for()
            assert page.title().startswith('GradePilot')
            assert page.locator('body').evaluate('(e)=>e.scrollWidth <= innerWidth+2')
            page.locator('#label').fill('Finance')
            page.locator('#grade').fill('10')
            page.locator('#weight').fill('2')
            page.locator('#save').click()
            page.wait_for_function("() => (document.querySelectorAll('.grade-row').length===1)")
            assert page.locator('#average').inner_text().startswith('10,00')

            # Prévision historique et simulation future recalculées.
            page.locator('#target').fill('12')
            page.locator('#nextweight').fill('2')
            assert page.locator('#required').inner_text().startswith('14,00')
            page.locator('#whatif-score').fill('16')
            assert page.locator('#whatif-average').inner_text().startswith('13,00')
            assert 'de 5,00 à 15,00' in page.locator('#forecast-range').inner_text()
            page.locator('#target').fill('12.11')
            page.locator('#nextweight').fill('7')
            assert page.locator('#required').inner_text().startswith('12,72')
            # On revient au scénario déterministe initial.
            page.locator('#target').fill('12')
            page.locator('#nextweight').fill('2')

            # Persistance après rechargement et modification.
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelectorAll('.grade-row').length===1)")
            page.get_by_role('button',name='Modifier').click()
            page.locator('#grade').fill('16')
            page.locator('#save').click()
            assert page.locator('#average').inner_text().startswith('16,00')

            # Une écriture localStorage défaillante ne doit pas modifier l'état en mémoire.
            page.evaluate("""() => {
              window._setItem = Storage.prototype.setItem;
              Storage.prototype.setItem = function() { throw new Error('simulated quota'); };
            }""")
            page.locator('#label').fill('Économie')
            page.locator('#grade').fill('19')
            page.locator('#weight').fill('1')
            page.locator('#save').click()
            assert 'Enregistrement impossible' in page.locator('#feedback').inner_text()
            assert page.locator('#grade-list .grade-row').count()==1
            assert page.locator('#average').inner_text().startswith('16,00')
            page.evaluate('() => {Storage.prototype.setItem = window._setItem;}')
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#grade-list .grade-row').count()==1

            # Ajout réussi et recherche insensible aux accents.
            page.locator('#label').fill('Économie')
            page.locator('#grade').fill('10')
            page.locator('#weight').fill('1')
            page.locator('#save').click()
            assert page.locator('#grade-list .grade-row').count()==2
            page.locator('#search').fill('economie')
            assert page.locator('#grade-list .grade-row').count()==1
            page.locator('#search').fill('')

            with page.expect_download() as d:
                page.locator('#export').click()
            backup=pathlib.Path(d.value.path()).read_bytes()
            saved=json.loads(backup)
            assert saved['version']==1 and len(saved['grades'])==2

            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv=pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert '"Évaluation";"Note /20";"Coefficient"' in csv
            assert 'Économie' in csv

            # Suppression, restauration du JSON existant.
            page.get_by_role('button',name='Supprimer').first.click()
            assert page.locator('#grade-list .grade-row').count()==1
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
            page.wait_for_function("() => (document.querySelectorAll('.grade-row').length===2)")

            # Corruption manuelle du stockage : export brut, zéro écrasement silencieux.
            page.evaluate("() => localStorage.setItem('louvre-wave2-gradepilot-v1','NOT_JSON')")
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#warning').is_visible()
            assert page.locator('#save').is_disabled()
            assert page.locator('#reset').is_disabled()
            page.locator('#export').click()
            assert 'exportez la copie brute' in page.locator('#feedback').inner_text()
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text()=='NOT_JSON'
            page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'broken'})
            assert page.locator('#warning').is_visible()
            assert page.evaluate("() => localStorage.getItem('louvre-wave2-gradepilot-v1')")=='NOT_JSON'

            # Même avec un JSON valide, une écriture défaillante ne doit pas lever le verrou.
            page.evaluate("""() => {
              window._setItem = Storage.prototype.setItem;
              Storage.prototype.setItem = function() { throw new Error('simulated quota'); };
            }""")
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
            assert page.locator('#warning').is_visible()
            assert page.evaluate("() => localStorage.getItem('louvre-wave2-gradepilot-v1')")=='NOT_JSON'
            page.evaluate('() => {Storage.prototype.setItem = window._setItem;}')
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
            page.wait_for_function("() => (document.querySelectorAll('.grade-row').length===2)")
            assert page.locator('#warning').is_hidden()
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#grade-list .grade-row').count()==2

            # PWA vérifiée après une installation initiale valide.
            page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',timeout=16000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            assert page.locator('main').count()==1
            assert page.locator('#grade-list .grade-row').count()==2
            assert not errors,errors
            context.set_offline(False)

            # --- Langues : 7 langues complètes, arabe RTL, échelle française sur 20 expliquée, saisies conservées.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='it-IT',accept_downloads=True)
            ip=intl.new_page()
            ip.on('pageerror',lambda e:errors.append(str(e)))
            ip.on('dialog',lambda d:d.accept())
            ip.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            assert ip.locator('h1 em').inner_text()=='Visualizzate il vostro percorso.'  # navigateur italien -> italien
            assert 'Scala francese' in ip.locator('#scale-note').inner_text()
            assert ip.locator('#louvre-currency').count()==0  # pas d'argent : menu de langue seul
            ip.locator('#label').fill('Finanza');ip.locator('#grade').fill('10');ip.locator('#weight').fill('2');ip.locator('#save').click()
            ip.wait_for_function("() => (document.querySelectorAll('.grade-row').length===1)")
            ip.locator('#target').fill('13.5')
            scale={'fr':'Échelle française','en':'French grading scale','es':'Escala francesa','ar':'السلّم الفرنسي','pt':'Escala francesa','de':'Französische Notenskala','it':'Scala francese'}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide,f'débordement en {lang} : {wide}'
                assert scale[lang] in ip.locator('#scale-note').inner_text(),lang
                assert ip.locator('#average').inner_text().endswith('/20')
                assert ip.locator('#target').input_value()=='13.5'
                assert ip.locator('#required').inner_text().replace(',','.').startswith('17.00'),ip.locator('#required').inner_text()
            assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            assert ip.locator('#average').inner_text()=='10.00/20'
            assert ip.locator('#count').inner_text()=='1 grade'
            with ip.expect_download() as d:
                ip.locator('#export-csv').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').startswith('"Assessment";"Grade /20";"Weight"')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#label').fill('   ');ip.locator('#grade').fill('12');ip.locator('#weight').fill('1');ip.locator('#save').click()
            assert ip.locator('#feedback').inner_text()=='Ungültiger Name (1 bis 64 Zeichen)',ip.locator('#feedback').inner_text()
            assert not errors,errors
            browser.close()
        print('BROWSER PASS GradePilot v2: weighted forecast, simulations, edit, write failure, imports, corrupt recovery, CSV, offline, mobile 390px, 7 languages, RTL, French /20 scale explained')
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':
    run()
