"""End-to-end smoke for ParkWise: Chrome, persistence, export/restore, GPS, PWA offline."""
import os
import http.server, functools, threading, pathlib, json
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR',geolocation={'latitude':44.839,'longitude':-0.579},permissions=['geolocation'])
            ctx.set_default_timeout(12000)
            page=ctx.new_page();errors=[]
            page.on('pageerror',lambda e: errors.append(str(e)))
            page.goto(url,wait_until='domcontentloaded')
            assert page.title().startswith('ParkWise')
            page.locator('#new-spot').click()
            page.locator('#spot-form [name=name]').fill('Parking Test A')
            page.locator('#spot-form [name=address]').fill('Rue test')
            page.locator('#spot-form [name=rate]').fill('2.50')
            page.locator('#spot-form [name=walk]').fill('3')
            page.locator('#spot-form button[type=submit]').click()
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 1)")
            page.locator('#new-spot').click()
            page.locator('#spot-form [name=name]').fill('Parking Test B')
            page.locator('#spot-form [name=rate]').fill('1')
            page.locator('#spot-form [name=walk]').fill('15')
            page.locator('#spot-form button[type=submit]').click()
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 2)")
            page.locator('#duration').select_option('120')
            page.locator('#value-time').select_option('0')
            page.wait_for_function("() => (document.querySelector('.result .result-title').textContent === 'Parking Test B')")
            page.locator('#value-time').select_option('20')
            page.wait_for_function("() => (document.querySelector('.result .result-title').textContent === 'Parking Test A')")
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 2)")
            page.locator('.spot').first.locator('button',has_text='Modifier').click()
            page.locator('#spot-form [name=name]').fill('Parking Test A corrige')
            page.locator('#spot-form button[type=submit]').click()
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 2 && document.body.textContent.includes('Parking Test A corrige'))")
            page.locator('#car-note').fill('Niveau B1')
            page.locator('#save-car').click()
            page.wait_for_function("() => (document.querySelector('#car-status').textContent.includes('Niveau B1'))")
            assert page.locator('#car-map').get_attribute('href').startswith('https://www.openstreetmap.org/')
            with page.expect_download() as download:page.locator('#export').click()
            blob=pathlib.Path(download.value.path()).read_text()
            backup=json.loads(blob)
            assert len(backup['spots'])==2 and backup['parkingSpot']['note']=='Niveau B1'
            page.on('dialog',lambda d:d.accept('120') if d.type=='prompt' else d.accept())
            page.locator('.spot').first.locator('button',has_text='Supprimer').click()
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 1)")
            page.locator('#import-file').set_input_files({'name':'parkwise.json','mimeType':'application/json','buffer':blob.encode()})
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 2)")
            with page.expect_download() as cal:page.locator('#calendar').click()
            assert 'BEGIN:VEVENT' in pathlib.Path(cal.value.path()).read_text()
            page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)",timeout=18000)
            ctx.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelectorAll('.spot').length === 2)")
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), 'horizontal mobile overflow'
            assert not errors,errors
            ctx.set_offline(False)

            # --- Langues : détection automatique, 7 langues complètes, arabe de droite à gauche, devise au choix.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='it-IT',accept_downloads=True,geolocation={'latitude':45.464,'longitude':9.19},permissions=['geolocation'])
            intl.set_default_timeout(12000)
            ip=intl.new_page()
            ip.on('pageerror',lambda e: errors.append(str(e)))
            ip.on('dialog',lambda d:d.accept('90') if d.type=='prompt' else d.accept())
            ip.goto(url,wait_until='domcontentloaded')
            assert ip.locator('h1').inner_text().startswith('Il parcheggio giusto.'), ip.locator('h1').inner_text()  # navigateur italien -> italien
            assert ip.evaluate('() => LouvreI18n.currency')=='EUR'
            ip.locator('#new-spot').click()
            ip.locator('#spot-form [name=name]').fill('Garage Centrale')
            ip.locator('#spot-form [name=rate]').fill('3')
            ip.evaluate("() => LouvreI18n.setLang('pt')")  # changement de langue pendant la saisie
            assert ip.locator('#spot-form [name=name]').input_value()=='Garage Centrale'
            assert ip.locator('#dialog-title').inner_text()=='Adicionar um parque'
            ip.locator('#spot-form button[type=submit]').click()
            ip.wait_for_function("() => (document.querySelectorAll('.spot').length === 1)")
            ip.locator('#car-note').fill('Piano -1')
            ip.locator('#save-car').click()
            ip.wait_for_function("() => (document.querySelector('#car-status').textContent.includes('Piano -1'))")
            expected={'fr':('Le bon parking.','2 heures'),'en':('The right car park.','2 hours'),'es':('El aparcamiento adecuado.','2 horas'),'ar':('الموقف المناسب.','ساعتان'),
                      'pt':('O parque certo.','2 horas'),'de':('Der richtige Parkplatz.','2 Stunden'),'it':('Il parcheggio giusto.','2 ore')}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                title,dur=expected[lang]
                assert ip.locator('h1').inner_text().startswith(title), (lang, ip.locator('h1').inner_text())
                assert ip.locator('#duration option:checked').inner_text()==dur, (lang, ip.locator('#duration option:checked').inner_text())
                assert ip.locator('#car-note').input_value()=='Piano -1'
                assert ip.evaluate('() => LouvreI18n.missing()')==[], ip.evaluate('() => LouvreI18n.missing()')
            # Devise choisie : tarifs et menus affichés en dollars.
            ip.locator('#louvre-lang').select_option('en')
            ip.locator('#louvre-currency').select_option('USD')
            assert ip.locator('.result-cost strong').inner_text()=='US$6.00', ip.locator('.result-cost strong').inner_text()
            assert 'US$5/h' in ip.locator('#value-time option:checked').inner_text(), ip.locator('#value-time option:checked').inner_text()
            assert ip.locator('.spot p').nth(1).inner_text().startswith('US$3.00/h'), ip.locator('.spot p').nth(1).inner_text()
            # Rappel calendrier dans la langue choisie.
            ip.locator('#louvre-lang').select_option('de')
            with ip.expect_download() as cal2: ip.locator('#calendar').click()
            assert 'SUMMARY:Zurück zu meinem Auto — ParkWise' in pathlib.Path(cal2.value.path()).read_text()
            # Erreur du moteur traduite.
            ip.locator('#new-spot').click()
            ip.locator('#spot-form [name=name]').fill('X')
            ip.locator('#spot-form [name=entry]').fill('5')
            ip.locator('#spot-form [name=cap]').fill('2')
            ip.locator('#spot-form button[type=submit]').click()
            assert ip.locator('#form-error').inner_text()=='Höchstbetrag niedriger als die Einfahrtsgebühr', ip.locator('#form-error').inner_text()
            assert not errors,errors
            browser.close()
            print('BROWSER PASS: parking costs, ranking, edit, GPS, JSON export/import, calendar, offline PWA, 390px mobile, 7 languages, RTL, currency, translated ICS')
    finally:server.shutdown()
if __name__=='__main__':run()