"""MoneyUntil browser regression: settings, budget, expense, bill and local recovery."""
import os
import functools
import http.server
import json
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT=pathlib.Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

def main():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
            page=context.new_page()
            errors=[];external=[]
            origin=f'http://127.0.0.1:{server.server_port}/'
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog',lambda d:d.accept())
            page.goto(origin,wait_until='domcontentloaded')
            expect(page.locator('#settings-modal')).to_be_visible()
            assert page.title().startswith('MoneyUntil')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
            payday=page.evaluate("""() => {
                const d=new Date();d.setDate(d.getDate()+14);
                return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
            }""")
            page.locator('#start-balance').fill('1200.001')
            page.locator('#settings-form').evaluate('(f) => { f.noValidate = true; f.requestSubmit(); }')
            expect(page.locator('#settings-modal')).to_be_visible()
            assert page.locator('#settings-error').inner_text().strip()
            page.locator('#settings-form').evaluate('(f) => { f.noValidate = false; }')
            page.locator('#start-balance').fill('1200.00')
            page.locator('#payday').fill(payday)
            page.locator('#reserve').fill('100.00')
            page.locator('#settings-form button[type=submit]').click()
            expect(page.locator('#settings-modal')).to_be_hidden()
            assert '€' in page.locator('#daily-amount').inner_text()
            assert page.locator('#expense-list').count()==1

            page.locator('#add-expense').click()
            expect(page.locator('#expense-modal')).to_be_visible()
            page.locator('#expense-name').fill('Courses')
            page.locator('#expense-amount').fill('25.501')
            page.locator('#expense-form').evaluate('(f) => { f.noValidate = true; f.requestSubmit(); }')
            expect(page.locator('#expense-modal')).to_be_visible()
            assert page.locator('#expense-error').inner_text().strip()
            page.locator('#expense-form').evaluate('(f) => { f.noValidate = false; }')
            page.locator('#expense-amount').fill('25.50')
            page.locator('#expense-form button[type=submit]').click()
            expect(page.locator('#expense-modal')).to_be_hidden()
            assert 'Courses' in page.locator('#expense-list').inner_text()
            page.locator('#add-bill').click()
            expect(page.locator('#bill-modal')).to_be_visible()
            page.locator('#bill-name').fill('Électricité')
            page.locator('#bill-amount').fill('60.001')
            page.locator('#bill-form').evaluate('(f) => { f.noValidate = true; f.requestSubmit(); }')
            expect(page.locator('#bill-modal')).to_be_visible()
            assert page.locator('#bill-error').inner_text().strip()
            page.locator('#bill-form').evaluate('(f) => { f.noValidate = false; }')
            page.locator('#bill-amount').fill('60.00')
            page.locator('#bill-date').fill(payday)
            page.locator('#bill-form button[type=submit]').click()
            expect(page.locator('#bill-modal')).to_be_hidden()
            assert 'Électricité' in page.locator('#bill-list').inner_text()

            # Scenario is hypothetical; must not create a new expense.
            before=page.locator('#expense-list').inner_text()
            page.locator('#scenario-amount').fill('30.00')
            assert page.locator('#scenario-result').inner_text().strip()
            assert before==page.locator('#expense-list').inner_text()
            with page.expect_download() as d:
                page.locator('#export-data').click()
            backup=pathlib.Path(d.value.path()).read_bytes()
            saved=json.loads(backup)
            assert saved['configured'] is True
            assert len(saved['expenses'])==1 and len(saved['bills'])==1

            page.reload(wait_until='domcontentloaded')
            assert 'Courses' in page.locator('#expense-list').inner_text()
            assert 'Électricité' in page.locator('#bill-list').inner_text()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')

            # Invalid import does not destroy saved records.
            page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'not JSON'})
            expect(page.locator('.toast')).to_contain_text('Impossible de lire')
            assert 'Courses' in page.locator('#expense-list').inner_text()
            # Valid saved JSON is accepted after explicit confirmation.
            page.locator('#import-file').set_input_files({'name':'good.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('.toast')).to_contain_text('Sauvegarde restaurée')
            assert 'Courses' in page.locator('#expense-list').inner_text()
            persisted=page.evaluate("JSON.parse(localStorage.getItem('moneyuntil:v1'))")
            assert len(persisted['expenses'])==1 and len(persisted['bills'])==1
            assert not external,external
            assert not errors,errors
            # Mode hors ligne : le service worker prend le contrôle, puis l'appli recharge sans réseau.
            page.reload(); page.wait_for_function('() => (navigator.serviceWorker.controller!==null)',timeout=15000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            assert page.title().startswith('MoneyUntil')
            assert 'Courses' in page.locator('#expense-list').inner_text()
            context.set_offline(False)

            # --- Langues : détection du navigateur, 7 langues, arabe de droite à gauche, devise du budget, saisie conservée.
            intl=browser.new_context(viewport={'width':390,'height':844},locale='en-US')
            ip=intl.new_page()
            ip.on('pageerror',lambda e:errors.append(str(e)))
            ip.on('dialog',lambda d:d.accept())
            ip.goto(origin,wait_until='domcontentloaded')
            expect(ip.locator('#settings-modal')).to_be_visible()
            expect(ip.locator('#settings-title')).to_have_text('Your financial situation')  # navigateur anglais -> anglais
            assert ip.evaluate('() => LouvreI18n.lang')=='en'
            assert ip.locator('#currency').input_value()=='USD'  # région US -> budget proposé en dollars
            ip.locator('#start-balance').fill('1200.00'); ip.locator('#payday').fill(payday); ip.locator('#reserve').fill('100.00')
            ip.locator('#settings-form button[type=submit]').click()
            expect(ip.locator('#settings-modal')).to_be_hidden()
            expect(ip.locator('#daily-amount')).to_contain_text('$')
            ip.locator('#add-expense').click()
            ip.locator('#expense-name').fill('Groceries'); ip.locator('#expense-amount').fill('25.50')
            ip.locator('#expense-form button[type=submit]').click()
            expect(ip.locator('#expense-modal')).to_be_hidden()
            ip.locator('#scenario-amount').fill('30')  # saisie en cours : doit survivre aux changements de langue
            heads={'fr':'Dernières dépenses','en':'Latest expenses','es':'Últimos gastos','ar':'آخر المصاريف','pt':'Últimas despesas','de':'Letzte Ausgaben','it':'Ultime spese'}
            for lang in ['fr','en','es','ar','pt','de','it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang')==lang
                assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
                wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide,f'débordement en {lang} : {wide}'
                expect(ip.locator('#expenses-head')).to_have_text(heads[lang])
                expect(ip.locator('#expense-list')).to_contain_text('Groceries')
                expect(ip.locator('#daily-amount')).to_have_text(re.compile(r'\$|USD'))  # devise du budget, quelle que soit la langue (« USD » en italien)
                assert ip.locator('#scenario-amount').input_value()=='30'
                assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
            expect(ip.locator('#scenario-result')).to_contain_text('USD')
            expect(ip.locator('#expense-cat option').first).to_have_text('Spesa')
            assert ip.title().startswith('MoneyUntil — Goditi')
            # Le choix de langue est mémorisé ; la sauvegarde garde son format (devise enregistrée, catégorie en valeur stable).
            ip.reload(wait_until='domcontentloaded')
            expect(ip.locator('#expenses-head')).to_have_text('Ultime spese')
            saved=ip.evaluate("JSON.parse(localStorage.getItem('moneyuntil:v1'))")
            assert saved['version']==1 and saved['currency']=='USD' and saved['expenses'][0]['category']=='courses'
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#top-settings').click()
            ip.locator('#payday').fill('2020-01-01')
            ip.locator('#settings-form button[type=submit]').click()
            expect(ip.locator('#settings-error')).to_have_text('Wählen Sie einen künftigen Zahltag.')
            assert not errors,errors
            browser.close()
        print('BROWSER PASS MoneyUntil: setup, precise inputs, expense/bill, scenario non-persistence, JSON download/import, mobile 390px, offline reload, 7 languages, RTL, budget currency')
    finally:
        server.shutdown()
        server.server_close()
if __name__=="__main__":
    main()
