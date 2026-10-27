"""WardrobeCapsule dans Chromium : saisie, compteur de tenues, règles de couleurs, objectifs, palette, filtres, suggestions, CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-wardrobecapsule-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def add(page, name, cat, color, seasons=('spring', 'summer', 'autumn', 'winter'), occasions=('casual',)):
    f = page.locator('#item-form')
    f.locator('[name=name]').fill(name)
    f.locator('[name=category]').select_option(cat)
    f.locator('[name=color]').select_option(color)
    for box in f.locator('#seasons input').all():
        box.set_checked(box.get_attribute('value') in seasons)
    for box in f.locator('#occasions input').all():
        box.set_checked(box.get_attribute('value') in occasions)
    page.locator('#save').click()
    expect(page.locator('#form-status')).to_have_text(f'« {name} » ajouté.')


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
            expect(page.locator('#count')).to_have_text('0 tenue possible')
            expect(page.locator('#items .empty')).to_have_text("Aucune pièce pour l'instant.")
            expect(page.locator('#neutrals')).to_contain_text('Noir, Blanc, Gris, Bleu marine, Beige, Marron, Jean (denim)')
            assert page.locator('#louvre-currency').count() == 0
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('Nom de la pièce obligatoire')
            page.locator('#item-form [name=name]').fill('Haut rouge')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('Cochez au moins une saison')

            # Pièces et compteur : deux couleurs vives dans une tenue sont refusées (règle : 1 au plus).
            add(page, 'Haut rouge', 'top', 'red')
            add(page, 'Jean', 'bottom', 'denim')
            add(page, 'Jupe verte', 'bottom', 'green')
            add(page, 'Baskets', 'shoes', 'white')
            expect(page.locator('#count')).to_have_text('1 tenue possible')
            expect(page.locator('#count-detail')).to_have_text('1 avec haut, bas et chaussures ; 0 avec une pièce unique.')
            expect(page.locator('#suggestions li')).to_have_count(1)
            expect(page.locator('#day .outfit')).to_contain_text('Haut rouge')
            expect(page.locator('#issues')).to_contain_text('Pièces qui n\'entrent dans aucune tenue avec ces filtres : Jupe verte.')
            page.locator('#accents').select_option('2')
            expect(page.locator('#rules-status')).to_have_text('Règles enregistrées.')
            expect(page.locator('#count')).to_have_text('2 tenues possibles')

            # Objectifs et palette.
            page.locator('#target-top').fill('3')
            page.locator('#target-top').dispatch_event('change')
            expect(page.locator('#targets-table tbody tr').first).to_contain_text('Il en manque 2')
            expect(page.locator('#issues')).to_contain_text('Haut : il manque 2 pièce(s) pour atteindre votre objectif.')
            for c in ['white', 'denim', 'red']:
                page.locator(f'#palette input[value={c}]').check()
            expect(page.locator('#issues')).to_contain_text('Hors de votre palette : Jupe verte.')
            expect(page.locator('#issues .good')).to_contain_text('Piste : une pièce « Haut » de couleur neutre (Blanc) ajouterait 2 tenues.')

            # Filtres : aucune pièce de travail.
            page.locator('#f-occasion').select_option('work')
            expect(page.locator('#count')).to_have_text('0 tenue possible')
            expect(page.locator('#issues')).to_contain_text("4 pièces ne correspondent pas à la saison ou à l'occasion choisie.")
            expect(page.locator('#day .empty')).to_have_text('Pas de tenue du jour avec ces filtres.')
            page.locator('#f-occasion').select_option('all')

            # Modifier et supprimer.
            page.get_by_role('button', name='Modifier « Jean »').click()
            expect(page.locator('#item-form #seasons input:checked')).to_have_count(4)
            page.locator('#item-form [name=name]').fill('Jean brut')
            page.locator('#save').click()
            expect(page.locator('#form-status')).to_have_text('« Jean brut » mis à jour.')
            page.get_by_role('button', name='Supprimer « Jupe verte »').click()
            expect(page.locator('#items-status')).to_have_text('« Jupe verte » supprimé.')
            expect(page.locator('#count')).to_have_text('1 tenue possible')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")
            assert saved['rules'] == {'targets': {'top': 3, 'bottom': 0, 'onepiece': 0, 'shoes': 0, 'outer': 0, 'accessory': 0}, 'palette': ['white', 'denim', 'red'], 'maxAccents': 2}, saved['rules']

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv == 'N°;Haut ou pièce unique;Bas;Chaussures;Couleurs\r\n1;Haut rouge;Jean brut;Baskets;Rouge + Jean (denim) + Blanc\r\n', csv
            expect(page.locator('#result-status')).to_have_text('1 tenue exportée (CSV).')

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['items']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[1,2')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            add_attempt = page.locator('#item-form [name=name]')
            add_attempt.fill('Pull')
            page.locator('#item-form #seasons input').first.check()
            page.locator('#item-form #occasions input').first.check()
            page.locator('#save').click()
            expect(page.locator('#backup-status')).to_contain_text('Stockage illisible')
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[1,2'
            bad = json.loads(backup); bad['items'][0]['category'] = 'hat'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Catégorie inconnue')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 3 pièces.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#target-top')).to_have_value('3')
            expect(page.locator('#count')).to_have_text('1 tenue possible')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#count')).to_have_text('1 tenue possible')
            context.set_offline(False)
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US', accept_downloads=True)
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Fewer clothes, more outfits.')
            ip.locator('#sample').click()
            expect(ip.locator('#form-status')).to_have_text('Example loaded: 13 pieces, at most one non-neutral colour per outfit.')
            expect(ip.locator('#count')).to_have_text('25 possible outfits')
            expect(ip.locator('#count-detail')).to_have_text('23 with top, bottom and shoes; 2 with a one-piece.')
            expect(ip.locator('#suggestions li')).to_have_count(6)
            expect(ip.locator('#issues .good')).to_contain_text('one "Bottom" piece in a neutral colour (Black) would add 11 outfits')
            ip.locator('#item-form [name=name]').fill('Linen shirt')
            ip.locator('#item-form #seasons input[value=summer]').check()
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#count')).to_contain_text('25')
                expect(ip.locator('#suggestions li')).to_have_count(6)
                assert ip.locator('#item-form [name=name]').input_value() == 'Linen shirt'
                assert ip.locator('#item-form #seasons input[value=summer]').is_checked()
                assert ip.locator('#target-top').input_value() == '5'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Weniger Kleidung, mehr Outfits.')
            expect(ip.locator('#count')).to_have_text('25 mögliche Outfits')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#item-form [name=name]').fill('')
            ip.locator('#save').click()
            expect(ip.locator('#form-status')).to_have_text('اسم القطعة مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS WardrobeCapsule: validation, outfit counter, colour rule, targets, palette, filters, gains, suggestions, outfit of the day, edit/delete, CSV, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
