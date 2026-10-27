import os
import functools,http.server,threading,pathlib,hashlib
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def run():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
   context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
   data=b'bonjour';h=hashlib.sha256(data).hexdigest()
   page.locator('#file').set_input_files({'name':'bonjour.txt','mimeType':'text/plain','buffer':data})
   page.locator('#expected').fill(h)
   page.locator('#calculate').click()
   page.wait_for_function(f"document.querySelector('#digest').textContent.trim()==='{h}'")
   assert 'Correspondance' in page.locator('#comparison').inner_text()
   with page.expect_download() as d:page.locator('#download').click()
   assert h in pathlib.Path(d.value.path()).read_text()
   page.locator('#expected').fill('0'*64);page.locator('#expected').dispatch_event('change')
   assert 'Différence détectée' in page.locator('#comparison').inner_text()
   assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
   page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)",timeout=12000)
   context.set_offline(True);page.reload(wait_until='domcontentloaded')
   assert page.locator('#dropzone').is_visible()
   assert not errors,errors
   context.set_offline(False);browser.close()
  print('BROWSER PASS FileIntegrity: SHA256, match/mismatch, download, offline, mobile')
 finally:server.shutdown()
if __name__=='__main__':run()
