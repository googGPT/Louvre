"""RoomSketch Chromium integration: dimensional fidelity, collisions, dragging, SVG/JSON, recovery."""
import os
import functools
import http.server
import json
import pathlib
import threading
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect

ROOT=pathlib.Path(__file__).resolve().parents[1]
KEY='louvre-wave2-roomsketch-v1'

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),
        functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page()
            errors=[];external=[];dialogs=[]
            origin=f'http://127.0.0.1:{server.server_port}/'
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:external.append(r.url)
                if r.url.startswith('http') and not r.url.startswith(origin) else None)
            def allow(dialog):
                dialogs.append(dialog.message);dialog.accept()
            page.on('dialog',allow)
            page.goto(origin,wait_until='domcontentloaded')
            expect(page.locator('#plan-view')).to_be_visible()
            assert page.title().startswith('RoomSketch')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
            assert page.locator('#area-room').inner_text()=='20,00 m²'
            assert page.locator('#area-free').inner_text()=='20,00 m²'
            assert page.locator('#plan-view').get_attribute('viewBox')=='0 0 500 400'
            assert page.locator('#object-count').inner_text()=='0 / 60'

            # Deterministic automatic placement, metric area and persistent JSON.
            page.locator('#furniture-kind').select_option('table')
            page.locator('#add-furniture').click()
            expect(page.locator('#plan-view g[data-id]')).to_have_count(1)
            assert page.locator('#area-filled').inner_text()=='0,84 m²'
            assert page.locator('#area-free').inner_text()=='19,16 m²'
            page.locator('#furniture-kind').select_option('chair')
            page.locator('#add-furniture').click()
            expect(page.locator('#plan-view g[data-id]')).to_have_count(2)
            assert page.locator('#area-filled').inner_text()=='1,09 m²'
            assert page.locator('#area-free').inner_text()=='18,91 m²'
            furniture=page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects')
            assert [(x['x'],x['y']) for x in furniture]==[(0,0),(120,0)]
            chair_id=furniture[1]['id']
            assert page.locator('#selected-id').input_value()==chair_id

            # Numeric position editing, hard collision rejection with atomic rollback.
            page.locator('#edit-x').fill('170')
            page.locator('#apply-furniture').click()
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1].x')==170
            page.locator('#edit-x').fill('100')
            page.locator('#apply-furniture').click()
            assert 'Collision' in page.locator('#feedback').inner_text()
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1].x')==170
            page.locator('#edit-x').fill('120')
            page.locator('#apply-furniture').click()
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1].x')==120

            # Keyboard is accessible without drag, incl. precision 1 cm.
            page.locator('#plan-view').focus()
            page.locator('#plan-view').press('ArrowRight')
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1].x')==130
            page.locator('#plan-view').press('Shift+ArrowLeft')
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1].x')==129
            page.locator('#rotate-furniture').click()
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1].rotation')==90

            # Rotation of rectangular furniture changes axis bounds but never its area.
            table_id=furniture[0]['id']
            page.locator('#selected-id').select_option(table_id)
            page.locator('#rotate-furniture').click()
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[0].rotation')==90
            table_rect=page.locator('#plan-view g[data-id="'+table_id+'"] rect')
            assert table_rect.get_attribute('width')=='70'
            assert table_rect.get_attribute('height')=='120'
            assert page.locator('#area-filled').inner_text()=='1,09 m²'
            page.locator('#selected-id').select_option(chair_id)

            # Pointer drag uses true SVG user coordinates; drag to a free area.
            rect=page.locator('#plan-view g[data-id="'+chair_id+'"] rect')
            # On a 390px viewport the canvas is below the tall editor: scroll to
            # the actual target before using viewport-relative Playwright mouse coordinates.
            rect.scroll_into_view_if_needed()
            bounds=rect.bounding_box()
            assert bounds is not None
            px=bounds['x']+bounds['width']/2
            py=bounds['y']+bounds['height']/2
            page.mouse.move(px,py)
            page.mouse.down()
            page.mouse.move(px+35,py+20,steps=7)
            page.mouse.up()
            moved=page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).objects[1]')
            assert moved['x']>129 and moved['y']>0,moved
            assert page.locator('#plan-view g[data-id]').count()==2

            # Invalid room resize never clips a piece; keep prior dimensions.
            page.locator('#room-width').fill('200')
            page.locator('#room-depth').fill('200')
            page.locator('#resize-room').click()
            assert page.evaluate('JSON.parse(localStorage.getItem("'+KEY+'")).room.width')==500
            assert 'hors de la pièce' in page.locator('#feedback').inner_text()

            # Export true SVG, verify XML parser and exact geometry independent of UI.
            with page.expect_download() as d:page.locator('#export-svg').click()
            svg=pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            svg_root=ET.fromstring(svg)
            assert svg_root.attrib['viewBox']=='0 0 500 400'
            assert svg_root.attrib['width']=='1000'
            assert svg_root.attrib['height']=='800'
            xmlns={'s':'http://www.w3.org/2000/svg'}
            groups=svg_root.findall('.//s:g',xmlns)
            assert len(groups)==2
            table_svg=next(g for g in groups if g.attrib.get('data-id')==table_id)
            assert table_svg.find('s:rect',xmlns).attrib['width']=='70'
            assert table_svg.find('s:rect',xmlns).attrib['height']=='120'
            with page.expect_download() as d:page.locator('#export-json').click()
            backup=pathlib.Path(d.value.path()).read_bytes()
            archive=json.loads(backup)
            assert archive['version']==1 and len(archive['objects'])==2
            assert archive['objects'][1]['x']==moved['x']

            # HTML and SVG injection are treated as text.
            page.locator('#edit-label').fill('<img src=x onerror=alert(1)>')
            page.locator('#apply-furniture').click()
            assert page.locator('#plan-view img').count()==0
            assert '<img src=x' in page.locator('#plan-view').text_content()
            with page.expect_download() as d:page.locator('#export-svg').click()
            exported=pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert '&lt;img src=x onerror=alert(1)&gt;' in exported
            assert '<img' not in exported

            # Simulated storage quota must never leave phantom furniture.
            page.evaluate("""() => {
              window._realSet=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw Error('quota simulated');};
            }""")
            page.locator('#furniture-kind').select_option('chair')
            page.locator('#add-furniture').click()
            assert 'Modification refusée' in page.locator('#feedback').inner_text()
            assert page.locator('#object-count').inner_text()=='2 / 60'
            page.evaluate('() => Storage.prototype.setItem=window._realSet')

            # Corrupted storage is blocked; backup raw bytes; JSON recovery is atomic.
            page.evaluate('() => localStorage.setItem("'+KEY+'","BROKEN_JSON")')
            page.reload(wait_until='domcontentloaded')
            assert page.locator('#warning').is_visible()
            assert page.locator('#add-furniture').is_disabled()
            assert page.locator('#export-svg').is_disabled()
            with page.expect_download() as d:page.locator('#raw-export').click()
            assert pathlib.Path(d.value.path()).read_text()=='BROKEN_JSON'

            page.locator('#import-file').set_input_files({
                'name':'invalid.json','mimeType':'application/json','buffer':b'not-json'})
            expect(page.locator('#feedback')).to_contain_text('Import refusé')
            assert page.locator('#warning').is_visible()
            # Imported overlapping objects are rejected and old bytes remain.
            invalid=dict(archive)
            invalid['objects']=[dict(archive['objects'][0]),dict(archive['objects'][1])]
            invalid['objects'][1]['x']=0
            invalid['objects'][1]['y']=0
            page.locator('#import-file').set_input_files({
                'name':'overlap.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
            expect(page.locator('#feedback')).to_contain_text('Collision')
            assert page.evaluate('localStorage.getItem("'+KEY+'")')=='BROKEN_JSON'

            # Failed write cannot unlock invalid storage.
            page.evaluate("""() => {
              window._realSet=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw Error('quota simulated');};
            }""")
            page.locator('#import-file').set_input_files({
                'name':'good.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#feedback')).to_contain_text('Restauration refusée')
            assert page.locator('#warning').is_visible()
            page.evaluate('() => Storage.prototype.setItem=window._realSet')
            page.locator('#import-file').set_input_files({
                'name':'good.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#plan-view g[data-id]')).to_have_count(2)

            # Print stylesheet and static shell survive offline reload.
            page.evaluate('() => { window._printCount=0;window.print=()=>window._printCount++; }')
            page.locator('#print-plan').click()
            assert page.evaluate('window._printCount')==1
            page.emulate_media(media='print')
            assert page.locator('#plan-view').evaluate('(e)=>getComputedStyle(e).visibility')=='visible'
            assert page.locator('.top').evaluate('(e)=>getComputedStyle(e).visibility')=='hidden'
            page.emulate_media(media='screen')
            page.wait_for_function('() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)',timeout=20000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            expect(page.locator('#plan-view g[data-id]')).to_have_count(2)
            assert page.locator('#area-filled').inner_text()=='1,09 m²'
            assert not external,external
            assert not errors,errors
            browser.close()
        print('BROWSER PASS RoomSketch: metric scale, collisions, 90° rotation, keyboard, drag, SVG XML, JSON, XSS, invalid backups, quota, A4 print, mobile 390px, offline')
    finally:
        server.shutdown()
        server.server_close()

if __name__=='__main__':main()
