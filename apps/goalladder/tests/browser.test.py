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
  fields=[{'key': 'goal', 'label': 'Objectif', 'type': 'text', 'sample': 'Exemple'}, {'key': 'milestone', 'label': 'Étape', 'type': 'text', 'sample': 'Exemple'}, {'key': 'due', 'label': 'Échéance', 'type': 'date', 'sample': '2026-11-10'}, {'key': 'done', 'label': 'Terminée ?', 'type': 'select', 'options': ['non', 'oui'], 'sample': 'non'}, {'key': 'priority', 'label': 'Priorité', 'type': 'select', 'options': ['haute', 'normale', 'basse'], 'sample': 'haute'}]
  for fld in fields:
   typ=fld['type'];v=fld.get('sample')
   if typ=='select':page.locator('[name="'+fld['key']+'"]').select_option(str(v))
   else:page.locator('[name="'+fld['key']+'"]').fill(str(v))
  page.locator('#save-button').click();page.wait_for_function('document.querySelectorAll("#items .item").length===1')
  page.reload();page.wait_for_function('document.querySelectorAll("#items .item").length===1')
  assert not errors, errors
  assert page.locator('body').evaluate('(e)=>e.scrollWidth <= innerWidth+2')
  with page.expect_download(timeout=10000) as d:page.locator('#export').click()
  backup=d.value.path();assert backup is not None
  page.locator('#search').fill('mot-absent-zz');assert page.locator('#items .item').count()==0
  page.locator('#search').fill('');assert page.locator('#items .item').count()==1
  page.locator('#items .item .item-actions button').first.click();assert page.locator('#save-button').inner_text()=='Enregistrer les modifications'
  page.locator('#cancel-edit').click()
  page.on('dialog',lambda x:x.accept())
  page.locator('#items .item .item-actions button').nth(1).click();page.wait_for_function('document.querySelectorAll("#items .item").length===0')
  page.locator('#import').set_input_files(backup);page.wait_for_function('document.querySelectorAll("#items .item").length===1')
  # Régression : nom d'objectif réservé et échéance réellement dépassée.
  past=page.evaluate("() => AppLogic.addDays(AppLogic.dayKey(), -3)")
  page.locator('[name="goal"]').fill('__proto__')
  page.locator('[name="milestone"]').fill('Étape en retard')
  page.locator('[name="due"]').fill(past)
  page.locator('[name="done"]').select_option('non')
  page.locator('[name="priority"]').select_option('haute')
  page.locator('#save-button').click()
  page.wait_for_function('document.querySelectorAll("#items .item").length===2')
  assert page.locator('#summary .stat-value').first.inner_text()=='2'
  assert page.locator('#summary .stat-value').nth(3).inner_text()=='1'
  assert page.locator('#goal-progress .goal-card').count()==2
  page.locator('#filter-status').select_option('overdue')
  assert page.locator('#items .item').count()==1
  page.locator('#items .item').get_by_role('button',name='Marquer terminée').click()
  assert page.locator('#items .item').count()==0
  assert page.locator('#summary .stat-value').nth(3).inner_text()=='0'
  page.locator('#filter-status').select_option('done')
  assert page.locator('#items .item').count()==1
  page.locator('#items .item').get_by_role('button',name='Rouvrir').click()
  page.locator('#filter-status').select_option('all')
  assert page.locator('#summary .stat-value').nth(3).inner_text()=='1'
  # L'export CSV n'exécute aucune formule issue d'un nom d'objectif.
  page.locator('[name="goal"]').fill('=HYPERLINK("https://example.invalid")')
  page.locator('[name="milestone"]').fill('Injection CSV')
  page.locator('[name="due"]').fill(past)
  page.locator('#save-button').click()
  page.wait_for_function('document.querySelectorAll("#items .item").length===3')
  with page.expect_download(timeout=10000) as d2:page.locator('#export-csv').click()
  csv=Path(d2.value.path()).read_text(encoding='utf-8-sig')
  assert "\"'=HYPERLINK" in csv
  # Un stockage corrompu reste protégé après un import invalide.
  page.evaluate("() => localStorage.setItem('louvre-factory:goalladder:v1','not valid JSON')")
  page.reload()
  assert page.locator('#warning').is_visible()
  page.locator('#import').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'not json'})
  assert 'Import refusé' in page.locator('#status').inner_text()
  assert page.locator('#warning').is_visible()
  page.locator('#import').set_input_files(backup)
  page.wait_for_function('document.querySelectorAll("#items .item").length===1')
  assert page.locator('#warning').is_hidden()
  page.reload()
  page.wait_for_function("navigator.serviceWorker.controller !== null",timeout=15000)
  page.wait_for_timeout(1200);page.reload();page.wait_for_timeout(450)
  page.context.set_offline(True);page.reload(wait_until='domcontentloaded');page.wait_for_selector('#record-form input')
  assert page.locator('#items .item').count()==1
  browser.close()
 print('BROWSER PASS: dashboard, deadlines, special goal names, completion, CSV, corrupt JSON recovery, offline, 390px; app=goalladder')
finally:server.shutdown();server.server_close()
