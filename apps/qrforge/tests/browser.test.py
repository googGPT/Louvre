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
   context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
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
   context.set_offline(False)

   # --- Langues : détection automatique, 7 langues complètes, arabe de droite à gauche ; le contenu encodé ne change jamais.
   intl=browser.new_context(viewport={'width':390,'height':844},locale='de-DE',accept_downloads=True)
   ip=intl.new_page()
   ip.on('pageerror',lambda e:errors.append(str(e)))
   ip.on('request',lambda req:external.append(req.url) if req.url.startswith('http') and not req.url.startswith(origin) else None)
   ip.goto(origin,wait_until='domcontentloaded')
   ip.locator('#preview').wait_for(state='visible')
   assert ip.locator('h1').inner_text().startswith('Ein nützlicher QR-Code.'), ip.locator('h1').inner_text()  # navigateur allemand -> allemand
   assert ip.locator('#louvre-currency').count()==0  # appli sans argent : pas de menu devise
   def ip_png():
    with ip.expect_download() as d:ip.locator('#download-png').click()
    return pathlib.Path(d.value.path()).read_bytes()
   ip.locator('#kind').select_option('wifi')
   ip.locator('#ssid').fill('Café;Maison')
   ip.locator('#wifi-password').fill('mot;passe:123')
   wifi_i18n='WIFI:T:WPA;S:Café\\;Maison;P:mot\\;passe\\:123;;'
   expected={'fr':('Un QR code utile.','Réseau Wi-Fi'),'en':('A useful QR code.','Wi-Fi network'),'es':('Un código QR útil.','Red Wi-Fi'),'ar':('رمز QR مفيد.','شبكة Wi-Fi'),
             'pt':('Um código QR útil.','Rede Wi-Fi'),'de':('Ein nützlicher QR-Code.','WLAN-Netz'),'it':('Un codice QR utile.','Rete Wi-Fi')}
   for lang in ['fr','en','es','ar','pt','de','it']:
    ip.locator('#louvre-lang').select_option(lang)
    assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
    wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
      [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
        .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
    assert not wide, f'débordement en {lang} : {wide}'
    title,kind=expected[lang]
    assert ip.locator('h1').inner_text().startswith(title), (lang, ip.locator('h1').inner_text())
    assert ip.locator('#kind option:checked').inner_text()==kind, (lang, ip.locator('#kind option:checked').inner_text())
    assert ip.locator('#ssid').input_value()=='Café;Maison'  # saisie conservée
    assert ip.evaluate('() => LouvreI18n.missing()')==[], ip.evaluate('() => LouvreI18n.missing()')
    if lang in ('ar','de'):
     assert decoded(ip_png())==wifi_i18n, lang  # contenu encodé identique quelle que soit la langue
   ip.locator('#louvre-lang').select_option('en')
   with ip.expect_download() as d2:ip.locator('#download-svg').click()
   assert 'aria-label="QR code"' in pathlib.Path(d2.value.path()).read_text()
   assert 'UTF-8 bytes' in ip.locator('#result-info').inner_text(), ip.locator('#result-info').inner_text()
   ip.locator('#louvre-lang').select_option('es')
   ip.locator('#ssid').fill('')
   assert ip.locator('#status').inner_text()=='Nombre de la red Wi-Fi obligatorio', ip.locator('#status').inner_text()
   ip.locator('#toggle-password').click()
   assert ip.locator('#toggle-password').inner_text()=='Ocultar la contraseña'
   assert not errors,errors
   assert not external,external
   browser.close()
  print('BROWSER PASS QRForge: decoded PNG+SVG URL, Unicode, email, phone, Wi-Fi escaped/open, limits, contrasts, no persistence, offline, mobile 390px, 7 languages, RTL, encoded content unchanged by language')
 finally:server.shutdown();server.server_close()

if __name__=='__main__':run()
