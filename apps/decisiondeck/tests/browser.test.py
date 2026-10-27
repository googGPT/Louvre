"""End-to-end test of the actual DecisionDeck browser UI, persistence and offline shell."""
import json
import os
import pathlib
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass

def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as pw:
            exe=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium') if os.path.isfile(os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')) else None
            browser=pw.chromium.launch(headless=True,executable_path=exe,args=['--no-sandbox'])
            ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            page=ctx.new_page();errors=[]
            page.on('pageerror',lambda x:errors.append(str(x)))
            page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            page.locator('[name=option]').fill('Voiture A')
            page.locator('[name=criterion]').fill('Qualité')
            page.locator('[name=weight]').fill('3')
            page.locator('[name=score]').fill('8')
            page.locator('#save-button').click()
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length===1)")
            page.reload()
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length===1)")
            assert page.locator('#summary .stat').count()==4
            assert not page.locator('a').filter(has_text='Louvre ↗').count()
            page.locator('#sample').click()
            page.on('dialog',lambda dialog:dialog.accept())
            page.locator('#sample').click()
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length>=7)")
            assert page.locator('#issues').inner_text().find('critères manquants')!=-1
            page.locator('#search').fill('voiture a')
            expect(page.locator('#items .item')).to_have_count(1)  # attend la fin du filtrage
            page.locator('#search').fill('')
            page.locator('#items .item .item-actions button').first.click()
            expect(page.locator('#save-button')).to_have_text('Mettre à jour')  # attend le passage en mode édition
            page.locator('#cancel-edit').click()
            with page.expect_download() as d:page.locator('#export').click()
            backup=pathlib.Path(d.value.path()).read_text()
            assert len(json.loads(backup)['records'])>=7
            with page.expect_download() as d:page.locator('#export-csv').click()
            assert 'Contribution pondérée' in pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            page.locator('#search').fill('voiture a')
            expect(page.locator('#items .item')).to_have_count(1)  # filtre appliqué avant de supprimer
            page.locator('#items .item .item-actions button').nth(1).click()
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length===0)")
            page.locator('#search').fill('')
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length>=6)")  # liste complète réaffichée
            page.locator('#import').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup.encode('utf-8')})
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length>=7)")
            page.locator('#import').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"app":"wrong","records":[]}'})
            assert page.locator('#items .item').count()>=7
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2')
            page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',timeout=15000)
            ctx.set_offline(True);page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelectorAll('#items .item').length>=7)")
            assert not errors,errors
            ctx.set_offline(False)

            # --- Langues : détection, 7 langues sans débordement, saisie conservée, nombres et erreurs traduits.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='it-IT')
            ip=intl.new_page()
            ip.on('pageerror',lambda x:errors.append(str(x)))
            ip.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
            expect(ip.locator('h1')).to_contain_text('Confronta le tue opzioni.')  # navigateur italien -> italien
            ip.locator('#sample').click()
            expect(ip.locator('#insights li').first).to_have_text('1. Opzione A: 8,33/10')  # exemple créé en italien
            ip.locator('[name=option]').fill('Bozza')  # saisie en cours
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                expected=ip.evaluate(f"() => LouvreMessages['{lang}']['rank.title']")
                expect(ip.locator('[data-i18n="rank.title"]')).to_have_text(expected)
                expect(ip.locator('#summary .stat-label').first).to_have_text(ip.evaluate(f"() => LouvreMessages['{lang}']['kpi.options']"))
                assert ip.locator('[name=option]').input_value()=='Bozza'
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide,f'débordement en {lang} : {wide}'
            assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#insights li').first).to_have_text('1. Opzione A: 8.33/10')
            expect(ip.locator('#save-button')).to_have_text('Save')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('[name=option]').fill('Opzione A'); ip.locator('[name=criterion]').fill('Costo')
            expect(ip.locator('#preview')).to_contain_text('gibt es schon')
            ip.locator('[name=option]').fill('Opzione C'); ip.locator('[name=criterion]').fill('Neu'); ip.locator('[name=weight]').fill('2'); ip.locator('[name=score]').fill('5')
            ip.locator('#save-button').click()
            expect(ip.locator('#issues')).to_contain_text('fehlende Kriterien')
            expect(ip.locator('#status')).to_have_text('Bewertung auf diesem Gerät gespeichert.')
            assert not errors,errors
            browser.close()
            print('BROWSER PASS: create, reload, example, inconsistent criteria warning, search, edit, delete, JSON/CSV, restore, offline, 390px, 7 languages, RTL, translated issues')
    finally:server.shutdown();server.server_close()
if __name__=='__main__':run()