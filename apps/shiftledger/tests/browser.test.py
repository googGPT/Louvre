"""ShiftLedger v2 — tests navigateur pour durées, heures supplémentaires et stockage."""
import os
import functools, http.server, threading, pathlib, json
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]

class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass

def run():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
   context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
   page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('dialog',lambda dialog:dialog.accept())
   page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
   page.locator('#date').wait_for()
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2')

   def form(day,begin,end,breaks,label):
    page.locator('#date').fill(day)
    page.locator('#start').fill(begin)
    page.locator('#end').fill(end)
    page.locator('#break').fill(str(breaks))
    page.locator('#label').fill(label)
    page.locator('#add').click()

   form('2026-10-26','09:00','17:30',30,'Première équipe')
   page.wait_for_function("() => (document.querySelectorAll('.entry').length===1)")
   assert '8 h 00' in page.locator('#hours').inner_text()
   assert '120' in page.locator('#pay').inner_text()
   form('2026-10-26','18:00','20:00',0,'Deuxième équipe')
   page.wait_for_function("() => (document.querySelectorAll('.entry').length===2)")
   assert '10 h 00' in page.locator('#hours').inner_text()
   assert '2 h 00' in page.locator('#overtime').inner_text()
   assert '157' in page.locator('#pay').inner_text()
   assert page.locator('#day-list .day-entry').count()==1
   assert page.locator('#overlap-warning').is_hidden()

   # Éditer un service et constater les nouvelles statistiques.
   page.locator('.entry').filter(has_text='Deuxième équipe').get_by_role('button',name='Modifier').click()
   assert page.locator('#add').inner_text()=='Mettre à jour le service'
   page.locator('#end').fill('19:00')
   page.locator('#add').click()
   assert '9 h 00' in page.locator('#hours').inner_text()
   assert '1 h 00' in page.locator('#overtime').inner_text()

   # Ajout d'un service de nuit, date du début et alerte chevauchement.
   form('2026-10-26','22:00','06:00',30,'Nuit')
   page.wait_for_function("() => (document.querySelectorAll('.entry').length===3)")
   assert '1' in page.locator('#overnight-total').inner_text()
   form('2026-10-27','05:00','07:00',0,'Chevauchement')
   page.wait_for_function("() => (document.querySelectorAll('.entry').length===4)")
   assert page.locator('#overlap-warning').is_visible()
   assert page.locator('#day-list .day-entry').count()==2
   page.locator('#search').fill('nuit')
   assert page.locator('.entry').count()==1
   page.locator('#search').fill('')
   page.locator('#month-filter').fill('2026-11')
   assert page.locator('.entry').count()==0
   page.locator('#clear-filters').click()
   assert page.locator('.entry').count()==4

   # Persistance et paramètres recalculés.
   page.reload(wait_until='domcontentloaded')
   assert page.locator('.entry').count()==4
   page.locator('#rate').fill('20')
   page.locator('#rate').dispatch_event('change')
   assert page.locator('#rate').input_value()=='20'

   # Une erreur de localStorage ne doit pas créer d'état fictif.
   page.evaluate("""() => {
    window._savedSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(){throw new Error('simulated quota');};
   }""")
   form('2026-10-28','08:00','09:00',0,'Ne doit pas être sauvé')
   assert 'Enregistrement impossible' in page.locator('#message').inner_text()
   assert page.locator('.entry').count()==4
   page.evaluate('() => { Storage.prototype.setItem = window._savedSetItem; }')
   page.reload(wait_until='domcontentloaded')
   assert page.locator('.entry').count()==4

   # Export JSON et CSV, puis suppression et restauration.
   with page.expect_download() as d: page.locator('#export').click()
   backup=pathlib.Path(d.value.path()).read_bytes()
   data=json.loads(backup)
   assert data['version']==1 and len(data['shifts'])==4
   with page.expect_download() as d: page.locator('#csv').click()
   csv=pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
   assert 'Étiquette' in csv and 'Nuit' in csv
   page.locator('.entry').first.get_by_role('button',name='Supprimer').click()
   assert page.locator('.entry').count()==3
   page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
   page.wait_for_function("() => (document.querySelectorAll('.entry').length===4)")

   # Stockage corrompu : export brut, blocage des modifications, import invalide.
   page.evaluate("() => localStorage.setItem('louvre-wave2-shiftledger-v1','NOT_JSON')")
   page.reload(wait_until='domcontentloaded')
   assert page.locator('#warning').is_visible()
   assert page.locator('#add').is_disabled()
   with page.expect_download() as d: page.locator('#export-raw').click()
   assert pathlib.Path(d.value.path()).read_text()=='NOT_JSON'
   page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'NOT_JSON'})
   assert page.locator('#warning').is_visible()
   page.evaluate("""() => {
    window._savedSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(){throw new Error('simulated quota');};
   }""")
   page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
   assert page.locator('#warning').is_visible()
   assert page.evaluate("() => localStorage.getItem('louvre-wave2-shiftledger-v1')")=='NOT_JSON'
   page.evaluate('() => { Storage.prototype.setItem = window._savedSetItem; }')
   page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
   page.wait_for_function("() => (document.querySelectorAll('.entry').length===4)")
   assert page.locator('#warning').is_hidden()

   # Vérification hors ligne une fois le service worker actif.
   page.reload(wait_until='domcontentloaded')
   page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',timeout=20000)
   context.set_offline(True)
   page.reload(wait_until='domcontentloaded')
   page.locator('#list .entry').first.wait_for()
   assert page.locator('.entry').count()==4
   assert not errors,errors
   browser.close()
  print('BROWSER PASS ShiftLedger v2: day aggregation, overnight, overlap, edit, search, CSV/JSON, transaction, corrupt recovery, offline, 390px')
 finally:server.shutdown();server.server_close()

if __name__=='__main__':run()
