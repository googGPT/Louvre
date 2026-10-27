"""End-to-end travel planning on actual Chromium; designed for GitHub Actions."""
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from tempfile import TemporaryDirectory
import os, threading, json
ROOT = Path(__file__).resolve().parents[1]
class Server(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Server)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p, TemporaryDirectory() as temp:
        exe=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium') if os.path.exists(os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')) else '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
        browser=p.chromium.launch(executable_path=exe, headless=True, args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        def fill(day,place,start,end,cost):
            page.locator('[name="day"]').fill(day)
            page.locator('[name="place"]').fill(place)
            page.locator('[name="start"]').fill(start)
            page.locator('[name="end"]').fill(end)
            page.locator('[name="cost"]').fill(str(cost))
            page.locator('[name="category"]').select_option('Visite')
        base=f'http://127.0.0.1:{server.server_port}/'
        page.goto(base,wait_until='domcontentloaded')
        page.locator('#record-form').wait_for()
        assert page.get_by_role('heading',name='TravelDay').count()==1
        assert page.locator('a[href="../../"]').count()==0, 'Unexpected Louvre link'
        assert page.locator('body').evaluate('(b)=>b.scrollWidth<=innerWidth+2'), 'Mobile overflow'
        fill('2026-11-10','Grande visite','08:00','18:00',19.99)
        assert '10 h 00' in page.locator('#preview').inner_text()
        page.locator('#save-button').click()
        page.locator('.item').first.wait_for()
        assert page.locator('.item').count()==1
        fill('2026-11-10','Petit musée','09:00','10:00',2.35)
        page.locator('#save-button').click()
        fill('2026-11-10','Déjeuner','13:00','14:00',12.10)
        page.locator('#save-button').click()
        assert page.locator('.item').count()==3
        assert page.locator('#conflicts li').count()==2, 'Missed nested non-adjacent overlap'
        assert '34,44' in page.locator('#summary').inner_text() or '34.44' in page.locator('#summary').inner_text()
        page.reload(wait_until='domcontentloaded')
        assert page.locator('.item').count()==3
        assert page.locator('#conflicts li').count()==2
        page.locator('#day-filter').select_option('2026-11-10')
        assert page.locator('.item').count()==3
        page.locator('#search').fill('dejeuner')
        assert page.locator('.item').count()==1, 'Accent-insensitive search'
        page.locator('#search').fill('')
        page.locator('.item').filter(has_text='Grande visite').get_by_role('button',name='Modifier').click()
        assert page.locator('#save-button').inner_text()=='Enregistrer les modifications'
        page.locator('[name="place"]').fill('Visite panoramique')
        page.locator('#save-button').click()
        assert page.locator('.item').filter(has_text='Visite panoramique').count()==1
        # Regression: two partial export formats and full JSON backup.
        with page.expect_download() as dl:page.locator('#csv').click()
        csv=Path(dl.value.path()).read_bytes().decode('utf-8-sig')
        assert 'Visite panoramique' in csv and '34' not in csv[:20]
        with page.expect_download() as dl:page.locator('#ics').click()
        ics=Path(dl.value.path()).read_text('utf-8')
        assert 'BEGIN:VCALENDAR' in ics and 'DTSTART:20261110T080000' in ics
        with page.expect_download() as dl:page.locator('#export').click()
        backup_path=dl.value.path()
        backup=json.loads(Path(backup_path).read_text('utf-8'))
        assert backup['version']==1 and len(backup['records'])==3
        # Invalid import must never destroy the old store.
        invalid=Path(temp)/'invalid.json';invalid.write_text('{not-json',encoding='utf-8')
        page.locator('#import').set_input_files(str(invalid))
        page.wait_for_function("document.querySelector('#status').textContent.includes('Import refusé')")
        assert page.locator('.item').count()==3
        page.once('dialog',lambda d:d.accept())
        page.locator('.item').filter(has_text='Petit musée').get_by_role('button',name='Supprimer').click()
        assert page.locator('.item').count()==2
        page.once('dialog',lambda d:d.accept())
        page.locator('#import').set_input_files(str(backup_path))
        page.wait_for_function("document.querySelectorAll('.item').length===3")
        # Legacy version-1 backup with only historical fields.
        old=Path(temp)/'old.json';old.write_text(json.dumps({'app':'travelday','version':1,'records':[{'id':'legacy0001','day':'2026-11-11','place':'Ancienne visite','start':'10:00','end':'11:00','cost':5}]}),encoding='utf-8')
        page.once('dialog',lambda d:d.accept())
        page.locator('#import').set_input_files(str(old))
        page.wait_for_function("document.querySelectorAll('.item').length===1")
        assert page.locator('.item').first.get_by_text('Ancienne visite').count()==1
        # Overnight: following-day intersection flagged in itinerary.
        page.locator('#day-filter').select_option('all')
        fill('2026-11-10','Train de nuit','23:30','00:30',50)
        page.locator('#save-button').click()
        assert '(+1 jour)' in page.locator('.item').filter(has_text='Train de nuit').inner_text()
        page.reload(wait_until='domcontentloaded')
        assert page.locator('.item').count()==2
        page.wait_for_function("navigator.serviceWorker.controller !== null",timeout=15000)
        page.context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.locator('.item').first.wait_for()
        assert page.locator('.item').count()==2
        assert page.locator('body').evaluate('(b)=>b.scrollWidth<=innerWidth+2')
        assert not errors,errors
        browser.close()
    print('BROWSER PASS: nested overlaps, cent-safe budgets, daily filters, edits, CSV/ICS/JSON, legacy restore, invalid import, overnight, mobile 390px, offline PWA')
finally:
    server.shutdown();server.server_close()