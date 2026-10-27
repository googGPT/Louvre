"""JSONInspector dans Chromium : validation avec ligne/colonne, arbre, JSONPath, doublons, formatage, gros fichier dans le Worker,
documents, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-jsoninspector-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


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
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#verdict')).to_have_text('Collez du JSON ou ouvrez un fichier.')
            expect(page.locator('#doc-select option')).to_have_count(1)

            # Validation : erreur localisée avec extrait de la ligne.
            page.locator('#editor').fill('{\n  "a": 1,\n  "b": [true, {"c": null}],\n}')
            expect(page.locator('#verdict')).to_have_text('JSON invalide — ligne 3, colonne 27 : virgule en trop avant la fermeture.')
            expect(page.locator('#excerpt')).to_contain_text('3 |   "b": [true, {"c": null}],')
            expect(page.locator('#format')).to_be_disabled()
            page.locator('#editor').fill('{"a": 1}x')
            expect(page.locator('#verdict')).to_contain_text('colonne 9 : texte en trop après la fin du JSON.')

            # Texte valide : arbre, sélection, chemin JSONPath, aperçu.
            page.locator('#editor').fill('{\n  "a": 1,\n  "b": [true, {"c d": null}],\n  "a": 2\n}')
            expect(page.locator('#verdict')).to_have_text('JSON valide. 1 clé dupliquée.')
            tree = page.locator('#tree')
            expect(tree.locator('.pick').first).to_contain_text('$')
            expect(tree.locator('.kids > li.node')).to_have_count(3)  # racine dépliée d'emblée
            expect(tree.locator('.tag.bad')).to_have_text('masquée')
            tree.locator('.kids > li.node').nth(1).locator(':scope > .line > .tog').click()
            tree.locator('.pick', has_text='[1]').click()
            expect(page.locator('#sel-path')).to_have_value("$.b[1]")
            expect(page.locator('#sel-value')).to_have_text('{\n  "c d": null\n}')
            expect(page.locator('#sel-info')).to_contain_text('objet')
            page.locator('#copy-path').click()
            expect(page.locator('#sel-status')).not_to_be_empty()
            # Aller au chemin.
            page.locator('#go-path').fill("$.b[1]['c d']")
            page.locator('#go').click()
            expect(page.locator('#sel-path')).to_have_value("$.b[1]['c d']")
            page.locator('#go-path').fill('$.zzz')
            page.locator('#go').click()
            expect(page.locator('#go-status')).to_have_text('Aucun élément à ce chemin')
            # Doublons : la première valeur est masquée.
            expect(page.locator('#dups li')).to_have_count(1)
            expect(page.locator('#dups li')).to_contain_text('lignes 2 et 4')
            page.locator('#dups button').click()
            expect(page.locator('#sel-masked')).to_be_visible()
            expect(page.locator('#sel-value')).to_have_text('1')
            # Statistiques.
            expect(page.locator('.kpi[data-k="stats.depth"] strong')).to_have_text('3')
            expect(page.locator('.kpi[data-k="stats.members"] strong')).to_have_text('4')
            expect(page.locator('.kpi[data-k="stats.uniqueKeys"] strong')).to_have_text('3')

            # Formatage puis minification (clés dupliquées conservées), enregistrés immédiatement.
            page.locator('#indent').select_option('4')
            page.locator('#format').click()
            expect(page.locator('#doc-status')).to_contain_text('Les clés dupliquées sont conservées')
            assert page.locator('#editor').input_value().startswith('{\n    "a": 1,')
            page.locator('#minify').click()
            expect(page.locator('#editor')).to_have_value('{"a":1,"b":[true,{"c d":null}],"a":2}')
            assert stored(page)['docs'][0]['text'] == '{"a":1,"b":[true,{"c d":null}],"a":2}'
            assert stored(page)['prefs'] == {'indent': '4'}

            # Enregistrement différé forcé avant de changer de document : la dernière frappe n'est pas perdue.
            page.locator('#editor').press('End')
            page.locator('#editor').type(' ')
            page.locator('#new-doc').click()
            expect(page.locator('#doc-select option')).to_have_count(2)
            texts = sorted(d['text'] for d in stored(page)['docs'])
            assert texts == ['', '{"a":1,"b":[true,{"c d":null}],"a":2} '], texts

            # Ouvrir un petit fichier crée un document ; un gros fichier passe en lecture seule, analysé dans le Worker.
            page.locator('#open-file').set_input_files({'name': 'mesures.json', 'mimeType': 'application/json', 'buffer': b'{"t": [1.5, 2.5]}'})
            expect(page.locator('#doc-status')).to_have_text('Fichier ouvert : mesures.')
            expect(page.locator('#verdict')).to_have_text('JSON valide.')
            big = json.dumps([{'id': i, 'name': f'n{i}', 'tags': ['a', 'b'], 'v': i / 3} for i in range(90000)])
            assert len(big) > 5_000_000
            page.evaluate('''() => { window.__gap = 0; let last = performance.now();
              window.__tick = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - last); last = n; }, 20); }''')
            page.locator('#open-file').set_input_files({'name': 'gros.json', 'mimeType': 'application/json', 'buffer': big.encode('utf-8')})
            expect(page.locator('#large')).to_be_visible()
            expect(page.locator('#editor')).to_be_hidden()
            expect(page.locator('#verdict')).to_have_text('JSON valide.', timeout=30000)
            gap = page.evaluate('() => { clearInterval(window.__tick); return window.__gap; }')
            # Garde-fou grossier : sur une machine de CI chargée, le transfert du fichier de test lui-même peut figer
            # la page ~1,5 s ; une analyse de 5 Mo sur le fil principal la figerait bien plus longtemps.
            assert gap < 4000, f'page bloquée {gap} ms'
            expect(page.locator('.kpi[data-k="stats.objects"] strong')).to_have_text('90 000')
            expect(page.locator('#save-state')).to_have_text('Fichier en lecture seule, non enregistré.')
            assert all(len(d['text']) < 1000 for d in stored(page)['docs'])
            expect(page.locator('#tree .kids > li.node')).to_have_count(200)
            page.locator('#tree li.more button').click()
            expect(page.locator('#tree .kids > li.node')).to_have_count(400)
            page.locator('#go-path').fill('$[89999].name')
            page.locator('#go').click()
            expect(page.locator('#sel-value')).to_have_text('"n89999"')
            expect(page.locator('#sel-path')).to_have_value('$[89999].name')
            expect(page.locator('#sel-status')).to_contain_text('sans dérouler')
            with page.expect_download() as d:
                page.locator('#minify').click()
            assert d.value.suggested_filename == 'gros.min.json'
            assert json.loads(pathlib.Path(d.value.path()).read_text(encoding='utf-8'))[5]['name'] == 'n5'
            page.locator('#large-close').click()
            expect(page.locator('#editor')).to_be_visible()

            # Changer de document recharge l'éditeur.
            page.locator('#doc-select').select_option(label='mesures')
            expect(page.locator('#editor')).to_have_value('{"t": [1.5, 2.5]}')

            # Sauvegarde JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['docs']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'corrompu')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#editor')).to_be_disabled()
            expect(page.locator('#new-doc')).to_be_disabled()
            page.locator('#sample').click(force=True)
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            with page.expect_download() as d:
                page.locator('#export-raw').click()
            assert pathlib.Path(d.value.path()).read_text(encoding='utf-8') == 'corrompu'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"jsoninspector","version":1,"prefs":{"indent":"2"},"docs":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'corrompu'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('3 documents')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#editor')).to_be_enabled()
            expect(page.locator('#indent')).to_have_value('4')

            # Hors ligne (Worker compris).
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#doc-select option')).to_have_count(3)
            page.locator('#editor').fill('[1, 2, ]')
            expect(page.locator('#verdict')).to_contain_text('colonne 6')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Ist Ihr JSON wirklich gültig?')
            ip.locator('#sample').click()
            expect(ip.locator('#verdict')).to_have_text('Gültiges JSON. 1 doppelter Schlüssel. 1 ungenaue Zahl.')
            assert '"veranstaltung"' in ip.locator('#editor').input_value()  # exemple dans la langue affichée
            ip.locator('#go-path').fill('$.ort.stadt')
            ip.locator('#go').click()
            expect(ip.locator('#sel-path')).to_have_value('$.ort.stadt')
            ip.locator('#editor').press('Control+End')
            ip.locator('#editor').type('\n')  # saisie en cours
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#sel-path')).to_have_value('$.ort.stadt')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#editor').input_value().endswith('}\n\n'), lang
                assert ip.evaluate("() => document.getElementById('tree').getAttribute('dir')") == 'ltr'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-tree')).to_have_text('الشجرة')
            expect(ip.locator('#verdict')).to_have_text('JSON صالح. مفتاح مكرّر واحد. عدد واحد غير دقيق.')
            ip.locator('#louvre-lang').select_option('es')
            ip.locator('#editor').fill('{"a": tru}')
            expect(ip.locator('#verdict')).to_have_text('JSON no válido — línea 1, columna 7: «tru» no es un valor JSON (true, false o null, en minúsculas).')
            ip.locator('#louvre-lang').select_option('it')
            expect(ip.locator('#verdict')).to_have_text('JSON non valido — riga 1, colonna 7: «tru» non è un valore JSON (true, false o null, in minuscolo).')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS JSONInspector: line/column errors, excerpt, tree, JSONPath, go to path, duplicate keys, stats, format/minify, debounce flush, large file in Worker (page responsive), backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
