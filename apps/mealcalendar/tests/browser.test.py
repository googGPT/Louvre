"""MealCalendar dans Chromium : plats, semaine, personnes par repas, liste de courses agrégée, cases, export, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-mealcalendar-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def dish(page, name, servings, ings):
    page.locator('#dish-form [name=name]').fill(name)
    page.locator('#dish-form [name=servings]').fill(servings)
    while page.locator('#ing-rows .ing').count() < len(ings):
        page.locator('#add-ing').click()
    for i, (n, q, u) in enumerate(ings):
        row = page.locator('#ing-rows .ing').nth(i)
        row.locator('.ing-name').fill(n)
        row.locator('.ing-qty').fill(q)
        row.locator('.ing-unit').select_option(u)
    page.locator('#save-dish').click()


def slot(page, day, meal):
    return page.locator('#days .day').nth(day).locator('.slot').nth(meal)


def item(page, name):
    return page.locator('#shop li').filter(has=page.locator('b', has_text=name))


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
            expect(page.locator('#no-dish')).to_be_visible()
            expect(page.locator('#days .day')).to_have_count(7)
            assert page.locator('#louvre-currency').count() == 0  # appli sans argent : menu de langue seul
            assert page.evaluate(WIDE) == [], page.evaluate(WIDE)

            # Validation du formulaire de plat.
            page.locator('#save-dish').click()
            expect(page.locator('#dish-status')).to_have_text('Nom du plat obligatoire')
            page.locator('#dish-form [name=name]').fill('Vide')
            page.locator('#save-dish').click()
            expect(page.locator('#dish-status')).to_have_text('Ajoutez au moins un ingrédient')
            dish(page, 'Vide', '4', [('Riz', 'beaucoup', 'g')])
            expect(page.locator('#dish-status')).to_have_text('Quantité invalide (ex. 250, 1,5 ou 1/2)')
            dish(page, 'Vide', '0', [('Riz', '100', 'g')])
            expect(page.locator('#dish-status')).to_have_text('Nombre de personnes : entier de 1 à 50')

            # Deux plats, dont un avec une apostrophe typographique et un oignon en grammes.
            dish(page, 'Pâtes tomate', '4', [('Pâtes', '500', 'g'), ('Oignon', '1', 'piece'), ("Huile d'olive", '2', 'tbsp')])
            expect(page.locator('#dish-status')).to_have_text('Plat « Pâtes tomate » enregistré.')
            dish(page, 'Salade', '2', [('Lentilles', '150', 'g'), ('oignon', '1/2', 'piece'), ('Huile d’olive', '1', 'tbsp'), ('Oignon', '20', 'g')])
            expect(page.locator('#dishes li')).to_have_count(2)
            dish(page, 'salade', '2', [('Riz', '1', 'kg')])
            expect(page.locator('#dish-status')).to_have_text('Un plat porte déjà ce nom')

            # Semaine : lundi midi pâtes pour 2 (recette pour 4), mardi soir salade pour 4 (recette pour 2).
            slot(page, 0, 1).locator('select').select_option(label='Pâtes tomate')
            expect(slot(page, 0, 1).locator('.ppl')).to_have_value('4')
            slot(page, 0, 1).locator('.ppl').fill('2')
            slot(page, 0, 1).locator('.ppl').dispatch_event('change')
            slot(page, 1, 2).locator('select').select_option(label='Salade')
            slot(page, 1, 2).locator('.ppl').fill('4')
            slot(page, 1, 2).locator('.ppl').dispatch_event('change')
            expect(page.locator('#shop li')).to_have_count(5)
            expect(page.locator('#shop-count')).to_have_text('0 / 5 cochés')
            expect(item(page, 'Pâtes')).to_contain_text('250 g')
            expect(item(page, 'Lentilles')).to_contain_text('300 g')
            expect(page.locator('#shop li').filter(has_text='pièce(s)')).to_contain_text('1,5 pièce(s)')  # 1 × 2/4 + 0,5 × 4/2
            expect(page.locator('#shop li').filter(has_text='40 g')).to_contain_text('Oignon')  # grammes : ligne séparée
            expect(item(page, 'Huile')).to_have_count(1)
            expect(item(page, 'Huile')).to_contain_text('3 c. à soupe')  # 1 + 2 cuillères à soupe
            slot(page, 0, 1).locator('.ppl').fill('99')
            slot(page, 0, 1).locator('.ppl').dispatch_event('change')
            expect(page.locator('#week-status')).to_have_text('Nombre de personnes : entier de 1 à 50')
            expect(slot(page, 0, 1).locator('.ppl')).to_have_value('2')

            # Cocher, conserver au rechargement.
            item(page, 'Lentilles').locator('input').check()
            expect(page.locator('#shop-count')).to_have_text('1 / 5 cochés')
            page.reload()
            expect(page.locator('#shop-count')).to_have_text('1 / 5 cochés')
            expect(item(page, 'Lentilles').locator('input')).to_be_checked()

            # Modifier un plat : les quantités suivent.
            page.locator('#dishes li').filter(has_text='Pâtes tomate').get_by_role('button', name='Modifier Pâtes tomate').click()
            expect(page.locator('#save-dish')).to_have_text('Mettre à jour le plat')
            page.locator('#dish-form [name=servings]').fill('2')
            page.locator('#save-dish').click()
            expect(page.locator('#dish-status')).to_have_text('Plat « Pâtes tomate » mis à jour.')
            expect(item(page, 'Pâtes')).to_contain_text('500 g')

            # Supprimer un plat : retiré de la semaine.
            page.get_by_role('button', name='Supprimer Salade').click()
            expect(page.locator('#shop li')).to_have_count(3)
            expect(slot(page, 1, 2).locator('select')).to_have_value('')

            # Autre semaine : liste vide ; retour.
            page.locator('#next').click()
            expect(page.locator('#shop li.empty')).to_be_visible()
            page.locator('#prev').click()
            expect(page.locator('#shop li')).to_have_count(3)

            # Export CSV de la liste.
            item(page, 'Oignon').locator('input').check()
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_bytes().decode('utf-8-sig')
            assert csv.startswith('Ingrédient;Quantité;Unité;Coché;Plats\r\n'), csv[:60]
            assert 'Oignon;1;pièce(s);oui;Pâtes tomate\r\n' in csv, csv
            assert "Huile d'olive;2;c. à soupe;non;Pâtes tomate" in csv, csv

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['dishes']) == 1
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            dish(page, 'Soupe', '2', [('Poireau', '2', 'piece')])
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            bad = json.loads(backup); bad['plans'][0]['week'] = '2026-10-27'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad).encode()})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 plat.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#shop li')).to_have_count(3)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#shop li')).to_have_count(3)
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
            expect(ip.locator('h1')).to_have_text('A week of meals, one shopping list.')
            ip.locator('#sample').click()
            expect(ip.locator('#week-status')).to_have_text('Example loaded: 4 dishes placed in this week.')
            expect(item(ip, 'Milk')).to_contain_text('215 cl')  # 20 cl × 2 × 5 + 5 cl × (1 + 2)
            expect(item(ip, 'Onion')).to_contain_text('2.5 item(s)')
            expect(item(ip, 'Olive oil')).to_contain_text('5 tbsp')
            expect(item(ip, 'Eggs')).to_contain_text('12 item(s)')
            ip.locator('#dish-form [name=name]').fill('Draft dish')
            ip.locator('#ing-rows .ing-name').first.fill('Draft ingredient')
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#shop li')).to_have_count(11)
                assert ip.locator('#dish-form [name=name]').input_value() == 'Draft dish'
                assert ip.locator('#ing-rows .ing-name').first.input_value() == 'Draft ingredient'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('h1')).to_have_text('Eine Woche Mahlzeiten, eine Einkaufsliste.')
            expect(item(ip, 'Olive oil')).to_contain_text('5 EL')  # données en anglais, unités traduites
            expect(slot(ip, 0, 0).locator('.meal')).to_have_text('Frühstück')
            ip.locator('#sample').click()
            expect(ip.locator('#shop li').filter(has_text='Haferflocken')).to_have_count(1)
            ip.locator('#louvre-lang').select_option('ar')
            expect(ip.locator('#shop-count')).to_have_text('0 من 11 مؤشَّر')
            ip.locator('#dish-form [name=name]').fill('')
            ip.locator('#save-dish').click()
            expect(ip.locator('#dish-status')).to_have_text('اسم الطبق مطلوب')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS MealCalendar: validation, dishes, week, people per meal, aggregated shopping list, ticks, edit/delete, CSV, backup/restore, protected mode, offline, mobile, 7 languages, RTL')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
