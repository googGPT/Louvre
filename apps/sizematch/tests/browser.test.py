"""Parcours Chromium réel exécuté par GitHub Actions sur serveur HTTP local."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
import threading,os,json,tempfile
ROOT=Path(__file__).resolve().parents[1]
class H(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),H)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        exe='/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
        browser=p.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept())
        page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        page.locator('#result-number').wait_for()
        assert '7,456' in page.locator('#result-number').inner_text()
        assert page.locator('a[href="../../"]').count()==0
        assert page.locator('body').evaluate('(body)=>body.scrollWidth<=window.innerWidth+2')
        page.locator('[data-preset="c-f"]').click()
        assert page.locator('#value').input_value()=='-10'
        assert page.locator('#result-number').inner_text()=='14'
        page.locator('#name').fill('Froid Bordeaux')
        page.locator('#save-button').click()
        page.wait_for_function('document.querySelectorAll("#items .item").length===1')
        assert '14 °F' in page.locator('#items .item .converted').inner_text()
        # Nouvelle conversion hors températures
        page.locator('[data-preset="l-gal"]').click()
        assert 'gal US' in page.locator('#result-unit').inner_text()
        page.locator('#name').fill('Bouteille test')
        page.locator('#save-button').click()
        page.wait_for_function('document.querySelectorAll("#items .item").length===2')
        page.reload()
        assert page.locator('#items .item').count()==2
        # Historique filtrable et modifier
        page.locator('#filter').select_option('température')
        assert page.locator('#items .item').count()==1
        page.locator('#filter').select_option('all')
        page.locator('#search').fill('bouteille')
        assert page.locator('#items .item').count()==1
        page.locator('#search').fill('')
        page.locator('#items .item').filter(has_text='Froid Bordeaux').get_by_role('button',name='Modifier').click()
        assert page.locator('#category').input_value()=='température'
        assert page.locator('#save-button').inner_text()=='Mettre à jour'
        page.locator('#value').fill('-20')
        assert page.locator('#result-number').inner_text()=='-4'
        page.locator('#save-button').click()
        page.wait_for_function("document.querySelector('#status').textContent.includes('enregistrée')")
        assert page.locator('#items .item').count()==2
        # Contrôle de valeur impossible sans écriture
        page.locator('[data-preset="c-f"]').click()
        page.locator('#value').fill('-274')
        assert 'zéro absolu' in page.locator('#result-number').inner_text()
        assert page.locator('#items .item').count()==2
        # Inversion d'unité et aperçu immédiat
        page.locator('[data-preset="km-mile"]').click()
        page.locator('#swap').click()
        assert page.locator('#from').input_value()=='mile'
        assert page.locator('#to').input_value()=='km'
        assert '16,093' in page.locator('#result-number').inner_text()
        with page.expect_download(timeout=15000) as req:page.locator('#export').click()
        download=req.value
        original=json.loads(Path(download.path()).read_text(encoding='utf-8'))
        assert original['version']==1 and len(original['records'])==2
        with page.expect_download(timeout=15000) as req2:page.locator('#export-csv').click()
        csv=Path(req2.value.path()).read_text(encoding='utf-8-sig')
        assert 'Valeur convertie' in csv and 'Bouteille test' in csv
        # Suppression confirmée et restauration
        page.locator('#items .item').filter(has_text='Bouteille test').get_by_role('button',name='Supprimer').click()
        page.wait_for_function('document.querySelectorAll("#items .item").length===1')
        page.locator('#import').set_input_files(download.path())
        page.wait_for_function('document.querySelectorAll("#items .item").length===2')
        # Sauvegarde invalide refusée, sans destruction des données
        with tempfile.TemporaryDirectory() as tmp:
            invalid=Path(tmp)/'bad.json';invalid.write_text('{"app":"wrong","version":1,"records":[]}',encoding='utf-8')
            page.locator('#import').set_input_files(str(invalid))
            page.wait_for_function("document.querySelector('#status').textContent.includes('Import refusé')")
            assert page.locator('#items .item').count()==2
            # Sauvegarde historique pure v1 restaurable
            legacy=Path(tmp)/'legacy.json';legacy.write_text(json.dumps({'app':'sizematch','version':1,'records':[{'id':'legacy0001','name':'Ancienne conversion','value':1,'from':'km','to':'mile'}]},ensure_ascii=False),encoding='utf-8')
            page.locator('#import').set_input_files(str(legacy))
            page.wait_for_function('document.querySelectorAll("#items .item").length===1')
            assert 'Ancienne conversion' in page.locator('#items .item').inner_text()
        # Ré-enregistrement et persistance hors ligne après activation du SW
        page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller!==null",timeout=25000)
        page.reload(wait_until='domcontentloaded')
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        assert page.locator('#items .item').count()==1
        assert page.locator('body').evaluate('(body)=>body.scrollWidth<=window.innerWidth+2')
        assert not errors,errors
        browser.close()
    print('BROWSER PASS: negative Celsius, absolute zero, volume US, preview, swap, edit, filtering, JSON/CSV, rejected/legacy import, offline PWA, mobile 390px')
finally:
    server.shutdown();server.server_close()