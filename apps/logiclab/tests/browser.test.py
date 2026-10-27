"""LogicLab dans Chromium : saisie, palette, table de vérité, classification, équivalence, formes normales, enregistrement,
CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-logiclab-v1'
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
            page.on('dialog', lambda d: d.accept('Mon exercice') if d.type == 'prompt' else d.accept())
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#verdict-a')).to_have_text('Saisissez une expression A.')

            # Validation : erreur localisée avec curseur.
            page.locator('#expr-a').fill('(p ∧ q')
            expect(page.locator('#verdict-a')).to_have_text("Expression A : la parenthèse ouverte en position 1 n'est pas fermée par « ) ».")
            expect(page.locator('#caret')).to_have_text('(p ∧ q\n^')
            page.locator('#expr-a').fill('p q')
            expect(page.locator('#verdict-a')).to_contain_text('opérateur manquant (position 3)')
            expect(page.locator('#export-csv')).to_be_disabled()

            # Parcours principal : saisie au clavier et par la palette.
            page.locator('#expr-a').fill('(p -> q) ET p')
            expect(page.locator('#verdict-a')).to_have_text('Satisfiable mais pas toujours vraie (contingente). 1 ligne vraie sur 4.')
            expect(page.locator('#read-as')).to_contain_text('(p → q) ∧ p')
            rows = page.locator('#table-wrap tbody tr')
            expect(rows).to_have_count(4)
            expect(page.locator('#table-wrap thead th')).to_have_text(['p', 'q', 'p → q', 'A'])
            expect(rows.nth(3).locator('td')).to_have_text(['1', '1', '1', '1'])
            page.locator('#only-true').check()
            expect(rows).to_have_count(1)
            page.locator('#only-true').uncheck()
            page.locator('#expr-a').fill('')
            page.locator('#expr-a').focus()
            page.locator('#expr-a').type('p')
            page.locator('.sym[data-ins="∨"]').click()
            page.locator('.sym[data-ins="¬"]').click()
            page.locator('#expr-a').type('p')
            expect(page.locator('#expr-a')).to_have_value('p ∨ ¬p')
            expect(page.locator('#verdict-a')).to_have_text('Tautologie : A est vraie sur toutes les lignes. 2 lignes vraies sur 2.')

            # Équivalence et contre-exemples.
            page.locator('#expr-a').fill('p → q')
            page.locator('#expr-b').fill('q → p')
            expect(page.locator('#verdict-b')).to_have_text('A et B ne sont pas équivalentes : elles diffèrent sur 2 lignes sur 4.')
            expect(page.locator('#diff li')).to_have_count(2)
            expect(page.locator('#diff li').first).to_contain_text('p = 0, q = 1')
            expect(page.locator('#table-wrap tr.differs')).to_have_count(2)
            page.locator('#expr-b').fill('¬q → ¬p')
            expect(page.locator('#verdict-b')).to_have_text('A et B sont équivalentes : même valeur sur toutes les lignes.')

            # Formes normales et « comparer comme B ».
            page.locator('#expr-a').fill('p ∧ q ∨ r')
            page.locator('#expr-b').fill('')
            expect(page.locator('[data-form="dnf"] pre')).to_have_text('r ∨ (p ∧ q)')
            expect(page.locator('[data-form="cnf"] pre')).to_have_text('(p ∨ r) ∧ (q ∨ r)')
            expect(page.locator('[data-form="canonDnf"] pre')).to_contain_text('(¬p ∧ ¬q ∧ r)')
            page.locator('[data-form="cnf"] button').click()
            expect(page.locator('#expr-b')).to_have_value('(p ∨ r) ∧ (q ∨ r)')
            expect(page.locator('#verdict-b')).to_contain_text('sont équivalentes')
            # Écriture « programmation » : enregistrée immédiatement dans les préférences.
            page.locator('#notation').select_option('ascii')
            expect(page.locator('[data-form="dnf"] pre')).to_have_text('r | (p & q)')
            assert stored(page)['prefs']['notation'] == 'ascii'
            page.locator('#order').select_option('trueFirst')
            expect(rows.first.locator('td').first).to_have_text('1')

            # Export CSV avec en-têtes traduits.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').splitlines()
            assert csv[0] == '"p","q","r","A = p & q | r","B = (p | r) & (q | r)"', csv[0]
            assert csv[1] == '"1","1","1","1","1"' and len(csv) == 9, csv

            # Enregistrement d'une expression ; la dernière frappe est enregistrée avant (brouillon différé forcé).
            page.locator('#expr-a').fill('a ⊕ b')
            page.locator('#expr-b').fill('')
            page.locator('#expr-a').press('End')
            page.locator('#expr-a').type(' ⊕ c')
            page.locator('#save-expr').click()
            expect(page.locator('#expr-status')).to_have_text('Enregistré : Mon exercice.')
            data = stored(page)
            assert data['draft'] == {'a': 'a ⊕ b ⊕ c', 'b': ''}, data['draft']
            assert data['saved'][0]['a'] == 'a ⊕ b ⊕ c'
            # Exemple : expressions nommées dans la langue affichée.
            page.locator('#sample').click()
            expect(page.locator('#saved li')).to_have_count(6)
            expect(page.locator('#saved')).to_contain_text('Loi de De Morgan')
            expect(page.locator('#verdict-b')).to_contain_text('sont équivalentes')
            page.locator('#saved li', has_text='Implication et réciproque').locator('button', has_text='Charger').click()
            expect(page.locator('#expr-b')).to_have_value('q → p')
            page.locator('#saved li', has_text='Mon exercice').locator('button', has_text='Supprimer').click()
            expect(page.locator('#saved li')).to_have_count(5)
            # Expression invalide : pas d'enregistrement.
            page.locator('#expr-a').fill('p ∧')
            page.locator('#save-expr').click()
            expect(page.locator('#expr-status')).to_contain_text('variable, constante ou parenthèse attendue')
            assert len(stored(page)['saved']) == 5

            # Sauvegarde JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            page.locator('#expr-a').fill('p ∨ q')
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['draft']['a'] == 'p ∨ q'
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#expr-a').fill('r')
            page.locator('#expr-a').blur()
            page.locator('#sample').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            expect(page.locator('#verdict-a')).to_contain_text('Satisfiable')  # le calcul reste possible
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"logiclab","version":1}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 5 expressions.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#expr-a')).to_have_value('p ∨ q')
            expect(page.locator('#notation')).to_have_value('ascii')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#saved li')).to_have_count(5)
            expect(page.locator('#table-wrap tbody tr')).to_have_count(4)
            context.set_offline(False)

            # Dix variables : 1 024 lignes (limite comptée sur l'union de A et B).
            page.locator('#expr-a').fill('a&b|c&d|e&f|g&h|i&j')
            expect(page.locator('#verdict-a')).to_contain_text('12 variables : 10 au plus.')  # B = q → p
            page.locator('#expr-b').fill('')
            expect(page.locator('#table-wrap tbody tr')).to_have_count(1024)
            expect(page.locator('[data-form="dnf"] pre')).to_have_text('(a & b) | (c & d) | (e & f) | (g & h) | (i & j)')
            page.locator('#expr-a').fill('a&b&c&d&e&f&g&h&i&j&k')
            expect(page.locator('#verdict-a')).to_contain_text('11 variables : 10 au plus.')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Verdadeiro, falso… ou depende?')
            ip.locator('#sample').click()
            expect(ip.locator('#saved')).to_contain_text('Lei de De Morgan')
            ip.locator('#expr-b').fill('¬p ∧ ¬q')  # saisie en cours
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#expr-a')).to_have_value('¬(p ∧ q)')
                expect(ip.locator('#expr-b')).to_have_value('¬p ∧ ¬q')
                expect(ip.locator('#table-wrap tr.differs')).to_have_count(2)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-table')).to_have_text('جدول الصدق')
            expect(ip.locator('#verdict-b')).to_have_text('A وB غير متكافئين: يختلفان في سطرين من 4. لكن B يستلزم A (A صادق حيثما كان B صادقًا).')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#verdict-a')).to_have_text('Erfüllbar, aber nicht immer wahr (kontingent). 3 wahre Zeilen von 4.')
            ip.locator('#expr-a').fill('p ∧ (q')
            expect(ip.locator('#verdict-a')).to_have_text('Ausdruck A: Die an Position 5 geöffnete Klammer wird nicht mit „)“ geschlossen.')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS LogicLab: parse errors with caret, palette, truth table, filters, tautology/contradiction/contingent, equivalence + counterexamples, normal forms, notation, CSV, saved expressions, debounce flush, backup/restore, corrupted storage, offline, 10 variables, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
