import functools,http.server,threading,pathlib
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
   page.locator('#source').fill('Article,Prix\n Thé ,3\nThé,3\nCafé,4')
   page.locator('#run').click()
   assert page.locator('#before').inner_text()=='3'
   assert page.locator('#after').inner_text()=='2'
   assert page.locator('#removed').inner_text()=='1'
   assert page.locator('#preview-table tbody tr').count()==2
   with page.expect_download() as d:page.locator('#download').click()
   assert 'Café' in pathlib.Path(d.value.path()).read_text()
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
   page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null",timeout=12000)
   context.set_offline(True);page.reload(wait_until='domcontentloaded')
   assert page.locator('#run').is_visible()
   context.set_offline(False)
   assert not errors,errors
   browser.close()
  print('BROWSER PASS CSVClinic: parsing, deduplication, CSV download, offline, mobile')
 finally: server.shutdown()
if __name__=='__main__':run()
