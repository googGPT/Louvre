"""ColorContrast v2: tests WCAG réels, palettes transactionnelles et PWA."""
import os
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import functools,threading,json

BASE=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda dialog:dialog.accept())
        page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        page.locator('#foreground').wait_for()
        assert page.title().startswith('ColorContrast')
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=window.innerWidth+2')

        def colors(fg,bg):
            page.locator('#foreground').fill(fg)
            page.locator('#foreground').dispatch_event('change')
            page.locator('#background').fill(bg)
            page.locator('#background').dispatch_event('change')

        colors('#000000','#FFFFFF')
        assert page.locator('#ratio').inner_text().startswith('21,0000')
        assert 'Conforme' in page.locator('#aaa-normal').inner_text()
        assert '#000000' in page.locator('#css-output').input_value()
        # Le résultat arrondi au centième 4.50 ne prouve pas la conformité.
        colors('#707972','#FFFFFF')
        assert page.locator('#ratio').inner_text().startswith('4,4998')
        assert 'Insuffisant' in page.locator('#aa-normal').inner_text()
        assert 'Insuffisant' in page.locator('#aaa-large').inner_text()

        # Ajustement RVB : correction automatique sans basculer sur le noir.
        colors('#999999','#FFFFFF')
        assert 'Insuffisant' in page.locator('#aa-normal').inner_text()
        suggested=page.locator('#adjusted').inner_text()
        assert suggested not in ('#000000','#FFFFFF')
        page.locator('#use-adjusted').click()
        assert page.locator('#foreground').input_value()==suggested
        assert 'Conforme' in page.locator('#aa-normal').inner_text()

        # AAA impossible sur certains fonds : jamais de fausse conformité.
        colors('#AAAAAA','#777777')
        page.locator('#target-ratio').select_option('7')
        assert 'inaccessible' in page.locator('#adjusted-reason').inner_text()
        assert page.locator('#use-adjusted').is_disabled()
        assert 'Insuffisant' in page.locator('#aaa-normal').inner_text()
        page.locator('#target-ratio').select_option('4.5')

        # Favoris, non duplication et réapplication.
        colors('#000000','#FFFFFF')
        page.locator('#save-pair').click()
        assert page.locator('.saved').count()==1
        assert page.locator('#saved-count').inner_text().startswith('1 / 100')
        page.locator('#save-pair').click()
        assert page.locator('.saved').count()==1
        assert 'déjà' in page.locator('#message').inner_text()
        page.reload(wait_until='domcontentloaded')
        assert page.locator('.saved').count()==1
        page.locator('#saved-list .saved-apply').click()
        assert page.locator('#ratio').inner_text().startswith('21,0000')

        # Sauvegarde, suppression puis restauration JSON.
        with page.expect_download() as d: page.locator('#export').click()
        backup=Path(d.value.path()).read_bytes()
        saved=json.loads(backup)
        assert saved=={'version':1,'pairs':[{'fg':'#000000','bg':'#FFFFFF'}]}
        page.locator('.saved .remove').click()
        assert page.locator('.saved').count()==0
        page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
        # Import JSON async (await file.text()): wait for the rendered collection.
        expect(page.locator('.saved')).to_have_count(1)

        # Quota simulé sur suppression : ne pas modifier la collection visible.
        page.evaluate("""() => {
          window._setItem=Storage.prototype.setItem;
          Storage.prototype.setItem=function(){throw new Error('quota simulated')};
        }""")
        page.locator('.saved .remove').click()
        assert page.locator('.saved').count()==1
        assert 'Enregistrement impossible' in page.locator('#message').inner_text()
        page.evaluate('() => { Storage.prototype.setItem=window._setItem; }')
        page.reload(wait_until='domcontentloaded')
        assert page.locator('.saved').count()==1

        # Historique illisible : aucune fausse sauvegarde JSON vide.
        page.evaluate("() => localStorage.setItem('louvre-wave2-colorcontrast-v1','INVALID_JSON')")
        page.reload(wait_until='domcontentloaded')
        assert page.locator('#warning').is_visible()
        assert page.locator('#save-pair').is_disabled()
        page.locator('#export').click()
        assert 'copie brute' in page.locator('#message').inner_text()
        with page.expect_download() as d:page.locator('#export-raw').click()
        assert Path(d.value.path()).read_text()=='INVALID_JSON'
        page.locator('#import-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'nope'})
        expect(page.locator('#message')).to_contain_text('Import rejeté')
        assert page.locator('#warning').is_visible()
        assert page.evaluate("() => localStorage.getItem('louvre-wave2-colorcontrast-v1')")=='INVALID_JSON'

        # Fichier valide mais écriture refusée : garder le verrou.
        page.evaluate("""() => {
          window._setItem=Storage.prototype.setItem;
          Storage.prototype.setItem=function(){throw new Error('quota simulated')};
        }""")
        page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
        expect(page.locator('#message')).to_contain_text('Enregistrement impossible')
        assert page.locator('#warning').is_visible()
        assert page.evaluate("() => localStorage.getItem('louvre-wave2-colorcontrast-v1')")=='INVALID_JSON'
        page.evaluate('() => { Storage.prototype.setItem=window._setItem; }')
        page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
        expect(page.locator('.saved')).to_have_count(1)
        expect(page.locator('#warning')).to_be_hidden()

        # Mobile et mode hors ligne après chargement de la coquille.
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=window.innerWidth+2')
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',timeout=20000)
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.locator('#foreground').wait_for()
        assert page.locator('.saved').count()==1
        assert not errors,errors
        context.set_offline(False)

        # --- Langues : détection, 7 langues, arabe de droite à gauche, couleurs conservées.
        intl=browser.new_context(viewport={'width':390,'height':844},locale='it-IT')
        ip=intl.new_page()
        ip.on('pageerror',lambda e:errors.append(str(e)))
        ip.on('dialog',lambda d:d.accept())
        ip.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        ip.locator('#foreground').wait_for()
        assert ip.evaluate('() => LouvreI18n.lang')=='it'
        assert ip.locator('#louvre-currency').count()==0  # appli sans argent
        ip.locator('#foreground').fill('#707972'); ip.locator('#foreground').dispatch_event('change')
        ip.locator('#background').fill('#FFFFFF'); ip.locator('#background').dispatch_event('change')
        assert ip.locator('#ratio').inner_text().startswith('4,4998')
        assert 'Insufficiente' in ip.locator('#aa-normal').inner_text()
        ip.locator('#save-pair').click()
        expect(ip.locator('.saved')).to_have_count(1)
        heads={'fr':'Améliorer le contraste','en':'Improve the contrast','es':'Mejorar el contraste','ar':'تحسين التباين','pt':'Melhorar o contraste','de':'Kontrast verbessern','it':'Migliorare il contrasto'}
        for lang in ['fr','en','es','ar','pt','de','it']:
            ip.locator('#louvre-lang').select_option(lang)
            assert ip.evaluate('() => document.documentElement.lang')==lang
            assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
            wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
              [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
            assert not wide,f'débordement en {lang} : {wide}'
            assert ip.locator('#suggest-title').inner_text()==heads[lang]
            assert ip.locator('#foreground').input_value()=='#707972'
            expect(ip.locator('.saved')).to_have_count(1)
            assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
        assert ip.locator('#ratio').inner_text().startswith('4,4998')
        ip.locator('#louvre-lang').select_option('en')
        assert ip.locator('#ratio').inner_text().startswith('4.4998')
        assert 'Fail' in ip.locator('#aa-normal').inner_text()
        assert ip.locator('#saved-count').inner_text()=='1 / 100 combination'
        ip.locator('#foreground').fill('#12'); ip.locator('#foreground').dispatch_event('change')
        assert ip.locator('#message').inner_text()=='Invalid colour: enter #RGB or #RRGGBB.'
        assert json.loads(ip.evaluate("localStorage.getItem('louvre-wave2-colorcontrast-v1')"))=={'version':1,'pairs':[{'fg':'#707972','bg':'#FFFFFF'}]}
        assert not errors,errors
        browser.close()
    print('BROWSER PASS ColorContrast v2: precise WCAG threshold, auto-adjust, unreachable AAA, favorites, quota, corrupt JSON, offline, mobile 390px, 7 languages, RTL')
finally:
    server.shutdown()
    server.server_close()
