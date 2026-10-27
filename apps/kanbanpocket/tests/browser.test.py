"""KanbanPocket dans Chromium : cartes, limite WIP, colonnes renommées, déplacements au clavier, à la souris et au doigt,
filtres, modification, export CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-kanbanpocket-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def col(page, i):
    return page.locator('#board .column').nth(i)


def titles(page, i):
    return col(page, i).locator('.card b').all_inner_texts()


def add(page, title, labels='', due='', column=None):
    page.locator('#c-title').fill(title); page.locator('#c-labels').fill(labels); page.locator('#c-due').fill(due)
    if column is not None:
        page.locator('#c-col').select_option(index=column)
    page.locator('#save-card').click()
    expect(page.locator('#card-status')).to_have_text(f'Carte ajoutée : {title}.')


def touch_drag(page, src, dst):
    """Glisser au doigt : événements pointer de type « touch » (la poignée seule démarre le glissement)."""
    page.evaluate('''([src, dst]) => {
      const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
      const opt = (x, y) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true });
      const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
      src.dispatchEvent(new PointerEvent('pointerdown', opt(x0, y0)));
      for (let i = 1; i <= 8; i += 1) window.dispatchEvent(new PointerEvent('pointermove', opt(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8)));
      window.dispatchEvent(new PointerEvent('pointerup', opt(x1, y1)));
    }''', [src.element_handle(), dst.element_handle()])


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
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#board .column h3')).to_have_text(['À faire', 'En cours', 'Fait'])

            # Validation.
            page.locator('#save-card').click()
            expect(page.locator('#card-status')).to_have_text('Titre de la carte obligatoire')
            page.locator('#c-title').fill('X'); page.locator('#c-labels').fill('a,b,c,d,e,f'); page.locator('#save-card').click()
            expect(page.locator('#card-status')).to_have_text('5 étiquettes au plus')

            # Cartes.
            add(page, 'Alpha', 'client, urgent')
            add(page, 'Bravo', '', '2020-01-02')
            add(page, 'Charlie', 'client')
            expect(page.locator('#k-total')).to_have_text('3')
            expect(page.locator('#k-overdue')).to_have_text('1')
            expect(col(page, 0).locator('.card', has_text='Bravo')).to_contain_text('en retard')

            # Colonne renommée avec limite WIP de 1.
            mid = col(page, 1)
            mid.locator('summary').click()
            mid.locator('.col-form input').nth(0).fill('Revue')
            mid.locator('.col-form input').nth(1).fill('1')
            mid.locator('.col-form button[type=submit]').click()
            expect(page.locator('#board-status')).to_have_text('Colonne enregistrée.')
            expect(col(page, 1).locator('h3')).to_have_text('Revue')
            expect(col(page, 1).locator('.count')).to_have_text('0 / 1')
            mid = col(page, 1)
            mid.locator('summary').click()
            mid.locator('.col-form input').nth(1).fill('abc'); mid.locator('.col-form button[type=submit]').click()
            expect(page.locator('#board-status')).to_have_text('Limite WIP : nombre entier de 1 à 99, ou vide')

            # Clavier : Maj + flèche droite, le focus suit la carte.
            card = col(page, 0).locator('.card', has_text='Alpha')
            card.focus(); page.keyboard.press('Shift+ArrowRight')
            expect(page.locator('#move-status')).to_have_text('« Alpha » déplacée vers Revue.')
            assert titles(page, 1) == ['Alpha']
            assert page.evaluate('() => document.activeElement.dataset.card') == page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}')).boards[0].cards.find((c) => c.title === 'Alpha').id")
            expect(col(page, 1).locator('.tag', has_text='pleine')).to_be_visible()
            # Limite WIP atteinte : déplacement refusé (bouton).
            col(page, 0).locator('.card', has_text='Bravo').get_by_role('button', name='Déplacer « Bravo » vers Revue').click()
            expect(page.locator('#move-status')).to_have_text('Colonne pleine : limite WIP de 1 atteinte')
            assert titles(page, 0) == ['Bravo', 'Charlie']

            # Souris : glisser Charlie dans « Fait », puis au-dessus de Bravo dans « À faire ».
            src = col(page, 0).locator('.card', has_text='Charlie').locator('.body')
            dst = col(page, 2).locator('.cards')
            src.scroll_into_view_if_needed()
            sb, db = src.bounding_box(), dst.bounding_box()
            page.mouse.move(sb['x'] + 20, sb['y'] + 10); page.mouse.down()
            page.mouse.move(sb['x'] + 30, sb['y'] + 30, steps=3)
            page.mouse.move(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2, steps=8)
            expect(page.locator('.drop-marker')).to_have_count(1)
            page.mouse.up()
            expect(page.locator('#move-status')).to_have_text('« Charlie » déplacée vers Fait.')
            assert titles(page, 2) == ['Charlie']
            add(page, 'Delta')
            assert titles(page, 0) == ['Bravo', 'Delta']
            src = col(page, 0).locator('.card', has_text='Delta').locator('.body')
            target = col(page, 0).locator('.card', has_text='Bravo')
            src.scroll_into_view_if_needed()
            sb, tb = src.bounding_box(), target.bounding_box()
            page.mouse.move(sb['x'] + 20, sb['y'] + 10); page.mouse.down()
            page.mouse.move(tb['x'] + 30, tb['y'] + 4, steps=8)
            page.mouse.up()
            expect(page.locator('#move-status')).to_have_text('« Delta » déplacée.')
            assert titles(page, 0) == ['Delta', 'Bravo']

            # Doigt : le corps de la carte ne déclenche rien (la page défile), la poignée déplace.
            touch_drag(page, col(page, 0).locator('.card', has_text='Bravo').locator('.body'), col(page, 2).locator('.cards'))
            assert titles(page, 0) == ['Delta', 'Bravo']
            touch_drag(page, col(page, 0).locator('.card', has_text='Bravo').locator('.grip'), col(page, 2).locator('.cards'))
            expect(page.locator('#move-status')).to_have_text('« Bravo » déplacée vers Fait.')
            assert sorted(titles(page, 2)) == ['Bravo', 'Charlie']
            expect(page.locator('#k-overdue')).to_have_text('0')  # « Fait » n'est jamais en retard

            # Filtres.
            page.locator('#f-label').select_option('client')
            expect(page.locator('#filter-info')).to_have_text('2 cartes affichées sur 4.')
            expect(col(page, 0).locator('.empty')).to_have_text('1 carte masquée par les filtres.')
            page.locator('#f-text').fill('alp')
            expect(page.locator('#filter-info')).to_have_text('1 carte affichée sur 4.')
            page.locator('#f-reset').click()
            expect(page.locator('#board .card')).to_have_count(4)

            # Modification : titre et colonne.
            col(page, 1).locator('.card', has_text='Alpha').get_by_role('button', name='Modifier « Alpha »').click()
            expect(page.locator('#h-card')).to_have_text('Modifier la carte')
            expect(page.locator('#c-labels')).to_have_value('client, urgent')
            page.locator('#c-title').fill('Alpha 2'); page.locator('#c-col').select_option(index=2)
            page.locator('#save-card').click()
            expect(page.locator('#card-status')).to_have_text('Carte enregistrée : Alpha 2.')
            assert titles(page, 2)[-1] == 'Alpha 2' and len(titles(page, 2)) == 3
            expect(page.locator('#h-card')).to_have_text('Nouvelle carte')

            # Colonnes : ajout avant « Fait », suppression d'une colonne vide.
            page.locator('#add-column').click()
            expect(page.locator('#board .column h3')).to_have_text(['À faire', 'Revue', 'Colonne 3', 'Fait'])
            c3 = col(page, 2); c3.locator('summary').click(); c3.get_by_role('button', name='Supprimer la colonne Colonne 3').click()
            expect(page.locator('#board .column')).to_have_count(3)

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            assert d.value.suggested_filename == 'kanban-mon-tableau.csv'
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert csv.splitlines()[0] == 'Colonne,Titre,Étiquettes,Échéance,Notes', csv
            assert 'Fait,Alpha 2,"client, urgent",,' in csv and 'Fait,Bravo,,2020-01-02,' in csv, csv

            # Suppression d'une carte.
            col(page, 0).locator('.card', has_text='Delta').get_by_role('button', name='Supprimer « Delta »').click()
            expect(page.locator('#board .card')).to_have_count(3)

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['boards'][0]['cards']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{abîmé')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#c-title')).to_be_disabled()
            page.locator('#new-board').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{abîmé'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"kanbanpocket","version":1,"boards":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 tableau.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#board .card')).to_have_count(3)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#board .card')).to_have_count(3)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Less work in progress, more work done.')
            ip.locator('#sample').click()
            expect(ip.locator('#board-select')).to_contain_text('Website launch')
            expect(ip.locator('#board .column h3')).to_have_text(['To do', 'Doing', 'Done'])
            expect(ip.locator('#board .card')).to_have_count(6)
            ip.locator('#c-title').fill('Draft in progress')
            heads = {'fr': 'À faire', 'en': 'To do', 'es': 'Por hacer', 'ar': 'للتنفيذ', 'pt': 'A fazer', 'de': 'Zu erledigen', 'it': 'Da fare'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#board .column h3').first).to_have_text(heads[lang])
                expect(ip.locator('#c-title')).to_have_value('Draft in progress')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # En arabe, la flèche gauche mène à la colonne suivante.
            ip.locator('#louvre-lang').select_option('ar')
            first = ip.locator('#board .column').nth(0).locator('.card').first
            name = first.locator('b').inner_text()
            first.focus(); ip.keyboard.press('Shift+ArrowLeft')
            expect(ip.locator('#board .column').nth(1).locator('.card b', has_text=name)).to_have_count(1)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS KanbanPocket: validation, cards, labels, overdue, renamed column, WIP limit, keyboard, mouse drag, touch drag (handle), filters, edit, columns, CSV, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL keys, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
