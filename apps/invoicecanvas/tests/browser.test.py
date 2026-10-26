"""InvoiceCanvas browser: true decimal figures, transactional persistence, printing and offline."""
import functools
import http.server
import json
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page();errors=[];external=[];dialogs=[]
            origin=f'http://127.0.0.1:{server.server_port}/'
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda q:external.append(q.url) if q.url.startswith('http') and not q.url.startswith(origin) else None)
            def dialog(d):
                dialogs.append(d.message);d.accept()
            page.on('dialog',dialog)
            page.goto(origin,wait_until='domcontentloaded')
            assert page.title().startswith('InvoiceCanvas')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
            assert page.locator('#print').is_disabled()
            assert page.locator('#print-number').inner_text().startswith('BROUILLON')

            # Live preview with exact centime rounding and user-selected VAT.
            page.locator('#type').select_option('invoice')
            page.locator('#issueDate').fill('2026-10-26')
            page.locator('#serviceDate').fill('2026-10-25')
            page.locator('#dueDate').fill('2026-11-25')
            page.locator('#nature').select_option('services')
            page.locator('#seller-name').fill('Émetteur Bordeaux SAS')
            page.locator('#seller-address').fill('Bordeaux, France')
            page.locator('#seller-siren').fill('123456789')
            page.locator('#seller-vat').fill('FR12345678901')
            page.locator('#buyer-name').fill('Client Paris')
            page.locator('#buyer-address').fill('Paris, France')
            page.locator('#conditions').fill('Virement à 30 jours')
            page.locator('#line-items [data-field=label]').fill('Prestation conseil')
            page.locator('#line-items [data-field=quantity]').fill('1.000')
            page.locator('#line-items [data-field=unitPrice]').fill('19.99')
            page.locator('#line-items [data-field=vatRate]').fill('5.50')
            assert '19,99' in page.locator('#print-ht').inner_text()
            assert '1,10' in page.locator('#print-vat').inner_text()
            assert '21,09' in page.locator('#print-ttc').inner_text()
            assert page.locator('#print').is_enabled()

            # Second line -> deterministic sum of separately rounded line taxes.
            page.locator('#add-line').click()
            second=page.locator('.line-row').nth(1)
            second.locator('[data-field=label]').fill('Petit service')
            second.locator('[data-field=quantity]').fill('1.000')
            second.locator('[data-field=unitPrice]').fill('0.10')
            second.locator('[data-field=vatRate]').fill('5.00')
            assert '20,09' in page.locator('#print-ht').inner_text()
            assert '1,11' in page.locator('#print-vat').inner_text()
            assert '21,20' in page.locator('#print-ttc').inner_text()

            # Syntactically invalid pricing blocks printing and saving.
            second.locator('[data-field=unitPrice]').fill('0.001')
            assert page.locator('#print').is_disabled()
            page.locator('#save').click()
            assert 'invalide' in page.locator('#feedback').inner_text().lower()
            second.locator('[data-field=unitPrice]').fill('0.10')

            # Save draft, reload and load persisted state.
            page.locator('#save').click()
            expect(page.locator('.archive-card')).to_have_count(1)
            assert page.locator('.archive-card strong').inner_text()=='BROUILLON'
            assert page.evaluate("JSON.parse(localStorage.getItem('louvre-wave2-invoicecanvas-v1')).documents[0].items.length")==2
            page.reload(wait_until='domcontentloaded')
            expect(page.locator('.archive-card')).to_have_count(1)
            page.locator('.archive-card .secondary').click()
            assert page.locator('#type').input_value()=='invoice'
            assert page.locator('#line-items .line-row').count()==2
            assert '21,20' in page.locator('#print-ttc').inner_text()

            # Finalization locks and locally numbers; HTML printing is actually invoked.
            page.locator('#lock').click()
            assert any('Verrouiller' in x for x in dialogs)
            expect(page.locator('.archive-card strong')).to_have_text('F-2026-0001')
            assert page.locator('#save').is_disabled()
            assert page.locator('#line-items [data-field=unitPrice]').first.is_disabled()
            assert page.locator('.archive-card .danger').count()==0
            page.evaluate("() => { window._printCalls=0; window.print=()=>window._printCalls++; }")
            page.locator('#print').click()
            assert page.evaluate('window._printCalls')==1
            assert 'DOCUMENT DE TRAVAIL' in page.locator('#print-sheet').inner_text()
            page.emulate_media(media='print')
            assert page.locator('#print-sheet').evaluate("(e)=>getComputedStyle(e).visibility")=='visible'
            assert page.locator('.top-bar').evaluate("(e)=>getComputedStyle(e).visibility")=='hidden'
            page.emulate_media(media='screen')

            # A second invoice dated later receives 0002, preserving the first locked.
            page.locator('#new').click()
            page.locator('#type').select_option('invoice')
            page.locator('#issueDate').fill('2026-10-27')
            page.locator('#serviceDate').fill('2026-10-27')
            page.locator('#dueDate').fill('2026-11-27')
            page.locator('#nature').select_option('services')
            page.locator('#seller-name').fill('Émetteur Bordeaux SAS')
            page.locator('#seller-address').fill('Bordeaux')
            page.locator('#seller-siren').fill('123456789')
            page.locator('#buyer-name').fill('Client 2')
            page.locator('#buyer-address').fill('Lyon')
            page.locator('#conditions').fill('Virement à 30 jours')
            page.locator('#line-items [data-field=label]').fill('Deuxième prestation')
            page.locator('#lock').click()
            expect(page.locator('.archive-card')).to_have_count(2)
            assert page.locator('.archive-card strong').first.inner_text()=='F-2026-0002'
            assert page.locator('.archive-card strong').last.inner_text()=='F-2026-0001'

            # JSON download/restore preserving both locked snapshots.
            with page.expect_download() as d:page.locator('#export-json').click()
            backup=pathlib.Path(d.value.path()).read_bytes()
            data=json.loads(backup)
            assert [x['number'] for x in data['documents']]==['F-2026-0001','F-2026-0002']
            assert data['version']==1

            # XSS user input is rendered as text, not inserted as HTML.
            page.locator('#new').click()
            page.locator('#issueDate').fill('2026-10-28')
            page.locator('#line-items [data-field=label]').fill('<img src=x onerror=alert(1)>')
            page.locator('#save').click()
            expect(page.locator('.archive-card')).to_have_count(3)
            assert page.locator('#print-sheet img').count()==0
            assert '<img src=x' in page.locator('#print-sheet').inner_text()

            # Quota failure must not leave phantom persisted drafts.
            page.locator('#new').click()
            page.locator('#line-items [data-field=label]').fill('Quota')
            page.evaluate("""() => {
                window._origSet=Storage.prototype.setItem;
                Storage.prototype.setItem=function(){throw Error('quota simulated');};
            }""")
            page.locator('#save').click()
            assert 'Écriture refusée' in page.locator('#feedback').inner_text()
            assert page.locator('.archive-card').count()==3
            page.evaluate('() => Storage.prototype.setItem=window._origSet')

            # Invalid JSON recovery: the raw bytes survive, while mutations are blocked.
            page.evaluate("() => localStorage.setItem('louvre-wave2-invoicecanvas-v1','BROKEN_JSON')")
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#warning').is_visible()
            assert page.locator('#save').is_disabled()
            with page.expect_download() as d:page.locator('#raw-export').click()
            assert pathlib.Path(d.value.path()).read_text()=='BROKEN_JSON'
            page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'not-json'})
            expect(page.locator('#feedback')).to_contain_text('Restauration refusée')
            assert page.locator('#warning').is_visible()

            # Failed write when restoring cannot unlock corrupted data.
            page.evaluate("""() => {
                window._origSet=Storage.prototype.setItem;
                Storage.prototype.setItem=function(){throw Error('quota simulated');};
            }""")
            page.locator('#import-file').set_input_files({'name':'good.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#feedback')).to_contain_text('Écriture refusée')
            assert page.locator('#warning').is_visible()
            page.evaluate('() => Storage.prototype.setItem=window._origSet')
            page.locator('#import-file').set_input_files({'name':'good.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('.archive-card')).to_have_count(2)
            assert page.locator('.archive-card strong').first.inner_text()=='F-2026-0002'

            # Static shell offline, no external API connections. Saved local docs persist.
            page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller !== null',timeout=20000)
            context.set_offline(True);page.reload(wait_until='domcontentloaded')
            expect(page.locator('.archive-card')).to_have_count(2)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
            assert not external,external
            assert not errors,errors
            browser.close()
        print('BROWSER PASS InvoiceCanvas: 20.09 HT / 1.11 VAT / 21.20 TTC, centimes, local drafts, sequential lock, immutable versions, print CSS, JSON backup, XSS, quota/corruption recovery, mobile 390px, offline')
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':run()
