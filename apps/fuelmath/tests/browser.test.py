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
  fields=[{'key': 'route', 'label': 'Trajet', 'type': 'text', 'sample': 'Exemple'}, {'key': 'km', 'label': 'Distance (km)', 'type': 'number', 'sample': 180}, {'key': 'litres', 'label': 'Consommation (L/100 km)', 'type': 'number', 'sample': 6.2}, {'key': 'price', 'label': 'Prix du litre (€)', 'type': 'number', 'sample': 1.8}, {'key': 'people', 'label': 'Passagers', 'type': 'number', 'sample': 2}]
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
  assert '20,09' in page.locator('#summary').inner_text()  # 180 km × 6,2 L × 1,80 € en français, euros

  # --- Langues : détection, 7 langues sans débordement, devise choisie, saisie conservée.
  ip=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True,locale='es-MX')
  ip.on('pageerror',lambda e:errors.append(str(e)))
  ip.on('dialog',lambda x:x.accept())
  ip.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded')
  ip.wait_for_selector('#record-form input')
  assert ip.locator('[data-i18n="subtitle"]').inner_text()=='Estimar un viaje en coche'  # navigateur espagnol -> espagnol
  assert ip.evaluate('() => LouvreI18n.currency')=='MXN'  # Mexique -> peso
  for k,v in [('route','Ida'),('km','180'),('litres','6.2'),('price','1.8'),('people','2')]:ip.locator(f'[name="{k}"]').fill(v)
  assert 'MXN' in ip.locator('#estimate-preview').inner_text()  # espagnol (es-ES) : « 20,09 MXN »
  ip.locator('[name="returnTrip"]').select_option('Aller-retour')
  for lang in ['fr','en','es','ar','pt','de','it']:
   ip.locator('#louvre-lang').select_option(lang)
   assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
   assert ip.locator('[data-i18n="s2.title"]').inner_text()==ip.evaluate(f"() => LouvreMessages['{lang}']['s2.title']")
   assert ip.locator('#fields label span').first.inner_text()==ip.evaluate(f"() => LouvreMessages['{lang}']['field.route']")
   assert ip.locator('[name="route"]').input_value()=='Ida' and ip.locator('[name="returnTrip"]').input_value()=='Aller-retour'
   wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
     [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
       .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
   assert not wide,f'débordement en {lang} : {wide}'
  assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
  ip.locator('#louvre-lang').select_option('en')
  ip.locator('#louvre-currency').select_option('GBP')
  assert '£40.18' in ip.locator('#estimate-preview').inner_text(), ip.locator('#estimate-preview').inner_text()
  assert 'Price per litre (£)' in ip.locator('#fields').inner_text()
  assert ip.locator('[name="returnTrip"] option:checked').inner_text()=='Return'
  ip.locator('#save-button').click();ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  assert 'Return' in ip.locator('#items .item').inner_text() and '£1.80' in ip.locator('#items .item').inner_text()
  ip.locator('#louvre-lang').select_option('de')
  for k,v in [('route','Retour'),('km','10'),('litres','5'),('price','2'),('people','0')]:ip.locator(f'[name="{k}"]').fill(v)
  ip.locator('#save-button').click()
  assert ip.locator('#status').inner_text()=='Personen: ganze Zahl zwischen 1 und 100', ip.locator('#status').inner_text()
  with ip.expect_download() as d:ip.locator('#export-csv').click()
  assert 'Gesamtkosten (GBP)' in Path(d.value.path()).read_text(encoding='utf-8-sig')
  assert not errors, errors
  browser.close()
 print('BROWSER PASS: create, reload, search, edit, delete, JSON export/import, offline reload, 390px mobile, 7 languages, RTL, currency; app=fuelmath')
finally:server.shutdown();server.server_close()
