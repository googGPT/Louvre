"""IconStudio dans Chromium : dessin à la souris et au clavier, validation, calques, annuler/rétablir, contraste,
export SVG propre, import SVG assaini, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import re
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-iconstudio-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
EVIL = '''<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">
<script>alert(2)</script><a href="javascript:alert(3)"><rect width="4" height="4"/></a>
<circle cx="12" cy="12" r="5" fill="#0b7285" onclick="alert(4)"/><image href="https://evil.example/x.png"/></svg>'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def tool(page, name):
    page.locator(f'input[name=tool][value={name}]').check()


def click_grid(page, x, y):
    """Clique au croisement (x, y) de la grille de dessin (viewBox -0,5 … n + 0,5)."""
    n = page.evaluate("() => Number(document.querySelector('#grid-size').value)")
    box = page.locator('#canvas svg').bounding_box()
    page.mouse.click(box['x'] + (x + 0.5) / (n + 1) * box['width'], box['y'] + (y + 0.5) / (n + 1) * box['height'])


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
            page.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            page.goto(origin)
            expect(page.locator('#icon-select')).to_contain_text('Mon icône')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : langue seulement

            # Validation : chemin avec une commande interdite, polyligne sans point.
            tool(page, 'path')
            page.locator('#path-d').fill('M1 1<script>')
            page.locator('#path-add').click()
            expect(page.locator('#draw-status')).to_contain_text('seules les commandes M, L, H, V, C, Q et Z')
            page.locator('#path-d').fill('M100 100L1 1')
            page.locator('#path-add').click()
            expect(page.locator('#draw-status')).to_contain_text('hors limites')
            tool(page, 'polyline')
            page.locator('#poly-finish').click()
            expect(page.locator('#draw-status')).to_contain_text('au moins 2 points')

            # Rectangle à la souris : deux coins opposés.
            tool(page, 'rect')
            click_grid(page, 2, 2)
            click_grid(page, 10, 8)
            expect(page.locator('#draw-status')).to_contain_text('Rectangle ajouté')
            expect(page.locator('#svg-code')).to_have_value(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n'
                '  <rect x="2" y="2" width="8" height="6" fill="#4263eb" stroke="#212529" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n'
                '</svg>\n')

            # Ligne au clavier : viseur au centre (12, 12), flèches, Entrée.
            tool(page, 'line')
            page.locator('#canvas').focus()
            page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight')
            expect(page.locator('#draw-status')).to_have_text('Viseur en x 14, y 12.')
            page.keyboard.press('Enter')
            page.keyboard.press('Shift+ArrowDown')
            page.keyboard.press('Enter')
            expect(page.locator('#svg-code')).to_have_value(re.compile(re.escape('<line x1="14" y1="12" x2="14" y2="16"')))
            expect(page.locator('#layers li')).to_have_count(2)

            # Annuler / rétablir (boutons et raccourci).
            page.locator('#undo').click()
            expect(page.locator('#layers li')).to_have_count(1)
            page.locator('body').press('Control+y')
            expect(page.locator('#layers li')).to_have_count(2)

            # Calques : la ligne (au-dessus) descend sous le rectangle.
            expect(page.locator('#layers li').first).to_contain_text('Ligne 2')
            page.locator('#layers li').first.get_by_role('button', name='Descendre Ligne 2').click()
            code = page.locator('#svg-code').input_value()
            assert code.index('<line') < code.index('<rect'), code

            # Forme choisie : déplacement au clavier, propriété refusée hors grille.
            tool(page, 'select')
            page.locator('#layers .pick', has_text='Rectangle 1').click()
            expect(page.locator('#props-box')).to_be_visible()
            page.locator('#canvas').focus()
            page.keyboard.press('ArrowLeft')
            expect(page.locator('#svg-code')).to_have_value(re.compile(re.escape('<rect x="1" y="2"')))
            page.locator('#prop-w').fill('40'); page.locator('#prop-w').press('Enter'); page.locator('#prop-w').blur()
            expect(page.locator('#draw-status')).to_contain_text('Taille invalide')
            expect(page.locator('#prop-w')).to_have_value('8')

            # Contraste : un remplissage jaune pâle est signalé sur fond clair.
            page.locator('#fill').fill('#fff3bf')
            expect(page.locator('#contrast li.low').filter(has_text='sur fond clair')).to_have_count(1)
            expect(page.locator('#contrast')).to_contain_text('#fff3bf')

            # Exemple dans la langue affichée.
            page.locator('#sample').click()
            expect(page.locator('#icon-select')).to_contain_text('Maison')
            expect(page.locator('#layers li')).to_have_count(4)
            expect(page.locator('#previews img')).to_have_count(12)

            # Export SVG : fichier minimal et propre.
            with page.expect_download() as d:
                page.locator('#export-svg').click()
            assert d.value.suggested_filename == 'maison.svg'
            svg = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert svg.startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'), svg
            assert svg.count('<polygon') == 1 and svg.count('<path') == 1, svg
            with page.expect_download() as d:
                page.locator('#export-png').click()
            assert d.value.suggested_filename == 'maison-256.png'
            assert pathlib.Path(d.value.path()).read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'

            # Import d'un SVG piégé : seul le cercle est repris, rien d'actif ne passe.
            page.locator('#import-svg').set_input_files({'name': 'piege.svg', 'mimeType': 'image/svg+xml', 'buffer': EVIL.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('SVG importé : 1 forme.')
            expect(page.locator('#backup-status')).to_contain_text('ignorés')
            code = page.locator('#svg-code').input_value()
            for bad in ['script', 'onload', 'onclick', 'javascript', 'href', 'evil']:
                assert bad not in code, (bad, code)
            assert '<circle cx="12" cy="12" r="5" fill="#0b7285"/>' in code, code
            expect(page.locator('#icon-select option')).to_have_count(3)

            # Sauvegarde, stockage corrompu (rien n'est écrasé), restauration.
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert len(saved['icons']) == 3
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert [len(i['shapes']) for i in json.loads(backup)['icons']] == [2, 4, 1]
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'faux.json', 'mimeType': 'application/json', 'buffer': b'{"app":"iconstudio","version":1,"icons":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()  # la protection reste
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('3 icônes')
            expect(page.locator('#warning')).to_be_hidden()

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#icon-select option')).to_have_count(3)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Um ícone nítido, forma a forma.')  # navigateur portugais -> portugais
            ip.locator('#sample').click()
            expect(ip.locator('#icon-select')).to_contain_text('Casa')  # exemple nommé dans la langue affichée
            tool(ip, 'path')
            ip.locator('#path-d').fill('M2 2L6 6')  # saisie en cours, non validée
            layers = {'fr': 'Calques', 'en': 'Layers', 'es': 'Capas', 'ar': 'الطبقات', 'pt': 'Camadas', 'de': 'Ebenen', 'it': 'Livelli'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-layers')).to_have_text(layers[lang])
                expect(ip.locator('#layers li')).to_have_count(4)
                expect(ip.locator('#contrast li')).to_have_count(2)
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#path-d').input_value() == 'M2 2L6 6'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # Erreur du moteur traduite, choix de langue mémorisé.
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#path-d').fill('M1 1A1 1 0 0 1 2 2')
            ip.locator('#path-add').click()
            expect(ip.locator('#draw-status')).to_contain_text('nur die Befehle M, L, H, V, C, Q und Z')
            ip.reload()
            expect(ip.locator('#h-layers')).to_have_text('Ebenen')
            expect(ip.locator('#icon-select')).to_contain_text('Casa')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS IconStudio: validation, mouse and keyboard drawing, undo/redo, layers, nudge, contrast, sample, SVG/PNG export, sanitised SVG import, backup, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
