"""VolunteerRoster dans Chromium : bénévoles, créneaux, validation, affectation automatique, ajustement manuel, modification,
trous, planning par personne, impression, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-volunteerroster-v1'
D = '2026-06-20'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_window(page, start, end, day=D):
    page.locator('#a-day').fill(day)
    page.locator('#a-start').fill(start)
    page.locator('#a-end').fill(end)
    page.locator('#add-window').click()


def add_volunteer(page, name, skills, hours, windows):
    page.locator('#v-name').fill(name)
    page.locator('#v-skills').fill(skills)
    page.locator('#v-hours').fill(hours)
    for s, e in windows:
        add_window(page, s, e)
    page.locator('#save-vol').click()
    expect(page.locator('#vol-status')).to_have_text(f'Bénévole ajouté : {name}.')


def add_shift(page, post, start, end, need, skill=''):
    page.locator('#s-post').fill(post)
    page.locator('#s-skill').fill(skill)
    page.locator('#s-day').fill(D)
    page.locator('#s-start').fill(start)
    page.locator('#s-end').fill(end)
    page.locator('#s-need').fill(need)
    page.locator('#save-shift').click()
    expect(page.locator('#shift-status')).to_contain_text(f'Créneau ajouté : {post}')


def card(page, post, start):
    return page.locator('#roster article.shift').filter(has_text=post).filter(has_text=start + '–')


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
            page.goto(origin)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'

            # Validation.
            page.locator('#save-vol').click()
            expect(page.locator('#vol-status')).to_have_text('Ajoutez au moins une disponibilité')
            add_window(page, '12:00', '10:00')
            expect(page.locator('#vol-status')).to_have_text("L'heure de fin doit suivre l'heure de début, le même jour")
            add_window(page, '08:00', '18:00')
            page.locator('#v-hours').fill('6')
            page.locator('#save-vol').click()
            expect(page.locator('#vol-status')).to_have_text('Nom du bénévole obligatoire')
            page.locator('#v-name').fill('Alice')
            page.locator('#v-skills').fill('secours')
            page.locator('#v-hours').fill('abc')
            page.locator('#save-vol').click()
            expect(page.locator('#vol-status')).to_contain_text("Maximum d'heures invalide")
            page.locator('#v-hours').fill('6')
            page.locator('#save-vol').click()
            expect(page.locator('#vol-status')).to_have_text('Bénévole ajouté : Alice.')
            add_volunteer(page, 'Bruno', '', '4', [('08:00', '12:00')])
            add_volunteer(page, 'Chloé', 'accueil', '8', [('12:00', '20:00')])
            expect(page.locator('#volunteers > li')).to_have_count(3)

            page.locator('#s-post').fill('Accueil')
            page.locator('#s-day').fill(D)
            page.locator('#s-start').fill('08:00')
            page.locator('#s-end').fill('12:00')
            page.locator('#s-need').fill('0')
            page.locator('#save-shift').click()
            expect(page.locator('#shift-status')).to_have_text('Besoin : nombre entier de 1 à 50')
            add_shift(page, 'Accueil', '08:00', '12:00', '2')
            add_shift(page, 'Secours', '10:00', '14:00', '1', 'Secours')
            add_shift(page, 'Accueil', '12:00', '16:00', '1')
            add_shift(page, 'Bar', '16:00', '20:00', '2')
            expect(page.locator('#roster article.shift')).to_have_count(4)

            # Affectation automatique : contraintes respectées, deux trous signalés.
            page.locator('#auto').click()
            expect(page.locator('#gaps')).to_have_text('2 places non pourvues sur 2 créneau(x).')
            expect(card(page, 'Accueil', '08:00').locator('.chip')).to_have_count(2)
            expect(card(page, 'Accueil', '12:00')).to_contain_text('Chloé')
            expect(card(page, 'Secours', '10:00')).to_contain_text('Manque 1 sur 1')
            expect(card(page, 'Secours', '10:00')).to_contain_text('Pas assez de bénévoles libres')
            # Ajustement manuel : les bénévoles non éligibles sont listés avec la raison.
            sel = card(page, 'Secours', '10:00').locator('select')
            expect(sel.locator('option', has_text='Bruno — compétence manquante')).to_be_disabled()
            expect(sel.locator('option', has_text='Alice — déjà pris à cette heure')).to_be_disabled()
            add_volunteer(page, 'Dan', 'Secours', '4', [('10:00', '14:00')])
            card(page, 'Secours', '10:00').locator('select').select_option(label='Dan')
            card(page, 'Secours', '10:00').locator('[data-action=assign]').click()
            expect(page.locator('#roster-status')).to_have_text('Dan affecté à Secours (verrouillé).')
            expect(page.locator('#gaps')).to_have_text('1 place non pourvue sur 1 créneau(x).')
            expect(card(page, 'Secours', '10:00').locator('.chip.locked')).to_have_count(1)
            # Modifier Chloé (plus disponible le soir) retire son créneau au bar.
            page.locator('#volunteers > li').filter(has_text='Chloé').locator('[data-action=edit]').click()
            expect(page.locator('#pending-windows .chip')).to_have_count(1)
            page.locator('#pending-windows button').click()
            add_window(page, '12:00', '16:00')
            page.locator('#save-vol').click()
            expect(page.locator('#vol-status')).to_have_text('Bénévole modifié : Chloé. 1 affectation devenue impossible a été retirée.')
            expect(card(page, 'Bar', '16:00')).to_contain_text('Manque 2 sur 2')
            expect(card(page, 'Bar', '16:00')).to_contain_text("Personne n'a à la fois la disponibilité et la compétence.")
            # Recalcul : l'affectation verrouillée de Dan est conservée.
            page.locator('#auto').click()
            expect(card(page, 'Secours', '10:00')).to_contain_text('Dan')
            expect(page.locator('#gaps')).to_have_text('2 places non pourvues sur 1 créneau(x).')

            # Planning par personne et impression.
            page.locator('#who').select_option(label='Alice')
            expect(page.locator('#person-view')).to_contain_text('1 créneau · 4 h (maximum 6 h)')
            page.evaluate('() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; }')
            page.locator('#print').click()
            assert page.evaluate('() => window.__printed') == 1
            page.emulate_media(media='print')
            expect(page.locator('#print-area')).to_be_visible()
            expect(page.locator('#print-area h2')).to_have_text('Alice')
            expect(page.locator('#h-roster')).to_be_hidden()
            page.emulate_media(media='screen')
            expect(page.locator('#print-area')).to_be_hidden()

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig').strip().splitlines()
            assert csv[0] == '"Date";"Début";"Fin";"Poste";"Compétence";"Besoin";"Affectés";"Manquants";"Bénévoles"', csv[0]
            assert csv[1] == f'"{D}";"08:00";"12:00";"Accueil";"";"2";"2";"0";"Alice / Bruno"', csv[1]
            assert csv[2] == f'"{D}";"10:00";"14:00";"Secours";"Secours";"1";"1";"0";"Dan (manuel)"', csv[2]
            assert csv[4].endswith('"Bar";"";"2";"0";"2";""'), csv[4]

            # Sauvegarde, puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            data = json.loads(backup)
            assert data['app'] == 'volunteerroster' and len(data['volunteers']) == 4 and len(data['assignments']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'pas du json')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#export-raw')).to_be_visible()
            add_window(page, '08:00', '09:00')
            page.locator('#v-name').fill('X')
            page.locator('#v-hours').fill('2')
            page.locator('#save-vol').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'pas du json'
            bad = dict(data, assignments=[{'shiftId': data['shifts'][1]['id'], 'volunteerId': data['volunteers'][1]['id'], 'locked': True}])
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 4 bénévoles.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#roster article.shift')).to_have_count(4)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#volunteers > li')).to_have_count(4)
            expect(page.locator('#gaps')).to_have_text('2 places non pourvues sur 1 créneau(x).')
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : 7 langues complètes, sans débordement ; arabe de droite à gauche ; saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='de-DE')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Die richtige Person am richtigen Posten, ohne Lücken.')  # navigateur allemand
            assert ip.locator('#louvre-currency').count() == 0  # aucune somme d'argent : menu langue seul
            ip.locator('#sample').click()
            expect(ip.locator('#roster article.shift').first).to_contain_text('Empfang')  # exemple dans la langue affichée
            expect(ip.locator('#roster article.shift')).to_have_count(7)
            ip.locator('#v-name').fill('Zed')  # saisie en cours, non validée
            add_window(ip, '09:00', '10:00')  # disponibilité en attente, non enregistrée
            titles = {'fr': 'Planning', 'en': 'Rota', 'es': 'Cuadrante', 'ar': 'الجدول', 'pt': 'Escala', 'de': 'Dienstplan', 'it': 'Programma'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#h-roster')).to_have_text(titles[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#roster article.shift')).to_have_count(7)
                expect(ip.locator('#v-name')).to_have_value('Zed')
                expect(ip.locator('#pending-windows .chip:not(.empty)')).to_have_count(1)
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            ip.locator('#s-post').fill('Gate')
            ip.locator('#s-start').fill('09:00')
            ip.locator('#s-end').fill('10:00')
            ip.locator('#s-need').fill('99')
            ip.locator('#save-shift').click()
            expect(ip.locator('#shift-status')).to_have_text('Needed: whole number from 1 to 50')  # erreur du moteur traduite
            assert not errors, errors
            browser.close()
        print('BROWSER PASS VolunteerRoster: validation, volunteers, shifts, automatic assignment, manual adjustment with reasons, locks, edit and prune, gaps, per-person schedule, print, CSV, export/restore, corrupted storage, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
