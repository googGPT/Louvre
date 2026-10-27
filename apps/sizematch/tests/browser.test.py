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
        exe=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium') if os.path.exists(os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')) else '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
        browser=p.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
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
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
        assert '14 °F' in page.locator('#items .item .converted').inner_text()
        # Nouvelle conversion hors températures
        page.locator('[data-preset="l-gal"]').click()
        assert 'gal US' in page.locator('#result-unit').inner_text()
        page.locator('#name').fill('Bouteille test')
        page.locator('#save-button').click()
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
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
        page.wait_for_function("() => (document.querySelector('#status').textContent.includes('enregistrée'))")
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
        # La température -20 °C et son résultat -4 °F doivent rester numériques.
        assert '"Froid Bordeaux";-20;"°C";-4;"°F"' in csv
        # Suppression confirmée et restauration
        page.locator('#items .item').filter(has_text='Bouteille test').get_by_role('button',name='Supprimer').click()
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
        page.locator('#import').set_input_files(download.path())
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
        # Sauvegarde invalide refusée, sans destruction des données
        with tempfile.TemporaryDirectory() as tmp:
            invalid=Path(tmp)/'bad.json';invalid.write_text('{"app":"wrong","version":1,"records":[]}',encoding='utf-8')
            page.locator('#import').set_input_files(str(invalid))
            page.wait_for_function("() => (document.querySelector('#status').textContent.includes('Import refusé'))")
            assert page.locator('#items .item').count()==2
            # Sauvegarde historique pure v1 restaurable
            legacy=Path(tmp)/'legacy.json';legacy.write_text(json.dumps({'app':'sizematch','version':1,'records':[{'id':'legacy0001','name':'Ancienne conversion','value':1,'from':'km','to':'mile'}]},ensure_ascii=False),encoding='utf-8')
            page.locator('#import').set_input_files(str(legacy))
            page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
            assert 'Ancienne conversion' in page.locator('#items .item').inner_text()
        # Ré-enregistrement et persistance hors ligne après activation du SW
        page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller!==null)",timeout=25000)
        page.reload(wait_until='domcontentloaded')
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        assert page.locator('#items .item').count()==1
        assert page.locator('body').evaluate('(body)=>body.scrollWidth<=window.innerWidth+2')
        assert not errors,errors
        context.set_offline(False)

        # --- Langues : détection automatique, 7 langues complètes, arabe de droite à gauche, sans débordement.
        intl=browser.new_context(viewport={'width':390,'height':844},locale='en-US',accept_downloads=True)
        ip=intl.new_page()
        ip.on('pageerror',lambda e:errors.append(str(e)))
        ip.on('dialog',lambda d:d.accept())
        ip.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        ip.locator('#result-number').wait_for()
        assert ip.locator('h1').inner_text().startswith('The right measures.'), ip.locator('h1').inner_text()  # navigateur anglais -> anglais
        assert ip.locator('#result-number').inner_text().startswith('7.456'), ip.locator('#result-number').inner_text()  # point décimal anglais
        assert ip.locator('#louvre-currency').count()==0  # appli sans argent : pas de menu devise
        ip.locator('[data-preset="kg-lb"]').click()
        ip.locator('#name').fill('Suitcase')
        ip.locator('#save-button').click()
        ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
        ip.locator('#value').fill('1234.5')  # saisie en cours, conservée au changement de langue
        expected={'fr':('Les bonnes mesures.','Kilomètre (km)','1 fiche'),'en':('The right measures.','Kilometre (km)','1 entry'),'es':('Las medidas correctas.','Kilómetro (km)','1 registro'),
                  'ar':('القياسات الصحيحة.','كيلومتر (\u2066km\u2069)','سجل واحد'),'pt':('As medidas certas.','Quilómetro (km)','1 registo'),'de':('Die richtigen Maße.','Kilometer (km)','1 Eintrag'),'it':('Le misure giuste.','Chilometro (km)','1 voce')}
        for lang in ['fr','en','es','ar','pt','de','it']:
            ip.locator('#louvre-lang').select_option(lang)
            assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
            wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
              [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
            assert not wide, f'débordement en {lang} : {wide}'
            title,unit,count=expected[lang]
            assert ip.locator('h1').inner_text().startswith(title), (lang, ip.locator('h1').inner_text())
            assert ip.locator('#from option:checked').inner_text()==unit, (lang, ip.locator('#from option:checked').inner_text())
            assert ip.locator('#counter').inner_text()==count, (lang, ip.locator('#counter').inner_text())
            assert ip.locator('#value').input_value()=='1234.5' and ip.locator('#name').input_value()==''
            assert ip.evaluate('() => LouvreI18n.missing()')==[], ip.evaluate('() => LouvreI18n.missing()')
        ip.locator('#louvre-lang').select_option('de')
        assert ip.locator('#result-number').inner_text().startswith('767,08'), ip.locator('#result-number').inner_text()  # 1234,5 km en miles, virgule allemande
        ip.locator('#filter').select_option('masse')
        assert ip.locator('#items .item').count()==1
        ip.locator('#search').fill('masse')  # recherche sur le nom traduit de la catégorie
        assert ip.locator('#items .item').count()==1
        ip.locator('#search').fill('')
        with ip.expect_download(timeout=15000) as req3: ip.locator('#export-csv').click()
        csv_de=Path(req3.value.path()).read_text(encoding='utf-8-sig')
        assert csv_de.startswith('"Name";"Ausgangswert"') and '"Masse"' in csv_de, csv_de[:200]
        ip.locator('#louvre-lang').select_option('en')
        with ip.expect_download(timeout=15000) as req4: ip.locator('#export-csv').click()
        assert ';2;"kg";4.40924524' in Path(req4.value.path()).read_text(encoding='utf-8-sig')  # point décimal en anglais
        ip.locator('#louvre-lang').select_option('es')
        ip.locator('[data-preset="c-f"]').click()
        ip.locator('#value').fill('-300')
        assert ip.locator('#result-number').inner_text()=='Temperatura por debajo del cero absoluto', ip.locator('#result-number').inner_text()
        assert not errors,errors
        browser.close()
    print('BROWSER PASS: negative Celsius, absolute zero, volume US, preview, swap, edit, filtering, JSON/CSV, rejected/legacy import, offline PWA, mobile 390px, 7 languages, RTL, translated CSV')
finally:
    server.shutdown();server.server_close()