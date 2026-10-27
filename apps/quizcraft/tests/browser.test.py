"""QuizCraft v2: end-to-end Chromium, stockage historique et hors ligne."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import threading, os, json
ROOT=Path(__file__).resolve().parents[1]
class H(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):
        pass
server=ThreadingHTTPServer(('127.0.0.1',0),H)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        exe=next((x for x in [os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium'),'/usr/bin/google-chrome'] if os.path.exists(x)),None)
        browser=p.chromium.launch(executable_path=exe,headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True,locale='fr-FR')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda dialog:dialog.accept())
        page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        page.locator('[name="question"]').wait_for()
        assert page.locator('body').evaluate('(e)=>e.scrollWidth<=window.innerWidth+2')
        assert page.locator('#start-quiz').is_disabled()

        def save(question,answer,category='Finance',difficulty='facile'):
            page.locator('[name="question"]').fill(question)
            page.locator('[name="answer"]').fill(answer)
            page.locator('[name="category"]').fill(category)
            page.locator('[name="difficulty"]').select_option(difficulty)
            page.locator('#save-button').click()
        save('Question principale','Réponse vérifiée', '__proto__')
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
        assert page.locator('#summary .stat-value').first.inner_text()=='1'
        assert page.locator('#theme-progress .theme-card').count()==1

        # La réponse d'une carte doit être masquée par défaut.
        card=page.locator('#items .item').first
        assert card.locator('.answer').is_hidden()
        card.get_by_role('button',name='Révéler la réponse').click()
        assert card.locator('.answer').is_visible()
        assert 'Réponse vérifiée' in card.locator('.answer').inner_text()
        card.get_by_role('button',name='Masquer la réponse').click()
        assert card.locator('.answer').is_hidden()

        save('=HYPERLINK("https://example.invalid")','Réponse dangereuse','Économie','difficile')
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
        assert page.locator('#summary .stat-value').first.inner_text()=='2'
        assert page.locator('#theme-progress .theme-card').count()==2
        assert page.locator('#category-filter option').count()==3
        page.locator('#search').fill('economie')
        assert page.locator('#items .item').count()==1
        page.locator('#search').fill('')
        page.locator('#mastery-filter').select_option('oui')
        assert page.locator('#items .item').count()==0
        page.locator('#mastery-filter').select_option('all')
        page.locator('#difficulty-filter').select_option('difficile')
        assert page.locator('#items .item').count()==1
        page.locator('#difficulty-filter').select_option('all')

        # Mode quiz : question visible, réponse révélable, progression explicite.
        page.locator('#quiz-count').select_option('5')
        page.locator('#start-quiz').click()
        assert page.locator('#quiz-panel').is_visible()
        assert page.locator('#quiz-status').inner_text().startswith('Question 1 / 2')
        assert page.locator('#quiz-body .answer').count()==0
        page.locator('#quiz-body').get_by_role('button',name='Afficher la réponse').click()
        assert page.locator('#quiz-body .answer').is_visible()
        page.locator('#quiz-body').get_by_role('button',name='J’ai répondu juste').click()
        assert page.locator('#summary .stat-value').nth(1).inner_text()=='1'
        page.locator('#quiz-body').get_by_role('button',name='Afficher la réponse').click()
        page.locator('#quiz-body').get_by_role('button',name='Je dois réviser').click()
        assert 'Résultat : 1 / 2' in page.locator('#quiz-body').inner_text()
        page.locator('#close-quiz').click()
        assert page.locator('#quiz-panel').is_hidden()

        # Sauvegarde compatible et export CSV neutralisé.
        with page.expect_download() as d:
            page.locator('#export').click()
        saved=d.value.path()
        data=json.loads(Path(saved).read_text(encoding='utf-8'))
        assert data['app']=='quizcraft' and data['version']==1 and len(data['records'])==2
        with page.expect_download() as d:
            page.locator('#export-csv').click()
        csv=Path(d.value.path()).read_text(encoding='utf-8-sig')
        assert "\"'=HYPERLINK" in csv

        # Modifier et supprimer une fiche, puis restaurer le JSON.
        card=page.locator('#items .item').first
        card.get_by_role('button',name='Modifier').click()
        assert page.locator('#save-button').inner_text()=='Enregistrer les modifications'
        page.locator('[name="question"]').fill('Question modifiée')
        page.locator('#save-button').click()
        assert 'Question modifiée' in page.locator('#items').inner_text()
        page.locator('#items .item').first.get_by_role('button',name='Supprimer').click()
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===1)')
        page.locator('#import').set_input_files(saved)
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')

        # Une lecture de fichier lente ne doit jamais écraser des modifications récentes.
        page.evaluate("""() => {
          window._originalFileText=File.prototype.text;
          window._releaseImport=null;
          File.prototype.text=function(){
            const file=this,original=window._originalFileText;
            return new Promise(resolve=>{window._releaseImport=()=>original.call(file).then(resolve);});
          };
        }""")
        page.locator('#import').set_input_files(saved)
        page.wait_for_function('() => (typeof window._releaseImport==="function")')
        page.locator('#items .item').first.get_by_role('button',name='Modifier').click()
        page.locator('[name="question"]').fill('Modification plus récente à conserver')
        page.locator('#save-button').click()
        expect(page.locator('#items')).to_contain_text('Modification plus récente à conserver')
        page.evaluate('window._releaseImport()')
        expect(page.locator('#status')).to_contain_text('Import refusé')
        assert 'Modification plus récente à conserver' in page.locator('#items').inner_text()
        page.evaluate('() => {File.prototype.text=window._originalFileText;delete window._releaseImport;}')

        # Le stockage corrompu doit rester protégé si l'import échoue.
        page.evaluate("() => localStorage.setItem('louvre-factory:quizcraft:v1','not valid JSON')")
        page.reload()
        assert page.locator('#warning').is_visible()
        page.locator('#import').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'broken'})
        expect(page.locator('#status')).to_contain_text('Import refusé')
        assert page.locator('#warning').is_visible()
        page.locator('#import').set_input_files(saved)
        page.wait_for_function('() => (document.querySelectorAll("#items .item").length===2)')
        assert page.locator('#warning').is_hidden()
        page.reload()
        page.wait_for_function('() => (navigator.serviceWorker.controller !== null)',timeout=20000)
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.locator('[name="question"]').wait_for()
        assert page.locator('#items .item').count()==2
        assert not errors,errors
        context.set_offline(False)

        # --- Langues : détection du navigateur, 7 langues, arabe de droite à gauche, saisie et session conservées.
        intl=browser.new_context(viewport={'width':390,'height':844},locale='es-MX')
        ip=intl.new_page()
        ip.on('pageerror',lambda e:errors.append(str(e)))
        ip.on('dialog',lambda d:d.accept())
        ip.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        expect(ip.locator('#form-title')).to_have_text('Crear una pregunta')  # navegador español -> español
        assert ip.evaluate('() => LouvreI18n.lang')=='es'
        assert ip.locator('#louvre-currency').count()==0  # appli sans argent : pas de menu devise
        expect(ip.locator('[name="difficulty"] option').nth(2)).to_have_text('Difícil')
        ip.locator('[name="question"]').fill('¿Capital de Japón?'); ip.locator('[name="answer"]').fill('Tokio')
        ip.locator('[name="category"]').fill('Geografía'); ip.locator('[name="difficulty"]').select_option('difficile')
        ip.locator('#save-button').click()
        expect(ip.locator('#status')).to_have_text('Pregunta guardada localmente.')
        stored=ip.evaluate("JSON.parse(localStorage.getItem('louvre-factory:quizcraft:v1'))")
        assert stored['records'][0]['difficulty']=='difficile' and stored['records'][0]['mastered']=='non'  # valeurs v1 inchangées
        ip.locator('#start-quiz').click()
        expect(ip.locator('#quiz-status')).to_have_text('Pregunta 1 / 1 · 0 correctas')
        ip.locator('[name="question"]').fill('Brouillon en cours')  # saisie non enregistrée
        titles={'fr':'Bibliothèque de questions','en':'Question library','es':'Biblioteca de preguntas','ar':'مكتبة الأسئلة','pt':'Biblioteca de perguntas','de':'Fragensammlung','it':'Raccolta di domande'}
        for lang in ['fr','en','es','ar','pt','de','it']:
            ip.locator('#louvre-lang').select_option(lang)
            assert ip.evaluate('() => document.documentElement.lang')==lang
            assert ip.evaluate('() => document.documentElement.dir')==('rtl' if lang=='ar' else 'ltr')
            wide=ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
              [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
            assert not wide,f'débordement en {lang} : {wide}'
            expect(ip.locator('#library-title')).to_have_text(titles[lang])
            assert ip.locator('[name="question"]').input_value()=='Brouillon en cours'
            expect(ip.locator('#quiz-panel')).to_be_visible()
            assert ip.evaluate('() => LouvreI18n.missing()')==[],ip.evaluate('() => LouvreI18n.missing()')
        expect(ip.locator('#quiz-status')).to_have_text('Domanda 1 / 1 · 0 corrette')
        expect(ip.locator('#items .meta')).to_have_text('Difficoltà: Difficile')
        ip.locator('#louvre-lang').select_option('de')
        expect(ip.locator('#summary .stat-label').first).to_have_text('Fragen')
        ip.locator('[name="question"]').fill('   ')
        ip.locator('[name="answer"]').fill('x'); ip.locator('[name="category"]').fill('y')
        ip.evaluate("() => document.getElementById('record-form').requestSubmit()")
        expect(ip.locator('#status')).to_have_text('Frage: Text erforderlich (höchstens 1.200 Zeichen)')
        assert not errors,errors
        browser.close()
    print('BROWSER PASS: CRUD, stats, categories, filters, quiz grading, CSV/JSON, corrupt backup, mobile 390px, offline, 7 languages, RTL')
finally:
    server.shutdown()
    server.server_close()
