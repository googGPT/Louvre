"""TextDiff: Chromium real UI, downloads, XSS, bound checks, mobile and offline."""
import os
import functools
import http.server
import pathlib
import threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            page=context.new_page();errors=[];external=[]
            origin=f'http://127.0.0.1:{server.server_port}/'
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda req: external.append(req.url) if req.url.startswith('http') and not req.url.startswith(origin) else None)
            page.goto(origin,wait_until='domcontentloaded')
            page.locator('#compare').wait_for()
            assert page.title().startswith('TextDiff')
            assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2')
            assert page.locator('#export').is_disabled()

            # Example has two replacements and one additional line.
            page.locator('#example').click()
            assert page.locator('#stat-original').inner_text()=='4'
            assert page.locator('#stat-revised').inner_text()=='5'
            assert page.locator('#stat-add').inner_text()=='3'
            assert page.locator('#stat-remove').inner_text()=='2'
            assert page.locator('#stat-blocks').inner_text()=='2'
            assert page.locator('.diff-table tbody tr').count()==7
            assert page.locator('#export').is_enabled()
            with page.expect_download() as download:
                page.locator('#export').click()
            d=download.value
            assert d.suggested_filename=='textdiff-report.txt'
            report=pathlib.Path(d.path()).read_text(encoding='utf-8')
            assert '- "Commande : 8"' in report
            assert '+ "Commande : 12"' in report
            assert '+ "Livraison demain."' in report
            assert '@@ -' not in report

            # Input mutation and option change invalidate stale results immediately.
            page.locator('#revised').fill('Bonjour le monde !\nCommande : 8\nStatut : en attente\nMerci.')
            assert page.locator('#export').is_disabled()
            assert page.locator('#stat-add').inner_text()=='—'
            assert page.locator('.diff-table').count()==0
            page.locator('#compare').click()
            assert page.locator('#stat-blocks').inner_text()=='0'
            assert 'Aucune différence' in page.locator('#feedback').inner_text()
            page.locator('#ignore-case').check()
            assert page.locator('#export').is_disabled()

            # Case insensitive equality still displays both ORIGINAL and REVISED texts correctly.
            page.locator('#original').fill('BONJOUR')
            page.locator('#revised').fill('bonjour')
            page.locator('#compare').click()
            assert page.locator('#stat-blocks').inner_text()=='0'
            cells=page.locator('.diff-table tbody tr').first.locator('.cell-text')
            assert cells.nth(0).inner_text()=='BONJOUR'
            assert cells.nth(1).inner_text()=='bonjour'
            with page.expect_download() as dd:
                page.locator('#export').click()
            assert '~ "BONJOUR" => "bonjour"' in pathlib.Path(dd.value.path()).read_text()

            # Word granularity: highlight only changed token.
            page.locator('#ignore-case').uncheck()
            page.locator('#mode').select_option('words')
            page.locator('#original').fill('Bonjour tout le monde')
            page.locator('#revised').fill('Bonjour tout le voisinage')
            page.locator('#compare').click()
            assert page.locator('.word-panes .word-pane').count()==2
            assert 'Bonjour tout le monde' == page.locator('.word-pane').first.locator('.word-content').inner_text()
            assert page.locator('.word-pane').last.locator('.word-content').inner_text()=='Bonjour tout le voisinage'
            assert page.locator('.word-content .diff-delete').count()==1
            assert page.locator('.word-content .diff-insert').count()==1

            # Whitespace ignored only for comparison; text remains unaltered on screen.
            page.locator('#mode').select_option('lines')
            page.locator('#ignore-whitespace').check()
            page.locator('#original').fill('a   b ')
            page.locator('#revised').fill('a b')
            page.locator('#compare').click()
            assert page.locator('#stat-blocks').inner_text()=='0'
            cells=page.locator('.diff-table tbody tr').first.locator('.cell-text')
            assert cells.nth(0).inner_text()=='a   b '
            assert cells.nth(1).inner_text()=='a b'

            # Limits stop large comparisons instead of silently truncating.
            page.locator('#original').fill('x\n'*701)
            page.locator('#revised').fill('x')
            page.locator('#compare').click()
            assert page.locator('#export').is_disabled()
            assert '700 maximum' in page.locator('#feedback').inner_text()
            assert page.locator('.diff-table').count()==0

            # Security: untrusted HTML is rendered as literal text, never tags.
            page.locator('#mode').select_option('lines')
            page.locator('#original').fill('<img src=x onerror=alert(1)>')
            page.locator('#revised').fill('<script>evil()</script>')
            page.locator('#compare').click()
            assert page.locator('#result img').count()==0
            assert page.locator('#result script').count()==0
            assert '<img src=x' in page.locator('#result').inner_text()
            assert '<script>evil()' in page.locator('#result').inner_text()

            # Real local file import, no persistence; stale export after load.
            page.locator('#file-original').set_input_files({
                'name':'document.txt','mimeType':'text/plain',
                'buffer':b'Premiere ligne\nSeconde ligne'
            })
            page.wait_for_function("() => (document.querySelector('#original').value.includes('Seconde ligne'))")
            assert page.locator('#export').is_disabled()
            page.locator('#file-revised').set_input_files({
                'name':'document.txt','mimeType':'text/plain',
                'buffer':b'Premiere ligne\nTroisieme ligne'
            })
            page.wait_for_function("() => (document.querySelector('#revised').value.includes('Troisieme ligne'))")
            page.locator('#compare').click()
            assert page.locator('#stat-blocks').inner_text()=='1'
            page.locator('#swap').click()
            assert 'Troisieme ligne' in page.locator('#original').input_value()
            assert 'Seconde ligne' in page.locator('#revised').input_value()

            # Reset and offline, no data storage.
            assert page.evaluate("localStorage.length") == 0
            assert page.evaluate("sessionStorage.length") == 0
            page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)",timeout=20000)
            page.locator('#reset').click()
            assert page.locator('#original').input_value() == ''
            assert page.locator('#export').is_disabled()
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#compare').is_enabled()
            assert page.locator('#original').input_value() == ''
            assert not errors,errors
            assert not external,external
            context.set_offline(False)

            # --- Langues : détection du navigateur, 7 langues complètes, arabe de droite à gauche (pas d'argent : menu langue seul).
            intl=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='es-MX')
            ip=intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin,wait_until='domcontentloaded')
            assert ip.locator('h1').inner_text().startswith('Detecta cada cambio.'), ip.locator('h1').inner_text()  # navigateur espagnol
            assert ip.locator('#louvre-currency').count()==0
            ip.locator('#example').click()
            assert [ip.locator('#'+i).inner_text() for i in ['stat-original','stat-revised','stat-add','stat-remove','stat-blocks']]==['4','5','3','2','2']
            assert 'Pedido: 12' in ip.locator('#result').inner_text()
            titles={'fr':'Repérez chaque changement.','en':'Spot every change.','es':'Detecta cada cambio.','ar':'التقط كل تغيير.','pt':'Detete cada alteração.','de':'Jede Änderung erkennen.','it':'Individua ogni modifica.'}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('h1').inner_text().startswith(titles[lang]),(lang,ip.locator('h1').inner_text())
                assert 'Pedido: 12' in ip.locator('#revised').input_value()  # textes saisis conservés
                assert ip.locator('.diff-table tbody tr').count()==7  # résultat conservé et réaffiché
            missing=ip.evaluate('() => LouvreI18n.missing()')
            assert missing==[],missing
            ip.locator('#louvre-lang').select_option('de')
            assert ip.locator('.diff-table th').nth(1).inner_text()=='Ursprünglicher Text'
            assert ip.locator('#stat-similarity').inner_text().replace('\u00a0',' ')=='44,44 %', ip.locator('#stat-similarity').inner_text()
            with ip.expect_download() as dg:
                ip.locator('#export').click()
            rep=pathlib.Path(dg.value.path()).read_text(encoding='utf-8')
            assert rep.startswith('TextDiff — Vergleichsbericht\nModus: Zeilen\n') and '+ "Pedido: 12"' in rep, rep[:200]
            ip.locator('#original').fill('x\n'*701);ip.locator('#compare').click()
            assert 'Zu viele Zeilen (höchstens 700 pro Text)' in ip.locator('#feedback').inner_text(), ip.locator('#feedback').inner_text()
            assert not errors,errors
            browser.close()
        print('BROWSER PASS TextDiff: line/word LCS, download, ignored-text preservation, stale invalidation, 700-unit guard, XSS, local imports, reset, mobile 390px, offline, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':run()
