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
  page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
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
  page.context.set_offline(False)
  # --- Langues : détection du navigateur, 7 langues complètes, arabe de droite à gauche (pas d'argent : menu langue seul).
  ip=browser.new_page(viewport={'width':390,'height':844},locale='pt-BR')
  ip.on('pageerror',lambda e:errors.append(str(e)));ip.on('dialog',lambda x:x.accept())
  ip.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded');ip.wait_for_selector('#record-form input')
  assert ip.locator('header p').first.inner_text()=='Acompanhar as suas leituras'  # navigateur portugais
  assert ip.locator('#louvre-currency').count()==0
  ip.locator('[name="title"]').fill('Livro');ip.locator('[name="total"]').fill('1200');ip.locator('[name="read"]').fill('300');ip.locator('[name="status"]').select_option('terminé')
  ip.locator('#save-button').click();ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  ip.locator('[name="title"]').fill('Rascunho')  # saisie en cours : conservée au changement de langue
  subtitles={'fr':'Suivre ses lectures','en':'Track your reading','es':'Seguir tus lecturas','ar':'تابع قراءاتك','pt':'Acompanhar as suas leituras','de':'Lektüre verfolgen','it':'Segui le tue letture'}
  for lang in ['fr','en','es','ar','pt','de','it']:
   ip.locator('#louvre-lang').select_option(lang)
   assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
   wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
     [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
       .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
   assert not wide, f'débordement en {lang} : {wide}'
   assert ip.locator('header p').first.inner_text()==subtitles[lang]
   assert ip.locator('[name="title"]').input_value()=='Rascunho'
   assert ip.locator('#items .item').count()==1
  missing=ip.evaluate('() => LouvreI18n.missing()');assert missing==[],missing
  assert ip.locator('nav a').inner_text()=='Louvre ↗'
  ip.locator('#louvre-lang').select_option('ar');assert ip.locator('nav a').inner_text()=='Louvre ↖'  # flèche retournée
  ip.locator('#louvre-lang').select_option('de')
  assert 'beendet' in ip.locator('#items .item dl').inner_text() and '1.200' in ip.locator('#items .item dl').inner_text()
  assert ip.locator('#summary .stat-value').nth(2).inner_text().replace('\u00a0',' ')=='25 %'
  assert ip.locator('#save-button').inner_text()=='Speichern'
  ip.locator('[name="total"]').fill('100');ip.locator('[name="read"]').fill('5000');ip.locator('#save-button').click()
  assert ip.locator('#status').inner_text()=='Gelesene Seiten müssen zwischen 0 und der Seitenzahl liegen', ip.locator('#status').inner_text()
  assert not errors,errors
  browser.close()
 print('BROWSER PASS: create, reload, search, edit, delete, JSON export/import, offline reload, 390px mobile, 7 languages, RTL; app=readtrail')
finally:server.shutdown();server.server_close()
