"""Fluxo real de avatares, pontuação por ordem, pódio e movimento reduzido."""
import os
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

artifacts = Path(tempfile.mkdtemp(prefix='despertos-arcade-ui-'))
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
        database = tempfile.TemporaryDirectory(prefix='despertos-arcade-db-')
        server = subprocess.Popen(['node', 'src/server.mjs'], cwd=Path(__file__).resolve().parents[1], env={
            **os.environ, 'PORT': str(port), 'HOST': '127.0.0.1', 'PUBLIC_ORIGIN': base,
            'COOKIE_SECURE': '0', 'DB_PATH': str(Path(database.name) / 'game.sqlite'),
        }, stdout=subprocess.DEVNULL)
        for attempt in range(60):
            try:
                urllib.request.urlopen(base + '/api/health', timeout=1).close()
                break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('Servidor de teste encerrou')
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
        players = []

        def state(room):
            response = context.request.get(f'{base}/api/rooms/{room}/snapshot?view=host')
            assert response.ok
            return response.json()

        def command(room, action):
            response = context.request.post(f'{base}/api/rooms/{room}/commands?view=host', data={
                'action': action, 'requestId': str(uuid.uuid4()), 'expectedVersion': state(room)['version'],
            }, headers={'Origin': base})
            assert response.ok, response.text()

        try:
            host.goto(base + '/host')
            host.get_by_role('button', name='Criar conta', exact=True).click()
            host.get_by_label('NOME DO ANFITRIÃO').fill('arcade_' + uuid.uuid4().hex[:10])
            host.get_by_label('SENHA', exact=True).fill(secrets.token_urlsafe(24))
            host.get_by_role('button', name='Criar minha conta').click()
            host.get_by_role('button', name='Criar partida').click()
            host.wait_for_url('**/host/*')
            room = urlparse(host.url).path.rsplit('/', 1)[1]
            rooms.append(room)
            host.get_by_label('Modo de pontuação').select_option('speed')
            host.wait_for_function("!document.querySelector('#scoring-mode').disabled && document.querySelector('#scoring-mode').value === 'speed'")
            assert state(room)['scoringMode'] == 'speed'
            host.evaluate('document.fonts.ready')
            assert host.evaluate("getComputedStyle(document.querySelector('.arcade-word')).fontFamily.includes('Press Start 2P')")
            assert host.evaluate("getComputedStyle(document.querySelector('.arcade-word')).color === 'rgb(255, 152, 0)'")
            assert host.evaluate("[...document.fonts].some(f => f.family === 'Press Start 2P' && f.status === 'loaded')")
            pin = state(room)['pin']
            profiles = [
                ('Ana Pixel', 'Leões', {'color': 'purple', 'skin': 'deep', 'face': 'glasses', 'accessory': 'crown'}),
                ('Bia Pixel', 'Lobos', {'color': 'blue', 'skin': 'light', 'face': 'happy', 'accessory': 'headphones'}),
                ('Caio Pixel', 'Águias', {'color': 'green', 'skin': 'brown', 'face': 'wink', 'accessory': 'cap'}),
            ]
            color_labels = {'purple': 'Roxo', 'blue': 'Azul', 'green': 'Verde'}
            skin_labels = {'deep': 'escuro', 'light': 'claro', 'brown': 'castanho'}
            for index, (name, team, avatar) in enumerate(profiles):
                player = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True).new_page()
                player.on('pageerror', lambda error: errors.append(str(error)))
                player.goto(f'{base}/join?pin={pin}')
                player.locator('.avatar-options summary').click()
                player.get_by_role('button', name='Cor ' + color_labels[avatar['color']], exact=True).click()
                player.get_by_role('button', name='Tom de pele ' + skin_labels[avatar['skin']], exact=True).click()
                player.get_by_label('Expressão', exact=True).select_option(avatar['face'])
                player.get_by_label('Acessório', exact=True).select_option(avatar['accessory'])
                if index == 0:
                    for width in [320, 390]:
                        player.set_viewport_size({'width': width, 'height': 844})
                        assert player.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Avatar cortado em {width}px'
                    player.screenshot(path=str(artifacts / 'avatar-editor.png'), full_page=True)
                player.get_by_label('COMO VOCÊ QUER SER CHAMADO?').fill(name)
                player.locator('.team-choice').filter(has_text=team).click()
                player.get_by_role('button', name='Entrar no desafio').click()
                player.wait_for_url(f'**/play/{room}')
                player.get_by_role('img', name=f'Avatar de {name}', exact=True).wait_for()
                players.append(player)
            host.wait_for_function("document.querySelector('.lobby-bar h2')?.textContent.startsWith('3')")
            assert [member['avatar'] for member in state(room)['players']] == [profile[2] for profile in profiles]
            host.screenshot(path=str(artifacts / 'arcade-lobby.png'), full_page=True)
            print('PASS: fonte Press Start 2P local, modo por ordem selecionado e três avatares personalizados no lobby.', flush=True)

            host.get_by_role('button', name='Iniciar desafio').click()
            for player in players:
                player.locator('[data-answer="A"]').wait_for()
            for index, player in enumerate(players):
                assert player.locator('#scoring-mode').count() == 0
                player.locator('[data-answer="A"]').click()
                if index < 2:
                    player.get_by_role('heading', name='Resposta enviada!').wait_for()
                    assert player.locator('.personal-points').count() == 0
            for player, points in zip(players, [100, 75, 50]):
                player.get_by_role('heading', name='Boa, você acertou!').wait_for()
                assert player.locator('.personal-points').inner_text().startswith('+' + str(points))
            players[0].reload()
            players[0].get_by_role('heading', name='Boa, você acertou!').wait_for()
            assert players[0].context.request.get(f'{base}/api/rooms/{room}/snapshot?view=player').json()['me']['avatar'] == profiles[0][2]
            host.get_by_role('button', name='Ver classificação').click()
            host.get_by_role('heading', name='Classificação', exact=True).wait_for()
            host.get_by_role('button', name='Encerrar partida', exact=True).click()
            host.get_by_role('dialog').get_by_role('button', name='Encerrar partida', exact=True).click()
            host.get_by_role('heading', name='PÓDIO FINAL', exact=True).wait_for()
            for rank, team in [(1, 'Leões'), (2, 'Lobos'), (3, 'Águias')]:
                assert team in host.locator(f'.podium-stage[data-rank="{rank}"]').inner_text()
            players[0].get_by_role('heading', name='PÓDIO FINAL', exact=True).wait_for()
            assert host.locator('.podium-stage').first.evaluate('element => element.getAnimations().length') > 0
            host.wait_for_timeout(1100)
            host.screenshot(path=str(artifacts / 'podium-desktop.png'), full_page=True)
            for width in [320, 390, 768, 1440]:
                host.set_viewport_size({'width': width, 'height': 1100})
                assert host.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Pódio cortado em {width}px'
            host.set_viewport_size({'width': 390, 'height': 844})
            host.screenshot(path=str(artifacts / 'podium-mobile.png'), full_page=True)
            host.emulate_media(reduced_motion='reduce')
            host.reload()
            host.get_by_role('heading', name='PÓDIO FINAL', exact=True).wait_for()
            assert host.evaluate('document.getAnimations().length') == 0
            print('PASS: acertos 100/75/50 sem revelação antecipada, avatar após recarregar, pódio animado e movimento reduzido.', flush=True)

            created = context.request.post(base + '/api/rooms', data={}, headers={'Origin': base})
            assert created.status == 201
            fixed = created.json()['roomId']; rooms.append(fixed)
            fixed_state = state(fixed)
            assert fixed_state['scoringMode'] == 'fixed'
            for player, (name, _, avatar), team in zip(players, profiles, ['lion', 'wolf', 'eagle']):
                response = player.context.request.post(base + '/api/join', data={
                    'pin': fixed_state['pin'], 'name': name, 'team': team, 'avatar': avatar,
                }, headers={'Origin': base})
                assert response.status == 201
            command(fixed, 'start')
            for attempt in range(40):
                current = state(fixed)
                if current['phase'] == 'QUESTION_OPEN': break
                time.sleep(.2)
            assert current['phase'] == 'QUESTION_OPEN'
            for player in players:
                response = player.context.request.post(f'{base}/api/rooms/{fixed}/commands?view=player', data={
                    'action': 'answer', 'requestId': str(uuid.uuid4()), 'questionRunId': current['question']['runId'], 'optionId': 'A',
                }, headers={'Origin': base})
                assert response.ok
            command(fixed, 'end')
            host.goto(f'{base}/host/{fixed}')
            host.get_by_role('heading', name='PÓDIO FINAL', exact=True).wait_for()
            assert host.locator('.podium-stage').count() == 1
            assert host.locator('.podium-stage[data-rank="1"] .podium-team').count() == 3
            assert all(team['score'] == 100 for team in state(fixed)['podium'])
            host.screenshot(path=str(artifacts / 'podium-tie.png'), full_page=True)
            assert not errors, errors
            print('PASS: modo fixo preservado, empates compartilhados no pódio e nenhum erro JavaScript.', flush=True)
        finally:
            for room in rooms:
                if state(room)['phase'] != 'ENDED': command(room, 'end')
            browser.close()
finally:
    if server is not None:
        server.terminate(); server.wait(timeout=10)
    if database is not None: database.cleanup()
