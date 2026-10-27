"""MoneyUntil browser regression: settings, budget, expense, bill and local recovery."""
import functools
import http.server
import json
import pathlib
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
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
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
            page.locator('#expense-amount').fill('25.50')
            page.locator('#expense-form button[type=submit]').click()
            expect(page.locator('#expense-modal')).to_be_hidden()
            assert 'Courses' in page.locator('#expense-list').inner_text()
            page.locator('#add-bill').click()
            expect(page.locator('#bill-modal')).to_be_visible()
            page.locator('#bill-name').fill('Électricité')
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
            expect(page.locator('#live-announcement')).to_contain_text('Impossible de lire')
            assert 'Courses' in page.locator('#expense-list').inner_text()
            # Valid saved JSON is accepted after explicit confirmation.
            page.locator('#import-file').set_input_files({'name':'good.json','mimeType':'application/json','buffer':backup})
            expect(page.locator('#live-announcement')).to_contain_text('Sauvegarde restaurée')
            assert 'Courses' in page.locator('#expense-list').inner_text()
            assert len(json.loads(page.evaluate("localStorage.getItem('moneyuntil-v1')") or '{}').get('expenses',[])) in (0,1)
            assert not external,external
            assert not errors,errors
            browser.close()
        print('BROWSER PASS MoneyUntil: setup, precise inputs, expense/bill, scenario non-persistence, JSON download/import, mobile 390px')
    finally:
        server.shutdown()
        server.server_close()
if __name__=="__main__":
    main()
