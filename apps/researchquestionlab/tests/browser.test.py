"""ResearchQuestionLab dans Chromium : projet, étapes guidées, validations, liste de contrôle, Markdown, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-researchquestionlab-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_bytes().decode('utf-8')


def step(page, n):
    page.locator(f'#steps button[data-step="{n}"]').click()
    expect(page.locator(f'#step-{n}')).to_be_visible()


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
            expect(page.locator('#no-project')).to_be_visible()
            expect(page.locator('#steps button').first).to_be_disabled()

            # Nouveau projet ; étape 1 : le titre est obligatoire.
            page.locator('#new-project').click()
            expect(page.locator('#project-status')).to_have_text("Projet créé : commencez par l'étape 1.")
            expect(page.locator('[data-field=title]')).to_have_value('Projet 1')
            expect(page.locator('#progress-text')).to_have_text('Liste de contrôle : 3 sur 20 (15 %)')
            page.locator('[data-field=title]').fill('')
            expect(page.locator('#step-1 .fstat')).to_have_text('Titre obligatoire')
            page.locator('[data-field=title]').fill('Gouvernance et risque')
            page.locator('[data-field=problem]').fill('Les conseils diversifiés prennent-ils moins de risques financiers ? Le débat reste ouvert.')
            expect(page.locator('#project-select')).to_contain_text('Gouvernance et risque')
            expect(page.locator('#progress-text')).to_have_text('Liste de contrôle : 4 sur 20 (20 %)')

            # Étape 2 : type de lacune avec aide contextuelle.
            page.locator('#next').click()
            expect(page.locator('#step-2')).to_be_visible()
            page.locator('#gap-type').select_option('contradictory')
            expect(page.locator('#gap-help')).to_contain_text('résultats opposés')
            page.locator('[data-field=gap]').fill('Résultats opposés selon les pays.')

            # Étape 3 : questions (validation, type, forme interrogative).
            step(page, 3)
            page.locator('#q-save').click()
            expect(page.locator('#q-status')).to_have_text('Écrivez la question')
            page.locator('#q-form [name=text]').fill('Effet de la diversité du conseil sur le risque')
            page.locator('#q-kind').select_option('causal')
            expect(page.locator('#kind-help')).to_contain_text("stratégie d'identification")
            page.locator('#q-save').click()
            expect(page.locator('#q-status')).to_have_text('Question ajoutée.')
            expect(page.locator('#questions li')).to_have_count(1)

            # Étape 4 : variables (doublon refusé).
            step(page, 4)
            for name, role, measure, source in [('Risque', 'dependent', 'Volatilité des rendements', 'Cours boursiers'), ('Diversité du conseil', 'independent', 'Part de femmes', '')]:
                page.locator('#v-form [name=name]').fill(name)
                page.locator('#v-role').select_option(role)
                page.locator('#v-form [name=measure]').fill(measure)
                page.locator('#v-form [name=source]').fill(source)
                page.locator('#v-save').click()
                expect(page.locator('#v-status')).to_have_text('Variable ajoutée.')
            page.locator('#v-form [name=name]').fill('risque')
            page.locator('#v-save').click()
            expect(page.locator('#v-status')).to_have_text('Une variable porte déjà ce nom')
            page.locator('#v-form [name=name]').fill('')

            # Étape 5 : hypothèse reliée aux variables.
            step(page, 5)
            page.locator('#h-iv').select_option(label='Diversité du conseil (Indépendante)')
            page.locator('#h-dv').select_option(label='Risque (Dépendante)')
            page.locator('#h-dir').select_option('negative')
            page.locator('#h-form [name=text]').fill('Plus le conseil est diversifié, plus le risque est faible.')
            page.locator('#h-save').click()
            expect(page.locator('#h-status')).to_have_text('Hypothèse ajoutée.')
            expect(page.locator('#hypotheses li').first).to_contain_text('Diversité du conseil → Risque')

            # Étape 6 : période validée.
            step(page, 6)
            page.locator('[data-field=periodStart]').fill('2024')
            page.locator('[data-field=periodEnd]').fill('2015')
            expect(page.locator('#field-status')).to_have_text("L'année de début dépasse l'année de fin")
            page.locator('[data-field=periodStart]').fill('2010')
            expect(page.locator('#field-status')).to_have_text('')
            page.locator('[data-check=ethics]').check()

            # Étape 7 : liste de contrôle et renvoi vers l'étape à corriger.
            step(page, 7)
            checklist = page.locator('#checklist li')
            expect(checklist).to_have_count(20)
            expect(page.locator('#checklist li.warn').filter(has_text='Questions formulées comme des questions')).to_contain_text('1 question à reformuler.')
            expect(page.locator('#checklist li.warn').filter(has_text='Chaque variable a une source')).to_contain_text('1 variable sans source.')
            expect(page.locator('#score')).to_have_text('11 points sur 20 remplis.')
            page.locator('#checklist li').filter(has_text='Questions formulées').get_by_role('button').click()
            expect(page.locator('#step-3')).to_be_visible()
            page.locator('#questions li').get_by_role('button', name='Modifier Q1').click()
            expect(page.locator('#q-save')).to_have_text('Enregistrer')
            page.locator('#q-form [name=text]').fill('La diversité du conseil réduit-elle le risque ?')
            page.locator('#q-save').click()
            expect(page.locator('#q-status')).to_have_text('Modification enregistrée.')
            expect(page.locator('#progress-text')).to_have_text('Liste de contrôle : 12 sur 20 (60 %)')

            # Export Markdown dans la langue affichée.
            step(page, 7)
            md = download_text(page, '#export-md')
            assert md.startswith('# Gouvernance et risque\n\n## Problème\n'), md[:80]
            assert '**Résultats contradictoires** — Résultats opposés selon les pays.' in md
            assert '| Diversité du conseil | Indépendante | Part de femmes |  |' in md
            assert 'Diversité du conseil → Risque · Effet négatif' in md
            assert '- [x] Questions formulées comme des questions' in md and '- [ ] Accès aux données confirmé' in md

            # Supprimer la variable explicative défait le lien de l'hypothèse.
            step(page, 4)
            page.locator('#variables li').filter(has_text='Diversité').get_by_role('button', name='Supprimer').click()
            expect(page.locator('#variables li')).to_have_count(1)
            step(page, 5)
            expect(page.locator('#hypotheses li').first).to_contain_text('— à relier — → Risque')

            # Sauvegarde, stockage corrompu, restauration.
            backup = download_text(page, '#export')
            assert json.loads(backup)['projects'][0]['title'] == 'Gouvernance et risque'
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#sample').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"researchquestionlab","version":1,"projects":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée : Sauvegarde invalide ou abîmée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 projet.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('[data-field=title]')).to_have_value('Gouvernance et risque')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#project-select')).to_contain_text('Gouvernance et risque')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : exemple dans la langue détectée, 7 langues sans débordement, brouillon conservé.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('De uma intuição a uma questão de investigação testável')
            ip.locator('#sample').click()
            expect(ip.locator('#project-select')).to_contain_text('Exemplo — Notações ESG')
            expect(ip.locator('#step-7')).to_be_visible()
            expect(ip.locator('#score')).to_have_text('14 de 20 pontos preenchidos.')
            ip.locator('#steps button[data-step="3"]').click()
            ip.locator('#q-form [name=text]').fill('Rascunho?')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#q-form [name=text]')).to_have_value('Rascunho?')
                expect(ip.locator('#questions li')).to_have_count(2)
                ip.locator('#steps button[data-step="7"]').click()
                expect(ip.locator('#checklist li')).to_have_count(20)
                ip.locator('#steps button[data-step="3"]').click()
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#questions .tag').first).to_have_text('Causal')
            expect(ip.locator('#step-3 h2')).to_have_text('3. Aim and questions')
            ip.locator('#louvre-lang').select_option('de')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Von der Idee zur prüfbaren Forschungsfrage')
            ip.locator('#steps button[data-step="6"]').click()
            ip.locator('[data-field=periodStart]').fill('99')
            expect(ip.locator('#field-status')).to_have_text('Ungültiges Jahr (4 Ziffern, 1800 bis 2100)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS ResearchQuestionLab: project, guided steps, validation, questions/variables/hypotheses, checklist, Markdown export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
