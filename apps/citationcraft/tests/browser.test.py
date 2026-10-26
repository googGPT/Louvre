"""CitationCraft — browser integration, real interchange downloads, safe storage and PWA."""
import functools
import http.server
import json
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page()
            errors=[];external=[]
            origin=f'http://127.0.0.1:{server.server_port}/'
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda req:external.append(req.url)
                if req.url.startswith('http') and not req.url.startswith(origin) else None)
            dialogs=[]
            def capture(dialog):
                dialogs.append(dialog.message)
                dialog.accept()
            page.on('dialog',capture)
            page.goto(origin,wait_until='domcontentloaded')
            page.locator('#ref-id').wait_for()
            assert page.title().startswith('CitationCraft')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
            assert page.locator('#export-bib').is_disabled()

            # Real local CRUD; BibTeX export and RIS both roundtrip.
            page.locator('#ref-id').fill('Ammari2026')
            page.locator('#ref-authors').fill('Ammari, Aymen; Doe, Jane')
            page.locator('#ref-title').fill('Financial Resilience & Climate Risk')
            page.locator('#ref-year').fill('2026')
            page.locator('#ref-source').fill('Journal of Test Research')
            page.locator('#ref-doi').fill('10.1234/Climate2026')
            page.locator('#ref-url').fill('https://example.org/article')
            page.locator('#save').click()
            expect(page.locator('.reference-card')).to_have_count(1)
            assert page.locator('#count').inner_text().startswith('1 / 200')
            assert 'Ammari, Aymen' in page.locator('.ref-meta').inner_text()
            assert page.evaluate("JSON.parse(localStorage.getItem('louvre-wave2-citationcraft-v1')).items[0].title")=='Financial Resilience & Climate Risk'
            page.reload(wait_until='domcontentloaded')
            expect(page.locator('.reference-card')).to_have_count(1)

            with page.expect_download() as d:page.locator('#export-bib').click()
            bib=pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert '@article{Ammari2026,' in bib
            assert 'author = {Ammari, Aymen and Doe, Jane}' in bib
            assert 'doi = {10.1234/Climate2026}' in bib
            assert 'title = {Financial Resilience & Climate Risk}' in bib
            with page.expect_download() as d:page.locator('#export-ris').click()
            ris=pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert 'TY  - JOUR' in ris and 'AU  - Doe, Jane' in ris
            assert 'ER  - ' in ris

            with page.expect_download() as d:page.locator('#export-json').click()
            backup=pathlib.Path(d.value.path()).read_bytes()
            saved=json.loads(backup)
            assert saved['version']==1
            assert saved['items'][0]['id']=='Ammari2026'
            assert len(saved['items'])==1

            # Filtering and editing preserve IDs and local state.
            page.locator('#search').fill('nonexistent')
            assert page.locator('.reference-card').count()==0
            page.locator('#search').fill('CLIMATE')
            expect(page.locator('.reference-card')).to_have_count(1)
            page.locator('#search').fill('')
            page.locator('.reference-card .secondary').click()
            assert page.locator('#ref-title').input_value()=='Financial Resilience & Climate Risk'
            page.locator('#ref-title').fill('Climate Risk & Sustainability')
            page.locator('#save').click()
            expect(page.locator('.reference-card')).to_have_count(1)
            assert 'Sustainability' in page.locator('.ref-top strong').inner_text()

            # Reject duplicate ID transactionally with zero ghost cards.
            page.locator('#ref-id').fill('Ammari2026')
            page.locator('#ref-title').fill('Second item')
            page.locator('#save').click()
            assert page.locator('.reference-card').count()==1
            assert 'dupliquée' in page.locator('#feedback').inner_text()

            # Reject unsafe URLs and keep storage unchanged.
            page.locator('#ref-id').fill('Malicious')
            page.locator('#ref-title').fill('Test')
            page.locator('#ref-url').fill('javascript:alert(1)')
            page.locator('#save').click()
            assert page.locator('.reference-card').count()==1
            assert 'URL' in page.locator('#feedback').inner_text()
            page.locator('#ref-url').fill('')

            # Storage quota simulated: form submission fails without ghost writes.
            page.evaluate("""() => {
              window._realSet=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw Error('quota simulated');};
            }""")
            page.locator('#ref-id').fill('Quota')
            page.locator('#ref-title').fill('Keep out')
            page.locator('#save').click()
            assert page.locator('.reference-card').count()==1
            assert 'Enregistrement impossible' in page.locator('#feedback').inner_text()
            page.evaluate('() => Storage.prototype.setItem=window._realSet')
            page.locator('#cancel-edit').click() if page.locator('#cancel-edit').is_visible() else None
            page.locator('#record-form').evaluate('(e)=>e.reset()')
            page.locator('#ref-id').fill('')
            page.locator('#ref-title').fill('')

            # Unknown RIS fields explicitly acknowledged before confirmed import.
            page.locator('#import-format').select_option('ris')
            page.locator('#import-mode').select_option('replace')
            new_ris=('TY  - JOUR\nID  - TestRIS\nAU  - Smith, Anne\n'
                     'TI  - Économie et IA\nPY  - 2025\n'
                     'DO  - 10.1234/ris.2025\nAB  - Ignored abstract\nER  - \n').encode('utf-8')
            dialogs.clear()
            page.locator('#import-file').set_input_files({
                'name':'references.ris','mimeType':'text/plain','buffer':new_ris})
            expect(page.locator('.reference-card')).to_have_count(1)
            expect(page.locator('.ref-top strong')).to_have_text('Économie et IA')
            assert any('Champ RIS ignoré' in d for d in dialogs)
            assert '1 champ(s) ignoré(s)' in page.locator('#feedback').inner_text()

            # Append duplicate DOI: reject whole batch with no partial import.
            page.locator('#import-format').select_option('bib')
            page.locator('#import-mode').select_option('append')
            add=b'@article{Another,title={Another},doi={10.1234/ris.2025}}'
            page.locator('#import-file').set_input_files({'name':'copy.bib','mimeType':'text/plain','buffer':add})
            expect(page.locator('#feedback')).to_contain_text('DOI dupliqué')
            assert page.locator('.reference-card').count()==1

            # BibTeX import preserves nested braces and accent data.
            page.locator('#import-mode').select_option('replace')
            clean='@article{Clean,title={The {AI} Era},author={Müller, Anna and Dupont, Paul},year={2024}}'.encode('utf-8')
            page.locator('#import-file').set_input_files({'name':'clean.bib','mimeType':'text/plain','buffer':clean})
            expect(page.locator('.ref-top strong')).to_have_text('The {AI} Era')
            assert 'Müller' in page.locator('.ref-meta').inner_text()

            # User HTML never executes in view.
            page.locator('#ref-id').fill('HtmlTest')
            page.locator('#ref-title').fill('<img src=x onerror=alert(1)>')
            page.locator('#save').click()
            expect(page.locator('.reference-card')).to_have_count(2)
            assert page.locator('.reference-card img').count()==0
            assert '<img' in page.locator('#reference-list').inner_text()

            # Delete one reference and restore valid JSON.
            page.locator('.reference-card .danger').last.click()
            expect(page.locator('.reference-card')).to_have_count(1)
            page.locator('#clear-all').click()
            expect(page.locator('.reference-card')).to_have_count(0)
            page.locator('#import-format').select_option('json')
            page.locator('#import-mode').select_option('replace')
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('.reference-card')).to_have_count(1)
            assert 'Financial Resilience' in page.locator('.ref-top strong').inner_text()

            # Broken persistent JSON is locked rather than overwritten.
            page.evaluate("() => localStorage.setItem('louvre-wave2-citationcraft-v1','INVALID_JSON')")
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#warning').is_visible()
            assert page.locator('#save').is_disabled()
            assert page.locator('#export-bib').is_disabled()
            with page.expect_download() as d:page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text()=='INVALID_JSON'
            page.locator('#restore-trigger').click()
            assert page.locator('#import-format').input_value()=='json'
            assert page.locator('#import-mode').input_value()=='replace'
            page.locator('#import-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'nope'})
            expect(page.locator('#feedback')).to_contain_text('Import refusé')
            assert page.locator('#warning').is_visible()

            # Failed recovery write cannot unlock corrupted library.
            page.evaluate("""() => {
              window._realSet=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw Error('quota simulated');};
            }""")
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#feedback')).to_contain_text('Enregistrement impossible')
            assert page.locator('#warning').is_visible()
            page.evaluate('() => Storage.prototype.setItem=window._realSet')
            page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('.reference-card')).to_have_count(1)

            # PWA cached shell works offline, record survives reload.
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')
            page.wait_for_function('navigator.serviceWorker && navigator.serviceWorker.controller!==null',timeout=20000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            expect(page.locator('.reference-card')).to_have_count(1)
            assert not external,external
            assert not errors,errors
            browser.close()
        print('BROWSER PASS CitationCraft: transactional CRUD, real BibTeX/RIS/JSON, unknown-field warning, duplicate rejection, malicious URL/XSS, corrupt recovery, quota, mobile 390px, offline')
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':main()
