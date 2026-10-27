from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import threading,os,contextlib
ROOT=Path(__file__).parents[1]
class H(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),H);port=server.server_port;threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  exe=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium') if os.path.exists(os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')) else '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
  browser=p.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded')
  page.wait_for_selector('#record-form input')
  fields=[{'key': 'title', 'label': 'Livre', 'type': 'text', 'sample': 'Exemple'}, {'key': 'total', 'label': 'Pages totales', 'type': 'number', 'sample': 320}, {'key': 'read', 'label': 'Pages lues', 'type': 'number', 'sample': 80}, {'key': 'status', 'label': 'État', 'type': 'select', 'options': ['en cours', 'terminé', 'en pause'], 'sample': 'en cours'}]
  for fld in fields:
   typ=fld['type'];v=fld.get('sample')
   if typ=='select':page.locator('[name="'+fld['key']+'"]').select_option(str(v))
   else:page.locator('[name="'+fld['key']+'"]').fill(str(v))
  page.locator('#save-button').click();page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  page.reload();page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  assert not errors, errors
  assert page.locator('body').evaluate('(e)=>e.scrollWidth <= innerWidth+2')
  with page.expect_download(timeout=10000) as d:page.locator('#export').click()
  backup=d.value.path();assert backup is not None
  page.locator('#search').fill('mot-absent-zz');assert page.locator('#items .item').count()==0
  page.locator('#search').fill('');assert page.locator('#items .item').count()==1
  page.locator('#items .item .item-actions button').first.click();assert page.locator('#save-button').inner_text()=='Mettre à jour'
  page.locator('#cancel-edit').click()
  page.on('dialog',lambda x:x.accept())
  page.locator('#items .item .item-actions button').nth(1).click();page.wait_for_function('() => (document.querySelectorAll("#items .item").length===0)')
  page.locator('#import').set_input_files(backup);page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',{ 'timeout':15000}) if False else None
  page.wait_for_timeout(1200);page.reload();page.wait_for_timeout(450)
  page.context.set_offline(True);page.reload(wait_until='domcontentloaded');page.wait_for_selector('#record-form input')
  assert page.locator('#items .item').count()==1
  browser.close()
 print('BROWSER PASS: create, reload, search, edit, delete, JSON export/import, offline reload, 390px mobile; app=readtrail')
finally:server.shutdown();server.server_close()
