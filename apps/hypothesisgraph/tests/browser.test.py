"""HypothesisGraph dans Chromium : variables, hypothèses, validation, cycles, modération, déplacement, exports, sauvegarde, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-hypothesisgraph-v1'
# Liste les éléments qui dépassent à droite (nommés, pour diagnostiquer la CI aux polices plus larges).
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_var(page, label, role, expect_text=None):
    page.locator('#node-form [name=label]').fill(label)
    page.locator('#node-form [name=role]').select_option(role)
    page.locator('#node-submit').click()
    expect(page.locator('#node-status')).to_contain_text(expect_text or ('Ajoutée : ' + label))


def add_hyp(page, src, dst, sign='+', label=None):
    f = page.locator('#edge-form')
    f.locator('[name=from]').select_option(label=src)
    f.locator('[name=to]').select_option(label=dst)
    f.locator('[name=sign]').select_option(sign)
    if label is not None:
        f.locator('[name=label]').fill(label)
    page.locator('#edge-submit').click()


def stored(page):
    return page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")


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
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Validation : nom obligatoire, doublon refusé, hypothèse sans deux variables refusée.
            page.locator('#node-submit').click()
            expect(page.locator('#node-status')).to_have_text('Nom de la variable obligatoire')
            page.locator('#edge-submit').click()
            expect(page.locator('#edge-status')).to_have_text('Ajoutez au moins deux variables')
            add_var(page, 'Formation', 'iv')
            add_var(page, 'Motivation', 'med')
            add_var(page, 'Performance', 'dv')
            add_var(page, 'formation', 'dv', 'existe déjà')
            expect(page.locator('#node-list li')).to_have_count(3)

            # Hypothèses : étiquettes proposées H1, H2… ; auto-relation et doublon refusés.
            expect(page.locator('#edge-form [name=label]')).to_have_value('H1')
            add_hyp(page, 'Formation (Indépendante)', 'Motivation (Médiatrice)')
            expect(page.locator('#edge-status')).to_have_text('Ajoutée : H1.')
            expect(page.locator('#edge-form [name=label]')).to_have_value('H2')
            add_hyp(page, 'Motivation (Médiatrice)', 'Motivation (Médiatrice)')
            expect(page.locator('#edge-status')).to_have_text('Une variable ne peut pas pointer vers elle-même')
            add_hyp(page, 'Formation (Indépendante)', 'Motivation (Médiatrice)', label='H9')
            expect(page.locator('#edge-status')).to_have_text('Cette relation existe déjà')
            add_hyp(page, 'Motivation (Médiatrice)', 'Performance (Dépendante)', '-', 'H2')
            expect(page.locator('#edge-list li')).to_have_count(2)
            expect(page.locator('#edge-list li').nth(1)).to_contain_text('Motivation a un effet négatif sur Performance.')
            expect(page.locator('#canvas [data-node]')).to_have_count(3)
            expect(page.locator('#paths')).to_contain_text('Formation → Motivation → Performance')
            expect(page.locator('#paths')).to_contain_text('médiation totale')

            # Boucle causale signalée, puis retirée.
            add_hyp(page, 'Performance (Dépendante)', 'Formation (Indépendante)', '+', 'H3')
            expect(page.locator('#diag')).to_contain_text('Boucle causale')
            page.locator('#edge-list li', has_text='H3').get_by_role('button', name='Retirer H3').click()
            expect(page.locator('#diag')).not_to_contain_text('Boucle causale')

            # Modération : W modère l'effet direct Formation → Performance.
            add_var(page, 'Ancienneté', 'mod')
            add_hyp(page, 'Formation (Indépendante)', 'Performance (Dépendante)', '+', 'H3')
            add_hyp(page, 'Ancienneté (Modératrice)', 'H3 : Formation → Performance', '-', 'H4')
            expect(page.locator('#edge-status')).to_have_text('Ajoutée : H4.')
            expect(page.locator('#edge-list li', has_text='H4')).to_contain_text('Ancienneté modère négativement la relation entre Formation et Performance')
            expect(page.locator('#paths')).to_contain_text('médiation partielle')
            expect(page.locator('#diag')).to_contain_text('Aucune incohérence')
            g = stored(page)['graphs'][0]
            assert [e['label'] for e in g['edges']] == ['H1', 'H2', 'H3', 'H4'] and g['manual'] is False

            # Déplacement à la souris puis au clavier ; « Réorganiser » revient à l'automatique.
            page.locator('#canvas [data-node]').first.scroll_into_view_if_needed()
            box = page.locator('#canvas [data-node]').first.bounding_box()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            page.mouse.down()
            page.mouse.move(box['x'] + box['width'] / 2 + 40, box['y'] + box['height'] / 2 + 60, steps=6)
            page.mouse.up()
            page.wait_for_function(f"() => JSON.parse(localStorage.getItem('{KEY}')).graphs[0].manual === true")
            first = page.locator('#canvas [data-node]').first
            node_id = first.get_attribute('data-node')
            before = next(n for n in stored(page)['graphs'][0]['nodes'] if n['id'] == node_id)
            first.focus()
            page.keyboard.press('ArrowDown')
            page.wait_for_function(f"() => JSON.parse(localStorage.getItem('{KEY}')).graphs[0].nodes.find((n) => n.id === '{node_id}').y === {before['y'] + 16}")
            assert page.evaluate('() => document.activeElement.getAttribute("data-node")') == node_id  # le focus reste sur la boîte
            page.locator('#relayout').click()
            expect(page.locator('#model-status')).to_have_text('Mise en page automatique rétablie.')
            assert stored(page)['graphs'][0]['manual'] is False

            # Exports : SVG autonome et hypothèses rédigées.
            with page.expect_download() as d:
                page.locator('#export-svg').click()
            svg = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert svg.startswith('<svg xmlns="http://www.w3.org/2000/svg"') and 'Ancienneté' in svg and 'Modératrice' in svg, svg[:300]
            with page.expect_download() as d:
                page.locator('#export-md').click()
            md = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert '- **H1** (+) : Formation a un effet positif sur Motivation.' in md, md
            assert 'médiation partielle' in md, md

            # Sauvegarde, stockage corrompu (rien n'est écrasé), restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['graphs'][0]['nodes']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#node-form [name=label]').fill('X')
            page.locator('#node-submit').click()
            expect(page.locator('#model-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"hypothesisgraph","version":1,"graphs":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()  # la protection reste active
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 modèle')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#node-list li')).to_have_count(4)

            # Exemple : nouveau modèle complet.
            page.locator('#sample').click()
            expect(page.locator('#model-status')).to_have_text("Modèle d'exemple ajouté.")
            expect(page.locator('#canvas [data-node]')).to_have_count(5)
            assert len(stored(page)['graphs']) == 2
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#canvas [data-node]')).to_have_count(5)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, 7 langues complètes sans débordement, RTL, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Your research model as one clear diagram')
            ip.locator('#sample').click()
            expect(ip.locator('#edge-list li', has_text='H1')).to_contain_text('Training has a positive effect on Motivation.')
            ip.locator('#node-form [name=label]').fill('Brouillon 42')
            titles = {'fr': 'Schéma', 'en': 'Diagram', 'es': 'Esquema', 'ar': 'المخطط', 'pt': 'Esquema', 'de': 'Diagramm', 'it': 'Schema'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-diagram')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#canvas [data-node]')).to_have_count(5)
                expect(ip.locator('#node-form [name=label]')).to_have_value('Brouillon 42')  # saisie conservée
                if lang == 'ar':
                    expect(ip.locator('#paths li').first).to_contain_text(' ← ')  # flèche retournée en arabe
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # pas d'argent : menu des langues seul
            # Le choix de langue est mémorisé ; les hypothèses exportées sont rédigées dans la langue affichée.
            ip.locator('#louvre-lang').select_option('de')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Ihr Forschungsmodell als klares Diagramm')
            with ip.expect_download() as d:
                ip.locator('#export-md').click()
            md = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert 'Training hat einen positiven Effekt auf Motivation.' in md, md  # les noms saisis restent tels quels
            ip.locator('#node-submit').click()
            expect(ip.locator('#node-status')).to_have_text('Name der Variable erforderlich')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS HypothesisGraph: validation, hypotheses, self-loop/duplicate, cycle, moderation, mediation, drag/keyboard move, relayout, SVG/Markdown export, backup, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
