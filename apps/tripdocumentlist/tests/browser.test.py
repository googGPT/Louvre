"""TripDocumentList dans Chromium : validation, dates et marge, voyageurs, documents, contrôle, notes sans numéro, modification, statut prêt, .ics, impression, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-tripdocumentlist-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add_doc(page, holder, kind, expires='', note='', done=False):
    f = page.locator('#doc-form')
    f.locator('[name=travelerId]').select_option(label=holder)
    f.locator('[name=type]').select_option(kind)
    f.locator('[name=expires]').fill(expires)
    f.locator('[name=note]').fill(note)
    f.locator('[name=done]').set_checked(done)
    page.locator('#add-doc').click()


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
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent
            expect(page.locator('#add-doc')).to_be_disabled()
            expect(page.locator('.notice')).to_contain_text('Ne saisissez jamais de numéro')

            # Validation des dates, puis voyage en 2035 avec une marge de 6 mois.
            f = page.locator('#dates-form')
            f.locator('[name=start]').fill('2035-07-15')
            f.locator('[name=end]').fill('2035-07-01')
            page.locator('#save-dates').click()
            expect(page.locator('#dates-status')).to_have_text('Le retour doit être après le départ')
            f.locator('[name=start]').fill('2035-07-01')
            f.locator('[name=end]').fill('2035-07-15')
            f.locator('[name=margin]').fill('6')
            f.locator('[name=marginUnit]').select_option('m')
            page.locator('#save-dates').click()
            expect(page.locator('#dates-status')).to_have_text("Enregistré : les documents doivent être valides jusqu'au 15 janvier 2036.")

            # Voyageurs et documents.
            for who in ['Nadia', 'Hugo']:
                page.locator('#traveler-form [name=name]').fill(who)
                page.locator('#add-traveler').click()
                expect(page.locator('#traveler-status')).to_have_text(f'Voyageur ajouté : {who}.')
            add_doc(page, 'Nadia', 'passport', '2040-01-01', done=True)
            expect(page.locator('#doc-status')).to_have_text('Ajouté : Passeport de Nadia.')
            add_doc(page, 'Nadia', 'visa', '2035-07-10', note='n° 12AB34567')
            expect(page.locator('#doc-status')).to_have_text("La note semble contenir un numéro : retirez-le, il n'a pas sa place ici")
            add_doc(page, 'Nadia', 'visa', '2035-07-10', note='Demande en ligne')
            add_doc(page, 'Hugo', 'passport', '2035-12-01', done=True)
            add_doc(page, 'Hugo', 'ticket', '', done=True)
            expect(page.locator('#k-ready')).to_have_text('2 / 4')
            expect(page.locator('#k-problems')).to_have_text('2')
            expect(page.locator('#k-until')).to_have_text('15 janvier 2036')
            expect(page.locator('#k-next')).to_have_text('10 juillet 2035')
            expect(page.locator('#verdict')).to_have_text('1 document expire avant la fin du voyage.')
            groups = page.locator('#groups .group')
            expect(groups).to_have_count(2)
            first = groups.nth(0).locator('li.doc').nth(0)
            expect(first).to_have_class('doc bad')
            expect(first).to_contain_text('Expire le 10 juillet 2035, pendant le voyage.')
            expect(first).to_contain_text('Demande en ligne')
            expect(first.locator('.pill')).to_have_text('À faire')
            expect(groups.nth(1).locator('h3')).to_contain_text('1 prêt sur 2')
            expect(groups.nth(1).locator('li.doc').nth(0)).to_contain_text('Expire le 1 décembre 2035 : avant la fin de votre marge (15 janvier 2036).')
            expect(groups.nth(0).locator('li.doc').nth(1)).to_contain_text("Valide jusqu'au 1 janvier 2040 (1631 jours après le retour).")
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile (contrôle) : {wide}'

            # Modification du visa : valide et prêt.
            first.get_by_role('button', name='Modifier : Visa ou autorisation de Nadia').click()
            expect(page.locator('#add-doc')).to_have_text('Enregistrer le document')
            page.locator('#doc-form [name=expires]').fill('2036-03-01')
            page.locator('#doc-form [name=done]').check()
            page.locator('#add-doc').click()
            expect(page.locator('#doc-status')).to_have_text('Modifié : Visa ou autorisation de Nadia.')
            expect(page.locator('#k-ready')).to_have_text('3 / 4')
            expect(groups.nth(0).locator('h3')).to_contain_text('2 prêts sur 2')
            expect(page.locator('#verdict')).to_have_text('1 document ne couvre pas votre marge après le retour.')
            page.get_by_label('Billet de Hugo prêt').uncheck()
            expect(page.locator('#k-ready')).to_have_text('2 / 4')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            tr = saved['trips'][0]
            assert tr['margin'] == 6 and tr['marginUnit'] == 'm' and len(tr['docs']) == 4
            assert sorted(tr['docs'][0].keys()) == ['done', 'expires', 'id', 'note', 'travelerId', 'type']  # aucun numéro

            # Export agenda et liste imprimable.
            with page.expect_download() as d:
                page.locator('#export-ics').click()
            ics = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert ics.count('BEGIN:VEVENT') == 3 and 'DTSTART;VALUE=DATE:20400101' in ics and 'SUMMARY:Échéance : Passeport de Nadia' in ics, ics
            expect(page.locator('#check-status')).to_have_text('Fichier agenda téléchargé.')
            page.emulate_media(media='print')
            expect(page.locator('#doc-form')).to_be_hidden()
            expect(page.locator('#groups li.doc').first).to_be_visible()
            expect(page.locator('#print-head')).to_have_text('Mon voyage — du 1 juillet 2035 au 15 juillet 2035')
            page.emulate_media(media='screen')

            # Export JSON puis stockage corrompu : rien n'est écrasé, restauration possible.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['trips'][0]['travelers']) == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{\"app\":\"tripdocumentlist\"')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#traveler-form [name=name]').fill('Zoé')
            page.locator('#add-traveler').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{"app":"tripdocumentlist"'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"tripdocumentlist","version":1,"trips":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 voyage.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#k-ready')).to_have_text('2 / 4')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#groups li.doc')).to_have_count(4)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('I documenti sono tutti pronti per partire?')
            ip.locator('#sample').click()
            expect(ip.locator('#trip-status')).to_have_text('Esempio aggiunto: una scadenza durante il viaggio, una entro il margine.')
            expect(ip.locator('#groups li.doc')).to_have_count(6)
            ip.locator('#traveler-form [name=name]').fill('Luca')  # saisies en cours
            ip.locator('#doc-form [name=note]').fill('Copia nello zaino')
            ip.locator('#doc-form [name=type]').select_option('insurance')
            expected = {'fr': '1 document expire avant la fin du voyage.', 'en': '1 document expires before the end of the trip.', 'es': '1 documento vence antes del final del viaje.',
                        'ar': 'وثيقة واحدة تنتهي قبل نهاية الرحلة.', 'pt': '1 documento expira antes do fim da viagem.', 'de': '1 Dokument läuft vor Reiseende ab.', 'it': '1 documento scade prima della fine del viaggio.'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                expect(ip.locator('#verdict')).to_have_text(expected[lang])
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#traveler-form [name=name]').input_value() == 'Luca', lang
                assert ip.locator('#doc-form [name=note]').input_value() == 'Copia nello zaino', lang
                assert ip.locator('#doc-form [name=type]').input_value() == 'insurance', lang
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#h-check')).to_have_text('التحقق')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#doc-form [name=type] option:checked')).to_have_text('Reiseversicherung')
            expect(ip.locator('#groups .group h3').nth(0)).to_contain_text('Nadia')  # données saisies gardées telles quelles (créées en italien)
            ip.locator('#doc-form [name=note]').fill('Nummer 0612345678')
            ip.locator('#add-doc').click()
            expect(ip.locator('#doc-status')).to_have_text('Die Notiz scheint eine Nummer zu enthalten: Bitte entfernen, sie gehört nicht hierher')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS TripDocumentList: validation, dates and margin, travellers, documents, validity, no-number notes, edit, ready status, ics, print, export/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
