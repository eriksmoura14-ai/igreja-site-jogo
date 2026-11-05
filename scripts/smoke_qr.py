"""Valida QR real, ingresso e layout; SMOKE_BASE_URL permite verificar um deploy."""
import io
import os
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image
from playwright.sync_api import sync_playwright
from zxingcpp import read_barcode

artifacts = Path(tempfile.mkdtemp(prefix='despertos-qr-'))
print('Artefatos:', artifacts, flush=True)
base = os.environ.get('SMOKE_BASE_URL', '').rstrip('/')
server = None
database = None
try:
    if not base:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        database = tempfile.TemporaryDirectory(prefix='despertos-qr-db-')
        server = subprocess.Popen(['node', 'src/server.mjs'], cwd=Path(__file__).resolve().parents[1], env={
            **os.environ, 'PORT': str(port), 'HOST': '127.0.0.1',
            'DB_PATH': str(Path(database.name) / 'game.sqlite'),
            'COOKIE_SECURE': '0', 'PUBLIC_ORIGIN': base,
        }, stdout=subprocess.DEVNULL)
        for attempt in range(60):
            try:
                urllib.request.urlopen(base + '/api/health', timeout=1).close()
                break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('Servidor de teste encerrou antes do health check')
                time.sleep(.1)
        else:
            raise RuntimeError('Health check não respondeu')

    with sync_playwright() as p:
        launch = {'executable_path': '/usr/bin/chromium', 'headless': True}
        if server is None and os.environ.get('HTTPS_PROXY'):
            launch['proxy'] = {'server': os.environ['HTTPS_PROXY']}
        browser = p.chromium.launch(**launch)
        context = browser.new_context(viewport={'width': 1440, 'height': 1100})
        host = context.new_page()
        errors = []
        host.on('pageerror', lambda error: errors.append(str(error)))
        rooms = []

        def snapshot(room):
            response = context.request.get(f'{base}/api/rooms/{room}/snapshot?view=host')
            assert response.ok, response.status
            return response.json()

        def decode(page, label):
            page.wait_for_function("document.querySelector('#room-qr')?.complete && document.querySelector('#room-qr')?.naturalWidth > 0")
            image = page.locator('#room-qr').screenshot(path=str(artifacts / f'{label}-qr.png'))
            result = read_barcode(Image.open(io.BytesIO(image)))
            assert result is not None, 'O QR code exibido não pôde ser lido'
            pin = page.locator('.pin-card strong').inner_text().replace(' ', '')
            assert result.text == f'{base}/join?pin={pin}', 'O QR code não aponta para o PIN exibido'
            assert parse_qs(urlparse(result.text).query) == {'pin': [pin]}, 'O convite contém dados além do PIN'
            return result.text, pin

        def join(url, name, team, expected_room, pin=None):
            player = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True).new_page()
            player.on('pageerror', lambda error: errors.append(str(error)))
            player.goto(url)
            if pin is None:
                assert player.locator('#pin').input_value() == parse_qs(urlparse(url).query)['pin'][0]
                assert player.locator('#nickname').input_value() == ''
                assert player.locator('input[name="team"]:checked').count() == 0
            else:
                assert player.locator('#pin').input_value() == ''
                player.locator('#pin').fill(pin)
            player.get_by_label('COMO VOCÊ QUER SER CHAMADO?').fill(name)
            player.locator('.team-choice').filter(has_text=team).click()
            player.get_by_role('button', name='Entrar no desafio').click()
            player.wait_for_url(f'**/play/{expected_room}')
            player.get_by_role('heading', name=team, exact=True).wait_for()
            return player

        try:
            host.goto(base + '/host')
            host.get_by_role('button', name='Criar conta', exact=True).click()
            host.get_by_label('NOME DO ANFITRIÃO').fill('qr_' + uuid.uuid4().hex[:12])
            host.get_by_label('SENHA', exact=True).fill(secrets.token_urlsafe(24))
            host.get_by_role('button', name='Criar minha conta').click()
            host.get_by_role('button', name='Criar partida').click()
            host.wait_for_url('**/host/*')
            room1 = urlparse(host.url).path.rsplit('/', 1)[1]
            rooms.append(room1)
            url1, pin1 = decode(host, 'room1')
            host.screenshot(path=str(artifacts / 'lobby-desktop.png'), full_page=True)
            player1 = join(url1, 'Ana QR', 'Leões', room1)
            join(base + '/join', 'Bia PIN', 'Lobos', room1, pin=pin1)
            host.wait_for_function("document.querySelector('.lobby-bar h2')?.textContent.startsWith('2')")
            assert decode(host, 'room1-after-join') == (url1, pin1)

            created = context.request.post(base + '/api/rooms', data={}, headers={'Origin': base})
            assert created.status == 201
            room2 = created.json()['roomId']
            rooms.append(room2)
            host.goto(f'{base}/host/{room2}')
            url2, pin2 = decode(host, 'room2')
            assert pin1 != pin2 and url1 != url2
            join(url2, 'Caio QR', 'Águias', room2)
            host.wait_for_function("document.querySelector('.lobby-bar h2')?.textContent.startsWith('1')")
            assert len(snapshot(room1)['players']) == 2
            assert len(snapshot(room2)['players']) == 1
            print('PASS: QR codes decodificados de duas salas; PIN correto e ingresso por QR e por código, sem misturar participantes.', flush=True)

            for width in [320, 390, 768, 1024, 1440]:
                host.set_viewport_size({'width': width, 'height': 1100})
                assert host.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow em {width}px'
                box = host.locator('#room-qr').bounding_box()
                assert box['x'] >= 0 and box['x'] + box['width'] <= width
                assert box['width'] >= 190, f'QR pequeno demais em {width}px'
            host.set_viewport_size({'width': 390, 'height': 844})
            host.screenshot(path=str(artifacts / 'lobby-mobile.png'), full_page=True)

            input_page = browser.new_context().new_page()
            input_page.goto(base + '/join?pin=000001')
            assert input_page.locator('#pin').input_value() == '000001'
            input_page.goto(base + '/join?pin=1234567')
            assert input_page.locator('#pin').input_value() == ''
            player1.goto(f'{base}/host/{room1}')
            player1.get_by_role('heading', name='Vamos reconectar?').wait_for()
            assert not errors, errors
            print('PASS: QR legível em celular e desktop, PIN com zero inicial, consulta inválida ignorada e painel do anfitrião protegido.', flush=True)
        finally:
            for room in rooms:
                state = snapshot(room)
                if state['phase'] != 'ENDED':
                    response = context.request.post(f'{base}/api/rooms/{room}/commands?view=host', data={
                        'action': 'end', 'requestId': str(uuid.uuid4()), 'expectedVersion': state['version'],
                    }, headers={'Origin': base})
                    assert response.ok, 'Não foi possível encerrar a sala de teste'
            browser.close()
finally:
    if server is not None:
        server.terminate()
        server.wait(timeout=10)
    if database is not None:
        database.cleanup()
