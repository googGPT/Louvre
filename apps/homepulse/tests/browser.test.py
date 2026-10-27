"""HomePulse Chromium smoke test; no paid service. Run from anywhere."""
import os
import http.server, functools, threading, socket, pathlib, json, base64, struct, zlib, time
from playwright.sync_api import sync_playwright
BASE=pathlib.Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass

def tiny_png():
    def chunk(tag,data): return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
    w=h=16
    pixels=b''.join(b'\x00'+b'\xe0\xec\xd0'*w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')

def run():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(BASE)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            ctx.set_default_timeout(12000)
            page=ctx.new_page()
            errors=[]
            page.on('pageerror',lambda err: errors.append(str(err)))
            page.goto(url,wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelector('#add-equipment').disabled === false)")
            assert page.title().startswith('HomePulse')
            page.locator('#add-equipment').click()
            page.locator('#equipment-name').fill('Filtre lave-linge')
            page.locator('#category').select_option('Buanderie')
            page.locator('#room').select_option('Garage')
            page.locator('#next-due').fill('2026-11-08')
            page.locator('#frequency').fill('42')
            page.locator('#notes').fill('Test pompe')
            page.locator('#photo').set_input_files({'name':'test.png','mimeType':'image/png','buffer':tiny_png()})
            page.locator('#save-equipment').click()
            page.wait_for_function("() => (document.querySelector('#count-all').textContent === '1')")
            assert page.get_by_text('Filtre lave-linge',exact=True).count()>=1
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelector('#count-all').textContent === '1')")
            assert page.locator('.eq-photo').count()==1
            page.locator('.equipment-item button',has_text='Modifier').click()
            page.locator('#equipment-name').fill('Filtre corrigé')
            page.locator('#save-equipment').click()
            page.wait_for_function("() => (document.querySelector('.equipment-item strong').textContent === 'Filtre corrigé')")
            page.locator('.equipment-item button',has_text='Effectué').click()
            page.locator('#done-date').fill('2026-10-25')
            page.locator('#done-cost').fill('12.50')
            page.locator('#done-note').fill('Nettoyé')
            page.locator('#done-form button[type="submit"]').click()
            page.wait_for_function("() => (document.querySelector('#count-cost').textContent.includes('12,50'))")
            assert page.locator('.history-row').count()==1
            with page.expect_download() as dl:page.locator('#export-json').click()
            backup=dl.value
            body=json.loads(pathlib.Path(backup.path()).read_text())
            assert body['equipment'][0]['name']=='Filtre corrigé'
            assert body['history'][0]['costCents']==1250
            with page.expect_download() as cal:page.locator('#export-ics').click()
            ics=pathlib.Path(cal.value.path()).read_text()
            assert 'BEGIN:VEVENT' in ics and 'Filtre corrigé' in ics
            page.on('dialog',lambda dialog:dialog.accept())
            page.locator('.equipment-item button',has_text='Supprimer').click()
            page.wait_for_function("() => (document.querySelector('#count-all').textContent === '0')")
            page.locator('#import-file').set_input_files({'name':'homepulse.json','mimeType':'application/json','buffer':json.dumps(body).encode()})
            page.wait_for_function("() => (document.querySelector('#count-all').textContent === '1')")
            page.wait_for_function("() => (navigator.serviceWorker && navigator.serviceWorker.controller !== null)",timeout=14000)
            ctx.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelector('#count-all').textContent === '1')")
            assert page.locator('.equipment-item').count()==1
            assert not errors,errors
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'), 'mobile overflow'
            ctx.set_offline(False)

            # --- Langues : détection automatique, 7 langues complètes, arabe de droite à gauche, devise au choix.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='es-MX',accept_downloads=True)
            intl.set_default_timeout(12000)
            ip=intl.new_page()
            ip.on('pageerror',lambda err: errors.append(str(err)))
            ip.on('dialog',lambda d:d.accept())
            ip.goto(url,wait_until='domcontentloaded')
            ip.wait_for_function("() => (document.querySelector('#add-equipment').disabled === false)")
            assert ip.locator('h1').inner_text().startswith('Una casa bien cuidada.'), ip.locator('h1').inner_text()
            assert ip.evaluate('() => LouvreI18n.currency')=='MXN'  # Mexique -> peso proposé
            ip.locator('#add-equipment').click()
            ip.locator('#equipment-name').fill('Caldera')
            ip.locator('#category').select_option('Chauffage')  # valeur enregistrée inchangée (français)
            ip.locator('#room').select_option('Garage')
            ip.locator('#next-due').fill('2026-01-10')
            ip.evaluate("() => LouvreI18n.setLang('de')")  # changement de langue pendant la saisie
            assert ip.locator('#equipment-name').input_value()=='Caldera'
            assert ip.locator('#category option:checked').inner_text()=='Heizung'
            assert ip.locator('#equipment-title').inner_text()=='Neues Gerät'
            ip.locator('#save-equipment').click()
            ip.wait_for_function("() => (document.querySelector('#count-all').textContent === '1')")
            ip.locator('.equipment-item button',has_text='Erledigt').click()
            ip.locator('#done-date').fill('2026-01-05')
            ip.locator('#done-cost').fill('12.50')
            ip.locator('#done-form button[type="submit"]').click()
            ip.wait_for_function("() => (document.querySelectorAll('.history-row').length === 1)")
            expected={'fr':('Une maison bien suivie.','Chauffage'),'en':('A well-kept home.','Heating'),'es':('Una casa bien cuidada.','Calefacción'),'ar':('بيت تحت المتابعة.','التدفئة'),
                      'pt':('Uma casa bem cuidada.','Aquecimento'),'de':('Ein gut gepflegtes Zuhause.','Heizung'),'it':('Una casa ben seguita.','Riscaldamento')}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                title,cat=expected[lang]
                assert ip.locator('h1').inner_text().startswith(title), (lang, ip.locator('h1').inner_text())
                assert cat in ip.locator('.eq-meta').inner_text(), (lang, ip.locator('.eq-meta').inner_text())
                assert ip.evaluate('() => LouvreI18n.missing()')==[], ip.evaluate('() => LouvreI18n.missing()')
            # Devise choisie : coût affiché en livres ; dates au format de la langue.
            ip.locator('#louvre-lang').select_option('en')
            ip.locator('#louvre-currency').select_option('GBP')
            assert ip.locator('#count-cost').inner_text()=='£12.50', ip.locator('#count-cost').inner_text()
            assert ip.locator('#done-symbol').inner_text()=='£'
            assert 'Jan 2026' in ip.locator('.history-row small').inner_text(), ip.locator('.history-row small').inner_text()
            assert 'Heating' in ip.locator('.eq-meta').inner_text() and 'Every 90 days' in ip.locator('.eq-meta').inner_text(), ip.locator('.eq-meta').inner_text()
            ip.locator('#search').fill('heating')  # recherche sur le nom traduit de la catégorie
            assert ip.locator('.equipment-item').count()==1
            ip.locator('#search').fill('')
            # Calendrier exporté dans la langue choisie.
            ip.locator('#louvre-lang').select_option('it')
            with ip.expect_download() as cal: ip.locator('#export-ics').click()
            ics=pathlib.Path(cal.value.path()).read_text()
            assert 'SUMMARY:Manutenzione: Caldera' in ics, ics[:400]
            # Erreur du moteur traduite.
            ip.locator('.equipment-item button',has_text='Fatto').click()
            ip.locator('#done-cost').fill('-3')
            ip.locator('#done-cost').evaluate("e => e.removeAttribute('min')")
            ip.locator('#done-form button[type="submit"]').click()
            assert ip.locator('#done-error').inner_text()=='Importo errato', ip.locator('#done-error').inner_text()
            assert not errors,errors
            browser.close()
            print('BROWSER PASS: equipment, photo, edit, completion, costs, history, backup, restore, ICS, offline PWA, 390px mobile, 7 languages, RTL, currency, translated ICS')
    finally:server.shutdown()
if __name__=='__main__':run()