"""End-to-end browser QA, designed to run in GitHub Actions with Chromium."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import tempfile,threading,os,json
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as pw, tempfile.TemporaryDirectory() as temp:
        exe=next((p for p in [os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),'/usr/bin/google-chrome'] if Path(p).exists()),None)
        browser=pw.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept())
        page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        page.wait_for_selector('[name="day"]')
        assert page.get_by_text('Louvre ↗').count()==0
        assert page.locator('body').evaluate('(x)=>x.scrollWidth<=innerWidth+2')
        page.locator('[name="day"]').fill('2026-10-26')
        page.locator('[name="purpose"]').fill('Université Bordeaux')
        page.locator('[name="km"]').fill('120.5')
        page.locator('[name="rate"]').fill('0.40')
        assert '48,20' in page.locator('#live-preview').inner_text()
        page.locator('#save-button').click()
        page.locator('#items .item').first.wait_for()
        assert page.locator('#items .item').count()==1
        assert '48,20' in page.locator('#items').inner_text()
        page.reload();page.locator('#items .item').first.wait_for()
        assert page.locator('#items .item').count()==1
        # Second trip, already reimbursed, plus status/month filters
        page.locator('[name="day"]').fill('2026-09-15')
        page.locator('[name="purpose"]').fill('Mission')
        page.locator('[name="km"]').fill('10')
        page.locator('[name="rate"]').fill('0.50')
        page.locator('[name="paid"]').select_option('oui')
        page.locator('#save-button').click();page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
        page.locator('#paid-filter').select_option('non');assert page.locator('#items .item').count()==1
        page.locator('#paid-filter').select_option('tous')
        page.locator('#month').fill('2026-10');assert page.locator('#items .item').count()==1
        page.locator('#clear-filters').click();assert page.locator('#items .item').count()==2
        page.locator('#search').fill('bordeaux');assert page.locator('#items .item').count()==1
        page.locator('#search').fill('');assert page.locator('#items .item').count()==2
        # one-click marking and reversal
        page.locator('#items .item').filter(has_text='Université Bordeaux').get_by_text('Marquer remboursé').click()
        assert 'Remboursé' in page.locator('#items .item').filter(has_text='Université Bordeaux').inner_text()
        page.locator('#items .item').filter(has_text='Université Bordeaux').get_by_text('Marquer non remboursé').click()
        assert 'À rembourser' in page.locator('#items .item').filter(has_text='Université Bordeaux').inner_text()
        # edit and persist
        page.locator('#items .item').filter(has_text='Université Bordeaux').get_by_text('Modifier').click()
        assert page.locator('#save-button').inner_text()=='Mettre à jour'
        page.locator('[name="km"]').fill('121')
        page.locator('#save-button').click()
        assert '48,40' in page.locator('#items .item').filter(has_text='Université Bordeaux').inner_text()
        # CSV filtered/all contents, JSON backup
        with page.expect_download() as d:page.locator('#export-csv').click()
        csv=Path(d.value.path()).read_text(encoding='utf-8-sig')
        assert 'Université Bordeaux' in csv and 'Mission' in csv and 'Montant EUR' in csv
        with page.expect_download() as d:page.locator('#export').click()
        backup=Path(d.value.path())
        assert json.loads(backup.read_text(encoding='utf-8'))['records'].__len__()==2
        # delete and restore from JSON
        page.locator('#items .item').filter(has_text='Mission').get_by_text('Supprimer').click()
        assert page.locator('#items .item').count()==1
        page.locator('#import').set_input_files(str(backup))
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
        # Invalid JSON must not overwrite local records
        bad=Path(temp)/'invalid.json';bad.write_text('{"app":"untrusted","version":1,"records":[]}',encoding='utf-8')
        page.locator('#import').set_input_files(str(bad))
        expect(page.locator('#status')).to_contain_text('Import refusé')  # attend la fin de l'import asynchrone
        expect(page.locator('#items .item')).to_have_count(2)
        # Historic schema without optional fields is supported
        legacy=Path(temp)/'legacy.json'
        legacy.write_text(json.dumps({'app':'mileagebook','version':1,'records':[{'id':'legacy123','day':'2026-02-10','purpose':'Ancien trajet','km':80,'rate':0.4,'paid':'non'}]}),encoding='utf-8')
        page.locator('#import').set_input_files(str(legacy))
        page.locator('#clear-filters').click()
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
        assert 'Ancien trajet' in page.locator('#items').inner_text()
        page.reload();page.locator('#items .item').first.wait_for()
        assert 'Ancien trajet' in page.locator('#items').inner_text()
        # Offline PWA after online load and SW activation
        page.evaluate('navigator.serviceWorker.ready')
        page.reload(wait_until='domcontentloaded');page.wait_for_timeout(350)
        page.context.set_offline(True)
        page.reload(wait_until='domcontentloaded');page.locator('#items .item').first.wait_for()
        assert 'Ancien trajet' in page.locator('#items').inner_text()
        assert not errors,errors
        browser.close()
    print('BROWSER PASS: cents, search, year/month/status filters, reimburse toggle, edit, CSV and JSON, legacy and invalid imports, offline PWA, responsive 390px')
finally:
    server.shutdown();server.server_close()