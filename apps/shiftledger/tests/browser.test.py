import functools,http.server,threading,pathlib,json
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def run():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
   page.locator('#date').fill('2026-10-26');page.locator('#start').fill('09:00');page.locator('#end').fill('17:30');page.locator('#break').fill('30');page.locator('#label').fill('Service du matin')
   page.locator('#add').click();page.wait_for_function("document.querySelectorAll('.entry').length===1")
   assert '8 h 00' in page.locator('#hours').inner_text()
   page.reload(wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('.entry').length===1")
   with page.expect_download() as d:page.locator('#export').click()
   data=pathlib.Path(d.value.path()).read_bytes();assert len(json.loads(data)['shifts'])==1
   page.on('dialog',lambda dialog:dialog.accept())
   page.locator('.entry button').click();page.wait_for_function("document.querySelectorAll('.entry').length===0")
   page.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':data})
   page.wait_for_function("document.querySelectorAll('.entry').length===1")
   assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
   page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null",timeout=12000)
   context.set_offline(True);page.reload(wait_until='domcontentloaded')
   assert page.locator('.entry').count()==1
   assert not errors,errors
   context.set_offline(False);browser.close()
  print('BROWSER PASS ShiftLedger: times, paid break, persistence, JSON restore, offline, mobile')
 finally:server.shutdown()
if __name__=='__main__':run()
