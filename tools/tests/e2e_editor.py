"""
End-to-end test of the editor against an in-memory fake of the GitHub API
(no real repo or token needed). Covers setup, login, editing every block type,
uploads and limits, drag reordering, saving, SHA conflicts, history/restore,
token rotation, password change, XSS sanitizing and read-only visitors.

  pip install playwright pillow && python3 -m playwright install chromium
  python3 -m http.server 8000          # from the repo root, in another terminal
  python3 tools/tests/e2e_editor.py    # BASE_URL=http://localhost:8000/ by default
"""
import asyncio, json, re, sys, io, os, tempfile, pathlib
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mock_github import MockGitHub
from playwright.async_api import async_playwright, expect
from PIL import Image

TMP = pathlib.Path(tempfile.mkdtemp())
OUT = str(TMP / 'e2e_')
BASE = os.environ.get('BASE_URL', 'http://localhost:8000/')
mock = MockGitHub(str(HERE.parents[1]))
(TMP / 'big.mp4').write_bytes(b'0' * (51 * 1024 * 1024))
(TMP / 'clip.mp4').write_bytes(b'0' * (16 * 1024 * 1024))
results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

def png_bytes(w=1600, h=1000):
    im = Image.new('RGB', (w, h), (62, 117, 183))
    for x in range(0, w, 50):
        for y in range(0, h, 50):
            if (x // 50 + y // 50) % 2: im.putpixel((x, y), (255, 255, 255))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()

async def setup_routes(ctx):
    async def handler(route):
        r = route.request
        status, headers, body = mock.handle(r.method, r.url, {k.lower(): v for k, v in r.headers.items()}, r.post_data)
        await route.fulfill(status=status, headers=headers, body=body)
    await ctx.route(re.compile(r'https://(api\.github\.com|raw\.githubusercontent\.com)/.*'), handler)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce', accept_downloads=True)
        await setup_routes(ctx)
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and '404' not in m.text and 'TUNNEL' not in m.text else None)
        pg.on('dialog', lambda d: (errors.append('NATIVE DIALOG: ' + d.message), asyncio.ensure_future(d.dismiss())))

        # 1. First-time setup
        await pg.goto(BASE + '#/admin', wait_until='networkidle')
        await pg.wait_for_selector('#setup-form')
        ok('setup form shown when no editors', True)
        await pg.fill('#su-user', 'daniel')
        await pg.fill('#su-pass', 'short')
        await pg.fill('#su-pass2', 'short')
        await pg.fill('#su-token', 'github_pat_TEST')
        await pg.click('#setup-form button[type=submit]')
        await pg.wait_for_timeout(300)
        ok('weak password rejected', 'at least 12' in (await pg.inner_text('#setup-form .form-error')).lower())
        await pg.fill('#su-pass', 'correct horse battery staple')
        await pg.fill('#su-pass2', 'correct horse battery staple')
        await pg.click('#setup-form button[type=submit]')
        await pg.wait_for_selector('#pw-form', timeout=30000)
        eds = json.loads(mock.read('content/editors.json'))
        e0 = eds['editors'][0]
        ok('editors.json committed with admin', e0['username'] == 'daniel' and e0['role'] == 'admin')
        raw = mock.read('content/editors.json').decode()
        ok('no plaintext token or password in repo', 'github_pat_TEST' not in raw and 'correct horse' not in raw)
        ok('kdf is PBKDF2 600k + AES-GCM', e0['kdf']['iterations'] == 600000 and e0['privateKey']['alg'] == 'AES-GCM')
        await pg.screenshot(path=OUT + 'admin.png', full_page=True)

        # 2. Add an editor
        await pg.fill('#a-user', 'alex')
        await pg.fill('#a-pass', 'temporary pass phrase 42')
        await pg.click('#add-form button[type=submit]')
        await pg.wait_for_function("document.querySelector('#editor-list').textContent.includes('alex')", timeout=30000)
        ok('editor alex added', any(e['username'] == 'alex' for e in json.loads(mock.read('content/editors.json'))['editors']))

        # 3. Edit a resource page
        await pg.goto(BASE + '#/team/programming', wait_until='networkidle')
        await pg.wait_for_selector('.editor-bar')
        ok('edit mode active', await pg.locator('.acc.is-editing').count() > 0)
        n0 = await pg.locator('.acc').count()
        await pg.click('[data-action=section-add]')
        await pg.fill('#p-input', 'Test Section: Swerve tuning')
        await pg.click('button[form=prompt-form]')
        await pg.wait_for_selector('#sec-test-section-swerve-tuning')
        ok('section added', await pg.locator('.acc').count() == n0 + 1)
        ok('save bar visible when dirty', await pg.is_visible('.save-bar'))

        # 3a. rich text via Quill
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=text]')
        await pg.wait_for_selector('.ql-editor')
        await pg.click('.ql-editor')
        await pg.keyboard.type('Tune the steer PID first. ')
        await pg.keyboard.press('Control+b')
        await pg.keyboard.type('Bold step')
        await pg.keyboard.press('Control+b')
        await pg.keyboard.press('Enter')
        await pg.keyboard.type('Second line with "quotes" & <angle>')
        await pg.screenshot(path=OUT + 'quill.png')
        await pg.click('#f-submit')
        await pg.wait_for_selector('#sec-test-section-swerve-tuning .blk-text')
        html = await pg.inner_html('#sec-test-section-swerve-tuning .blk-text')
        ok('rich text saved with bold', '<strong>Bold step</strong>' in html, html[:160])

        # 3b. link block (Google Sheet)
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=link]')
        await pg.fill('#f-url', 'javascript:alert(1)')
        await pg.fill('#f-title', 'Bad')
        await pg.click('#f-submit')
        ok('javascript: URL rejected', await pg.is_visible('#f-error'))
        await pg.fill('#f-url', 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0')
        await pg.fill('#f-title', 'PID tuning log')
        await pg.click('#f-submit')
        await pg.wait_for_selector('#sec-test-section-swerve-tuning .kind-sheet')
        ok('Google Sheet link detected', True)

        # 3c. YouTube + Drive
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=youtube]')
        await pg.fill('#f-url', 'https://youtu.be/_fybREErgyM?t=1m5s')
        await pg.fill('#f-title', 'Game animation')
        await pg.click('#f-submit')
        await pg.wait_for_selector('#sec-test-section-swerve-tuning [data-yt="_fybREErgyM"][data-start="65"]')
        ok('YouTube block with timestamp', True)
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=drive]')
        await pg.fill('#f-url', 'https://drive.google.com/file/d/1a2B3c4D5e6F7g8H9i0J/view?usp=sharing')
        await pg.fill('#f-title', 'Match video')
        await pg.click('#f-submit')
        await pg.wait_for_selector('#sec-test-section-swerve-tuning [data-embed*="/preview"]')
        ok('Drive embed block', True)

        # 3d. image upload (auto-compressed to WebP)
        png = png_bytes()
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=image]')
        await pg.set_input_files('#f-file', files=[{'name': 'Swerve Module Photo.png', 'mimeType': 'image/png', 'buffer': png}])
        await pg.wait_for_function("document.querySelector('#f-file-status').textContent.includes('Optimized') || document.querySelector('#f-file-status').textContent.includes('Kept')", timeout=20000)
        status = await pg.inner_text('#f-file-status')
        await pg.click('#f-submit')
        await pg.wait_for_selector('#sec-test-section-swerve-tuning .blk-image img')
        ok('image prepared + previewed', True, status)

        # 3e. SVG upload blocked; oversize video blocked
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=image]')
        await pg.set_input_files('#f-file', files=[{'name': 'x.svg', 'mimeType': 'image/svg+xml', 'buffer': b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'}])
        await pg.wait_for_timeout(300)
        ok('SVG upload blocked', 'SVG uploads are blocked' in await pg.inner_text('#f-error'))
        await pg.click('dialog[open] [data-close]')
        await pg.click('#sec-test-section-swerve-tuning .add-block')
        await pg.click('[data-type=video]')
        await pg.set_input_files('#f-file', files=str(TMP / 'big.mp4'))
        await pg.wait_for_timeout(500)
        ok('video over limit blocked', 'limited to 50 MB' in await pg.inner_text('#f-error'))
        await pg.set_input_files('#f-file', files=str(TMP / 'clip.mp4'))
        await pg.wait_for_selector('dialog[open] >> text=Large video')
        ok('large video warns and recommends YouTube/Drive', 'YouTube' in await pg.inner_text('dialog[open]:last-of-type'))
        await pg.click('dialog[open]:last-of-type [data-cancel]')
        await pg.click('dialog[open] [data-close]')

        # 3f. reorder: move the new section up with the button, and drag with Sortable
        order_before = await pg.eval_on_selector_all('.acc', 'els => els.map(e => e.dataset.id)')
        await pg.click('#sec-test-section-swerve-tuning [data-action=section-up]')
        order_after = await pg.eval_on_selector_all('.acc', 'els => els.map(e => e.dataset.id)')
        ok('move up button reorders', order_after.index('test-section-swerve-tuning') == order_before.index('test-section-swerve-tuning') - 1)
        first = pg.locator('.acc').nth(0).locator('.acc-drag')
        third = pg.locator('.acc').nth(2)
        fb = await first.bounding_box(); tb = await third.bounding_box()
        await pg.mouse.move(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] / 2)
        await pg.mouse.down()
        for i in range(1, 16):
            await pg.mouse.move(fb['x'] + fb['width'] / 2, fb['y'] + (tb['y'] + tb['height'] * 0.75 - fb['y']) * i / 15)
            await pg.wait_for_timeout(30)
        await pg.mouse.up()
        await pg.wait_for_timeout(400)
        order_drag = await pg.eval_on_selector_all('.acc', 'els => els.map(e => e.dataset.id)')
        ok('drag-and-drop reorders sections', order_drag != order_after, f'{order_after[:3]} -> {order_drag[:3]}')

        # 3g. save
        await pg.screenshot(path=OUT + 'editing.png', full_page=False)
        await pg.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
        await pg.click('.save-bar [data-action=save]')
        await pg.wait_for_selector('.toast >> text=Saved', timeout=30000)
        saved = json.loads(mock.read('content/programming/sections.json'))
        ids = [s['id'] for s in saved['sections']]
        ok('sections.json committed', 'test-section-swerve-tuning' in ids)
        ok('order persisted', ids == order_drag, f'{ids[:3]}')
        img_block = [bl for s in saved['sections'] for bl in s['blocks'] if bl['type'] == 'image'][0]
        up = mock.read(img_block['src'])
        ok('image file committed in same commit (webp)', up is not None and up[:4] == b'RIFF' and img_block['src'].endswith('.webp'), f'{img_block["src"]} {len(up or b"")} bytes')
        msg = mock.commits[mock.head]['message']
        ok('single commit with message + author', msg.startswith('Update Programming resources') and 'daniel' in msg)
        ok('save bar hidden after save', not await pg.is_visible('.save-bar'))

        # 4. Conflict: someone else edits, we edit, save -> dialog
        other = json.loads(mock.read('content/programming/sections.json'))
        other['sections'][0]['title'] = 'Renamed by someone else'
        mock.external_write('content/programming/sections.json', json.dumps(other, indent=2))
        await pg.click('#sec-test-section-swerve-tuning [data-action=section-rename]')
        await pg.fill('#p-input', 'Swerve tuning (renamed)')
        await pg.click('button[form=prompt-form]')
        await pg.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
        await pg.click('.save-bar [data-action=save]')
        await pg.wait_for_selector('dialog[open] >> text=Someone else saved this page', timeout=30000)
        ok('conflict detected via SHA check', True)
        await pg.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
        await pg.click('dialog[open] [data-choice=mine]')
        await pg.wait_for_selector('.toast >> text=Saved', timeout=30000)
        saved = json.loads(mock.read('content/programming/sections.json'))
        ok('overwrite resolves conflict', any(s['title'] == 'Swerve tuning (renamed)' for s in saved['sections']))

        # 5. Delete with confirmation, then discard
        n_blocks = len(saved['sections'][[s['id'] for s in saved['sections']].index('test-section-swerve-tuning')]['blocks'])
        await pg.click('#sec-test-section-swerve-tuning .blk-wrap >> nth=0 >> [data-action=block-delete]')
        await pg.wait_for_selector('dialog[open] >> text=Delete this item?')
        ok('delete asks for confirmation', True)
        await pg.click('dialog[open] [data-ok]')
        ok('block removed locally', await pg.locator('#sec-test-section-swerve-tuning .blk-wrap').count() == n_blocks - 1)
        await pg.click('.save-bar [data-action=discard]')
        await pg.click('dialog[open] [data-ok]')
        ok('discard restores', await pg.locator('#sec-test-section-swerve-tuning .blk-wrap').count() == n_blocks)

        # 6. History: load an older version and save it (undo through git)
        await pg.click('[data-action=history]')
        await pg.wait_for_selector('.history-list li')
        count = await pg.locator('.history-list li').count()
        ok('history lists commits', count >= 3, f'{count} versions')
        await pg.click('.history-list [data-restore] >> nth=-1')   # oldest = seed
        await pg.wait_for_selector('.toast >> text=Older version loaded')
        ok('older version loaded (dirty)', await pg.is_visible('.save-bar') and await pg.locator('#sec-test-section-swerve-tuning').count() == 0)
        await pg.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
        await pg.click('.save-bar [data-action=save]')
        await pg.wait_for_selector('.toast >> text=Saved', timeout=30000)
        saved = json.loads(mock.read('content/programming/sections.json'))
        ok('restore committed', 'test-section-swerve-tuning' not in [s['id'] for s in saved['sections']])
        # uploaded image no longer referenced -> removed in that commit
        ok('unused uploaded file cleaned up', mock.read(img_block['src']) is None)

        # 7. Rotate token, then sign in as alex
        await pg.goto(BASE + '#/admin', wait_until='networkidle')
        await pg.wait_for_selector('#rot-form')
        mock.tokens.add('github_pat_NEW')
        await pg.fill('#r-token', 'github_pat_NEW')
        await pg.click('#rot-form button[type=submit]')
        await pg.wait_for_selector('.toast >> text=Token rotated', timeout=60000)
        mock.tokens.discard('github_pat_TEST')   # old token revoked
        ok('token rotated for all editors', True)

        await pg.click('.nav-toggle')
        await pg.click('[data-action=signout]')
        await pg.goto(BASE + '#/login', wait_until='networkidle')
        await pg.fill('#l-user', 'alex')
        await pg.fill('#l-pass', 'wrong password here')
        await pg.click('#login-form button[type=submit]')
        await pg.wait_for_function("!document.querySelector('#login-form .form-error').hidden", timeout=20000)
        ok('wrong password rejected', 'Incorrect' in await pg.inner_text('#login-form .form-error'))
        await pg.fill('#l-pass', 'temporary pass phrase 42')
        await pg.click('#login-form button[type=submit]')
        await pg.wait_for_selector('.nav-edit-badge:not([hidden])', timeout=20000)
        sess = await pg.evaluate("JSON.parse(sessionStorage.getItem('ihot.session.v1'))")
        ok('alex signs in and receives the NEW token', sess and sess['token'] == 'github_pat_NEW' and sess['role'] == 'editor')

        # alex changes password
        await pg.goto(BASE + '#/admin', wait_until='networkidle')
        await pg.wait_for_selector('#pw-form')
        ok('non-admin sees no editor management', await pg.locator('#add-form').count() == 0)
        await pg.fill('#pw-old', 'temporary pass phrase 42')
        await pg.fill('#pw-new', 'alex long new passphrase')
        await pg.fill('#pw-new2', 'alex long new passphrase')
        await pg.click('#pw-form button[type=submit]')
        await pg.wait_for_selector('.toast >> text=Password updated', timeout=30000)
        ok('password change committed', True)

        # 8. XSS: malicious content in the repo is neutralized
        evil = json.loads(mock.read('content/programming/sections.json'))
        evil['sections'].insert(0, {'id': 'evil', 'title': '<img src=x onerror="window.__xss=1">', 'blocks': [
            {'id': 'x1', 'type': 'text', 'html': '<img src=x onerror="window.__xss=2"><script>window.__xss=3</script><a href="javascript:window.__xss=4">click</a><p style="position:fixed;top:0;background:url(x)">styled</p><iframe src="https://evil.example"></iframe>'},
            {'id': 'x2', 'type': 'link', 'url': 'javascript:window.__xss=5', 'title': 'bad link'},
            {'id': 'x3', 'type': 'image', 'src': 'javascript:alert(1)', 'alt': 'x'},
        ]})
        mock.external_write('content/programming/sections.json', json.dumps(evil))
        await pg.goto(BASE + '#/team/cad', wait_until='networkidle')
        await pg.goto(BASE + '#/team/programming', wait_until='networkidle')
        await pg.wait_for_selector('#sec-evil')
        await pg.click('#sec-evil .acc-btn')
        await pg.click('#sec-evil a >> text=click')
        await pg.wait_for_timeout(500)
        xss = await pg.evaluate('window.__xss || 0')
        body = await pg.inner_html('#sec-evil')
        bad_attrs = await pg.evaluate("[...document.querySelectorAll('#sec-evil *')].filter(el => [...el.attributes].some(a => a.name.startsWith('on') || /javascript:/i.test(a.value) || (a.name==='style' && /position|url\\(/i.test(a.value)))).map(el => el.outerHTML.slice(0,80))")
        tags = await pg.evaluate("[...document.querySelectorAll('#sec-evil script, #sec-evil iframe, #sec-evil .acc-title img')].length")
        ok('XSS payloads neutralized', xss == 0 and not bad_attrs and tags == 0, f'xss={xss} bad={bad_attrs} tags={tags}')

        # 9. Visitor (no session) is read-only
        pub = await b.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
        vp = await pub.new_page()
        await vp.goto(BASE + '#/team/programming', wait_until='networkidle')
        await vp.wait_for_selector('.acc')
        ok('visitors see no edit controls', await vp.locator('.editor-bar, [data-action], .acc-drag').count() == 0)
        await pub.close()

        ok('no page errors / native dialogs', not errors, '; '.join(errors[:5]))
        await b.close()
    failed = [n for n, c in results if not c]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    if failed:
        print('FAILED:', failed)
        sys.exit(1)

asyncio.run(main())
