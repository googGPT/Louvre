"""GroupAllocator dans Chromium : liste, import collé, règles, groupes, graine, rapport, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-groupallocator-v1'
ROSTER = 'Nom;Parcours\nBob;Audit\nCléo;Finance\nDan;Audit\n"Martin, Éva";Contrôle\nFarid;Finance\nGina;Audit\nHugo;Contrôle\nInès;Finance\nJonas;Audit\nKenza;Contrôle\nLéo;Finance\n'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def set_field(locator, value):
    """Remplit un champ puis déclenche « change » (comme quand on quitte le champ)."""
    locator.fill(value)
    locator.dispatch_event('change')


def card_of(page, name):
    """Numéro du groupe (texte de l'en-tête) qui contient l'étudiant."""
    return page.locator('#groups .group').filter(has=page.locator('li', has_text=name)).locator('h3 span').first.inner_text()


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
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Saisie : nom obligatoire, doublon refusé.
            page.locator('#student-form button').click()
            expect(page.locator('#student-status')).to_have_text("Nom de l'étudiant obligatoire")
            page.locator('#student-form [name=name]').fill('Ana')
            page.locator('#student-form [name=attr]').fill('Finance')
            page.locator('#student-form button').click()
            expect(page.locator('#student-status')).to_have_text('Ajouté : Ana.')
            page.locator('#student-form [name=name]').fill(' ana ')
            page.locator('#student-form button').click()
            expect(page.locator('#student-status')).to_have_text('« ana » figure déjà dans la liste')

            # Liste collée avec en-tête (séparateur « ; », guillemets).
            page.locator('#import-box summary').click()
            page.locator('#roster-text').fill(ROSTER)
            page.locator('#roster-header').check()
            page.locator('#roster-import').click()
            expect(page.locator('#student-status')).to_have_text('11 étudiants ajoutés.')
            expect(page.locator('#students .chip')).to_have_count(12)
            expect(page.locator('#students')).to_contain_text('Martin, Éva')
            set_field(page.locator('#attr-name'), 'Parcours')
            expect(page.locator('#balance-label')).to_have_text('Équilibrer « Parcours » entre les groupes')

            # Groupes de 4 : 3 groupes, aucune règle.
            expect(page.locator('#groups .group')).to_have_count(3)
            expect(page.locator('#report')).to_contain_text('3 groupes pour 12 étudiants.')
            expect(page.locator('#report')).to_contain_text('Aucune règle à respecter.')

            # Règles : même étudiant refusé ; séparer Ana/Bob, réunir Cléo/Dan.
            form = page.locator('#constraint-form')
            form.locator('[name=a]').select_option(label='Ana')
            form.locator('[name=b]').select_option(label='Ana')
            form.locator('button').click()
            expect(page.locator('#constraint-status')).to_have_text('Choisissez deux étudiants différents')
            form.locator('[name=b]').select_option(label='Bob')
            form.locator('button').click()
            expect(page.locator('#constraint-status')).to_have_text('Règle ajoutée.')
            form.locator('[name=type]').select_option('together')
            form.locator('[name=a]').select_option(label='Cléo')
            form.locator('[name=b]').select_option(label='Dan')
            form.locator('button').click()
            expect(page.locator('#constraints li')).to_have_count(2)
            expect(page.locator('#report')).to_contain_text('Toutes les règles sont respectées.')
            assert card_of(page, 'Ana') != card_of(page, 'Bob')
            assert card_of(page, 'Cléo') == card_of(page, 'Dan')

            # Graine : même graine, mêmes groupes.
            before = page.locator('#groups').text_content()
            set_field(page.locator('#seed'), 'autre')
            expect(page.locator('#seed')).to_have_value('autre')
            set_field(page.locator('#seed'), '1')
            expect(page.locator('#groups')).to_have_text(before)
            set_field(page.locator('#seed'), '')
            expect(page.locator('#settings-status')).to_have_text('Graine obligatoire')

            # Nombre de groupes : 5 groupes (3, 3, 2, 2, 2) ; 1 groupe -> séparation impossible signalée.
            set_field(page.locator('#seed'), '1')
            page.locator('#mode-count').check()
            expect(page.locator('#value-label')).to_have_text('Nombre de groupes')
            set_field(page.locator('#group-value'), '5')
            expect(page.locator('#groups .group')).to_have_count(5)
            set_field(page.locator('#group-value'), '0')
            expect(page.locator('#settings-status')).to_have_text('Nombre de groupes : entier de 1 à 500')
            set_field(page.locator('#group-value'), '1')
            expect(page.locator('#report')).to_contain_text("Ana et Bob n'ont pas pu être séparés (groupe 1).")
            set_field(page.locator('#group-value'), '3')
            # Équilibre du parcours (5 Finance, 4 Audit, 3 Contrôle sur 3 groupes) : chaque groupe a au moins un étudiant de chaque parcours.
            page.locator('#balance').check()
            for value in ['Audit', 'Contrôle', 'Finance']:
                expect(page.locator('#report')).to_contain_text(f'{value} : ')
            assert 'de 0 à' not in page.locator('#report').inner_text()

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').strip().splitlines()
            assert csv[0] == '"Groupe";"Étudiant";"Parcours"', csv[0]
            assert len(csv) == 13 and any('"Martin, Éva";"Contrôle"' in l for l in csv), csv

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert len(data['classes'][0]['students']) == 12 and data['classes'][0]['settings']['balance'] is True
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[1,2')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#student-form [name=name]').fill('Zoé')
            page.locator('#student-form button').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[1,2'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'not json'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('1 classe')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#students .chip')).to_have_count(12)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#groups .group')).to_have_count(3)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-MX', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Grupos equilibrados, sin quebraderos de cabeza.')  # navigateur espagnol
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('#students .chip')).to_have_count(18)
            expect(ip.locator('#students')).to_contain_text('Auditoría')  # exemple dans la langue affichée
            ip.locator('#student-form [name=name]').fill('Borrador')  # saisie en cours, non validée
            set_field(ip.locator('#group-value'), 'zz')  # valeur invalide en cours
            titles = {'fr': 'Contraintes', 'en': 'Rules', 'es': 'Restricciones', 'ar': 'القيود', 'pt': 'Restrições', 'de': 'Regeln', 'it': 'Vincoli'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-constraints')).to_have_text(titles[lang])
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#groups .group')).to_have_count(5)
                expect(ip.locator('#student-form [name=name]')).to_have_value('Borrador')
                expect(ip.locator('#group-value')).to_have_value('zz')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            set_field(ip.locator('#group-value'), 'abc')
            expect(ip.locator('#settings-status')).to_have_text('Target size: whole number from 1 to 500')  # erreur du moteur traduite
            expect(ip.locator('#report')).to_contain_text('5 groups for 18 students.')
            expect(ip.locator('#report')).to_contain_text('All rules are met.')
            with ip.expect_download() as d:
                ip.locator('#export-csv').click()
            head = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').splitlines()[0]
            assert head == '"Group","Student","Itinerario"', head  # en-têtes traduits ; le nom d'attribut saisi (en espagnol) reste tel quel
            assert not errors, errors
            browser.close()
        print('BROWSER PASS GroupAllocator: validation, duplicates, pasted CSV, rules, seed determinism, group count, unsatisfiable report, balance, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
