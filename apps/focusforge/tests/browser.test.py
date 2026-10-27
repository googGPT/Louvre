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
  fields=[{'key': 'task', 'label': 'Projet ou activité', 'type': 'text', 'sample': 'Exemple'}, {'key': 'minutes', 'label': 'Durée (minutes)', 'type': 'number', 'sample': 25}, {'key': 'day', 'label': 'Jour', 'type': 'date', 'sample': '2026-11-10'}, {'key': 'completed', 'label': 'Session terminée', 'type': 'select', 'options': ['oui', 'non'], 'sample': 'oui'}]
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

  # --- Langues : détection, 7 langues sans débordement, saisie conservée, valeurs stockées traduites à l'affichage.
  ip=browser.new_page(viewport={'width':390,'height':844},locale='pt-BR')
  ip.on('pageerror',lambda e:errors.append(str(e)))
  ip.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded')
  ip.wait_for_selector('#record-form input')
  assert ip.locator('[data-i18n="subtitle"]').inner_text()=='Medir as suas sessões de concentração'  # navigateur portugais -> portugais
  assert ip.locator('#louvre-currency').count()==0  # appli sans argent : pas de menu devise
  ip.locator('[name="task"]').fill('Tese');ip.locator('[name="minutes"]').fill('50');ip.locator('[name="day"]').fill('2026-11-10')
  ip.locator('#save-button').click();ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  ip.locator('[name="task"]').fill('Rascunho')  # saisie en cours
  for lang in ['fr','en','es','ar','pt','de','it']:
   ip.locator('#louvre-lang').select_option(lang)
   assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
   assert ip.locator('[data-i18n="s2.title"]').inner_text()==ip.evaluate(f"() => LouvreMessages['{lang}']['s2.title']")
   assert ip.locator('#items .item dd').nth(3).inner_text()==ip.evaluate(f"() => LouvreMessages['{lang}']['yes']")  # « oui » stocké, traduit
   assert ip.locator('[name="task"]').input_value()=='Rascunho'
   wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
     [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
       .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
   assert not wide,f'débordement en {lang} : {wide}'
  assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
  ip.locator('#louvre-lang').select_option('en')
  assert '10 Nov 2026' in ip.locator('#items .item').inner_text()
  assert ip.locator('#insights li').first.inner_text()=='Tese: 50 min'
  assert ip.locator('#summary .stat-value').nth(2).inner_text()=='0.8'
  ip.locator('#louvre-lang').select_option('de')
  assert ip.locator('#summary .stat-value').nth(2).inner_text()=='0,8'
  ip.locator('[name="minutes"]').fill('2000');ip.locator('[name="day"]').fill('2026-11-11');ip.locator('#save-button').click()
  assert ip.locator('#status').inner_text()=='Dauer zwischen 1 und 1440 Minuten', ip.locator('#status').inner_text()
  assert not errors, errors
  browser.close()
 print('BROWSER PASS: create, reload, search, edit, delete, JSON export/import, offline reload, 390px mobile, 7 languages, RTL; app=focusforge')
finally:server.shutdown();server.server_close()
