"""PriorityMatrix dans Chromium : urgence calculée selon le seuil saisi, classement (clavier, liste, souris, doigt),
tâches faites, modification, exports .md/.csv, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import datetime
import functools
import http.server
import json
import os
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-prioritymatrix-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''
TODAY = datetime.date.today()


def day(n):
    return (TODAY + datetime.timedelta(days=n)).isoformat()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def quad(page, q):
    return page.locator(f'#grid .quad.{q}')


def names(page, q):
    return quad(page, q).locator('.task b').all_inner_texts()


def add(page, title, due='', important=True, urgency='auto'):
    page.locator('#t-title').fill(title); page.locator('#t-due').fill(due)
    page.locator('#t-imp').select_option('yes' if important else 'no'); page.locator('#t-urg').select_option(urgency)
    page.locator('#save-task').click()
    expect(page.locator('#task-status')).to_contain_text(f'Tâche ajoutée : {title}')


def touch_drag(page, src, dst):
    page.evaluate('''([src, dst]) => {
      const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
      const opt = (x, y) => ({ pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true });
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
            expect(page.locator('#threshold')).to_have_value('3')
            expect(page.locator('#rule')).to_contain_text('dans 3 jours ou moins')

            # Validation.
            page.locator('#save-task').click()
            expect(page.locator('#task-status')).to_have_text('Intitulé de la tâche obligatoire')
            page.locator('#threshold').fill('abc'); page.locator('#threshold').press('Tab')
            expect(page.locator('#matrix-status')).to_have_text('Seuil : nombre entier de jours de 0 à 365')
            page.locator('#threshold').fill('3'); page.locator('#threshold').press('Tab')

            # Urgence calculée depuis l'échéance et le seuil.
            add(page, 'Rapport', day(1))
            expect(page.locator('#task-status')).to_have_text('Tâche ajoutée : Rapport → Faire maintenant.')
            add(page, 'Formation', day(10))
            add(page, 'Courriels', '', False, 'urgent')
            add(page, 'Favoris', '', False)
            add(page, 'Relance', day(-2))
            assert names(page, 'q1') == ['Relance', 'Rapport'] and names(page, 'q2') == ['Formation']
            assert names(page, 'q3') == ['Courriels'] and names(page, 'q4') == ['Favoris']
            relance = quad(page, 'q1').locator('.task', has_text='Relance')
            expect(relance).to_contain_text('en retard de 2 jours')
            expect(relance).to_contain_text('urgence : échéance')
            expect(quad(page, 'q3').locator('.task')).to_contain_text('urgence : fixée à la main')
            expect(page.locator('#k-overdue')).to_have_text('1')

            # Seuil modifié puis export immédiat : la saisie est prise en compte sans quitter le champ.
            page.locator('#threshold').fill('14')
            with page.expect_download() as d:
                page.locator('#export-md').click()
            md = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert 'dans 14 jours ou moins' in md, md
            assert '## Faire maintenant (Urgent · Important)\n\n- [ ] Relance' in md and '- [ ] Formation' in md.split('## Planifier')[0], md
            assert page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}')).matrices[0].threshold") == 14
            expect(page.locator('#k-q1')).to_have_text('3')
            expect(quad(page, 'q1').locator('.task', has_text='Formation')).to_have_count(1)

            # Clavier : Maj + flèche droite -> « Planifier », urgence fixée à la main.
            task = quad(page, 'q1').locator('.task', has_text='Formation')
            task.focus(); page.keyboard.press('Shift+ArrowRight')
            expect(page.locator('#move-status')).to_have_text('« Formation » classée dans « Planifier » (urgence fixée à la main).')
            assert names(page, 'q2') == ['Formation']
            assert page.evaluate('() => document.activeElement.querySelector("b").textContent') == 'Formation'
            # Liste « quadrant ».
            quad(page, 'q3').locator('.task select').select_option('q4')
            expect(page.locator('#move-status')).to_contain_text('« Courriels » classée dans « Abandonner »')
            assert sorted(names(page, 'q4')) == ['Courriels', 'Favoris']

            # Souris et doigt (grand écran : les quatre quadrants sont visibles).
            page.set_viewport_size({'width': 1280, 'height': 1000})
            quad(page, 'q1').scroll_into_view_if_needed()
            src = quad(page, 'q4').locator('.task', has_text='Favoris').locator('.body')
            src.scroll_into_view_if_needed()
            sb, qb = src.bounding_box(), quad(page, 'q1').bounding_box()
            page.mouse.move(sb['x'] + 20, sb['y'] + 8); page.mouse.down()
            page.mouse.move(sb['x'] + 30, sb['y'] + 30, steps=3)
            page.mouse.move(qb['x'] + qb['width'] / 2, qb['y'] + 30, steps=10)
            expect(quad(page, 'q1')).to_have_class('quad q1 drop')
            page.mouse.up()
            expect(page.locator('#move-status')).to_contain_text('« Favoris » classée dans « Faire maintenant »')
            assert 'Favoris' in names(page, 'q1')
            touch_drag(page, quad(page, 'q1').locator('.task', has_text='Favoris').locator('.body'), quad(page, 'q3'))
            assert 'Favoris' in names(page, 'q1')  # au doigt, le corps de la tâche laisse défiler la page
            touch_drag(page, quad(page, 'q1').locator('.task', has_text='Favoris').locator('.grip'), quad(page, 'q3'))
            expect(page.locator('#move-status')).to_have_text('« Favoris » classée dans « Déléguer » (urgence fixée à la main).')
            page.set_viewport_size({'width': 390, 'height': 844})

            # Tâche faite, modification, suppression.
            quad(page, 'q1').locator('.task', has_text='Rapport').locator('input[type=checkbox]').click()
            expect(page.locator('#done-title')).to_have_text('Tâches faites (1)')
            expect(page.locator('#k-done')).to_have_text('1')
            quad(page, 'q1').locator('.task', has_text='Relance').get_by_role('button', name='Modifier « Relance »').click()
            expect(page.locator('#h-task')).to_have_text('Modifier la tâche')
            page.locator('#t-imp').select_option('no'); page.locator('#save-task').click()
            expect(page.locator('#task-status')).to_have_text('Tâche enregistrée : Relance → Déléguer.')
            quad(page, 'q4').locator('.task', has_text='Courriels').get_by_role('button', name='Supprimer « Courriels »').click()
            expect(page.locator('#k-open')).to_have_text('3')

            # Export CSV.
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert csv.splitlines()[0] == 'Quadrant,Tâche,Échéance,Jours restants,Urgente,Importante,Origine de l\'urgence,Notes', csv
            assert f'Déléguer (Urgent · Pas important),Relance,{day(-2)},-2,oui,non,urgence : échéance,' in csv, csv
            assert 'Tâches faites,Rapport,' in csv, csv

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['matrices'][0]['tasks']) == 4
            page.evaluate(f"() => localStorage.setItem('{KEY}', 'xx')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#t-title')).to_be_disabled()
            page.locator('#sample').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == 'xx'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"prioritymatrix","version":1,"matrices":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 matrice.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#threshold')).to_have_value('14')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#grid .task')).to_have_count(3)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('Ciò che preme non è sempre ciò che conta.')
            ip.locator('#sample').click()
            expect(ip.locator('#matrix-select')).to_contain_text('Settimana di lavoro')
            expect(ip.locator('#grid .task')).to_have_count(8)
            expect(ip.locator('#grid .quad.q1 .task').first).to_contain_text('Rispondere al reclamo del cliente')
            ip.locator('#t-title').fill('Bozza in corso')
            heads = {'fr': 'Faire maintenant', 'en': 'Do now', 'es': 'Hacer ahora', 'ar': 'نفّذ الآن', 'pt': 'Fazer já', 'de': 'Sofort erledigen', 'it': 'Fare subito'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#h-q1')).to_have_text(heads[lang])
                expect(ip.locator('#t-title')).to_have_value('Bozza in corso')
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # En arabe la grille est inversée : Maj + flèche gauche quitte « urgent » (à droite) pour « planifier ».
            ip.locator('#louvre-lang').select_option('ar')
            first = ip.locator('#grid .quad.q1 .task').first
            name = first.locator('b').inner_text()
            first.focus(); ip.keyboard.press('Shift+ArrowLeft')
            expect(ip.locator('#grid .quad.q2 .task b', has_text=name)).to_have_count(1)
            assert not errors, errors
            browser.close()
        print('BROWSER PASS PriorityMatrix: validation, urgency from due date and threshold, overdue, threshold flush on export, keyboard, quadrant list, mouse drag, touch drag (handle), done, edit, delete, .md/.csv export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL keys, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
