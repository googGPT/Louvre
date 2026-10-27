"""ImageShrink: Chromium E2E — real canvas decode, output, privacy and offline."""
import os
import base64
import functools
import http.server
import pathlib
import threading
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[1]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

def run():
    server=http.server.ThreadingHTTPServer(
        ('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(
                headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            context=browser.new_context(
                viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page()
            errors=[]
            outside=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('request',lambda req:outside.append(req.url)
                    if req.url.startswith('http') and
                    not req.url.startswith(f'http://127.0.0.1:{server.server_port}/')
                    else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            page.locator('#file-input').wait_for(state='attached')
            assert page.title().startswith('ImageShrink')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2')

            # PNG synthétique entièrement local : moitié gauche opaque, droite transparente.
            png_base64=page.evaluate("""() => {
              const c=document.createElement('canvas');c.width=640;c.height=320;
              const ctx=c.getContext('2d');
              ctx.fillStyle='#ff0000';ctx.fillRect(0,0,320,320);
              return c.toDataURL('image/png').split(',')[1];
            }""")
            png=base64.b64decode(png_base64)
            page.locator('#file-input').set_input_files({
                'name':'portrait.png','mimeType':'image/png','buffer':png})
            assert page.locator('.file-card').count()==1
            assert page.locator('#process').is_enabled()

            # WebP : respect du ratio, vraie réduction de 640x320 à 320x160.
            page.locator('#max-width').fill('320')
            page.locator('#max-width').dispatch_event('change')
            page.locator('#max-height').fill('320')
            page.locator('#max-height').dispatch_event('change')
            page.locator('#process').click()
            page.locator('.result-card').first.wait_for(timeout=25000)
            assert '640 × 320 → 320 × 160' in page.locator('.result-details').inner_text()
            assert page.locator('.result-card .download').count()==1
            assert page.locator('#progress').inner_text()==''
            result=page.evaluate("""async()=>{
              const link=document.querySelector('.result-card .download');
              const blob=await (await fetch(link.href)).blob();
              const img=await createImageBitmap(blob);
              const d={type:blob.type,size:blob.size,width:img.width,
                height:img.height,name:link.download};img.close();return d;
            }""")
            assert result['type']=='image/webp'
            assert (result['width'],result['height'])==(320,160)
            assert result['name']=='portrait-imageshrink.webp'
            assert result['size']>0

            with page.expect_download() as d:
                page.locator('.download').click()
            assert d.value.suggested_filename=='portrait-imageshrink.webp'
            assert pathlib.Path(d.value.path()).stat().st_size>0

            # JPEG : le canal alpha de PNG est aplati sur blanc.
            page.locator('#format').select_option('image/jpeg')
            assert page.locator('.result-card').count()==0
            page.locator('#quality').fill('0.65')
            page.locator('#quality').dispatch_event('change')
            page.locator('#process').click()
            page.locator('.result-card').first.wait_for(timeout=25000)
            pixel=page.evaluate("""async()=>{
              const l=document.querySelector('.result-card .download');
              const blob=await (await fetch(l.href)).blob();
              const bmp=await createImageBitmap(blob);
              const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
              const x=c.getContext('2d');x.drawImage(bmp,0,0);
              const rgb=Array.from(x.getImageData(240,80,1,1).data);
              bmp.close();return {rgb,type:blob.type,name:l.download};
            }""")
            assert pixel['type']=='image/jpeg'
            assert pixel['name']=='portrait-imageshrink.jpg'
            assert all(v>=245 for v in pixel['rgb'][:3])

            # PNG : curseur de qualité sans effet; alpha conservé.
            page.locator('#format').select_option('image/png')
            assert page.locator('#quality').is_disabled()
            page.locator('#process').click()
            page.locator('.result-card').first.wait_for(timeout=25000)
            pixel=page.evaluate("""async()=>{
              const l=document.querySelector('.result-card .download');
              const blob=await (await fetch(l.href)).blob();
              const bmp=await createImageBitmap(blob);
              const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
              const x=c.getContext('2d');x.drawImage(bmp,0,0);
              const rgba=Array.from(x.getImageData(240,80,1,1).data);
              bmp.close();return {rgba,type:blob.type};
            }""")
            assert pixel['type']=='image/png' and pixel['rgba'][3]==0

            # Plusieurs fichiers : deux résultats et pas de fuite de requêtes externes.
            page.locator('#format').select_option('image/webp')
            page.locator('#file-input').set_input_files([
                {'name':'img1.png','mimeType':'image/png','buffer':png},
                {'name':'img2.png','mimeType':'image/png','buffer':png}])
            assert page.locator('.file-card').count()==2
            page.locator('#process').click()
            page.wait_for_function("document.querySelectorAll('.result-card').length===2",timeout=30000)
            assert '2 image(s) traitée(s)' in page.locator('#feedback').inner_text()
            assert page.locator('.download').count()==2

            # Lot rejeté : format SVG et faux contenu bloqués.
            page.locator('#file-input').set_input_files({
                'name':'malveillant.svg','mimeType':'image/svg+xml',
                'buffer':b'<svg xmlns="http://www.w3.org/2000/svg"/>'})
            assert 'Format source non accepté' in page.locator('#feedback').inner_text()
            assert page.locator('.file-card').count()==2
            # Fichier MIME annoncé PNG mais illisible au décodage.
            page.locator('#file-input').set_input_files({
                'name':'faux.png','mimeType':'image/png','buffer':b'<html>fake</html>'})
            page.locator('#process').click()
            page.wait_for_function("document.querySelector('#process').disabled===false",timeout=20000)
            assert page.locator('.result-card').count()==0
            assert '1 échec(s)' in page.locator('#feedback').inner_text()

            # Annuler / effacer les résultats et vider les images de la session.
            page.locator('#reset').click()
            assert page.locator('.file-card').count()==0
            assert page.locator('.result-card').count()==0
            assert page.locator('#process').is_disabled()

            # Pas de données d'images persistées dans le localStorage.
            assert page.evaluate("Object.keys(localStorage).filter(k=>/imageshrink/i.test(k)).length")==0
            page.wait_for_function("navigator.serviceWorker.controller !== null",timeout=20000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            assert page.locator('main').count()==1
            assert page.locator('.file-card').count()==0
            assert page.locator('#process').is_disabled()
            assert not errors,errors
            assert not outside,outside
            browser.close()
        print('BROWSER PASS ImageShrink: WebP dimension/output/download, JPEG alpha flatten, PNG transparency, 2 images, unsafe MIME, corrupted file, no persistence, mobile 390px, offline')
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':run()
