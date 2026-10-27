"""CSVClinic v2 — Chromium: CSV fidelity, safety, stale-result prevention, mobile/offline."""
import os
import functools
import http.server
import pathlib
import threading
from playwright.sync_api import sync_playwright

BASE=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),
        functools.partial(Handler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            page=context.new_page()
            errors=[];external=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            origin=f'http://127.0.0.1:{server.server_port}/'
            page.on('request',lambda req:external.append(req.url)
                if req.url.startswith('http') and not req.url.startswith(origin) else None)
            page.goto(origin,wait_until='domcontentloaded')
            page.locator('#run').wait_for()
            assert page.title().startswith('CSVClinic')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
            assert page.locator('#download').is_disabled()

            # Quoted embedded delimiter, quoted newlines, BOM and dedupe of whitespace.
            source='\ufeffNom;Commentaires;Montant\r\n"Julie, A";"Première ligne\nDeuxième ligne";12\r\n' + \
                   '"Julie, A";"Première ligne\nDeuxième ligne";12\r\n' + \
                   '"Marc";"=HYPERLINK(""https://bad.test"")";45'
            page.locator('#source').fill(source)
            page.locator('#run').click()
            assert page.locator('#before').inner_text()=='3'
            assert page.locator('#after').inner_text()=='2'
            assert page.locator('#removed').inner_text()=='1'
            assert 'séparateur ;' in page.locator('#cols').inner_text()
            assert page.locator('#preview-table tbody tr').count()==2
            assert page.locator('#download').is_enabled()
            with page.expect_download() as download:
                page.locator('#download').click()
            exported=pathlib.Path(download.value.path()).read_text(encoding='utf-8-sig')
            assert "Julie, A" in exported
            assert '"Première ligne\nDeuxième ligne"' in exported
            assert "'=HYPERLINK" in exported  # Formula neutralization before output.

            # Source edits invalidate preview and export immediately.
            page.locator('#source').fill('A,B\n1,2')
            assert page.locator('#download').is_disabled()
            assert page.locator('#before').inner_text()=='—'
            assert page.locator('#preview-table').get_by_text('Lancez l’analyse').count()==1
            page.locator('#run').click()
            assert page.locator('#after').inner_text()=='1'

            # Invalid source after prior success cannot show stale table or allow download.
            page.locator('#source').fill('A,B\n"not closed,z')
            page.locator('#run').click()
            assert page.locator('#download').is_disabled()
            assert page.locator('#after').inner_text()=='—'
            assert 'Guillemet non fermé' in page.locator('#feedback').inner_text()

            # Settings change requires recomputation.
            page.locator('#source').fill('Id,Nom\nx,A\nx,B')
            page.locator('#run').click()
            assert page.locator('#after').inner_text()=='2'
            page.locator('#dedupe').select_option('first')
            assert page.locator('#download').is_disabled()
            page.locator('#run').click()
            assert page.locator('#after').inner_text()=='1'
            page.locator('#dedupe').select_option('none')
            page.locator('#run').click()
            assert page.locator('#after').inner_text()=='2'

            # Empty keys not silently collapsed in first-column dedupe.
            page.locator('#dedupe').select_option('first')
            page.locator('#source').fill('Id,Nom\n,A\n,B\nz,C\nz,D')
            page.locator('#run').click()
            assert page.locator('#after').inner_text()=='3'
            assert '2 identifiants vides conservés' in page.locator('#output-info').inner_text()

            # HTML injection rendered as text, not evaluated.
            page.locator('#source').fill('Nom;Valeur\n"<img src=x onerror=alert(1)>";"ok"')
            page.locator('#run').click()
            assert page.locator('#preview-table').locator('img').count()==0
            assert '<img' in page.locator('#preview-table tbody').inner_text()

            # Import files locally, with strict file-size rejection.
            page.locator('#source-file').set_input_files({
                'name':'table.csv','mimeType':'text/csv','buffer':b'Nom;Montant\nMarc;10\nLea;20'})
            page.wait_for_function("() => (document.querySelector('#source').value.includes('Marc;10'))")
            assert page.locator('#download').is_disabled()
            page.locator('#run').click()
            assert page.locator('#after').inner_text()=='2'
            page.locator('#source-file').set_input_files({
                'name':'oversized.csv','mimeType':'text/csv','buffer':b'A'*1050001})
            assert 'trop volumineux' in page.locator('#feedback').inner_text()
            assert page.locator('#download').is_disabled()

            # Source data and exports should not be persisted to storage.
            assert page.evaluate('localStorage.length')==0
            assert page.evaluate('sessionStorage.length')==0
            page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)",timeout=20000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#run').is_visible()
            assert page.locator('#source').input_value()==''
            assert page.locator('#download').is_disabled()
            assert not errors,errors
            assert not external,external
            context.set_offline(False)

            # --- Langues : détection automatique, 7 langues complètes, arabe de droite à gauche.
            # La lecture du CSV (séparateur, décimales) et le fichier exporté ne dépendent pas de la langue.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='pt-BR',accept_downloads=True)
            ip=intl.new_page()
            ip.on('pageerror',lambda e:errors.append(str(e)))
            ip.on('request',lambda req:external.append(req.url) if req.url.startswith('http') and not req.url.startswith(origin) else None)
            ip.goto(origin,wait_until='domcontentloaded')
            ip.locator('#run').wait_for()
            assert ip.locator('h1').inner_text().startswith('Dados limpos'), ip.locator('h1').inner_text()  # navigateur portugais -> portugais
            assert ip.locator('#louvre-currency').count()==0  # appli sans argent : pas de menu devise
            csv_src='Nom;Montant\nJulie;24,50\nJulie;24,50\nMarc;=1+1'
            ip.locator('#source').fill(csv_src)
            ip.locator('#run').click()
            assert ip.locator('#after').inner_text()=='2'
            expected={'fr':('Les données propres','2 colonnes · séparateur ;'),'en':('Clean data','2 columns · delimiter ;'),'es':('Los datos limpios','2 columnas · separador ;'),
                      'ar':('البيانات النظيفة','عمودان · الفاصل ;'),'pt':('Dados limpos','2 colunas · separador ;'),'de':('Saubere Daten','2 Spalten · Trennzeichen ;'),'it':('Dati puliti','2 colonne · separatore ;')}
            exports={}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                title,cols=expected[lang]
                assert ip.locator('h1').inner_text().startswith(title), (lang, ip.locator('h1').inner_text())
                assert ip.locator('#cols').inner_text()==cols, (lang, ip.locator('#cols').inner_text())
                assert ip.locator('#source').input_value()==csv_src and ip.locator('#download').is_enabled()  # saisie et résultat conservés
                assert ip.evaluate('() => LouvreI18n.missing()')==[], ip.evaluate('() => LouvreI18n.missing()')
                if lang in ('en','ar','de'):
                    with ip.expect_download() as dl: ip.locator('#download').click()
                    exports[lang]=pathlib.Path(dl.value.path()).read_bytes()
            assert exports['en']==exports['ar']==exports['de'], 'export dépendant de la langue'
            assert "Julie;\"24,50\"" not in exports['en'].decode('utf-8-sig') and 'Julie;24,50' in exports['en'].decode('utf-8-sig')
            assert "'=1+1" in exports['en'].decode('utf-8-sig')
            ip.locator('#louvre-lang').select_option('en')
            assert ip.locator('#feedback').inner_text().startswith('Export created.'), ip.locator('#feedback').inner_text()
            ip.locator('#source').fill('A,B\n"open,z')
            ip.locator('#run').click()
            assert ip.locator('#feedback').inner_text()=='Analysis refused: Unclosed quote', ip.locator('#feedback').inner_text()
            ip.locator('#louvre-lang').select_option('it')
            assert ip.locator('#feedback').inner_text()=='Analisi rifiutata: Virgolette non chiuse', ip.locator('#feedback').inner_text()  # message retraduit
            assert not errors,errors
            assert not external,external
            browser.close()
        print('BROWSER PASS CSVClinic v2: BOM, semicolon, multiline quote, CSV export formula protection, stale invalidation, invalid CSV reset, dedupe, blank key, XSS, imports, offline, mobile 390px, 7 languages, RTL, language-independent export')
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':
    run()
