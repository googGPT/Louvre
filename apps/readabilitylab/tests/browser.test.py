"""ReadabilityLab dans Chromium : analyse, seuils, formules par langue, sélection des phrases longues, textes multiples,
enregistrement différé, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-readabilitylab-v1'
# Liste les éléments qui dépassent à droite (nommés, pour diagnostiquer la CI aux polices plus larges).
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
LONG = ('Pourtant, la direction reste prudente, car les coûts de l\'énergie, qui avaient déjà fortement augmenté '
        'l\'an dernier, continuent de peser sur les marges des usines, en particulier dans les régions concernées.')
TEXT = f'Le rapport a été publié hier. Selon M. Martin, les ventes ont progressé de 3,5 % en un an. {LONG} Les équipes préparent un plan.'


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
            expect(page.locator('#kpis')).to_contain_text('Saisissez un texte')
            expect(page.locator('#text-lang')).to_have_value('fr')  # langue du texte proposée : celle de l'interface

            # Validation d'un seuil : refusé, valeur précédente rétablie.
            page.locator('#long-sentence').fill('3')
            page.locator('#long-sentence').dispatch_event('change')
            expect(page.locator('#text-status')).to_have_text('Seuil de phrase longue : entier de 5 à 100')
            expect(page.locator('#long-sentence')).to_have_value('25')

            # Analyse : 4 phrases (M. et 3,5 ne coupent pas), une phrase longue, formule française.
            page.locator('#text').fill(TEXT)
            expect(page.locator('#kpis .kpi').first).to_contain_text('4')
            expect(page.locator('#long-list li')).to_have_count(1)
            expect(page.locator('#long-list li').first).to_contain_text('Phrase 3 · 33 mots')
            expect(page.locator('#formulas')).to_contain_text('Kandel et Moles (1958)')
            expect(page.locator('#formulas')).to_contain_text('Conçue pour le français')
            expect(page.locator('#formulas')).to_contain_text('Texte court')
            page.wait_for_function(f"() => (JSON.parse(localStorage.getItem('{KEY}') || '{{}}').docs || [])[0]?.text.endsWith('un plan.')")
            # Clic sur une phrase longue : elle est sélectionnée dans la zone de texte.
            page.locator('#long-list button').click()
            expect(page.locator('#text-status')).to_have_text('Phrase 3 sélectionnée dans le texte.')
            sel = page.evaluate('() => { const t = document.getElementById("text"); return t.value.slice(t.selectionStart, t.selectionEnd); }')
            assert sel == LONG, sel

            # Langue du texte : aucune formule pour l'arabe ni pour « autre langue ».
            page.locator('#text-lang').select_option('ar')
            expect(page.locator('#formulas')).to_contain_text("Aucune formule n'est proposée pour l'arabe")
            expect(page.locator('#kpis')).to_contain_text('—')  # pas de syllabes arabes
            page.locator('#text-lang').select_option('other')
            expect(page.locator('#formulas')).to_contain_text('« Autre langue »')
            page.locator('#text-lang').select_option('en')
            expect(page.locator('#formulas')).to_contain_text('Flesch Reading Ease')
            page.locator('#text-lang').select_option('fr')
            assert stored(page)['docs'][0]['lang'] == 'fr'

            # Seuil réglable.
            page.locator('#long-sentence').fill('40')
            page.locator('#long-sentence').dispatch_event('change')
            expect(page.locator('#long-list')).to_contain_text('Aucune phrase ne dépasse 40 mots.')
            assert stored(page)['settings']['longSentence'] == 40
            page.locator('#long-sentence').fill('25')
            page.locator('#long-sentence').dispatch_event('change')
            expect(page.locator('#long-list li')).to_have_count(1)

            # Deuxième texte ; la dernière frappe est enregistrée avant de changer de texte (enregistrement différé forcé).
            page.locator('#new-doc').click()
            expect(page.locator('#doc-select option')).to_have_count(2)
            expect(page.locator('#text')).to_have_value('')
            page.locator('#text').fill('Second texte. Très court.')
            page.locator('#doc-select').select_option(index=0)
            assert stored(page)['docs'][1]['text'] == 'Second texte. Très court.', stored(page)
            expect(page.locator('#text')).to_have_value(TEXT)
            # Fermeture de page : la frappe en attente est enregistrée (pagehide).
            page.locator('#text').fill(TEXT + ' Ajout final.')
            page.reload()
            expect(page.locator('#text')).to_have_value(TEXT + ' Ajout final.')

            # Export CSV des phrases.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            lines = csv.strip().split('\n')
            assert lines[0].strip() == '"N°";"Mots";"Caractères";"Longue";"Phrase"', lines[0]
            assert len(lines) == 6 and '"33";' in lines[3] and '"oui"' in lines[3], csv

            # Sauvegarde, stockage corrompu (rien n'est écrasé, l'analyse fonctionne), restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['docs']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#text').fill('Une phrase. Deux phrases.')
            expect(page.locator('#kpis .kpi').first).to_contain_text('2')
            expect(page.locator('#text-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"readabilitylab","version":1,"settings":{},"docs":[]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()  # la protection reste active
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('2 textes')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#text')).to_have_value(TEXT + ' Ajout final.')

            # Exemple : un texte complet dans la langue affichée.
            page.locator('#sample').click()
            expect(page.locator('#text-status')).to_have_text("Texte d'exemple ajouté.")
            expect(page.locator('#doc-select option')).to_have_count(3)
            expect(page.locator('#doubled')).to_contain_text('« les les » (phrase 7)')
            expect(page.locator('#repeats')).to_contain_text('salariés ×3')
            expect(page.locator('#formulas .formula')).to_have_count(1)
            expect(page.locator('#formulas')).not_to_contain_text('Texte court')
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#formulas .formula')).to_have_count(1)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, 7 langues complètes sans débordement, RTL, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Are your sentences too long?')
            ip.locator('#sample').click()
            expect(ip.locator('#formulas')).to_contain_text('Flesch Reading Ease (Flesch, 1948)')
            expect(ip.locator('#doubled')).to_contain_text('the the')
            ip.locator('#text').fill(ip.locator('#text').input_value() + ' Draft 42.')
            draft = ip.locator('#text').input_value()
            titles = {'fr': 'Mesures', 'en': 'Measures', 'es': 'Medidas', 'ar': 'المقاييس', 'pt': 'Medidas', 'de': 'Messwerte', 'it': 'Misure'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-stats')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#text')).to_have_value(draft)  # saisie conservée
                expect(ip.locator('#text-lang')).to_have_value('en')  # la langue du texte ne suit pas celle de l'interface
                expect(ip.locator('#formulas')).to_contain_text('Flesch Reading Ease')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # pas d'argent : menu des langues seul
            ip.locator('#louvre-lang').select_option('de')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Sind Ihre Sätze zu lang?')
            expect(ip.locator('#text-lang option[value=en]')).to_have_text('Englisch')
            ip.locator('#long-word').fill('99')
            ip.locator('#long-word').dispatch_event('change')
            expect(ip.locator('#text-status')).to_have_text('Schwelle für lange Wörter: ganze Zahl von 6 bis 40')
            # Exemple allemand : Amstad seulement.
            ip.locator('#sample').click()
            expect(ip.locator('#formulas')).to_contain_text('Amstad (1978)')
            expect(ip.locator('#formulas')).not_to_contain_text('Flesch Reading Ease')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS ReadabilityLab: thresholds, sentence split, long-sentence selection, per-language formulas (none for ar/other), multiple texts, debounced save flushed on switch/pagehide, CSV, backup, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
