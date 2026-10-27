"""KeyboardCoach dans Chromium : séance, mesures, collage bloqué, historique, hors ligne, mobile."""
import functools  # pour fixer le dossier servi
import http.server  # petit serveur local
import os  # chemin de Chromium configurable (LOUVRE_CHROMIUM)
import pathlib  # chemins de fichiers
import threading  # serveur en tâche de fond
from playwright.sync_api import sync_playwright, expect  # pilotage du navigateur

ROOT = pathlib.Path(__file__).resolve().parents[1]  # dossier de l'appli


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # pas de journal HTTP dans la sortie
        pass


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, locale='fr-FR')
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.goto(origin)
            expect(page.locator('#session-state')).to_have_text('À préparer')
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Séance : 6 caractères dont 1 erreur.
            page.locator('#start').click()
            expect(page.locator('#session-state')).to_have_text('Prêt à saisir')
            text = page.locator('#target').get_attribute('aria-label')
            title = page.locator('#passage-title').inner_text()  # titre de l'exercice choisi
            typing = page.locator('#typing')
            typing.press_sequentially('X' + text[1:6], delay=20)
            expect(page.locator('#session-state')).to_have_text('En cours')
            expect(page.locator('#errors')).to_have_text('1')
            expect(page.locator('#target .incorrect')).to_have_count(1)

            # Coller est refusé : la mesure doit refléter une vraie frappe.
            typing.dispatch_event('paste')
            expect(page.locator('#feedback')).to_contain_text('Coller est désactivé')

            # Pause puis reprise.
            page.locator('#pause').click()
            expect(page.locator('#session-state')).to_have_text('En pause')
            assert typing.is_disabled()
            page.locator('#pause').click()
            expect(page.locator('#session-state')).to_have_text('En cours')

            # Fin de séance en saisissant tout le texte : bilan et historique local (option à cocher).
            expect(page.locator('#history-rows')).to_contain_text('Aucune séance sauvegardée')
            page.locator('#save-history').check()
            typing.fill('X' + text[1:])
            page.wait_for_function('() => document.querySelector("#session-state").textContent === "Terminé"')
            expect(page.locator('#finish-summary')).to_be_visible()
            expect(page.locator('#completion')).to_have_text('100,00 %')
            expect(page.locator('#history-rows tr')).to_have_count(1)
            expect(page.locator('#history-rows')).not_to_contain_text('Aucune séance')
            saved = page.evaluate("() => JSON.parse(localStorage.getItem('louvre-wave2-keyboardcoach-v1'))")
            assert len(saved['records']) == 1 and saved['records'][0]['correct'] == len(text) - 1

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-history').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').startswith('Date ISO,Exercice')

            # Hors ligne : le service worker prend le contrôle puis la page recharge sans réseau.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#session-state')).to_have_text('À préparer')
            expect(page.locator('#history-rows')).to_contain_text(title)  # l'historique reste disponible
            context.set_offline(False)

            assert not external, external  # aucune requête vers un service externe
            assert not errors, errors

            # --- Langues : détection, 7 langues d'interface sans débordement, séance conservée, textes d'exercice par langue.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('#session-state')).to_have_text('Nicht gestartet')  # navigateur allemand -> interface allemande
            assert ip.locator('#language').input_value() == 'de'  # premier texte proposé en allemand
            ip.locator('#start').click()
            text = ip.locator('#target').get_attribute('aria-label')
            ip.locator('#typing').press_sequentially(text[:8], delay=10)
            expect(ip.locator('#session-state')).to_have_text('Läuft')
            ip.locator('#pause').click()
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expected = ip.evaluate(f"() => LouvreMessages['{lang}']['state.paused']")
                expect(ip.locator('#session-state')).to_have_text(expected)
                assert ip.locator('#typing').input_value() == text[:8]  # saisie conservée
                assert ip.locator('#target').get_attribute('dir') == 'ltr'  # texte allemand : gauche à droite
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#pause')).to_have_text('Resume')
            ip.locator('#pause').click()
            ip.locator('#typing').fill(text)  # fin du texte
            expect(ip.locator('#finish-summary')).to_contain_text('net wpm')
            expect(ip.locator('#completion')).to_have_text('100.00%')
            ip.locator('#louvre-lang').select_option('it')
            expect(ip.locator('#finish-summary')).to_contain_text('parole/min nette')  # bilan retraduit
            # Texte arabe : de droite à gauche, mesuré caractère par caractère.
            ip.locator('#language').select_option('ar')
            ip.locator('#start').click()
            assert ip.locator('#target').get_attribute('dir') == 'rtl'
            arabic = ip.locator('#target').get_attribute('aria-label')
            ip.locator('#typing').press_sequentially(arabic[:6], delay=10)
            expect(ip.locator('#errors')).to_have_text('0')
            expect(ip.locator('#target .correct')).to_have_count(6)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS KeyboardCoach: session, errors, paste blocked, pause, history, CSV, offline, mobile, 7 languages, RTL, texts per language')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
