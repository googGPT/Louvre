"""QRForge end-to-end: independent QR decode of SVG+PNG in Chromium."""
import os
import functools
import http.server
import io
import pathlib
import threading
from PIL import Image
import zxingcpp
from playwright.sync_api import sync_playwright

BASE=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def decoded(png_bytes):
 image=Image.open(io.BytesIO(png_bytes)).convert('RGB')
 result=zxingcpp.read_barcode(image)
 assert result is not None,'Generated QR is not decodable by independent ZXing-C++'
 return result.text

def run():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
   context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
   page=context.new_page();errors=[];external=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   origin=f'http://127.0.0.1:{server.server_port}/'
   page.on('request',lambda req:external.append(req.url) if req.url.startswith('http') and not req.url.startswith(origin) else None)
   page.goto(origin,wait_until='domcontentloaded')
   page.locator('#preview').wait_for(state='visible')
   assert page.title().startswith('QRForge')
   assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2')
   assert not page.locator('#download-png').is_disabled()

   def download_png():
    with page.expect_download() as d:page.locator('#download-png').click()
    assert d.value.suggested_filename=='qrforge-code.png'
    return pathlib.Path(d.value.path()).read_bytes()

   # QR URL: real bytes decoded by independent library, not just visual presence.
   assert decoded(download_png())=='https://example.com/'
   with page.expect_download() as d:page.locator('#download-svg').click()
   svg=pathlib.Path(d.value.path()).read_text()
   assert svg.startswith('<svg') and 'viewBox=' in svg and '<path' in svg
   assert 'https://example.com' not in svg
   # Decode SVG via native browser rasterization to validate SVG geometry.
   svg_png=page.evaluate("""async (xml)=>{
      const blob=new Blob([xml],{type:'image/svg+xml'});
      const url=URL.createObjectURL(blob);
      try{
        const img=new Image();
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
        const canvas=document.createElement('canvas');
        canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        canvas.getContext('2d').drawImage(img,0,0);
        return canvas.toDataURL('image/png').split(',')[1];
      }finally{URL.revokeObjectURL(url);}
   }""",svg)
   import base64
   assert decoded(base64.b64decode(svg_png))=='https://example.com/'

   # Text and Unicode: UTF-8 conversion in embedded encoder is essential.
   page.locator('#kind').select_option('text')
   assert page.locator('#url-fields').is_hidden()
   text='Été à Bordeaux 🌻 — 漢字'
   page.locator('#content-text').fill(text)
   assert decoded(download_png())==text

   # E-mail and telephone payloads.
   page.locator('#kind').select_option('email')
   page.locator('#email').fill('contact@example.org')
   assert decoded(download_png())=='mailto:contact@example.org'
   page.locator('#kind').select_option('telephone')
   page.locator('#telephone').fill('+33 6 12 34 56 78')
   assert decoded(download_png())=='tel:+33612345678'

   # Wi-Fi special characters escaped exactly in payload.
   page.locator('#kind').select_option('wifi')
   page.locator('#ssid').fill('Reseau;Maison')
   assert page.locator('#wifi-password').get_attribute('type')=='password'
   page.locator('#toggle-password').click()
   assert page.locator('#wifi-password').get_attribute('type')=='text'
   page.locator('#toggle-password').click()
   assert page.locator('#wifi-password').get_attribute('type')=='password'
   page.locator('#wifi-password').fill('mot;passe:123')
   wifi='WIFI:T:WPA;S:Reseau\\;Maison;P:mot\\;passe\\:123;;'
   assert decoded(download_png())==wifi

   # Open Wi-Fi contains no secret.
   page.locator('#security').select_option('nopass')
   assert page.locator('#wifi-password-wrapper').is_hidden()
   assert decoded(download_png())=='WIFI:T:nopass;S:Reseau\\;Maison;;'

   # Invalid output, no stale QR/download allowed.
   page.locator('#ssid').fill('')
   assert page.locator('#download-png').is_disabled()
   assert page.locator('#preview').is_hidden()
   assert 'requis' in page.locator('#status').inner_text()

   # Contrast safety; dark-on-light rule.
   page.locator('#reset').click()
   assert page.locator('#download-png').is_enabled()
   page.locator('#swap-colors').click()
   assert page.locator('#download-png').is_disabled()
   assert 'contraste' in page.locator('#status').inner_text().lower() or 'foncés' in page.locator('#status').inner_text()
   page.locator('#reset').click()

   # Input that cannot fit H cannot create misleading QR.
   page.locator('#kind').select_option('text')
   page.locator('#ecc').select_option('H')
   page.locator('#content-text').fill('a'*1600)
   assert page.locator('#download-png').is_disabled()
   assert 'volumineux' in page.locator('#status').inner_text()

   page.locator('#reset').click()
   # Static app cache only, no saved QR/SSID/passwords.
   assert page.evaluate('localStorage.length')==0
   page.wait_for_function('() => (navigator.serviceWorker && navigator.serviceWorker.controller!==null)',timeout=18000)
   context.set_offline(True)
   page.reload(wait_until='domcontentloaded')
   page.locator('#preview').wait_for(state='visible')
   assert decoded(download_png())=='https://example.com/'
   assert page.locator('#kind').input_value()=='url'
   assert not errors,errors
   assert not external,external
   browser.close()
  print('BROWSER PASS QRForge: decoded PNG+SVG URL, Unicode, email, phone, Wi-Fi escaped/open, limits, contrasts, no persistence, offline, mobile 390px')
 finally:server.shutdown();server.server_close()

if __name__=='__main__':run()
