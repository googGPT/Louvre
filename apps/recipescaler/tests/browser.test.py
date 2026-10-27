"""RecipeScaler dans Chromium : saisie, recalcul par portions et par ingrédient disponible, conversions, œufs, enregistrement, export, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-recipescaler-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def fill_recipe(page, title, servings, ings):
    page.locator('#recipe-form [name=title]').fill(title)
    page.locator('#recipe-form [name=servings]').fill(servings)
    while page.locator('#ing-rows .ing').count() < len(ings):
        page.locator('#add-ing').click()
    for i, (n, q, u) in enumerate(ings):
        row = page.locator('#ing-rows .ing').nth(i)
        row.locator('.ing-name').fill(n)
        row.locator('.ing-unit').select_option(u)
        if u != 'taste':
            row.locator('.ing-qty').fill(q)


def cell(page, name):
    return page.locator('#scaled tbody tr').filter(has=page.locator('td.name', has_text=name)).locator('td').last


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
            expect(page.locator('#h-scaled')).to_have_text('Saisissez un titre, les portions et au moins un ingrédient.')
            assert page.locator('#louvre-currency').count() == 0
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation.
            page.locator('#save').click()
            expect(page.locator('#recipe-status')).to_have_text('Titre obligatoire')
            fill_recipe(page, 'Gâteau', '4', [('Farine', 'beaucoup', 'g')])
            expect(page.locator('#scale-status')).to_have_text('Quantité invalide (ex. 250, 1,5 ou 1/2)')
            fill_recipe(page, 'Gâteau', '4', [('Farine', '250', 'g'), ('Œufs', '3', 'piece'), ('Lait', '1', 'l'), ('Sucre', '2', 'tsp'), ('Sel', '1', 'pinch'), ('Vanille', '', 'taste')])
            expect(page.locator('#scale-status')).to_have_text('')
            expect(page.locator('#h-scaled')).to_have_text('Gâteau — 4 portions')

            # 5 portions : arrondis lisibles, œufs entiers avec valeur exacte, cuillères en fractions, « au goût » inchangé.
            page.locator('#plus').click()
            expect(page.locator('#target')).to_have_value('5')
            expect(page.locator('#factor')).to_have_text('Quantités × 1,25 (recette pour 4)')
            expect(cell(page, 'Farine')).to_have_text('≈ 315 g')
            expect(cell(page, 'Œufs')).to_have_text('≈ 4 pièce(s) (exactement 3,75)')
            expect(cell(page, 'Lait')).to_have_text('1,25 L')
            expect(cell(page, 'Sucre')).to_have_text('2 ½ c. à café')
            expect(cell(page, 'Sel')).to_have_text('≈ 1 pincée(s) (exactement 1,25)')
            expect(cell(page, 'Vanille')).to_have_text('au goût')
            page.locator('#plus').click()
            expect(cell(page, 'Sucre')).to_have_text('1 c. à soupe')  # 3 c. à café = 1 c. à soupe
            page.locator('#target').fill('0')
            expect(page.locator('#scale-status')).to_have_text('Portions : entier de 1 à 100')

            # D'après un ingrédient disponible : 500 g de farine -> × 2, 8 portions.
            page.locator('#avail summary').click()
            page.locator('#avail-ing').select_option(label='Farine')
            page.locator('#avail-qty').fill('0,5')
            page.locator('#avail-unit').select_option('kg')
            page.locator('#avail-apply').click()
            expect(page.locator('#scale-status')).to_have_text('Recette adaptée à ce que vous avez : environ 8 portions.')
            expect(page.locator('#target')).to_have_value('8')
            expect(cell(page, 'Lait')).to_have_text('2 L')
            page.locator('#avail-ing').select_option(label='Lait')
            assert page.locator('#avail-unit option').evaluate_all('(o) => o.map((x) => x.value)') == ['ml', 'cl', 'l', 'tsp', 'tbsp']  # pas de grammes pour un liquide
            page.locator('#minus').click()
            expect(page.locator('#h-scaled')).to_have_text('Gâteau — 7 portions')

            # Enregistrer, recharger, rouvrir.
            page.locator('#save').click()
            expect(page.locator('#recipe-status')).to_have_text('Recette « Gâteau » enregistrée.')
            page.reload()
            expect(page.locator('#recipe-select option')).to_have_count(2)
            page.locator('#recipe-select').select_option(label='Gâteau')
            expect(page.locator('#recipe-form [name=title]')).to_have_value('Gâteau')
            expect(page.locator('#ing-rows .ing')).to_have_count(6)
            expect(page.locator('#ing-rows .ing').nth(5).locator('.ing-qty')).to_be_disabled()  # « au goût » : sans quantité
            page.locator('#recipe-form [name=servings]').fill('2')
            page.locator('#save').click()
            expect(page.locator('#recipe-status')).to_have_text('Recette « Gâteau » mise à jour.')

            # Export texte de la recette adaptée.
            page.locator('#target').fill('3')
            with page.expect_download() as d:
                page.locator('#export-txt').click()
            txt = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert txt.startswith('Gâteau — 3 portions\n'), txt
            assert '- Farine : 375 g' in txt and '- Œufs : ≈ 5 pièce(s)' in txt and '- Vanille : au goût' in txt, txt

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert json.loads(backup)['recipes'][0]['servings'] == 2
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[[[')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            fill_recipe(page, 'Soupe', '2', [('Poireau', '2', 'piece')])
            page.locator('#save').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[[['
            bad = json.loads(backup); bad['recipes'][0]['ingredients'][0]['unit'] = 'cup'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_have_text('Restauration refusée : Unité inconnue')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 recette.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#recipe-form [name=title]')).to_have_value('Gâteau')

            # Supprimer.
            page.locator('#delete').click()
            expect(page.locator('#recipe-status')).to_have_text('Recette « Gâteau » supprimée.')
            expect(page.locator('#recipe-select option')).to_have_count(1)

            # Hors ligne.
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 recette.')
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#recipe-select option')).to_have_count(2)
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
            expect(ip.locator('h1')).to_have_text('For 4, for 7 or for 12: the right quantities.')
            ip.locator('#sample').click()
            expect(ip.locator('#recipe-status')).to_have_text('Example loaded (not saved): adjusted for 6 people.')
            expect(ip.locator('#h-scaled')).to_have_text('Pancakes — 6 servings')
            expect(cell(ip, 'Flour')).to_have_text('375 g')
            expect(cell(ip, 'Eggs')).to_have_text('6 item(s)')
            expect(cell(ip, 'Milk')).to_have_text('75 cl')
            expect(cell(ip, 'Sugar')).to_have_text('1 tbsp + 1 ½ tsp')
            expect(cell(ip, 'Salt')).to_have_text('≈ 2 pinch(es) (exactly 1.5)')
            ip.locator('#recipe-form [name=title]').fill('My draft')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#scaled tbody tr')).to_have_count(7)
                assert ip.locator('#recipe-form [name=title]').input_value() == 'My draft'
                expect(ip.locator('#h-scaled')).to_contain_text('My draft')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Für 4, für 7 oder für 12: die richtigen Mengen.')
            expect(cell(ip, 'Sugar')).to_have_text('1 EL + 1 ½ TL')
            expect(ip.locator('#h-scaled')).to_have_text('My draft — 6 Portionen')
            ip.locator('#sample').click()
            expect(ip.locator('#h-scaled')).to_have_text('Pfannkuchen — 6 Portionen')
            ip.locator('#louvre-lang').select_option('ar')
            ip.locator('#recipe-form [name=title]').fill('')
            ip.locator('#save').click()
            expect(ip.locator('#recipe-status')).to_have_text('العنوان مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS RecipeScaler: validation, scaling by servings and by available ingredient, conversions, eggs, save/reopen/delete, text export, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
