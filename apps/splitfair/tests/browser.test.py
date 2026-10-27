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
  fields=[{'key': 'title', 'label': 'Dépense', 'type': 'text', 'sample': 'Exemple'}, {'key': 'payer', 'label': 'Payé par', 'type': 'text', 'sample': 'Alice'}, {'key': 'people', 'label': 'Participants (séparés par virgule)', 'type': 'text', 'sample': 'Alice, Bob'}, {'key': 'amount', 'label': 'Montant (€)', 'type': 'number', 'sample': 42}]
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
  # --- Langues : 7 langues complètes, arabe RTL, devise choisie, erreurs traduites, saisie conservée.
  intl=browser.new_context(viewport={'width':390,'height':844},locale='es-MX')
  ip=intl.new_page();ip.on('pageerror',lambda e:errors.append(str(e)));ip.on('dialog',lambda d:d.accept())
  ip.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded');ip.wait_for_selector('#record-form input')
  assert ip.locator('[data-i18n=subtitle]').inner_text()=='Compartir los gastos de forma justa'
  assert ip.evaluate('() => LouvreI18n.currency')=='MXN'
  ip.locator('[name=title]').fill('Cena');ip.locator('[name=payer]').fill('Ana');ip.locator('[name=people]').fill('Ana, Luis');ip.locator('[name=amount]').fill('30')
  ip.locator('#save-button').click();ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
  assert 'MXN' in ip.locator('#insights').inner_text() and 'Luis → Ana' in ip.locator('#insights').inner_text(),ip.locator('#insights').inner_text()
  assert 'MXN' in ip.locator('#label-amount').inner_text()
  ip.locator('[name=title]').fill('Taxi')  # typed, not saved
  labels={'fr':'Payé par','en':'Paid by','es':'Pagado por','ar':'دفعه','pt':'Pago por','de':'Bezahlt von','it':'Pagato da'}
  for lang in ['fr','en','es','ar','pt','de','it']:
   ip.locator('#louvre-lang').select_option(lang)
   assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
   wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
     [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
       .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
   assert not wide,f'débordement en {lang} : {wide}'
   assert ip.locator('#label-payer').inner_text()==labels[lang],lang
   assert ip.locator('[name=title]').input_value()=='Taxi'
   assert ip.evaluate('() => LouvreI18n.money(3000)') in ip.locator('#summary').inner_text(),lang  # 30 in the chosen currency (MXN)
  assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
  ip.locator('#louvre-lang').select_option('ar')
  ip.locator('[name=title]').fill('عشاء');ip.locator('[name=payer]').fill('سارة');ip.locator('[name=people]').fill('سارة، يوسف');ip.locator('[name=amount]').fill('20')
  ip.locator('#save-button').click();ip.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
  assert 'يحوّل يوسف إلى سارة' in ip.locator('#insights').inner_text(),ip.locator('#insights').inner_text()  # Arabic comma accepted
  ip.locator('#louvre-lang').select_option('en');ip.locator('#louvre-currency').select_option('EUR')
  assert '€' in ip.locator('#summary').inner_text()
  ip.locator('#louvre-lang').select_option('es')
  ip.locator('[name=title]').fill('X');ip.locator('[name=payer]').fill('   ');ip.locator('[name=people]').fill('A');ip.locator('[name=amount]').fill('5')
  ip.locator('#save-button').click()
  assert ip.locator('#status').inner_text()=='Pagado por: texto obligatorio (160 caracteres como máximo)',ip.locator('#status').inner_text()
  assert not errors,errors
  browser.close()
 print('BROWSER PASS: create, reload, search, edit, delete, JSON export/import, offline reload, 390px mobile, 7 languages, RTL, currency; app=splitfair')
finally:server.shutdown();server.server_close()
