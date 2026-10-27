"""SurveyComposer dans Chromium : questions, conditions, aperçu, contrôle de qualité, exports, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-surveycomposer-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def download_text(page, button):
    with page.expect_download() as d:
        page.locator(button).click()
    return pathlib.Path(d.value.path()).read_bytes().decode('utf-8')


def add_question(page, qtype, text, **kw):
    form = page.locator('#q-form')
    form.locator('[name=type]').select_option(qtype)
    form.locator('[name=text]').fill(text)
    for name, value in kw.items():
        field = form.locator(f'[name={name}]')
        if name in ('required', 'reversed', 'long'):
            field.set_checked(value)
        elif name in ('points', 'start', 'decimals', 'condQuestion', 'condOp', 'condValueSel', 'section'):
            field.select_option(value)
        else:
            field.fill(value)
    page.locator('#save-q').click()


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
            expect(page.locator('#no-survey')).to_be_visible()

            # Nouveau questionnaire (la boîte de dialogue accepte le titre proposé).
            page.locator('#new-survey').click()
            expect(page.locator('#survey-status')).to_have_text('Questionnaire créé.')
            expect(page.locator('#survey-title')).to_have_value('Questionnaire 1')
            page.locator('#survey-title').fill('Enquête emploi')
            expect(page.locator('#survey-select')).to_contain_text('Enquête emploi (0)')

            # Validation : texte obligatoire, modalités insuffisantes, bornes incohérentes.
            page.locator('#save-q').click()
            expect(page.locator('#form-status')).to_have_text('Au moins deux modalités')
            add_question(page, 'single', 'Avez-vous un emploi ?', options='Oui')
            expect(page.locator('#form-status')).to_have_text('Au moins deux modalités')
            add_question(page, 'single', ' ', options='Oui\nNon')
            expect(page.locator('#form-status')).to_have_text('Texte de la question obligatoire')

            add_question(page, 'single', 'Avez-vous un emploi ?', options='Oui\nNon\n9 = Ne souhaite pas répondre', required=True)
            expect(page.locator('#form-status')).to_have_text('Question Q1 ajoutée.')
            add_question(page, 'number', 'Heures travaillées par semaine', min='80', max='0')
            expect(page.locator('#form-status')).to_have_text('Le minimum doit être inférieur au maximum')
            page.locator('#q-form [name=condQuestion]').select_option(label='Q1 · Avez-vous un emploi ?')
            expect(page.locator('#q-form [name=condOp]')).to_have_value('eq')
            add_question(page, 'number', 'Heures travaillées par semaine', min='0', max='80', unit='h', condValueSel='1')
            expect(page.locator('#form-status')).to_have_text('Question Q2 ajoutée.')
            add_question(page, 'likert', 'Mon travail me plaît.', points='5', minLabel="Pas du tout d'accord", maxLabel="Tout à fait d'accord")
            add_question(page, 'likert', 'Le salaire et les horaires me conviennent.', points='7', minLabel="Pas du tout d'accord", maxLabel="Tout à fait d'accord")
            expect(page.locator('#form-status')).to_have_text('Question Q4 ajoutée.')
            expect(page.locator('#sections .qlist li')).to_have_count(4)
            expect(page.locator('#sections .qlist li').nth(1)).to_contain_text('si Q1 = « Oui »')

            # Contrôle de qualité : question double (« et ») et échelles différentes dans la section.
            quality = page.locator('#quality')
            expect(quality).to_contain_text('Q4 contient « et » : question double possible')
            expect(quality).to_contain_text('échelles de Likert différentes')
            expect(quality).to_contain_text('5 points à partir de 1 : Q3')
            # Correction depuis la liste : le formulaire est prérempli, on passe Q4 à 5 points et on reformule.
            quality.locator('li', has_text='Q4 contient').get_by_role('button', name='Modifier Q4').click()
            expect(page.locator('#q-form-title')).to_have_text('Modifier la question Q4')
            expect(page.locator('#q-form [name=points]')).to_have_value('7')
            page.locator('#q-form [name=points]').select_option('5')
            page.locator('#q-form [name=text]').fill('Le salaire me convient.')
            page.locator('#save-q').click()
            expect(page.locator('#form-status')).to_have_text('Question Q4 mise à jour.')
            expect(page.locator('#quality-summary')).to_have_text('Aucun défaut repéré.')

            # Une question utilisée par une condition ne peut pas être supprimée ; la condition ne peut pas viser plus bas.
            page.get_by_role('button', name='Supprimer Q1').click()
            expect(page.locator('#structure-status')).to_have_text('Question utilisée dans la condition de : Q2')
            page.get_by_role('button', name='Monter Q2').click()
            expect(page.locator('#structure-status')).to_have_text('La condition de Q2 doit porter sur une question placée plus haut')

            # Aperçu : Q2 masquée tant que Q1 ≠ Oui ; contrôles obligatoires et bornes.
            pv = page.locator('#preview')
            expect(pv.locator('.pv-q')).to_have_count(4)
            expect(pv.locator('.pv-q').nth(1)).to_be_hidden()
            expect(page.locator('#preview-count')).to_have_text('3 question(s) affichée(s) sur 4')
            page.locator('#check-answers').click()
            expect(page.locator('#preview-status')).to_have_text('1 réponse à corriger.')
            expect(pv.locator('.pv-q').first.locator('.pv-err')).to_have_text('Réponse obligatoire.')
            pv.locator('.pv-q').first.get_by_label('Oui').check()
            expect(pv.locator('.pv-q').nth(1)).to_be_visible()
            pv.locator('.pv-q').nth(1).locator('input').fill('95')
            page.locator('#check-answers').click()
            expect(pv.locator('.pv-q').nth(1).locator('.pv-err')).to_have_text('Valeur hors des bornes prévues.')
            pv.locator('.pv-q').nth(1).locator('input').fill('35,5')
            page.locator('#check-answers').click()
            expect(pv.locator('.pv-q').nth(1).locator('.pv-err')).to_have_text('Au plus 0 décimale(s).')
            pv.locator('.pv-q').nth(1).locator('input').fill('35')
            pv.locator('.pv-q').nth(2).get_by_label('4').check()
            page.locator('#check-answers').click()
            expect(page.locator('#preview-status')).to_have_text('Réponses valides : 3 variables renseignées.')
            pv.locator('.pv-q').first.get_by_label('Non').check()
            expect(pv.locator('.pv-q').nth(1)).to_be_hidden()
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert sorted(saved) == ['app', 'surveys', 'version'] and sorted(saved['surveys'][0]) == ['id', 'intro', 'lang', 'sections', 'title'], 'les réponses de l\'aperçu ne doivent pas être enregistrées'
            assert [q['code'] for q in saved['surveys'][0]['sections'][0]['questions']] == ['Q1', 'Q2', 'Q3', 'Q4']

            # Exports : dictionnaire des codes (CSV, en-têtes traduits) et version texte.
            csv = download_text(page, '#export-csv')
            assert csv.startswith('﻿Section,Variable,Question,Type,Valeur,Libellé,Obligatoire,Condition,Remarque\r\n'), csv[:120]
            assert 'Section 1,Q1,Avez-vous un emploi ?,Choix unique,9,Ne souhaite pas répondre,oui,,\r\n' in csv, csv
            assert 'Section 1,Q2,Heures travaillées par semaine,Nombre,,,non,Q1 = 1,min 0 ; max 80 ; 0 décimale(s) ; h\r\n' in csv, csv
            page.locator('#csv-sep').select_option(';')
            assert download_text(page, '#export-csv').startswith('﻿Section;Variable;')
            txt = download_text(page, '#export-txt')
            assert txt.startswith('ENQUÊTE EMPLOI\n'), txt[:80]
            assert '  [Si réponse à la question 1 = « Oui »]\n2. Heures travaillées par semaine\n   __________ h   (minimum 0, maximum 80)' in txt, txt
            assert '1. Avez-vous un emploi ? *\n   Une seule réponse\n   ○ Oui' in txt

            # Sauvegarde, stockage corrompu : rien n'est écrasé, refus d'un faux fichier, puis restauration.
            backup = download_text(page, '#export')
            assert len(json.loads(backup)['surveys']) == 1
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            page.locator('#new-survey').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            raw = download_text(page, '#export-raw')
            assert raw == '{abîmé'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': b'{"app":"autre"}'})
            expect(page.locator('#backup-status')).to_contain_text("n'est pas une sauvegarde SurveyComposer")
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 questionnaire.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#sections .qlist li')).to_have_count(4)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#sections .qlist li')).to_have_count(4)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection, exemple dans la langue affichée, 7 langues sans débordement, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-MX')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Un cuestionario claro, antes de la primera respuesta')
            ip.locator('#sample').click()
            expect(ip.locator('#survey-title')).to_have_value('Ejemplo — Satisfacción de los estudiantes')
            expect(ip.locator('#sections .qlist li')).to_have_count(7)
            expect(ip.locator('#quality')).to_contain_text('«y»')
            expect(ip.locator('#quality')).to_contain_text('escalas Likert distintas')
            assert ip.evaluate('() => JSON.parse(localStorage.getItem("louvre-surveycomposer-v1")).surveys[0].lang') == 'es'
            ip.locator('#q-form [name=text]').fill('Borrador en curso')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#sections .qlist li')).to_have_count(7)
                expect(ip.locator('#q-form [name=text]')).to_have_value('Borrador en curso')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            assert ip.locator('#louvre-currency').count() == 0  # appli sans argent : pas de menu devise
            # L'aperçu reste dans la langue du questionnaire (espagnol), l'interface passe en anglais.
            ip.locator('#louvre-lang').select_option('en')
            expect(ip.locator('#h-quality')).to_have_text('Quality check')
            expect(ip.locator('#preview .pv-q').first.locator('.pv-help')).to_have_text('Una sola respuesta')
            assert ip.evaluate("() => document.getElementById('preview').lang") == 'es'
            # Questionnaire en arabe : aperçu de droite à gauche même avec l'interface en anglais.
            ip.locator('#survey-lang').select_option('ar')
            assert ip.evaluate("() => document.getElementById('preview').dir") == 'rtl'
            expect(ip.locator('#preview .pv-q').first.locator('.pv-help')).to_have_text('إجابة واحدة فقط')
            ip.locator('#louvre-lang').select_option('de')
            ip.reload()
            expect(ip.locator('h1')).to_have_text('Ein klarer Fragebogen – vor der ersten Antwort')
            ip.locator('#q-form [name=type]').select_option('likert')
            ip.locator('#q-form [name=text]').fill('Test')
            ip.locator('#q-form [name=code]').fill('1x')
            ip.locator('#save-q').click()
            expect(ip.locator('#form-status')).to_have_text('Ungültiger Code: ein Buchstabe, dann Buchstaben, Ziffern oder _ (höchstens 32)')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS SurveyComposer: validation, conditions, quality check, fix from list, preview, CSV/text export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
