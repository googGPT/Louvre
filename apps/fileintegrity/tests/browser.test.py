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
   context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
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
   context.set_offline(False)

   # --- Langues : détection, 7 langues, arabe de droite à gauche, fichier et empreinte conservés.
   intl=browser.new_context(viewport={'width':390,'height':844},locale='de-DE')
   ip=intl.new_page();ip.on('pageerror',lambda e:errors.append(str(e)))
   ip.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
   assert ip.evaluate('() => LouvreI18n.lang')=='de'
   assert ip.locator('#louvre-currency').count()==0  # appli sans argent
   assert ip.locator('#digest').inner_text()=='Warte auf eine Datei'
   ip.locator('#file').set_input_files({'name':'bonjour.txt','mimeType':'text/plain','buffer':data})
   ip.locator('#expected').fill(h)
   ip.locator('#calculate').click()
   ip.wait_for_function(f"document.querySelector('#digest').textContent.trim()==='{h}'")
   assert 'Übereinstimmung' in ip.locator('#comparison').inner_text()
   heads={'fr':'Résultat cryptographique','en':'Cryptographic result','es':'Resultado criptográfico','ar':'النتيجة التشفيرية','pt':'Resultado criptográfico','de':'Kryptografisches Ergebnis','it':'Risultato crittografico'}
   for lang in ['fr','en','es','ar','pt','de','it']:
    ip.locator('#louvre-lang').select_option(lang)
    assert ip.evaluate('() => document.documentElement.lang')==lang
    assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
    wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
      [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
        .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
    assert not wide,f'débordement en {lang} : {wide}'
    assert ip.locator('.right h2').inner_text()==heads[lang]
    assert ip.locator('#digest').inner_text().strip()==h and ip.locator('#expected').input_value()==h
    assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
   assert 'Corrispondenza' in ip.locator('#comparison').inner_text()
   ip.locator('#louvre-lang').select_option('en')
   assert ip.locator('#filesize').inner_text()=='0.0 KB'
   ip.locator('#expected').fill('abcd');ip.locator('#calculate').click()
   ip.wait_for_function("document.querySelector('#message').textContent.length>0")
   assert ip.locator('#message').inner_text()=='A SHA-256 checksum has exactly 64 hexadecimal digits.'
   assert not errors,errors
   browser.close()
  print('BROWSER PASS FileIntegrity: SHA256, match/mismatch, download, offline, mobile, 7 languages, RTL')
 finally:server.shutdown()
if __name__=='__main__':run()
