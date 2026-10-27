"""OralPresentationClock dans Chromium : validation, réglages, ordre de passage, chronomètre (horloge simulée : seuils,
arrière-plan, pause, questions, rechargement), plein écran, clavier, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-oralpresentationclock-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
MIN = 60_000


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_field(locator, value):
    """Remplit un champ puis déclenche « change » (comme quand on quitte le champ)."""
    locator.fill(value)
    locator.dispatch_event('change')


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='fr-FR')
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept())
            page.clock.install()  # horloge simulée : on peut « sauter » des minutes comme un onglet en arrière-plan
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Validation.
            page.locator('#add').click()
            expect(page.locator('#form-status')).to_have_text('Nom du groupe ou du candidat obligatoire')
            set_field(page.locator('#s-present'), 'abc')
            expect(page.locator('#settings-status')).to_contain_text('Durée invalide')
            expect(page.locator('#s-present')).to_have_attribute('aria-invalid', 'true')
            set_field(page.locator('#s-present'), '10')
            expect(page.locator('#settings-status')).to_have_text('Réglages enregistrés.')
            set_field(page.locator('#s-present-alerts'), '12')
            expect(page.locator('#settings-status')).to_have_text('Chaque seuil doit être inférieur à la durée (10:00)')
            set_field(page.locator('#s-present-alerts'), '1, 2')
            expect(page.locator('#settings-status')).to_have_text('Réglages enregistrés.')
            set_field(page.locator('#s-start'), '25:00')
            expect(page.locator('#settings-status')).to_have_text('Heure invalide (ex. 08:30)')
            set_field(page.locator('#s-start'), '08:30')
            expect(page.locator('#settings-status')).to_have_text('Réglages enregistrés.')

            # Ordre de passage : 10 min + 5 min de questions + 2 min de changement = un passage toutes les 17 min.
            for name, members in [('Groupe A', 'Léa, Hugo'), ('Groupe B', ''), ('Groupe C', 'Inès')]:
                page.locator('#p-name').fill(name)
                page.locator('#p-members').fill(members)
                page.locator('#add').click()
                expect(page.locator('#form-status')).to_contain_text('Ajouté : ' + name)
            items = page.locator('#passages > li')
            expect(items).to_have_count(3)
            expect(items.nth(1)).to_contain_text('prévu à 08:47')
            items.nth(2).locator('[data-action=up]').click()
            expect(items.nth(1)).to_contain_text('Groupe C')
            expect(items.nth(2)).to_contain_text('prévu à 09:04')
            expect(page.locator('#st-name')).to_have_text('Groupe A')
            expect(page.locator('#st-time')).to_have_text('10:00')

            # Chronomètre : 8 min 1 s plus tard (onglet en arrière-plan), le premier seuil (2:00) est franchi.
            page.locator('#toggle').click()
            expect(page.locator('#st-phase')).to_have_text('Présentation')
            page.clock.fast_forward(8 * MIN + 1000)
            expect(page.locator('#st-time')).to_have_text(re.compile(r'^1:5\d$'))
            expect(page.locator('#stage')).to_have_attribute('data-level', 'warn1')
            expect(page.locator('#stage-status')).to_have_text('Plus que 2:00.')
            # Trois minutes de plus d'un coup : seuil 1:00 et fin signalés, dépassement affiché.
            page.clock.fast_forward(3 * MIN)
            expect(page.locator('#st-time')).to_have_text(re.compile(r'^\+1:0\d$'))
            expect(page.locator('#stage')).to_have_attribute('data-level', 'over')
            expect(page.locator('#stage-status')).to_have_text('Temps écoulé.')
            expect(page.locator('#stage')).to_have_attribute('data-signals', '3')
            # Pause au clavier (Espace) : le temps ne court plus.
            page.locator('h1').click()
            page.keyboard.press('Space')
            expect(page.locator('#st-phase')).to_have_text('Présentation · en pause')
            frozen = page.locator('#st-time').inner_text()
            page.clock.fast_forward(5 * MIN)
            page.wait_for_timeout(400)
            expect(page.locator('#st-time')).to_have_text(frozen)
            page.keyboard.press('Space')
            expect(page.locator('#st-phase')).to_have_text('Présentation')
            # Questions (touche Q), puis rechargement de la page : le chronomètre continue d'après les horodatages.
            page.keyboard.press('q')
            expect(page.locator('#st-phase')).to_have_text('Questions')
            page.clock.fast_forward(MIN)
            expect(page.locator('#st-time')).to_have_text(re.compile(r'^(4:00|3:5\d)$'))
            page.reload()
            expect(page.locator('#st-phase')).to_have_text('Questions')
            expect(page.locator('#st-time')).to_have_text(re.compile(r'^(4:00|3:5\d)$'))
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['run']['phase'] == 'questions' and saved['run']['presentMs'] >= 11 * MIN, saved['run']
            # Plein écran puis Échap.
            page.locator('#full').click()
            expect(page.locator('#stage')).to_have_class(re.compile(r'\bfull\b'))
            expect(page.locator('#full')).to_have_attribute('aria-pressed', 'true')
            page.keyboard.press('Escape')
            expect(page.locator('#stage')).not_to_have_class(re.compile(r'\bfull\b'))
            page.locator('#finish').click()
            expect(page.locator('#stage-status')).to_have_text(re.compile(r'^Groupe A : terminé avec 1:0\d de dépassement\.$'))
            expect(items.nth(0)).to_contain_text('Dépassement : 1:0')
            # Deuxième passage dans les temps, terminé au clavier (T).
            expect(page.locator('#st-name')).to_have_text('Groupe C')
            page.locator('#toggle').click()
            page.clock.fast_forward(5 * MIN)
            page.locator('h1').click()
            page.keyboard.press('t')
            expect(page.locator('#stage-status')).to_have_text('Groupe C : terminé dans les temps.')
            expect(items.nth(1)).to_contain_text('Dans les temps')
            expect(page.locator('#kpis')).to_contain_text('2 / 3')

            # Son : signal de test généré localement (ou message clair si le navigateur n'a pas Web Audio).
            page.locator('#s-sound').check()
            expect(page.locator('#settings-status')).to_have_text('Réglages enregistrés.')
            page.locator('#test-sound').click()
            expect(page.locator('#settings-status')).to_have_text(re.compile('Signal joué|pas disponible'))

            # Export CSV du déroulé.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').strip().splitlines()
            assert csv[0] == '"#";"Passage";"Membres";"Début prévu";"Début réel";"Présentation";"Questions";"Dépassement présentation";"Dépassement questions";"Statut"', csv[0]
            assert csv[1].startswith('"1";"Groupe A";"Léa, Hugo";"08:30";"') and csv[1].endswith('"0:00";"dépassement"'), csv[1]
            assert csv[2].endswith('"terminé"') and csv[3].endswith('"à venir"'), csv

            # Sauvegarde, puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['app'] == 'oralpresentationclock' and len(json.loads(backup)['passages']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#p-name').fill('X')
            page.locator('#add').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"oralpresentationclock","version":1,"settings":{},"passages":[],"run":null}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 3 passages.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(items).to_have_count(3)
            expect(page.locator('#s-start')).to_have_value('08:30')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(items).to_have_count(3)
            expect(page.locator('#st-name')).to_have_text('Groupe B')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-MX')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Cada grupo tiene el mismo tiempo.')  # navigateur espagnol
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('#passages > li').first).to_contain_text('Grupo 1')  # exemple dans la langue affichée
            ip.locator('#toggle').click()
            ip.locator('#p-name').fill('Zed')  # saisie en cours, non validée
            set_field(ip.locator('#s-questions'), 'x')  # valeur invalide en cours
            titles = {'fr': 'Ordre de passage', 'en': 'Running order', 'es': 'Orden de intervención', 'ar': 'ترتيب العروض', 'pt': 'Ordem de apresentação', 'de': 'Reihenfolge', 'it': 'Ordine degli interventi'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-passages')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#passages > li')).to_have_count(5)
                expect(ip.locator('#st-time')).to_have_text(re.compile(r'^\d{1,2}:\d\d$'))  # chiffres latins, lisibles de loin
                expect(ip.locator('#p-name')).to_have_value('Zed')
                expect(ip.locator('#s-questions')).to_have_value('x')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            set_field(ip.locator('#s-present'), '1:2')
            expect(ip.locator('#settings-status')).to_contain_text('Invalid duration')  # erreur du moteur traduite
            expect(ip.locator('#st-phase')).to_have_text('Presentation')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS OralPresentationClock: validation, settings, running order, timestamp-based timer (thresholds, background jump, pause, questions, reload), full screen, keyboard, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
