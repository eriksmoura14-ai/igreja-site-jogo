import os, subprocess, tempfile, time, urllib.request, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

folder = tempfile.mkdtemp(prefix='despertos-browser-')
artifacts = Path(tempfile.mkdtemp(prefix='despertos-ui-'))
Path('/tmp/despertos-ui-latest.txt').write_text(str(artifacts))
print('Artefatos desta execução:', artifacts, flush=True)
server = subprocess.Popen(['node', 'src/server.mjs'], cwd=Path(__file__).resolve().parents[1], env={**os.environ, 'DB_PATH': folder + '/game.sqlite', 'PORT': '3001', 'HOST': '127.0.0.1'}, stdout=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=1)
            break
        except OSError: time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        errors=[]
        host_context = browser.new_context(viewport={'width':1440,'height':1100})
        host = host_context.new_page()
        host.on('pageerror', lambda e: errors.append(str(e)))
        host.goto('http://127.0.0.1:3001/')
        host.evaluate('document.fonts.ready')
        assert host.evaluate("[...document.fonts].some(f => f.family === 'Bebas Neue' && f.status === 'loaded')"), 'Bebas Neue não carregou'
        assert host.evaluate("[...document.fonts].some(f => f.family === 'Poppins' && f.status === 'loaded')"), 'Poppins não carregou'
        assert host.evaluate("[...document.fonts].some(f => f.family === 'Anton' && f.status === 'loaded')"), 'Anton não carregou'
        assert host.evaluate("[...document.fonts].some(f => f.family === 'Montserrat' && f.status === 'loaded')"), 'Montserrat Bold não carregou'
        assert host.evaluate("getComputedStyle(document.body).fontFamily.includes('Poppins')")
        assert host.locator('.hero-lettering').evaluate('e => e.complete && e.naturalWidth === 2142 && e.naturalHeight === 734'), 'Arte da marca não carregou'
        assert host.locator('.brand-lettering').evaluate('e => e.complete && e.naturalWidth === 2142'), 'Arte do cabeçalho não carregou'
        assert host.locator('.hero-lettering').get_attribute('src') == host.locator('.brand-lettering').get_attribute('src'), 'Marcas divergentes entre abertura e cabeçalho'
        assert host.evaluate("getComputedStyle(document.querySelector('.hero h2')).fontFamily.includes('Anton')")
        assert host.evaluate("getComputedStyle(document.querySelector('.hero h2')).fontWeight === '400'")
        assert host.evaluate("getComputedStyle(document.querySelector('.hero-wordmark h1')).fontStyle === 'normal'")
        assert host.evaluate("getComputedStyle(document.body).fontSynthesis === 'none'")
        host.wait_for_timeout(650)
        host.screenshot(path=str(artifacts / 'home.png'), full_page=True)
        assert host.locator('h1').inner_text() == 'DESPERTOS'
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True).new_page()
        mobile.goto('http://127.0.0.1:3001/')
        mobile.evaluate('document.fonts.ready')
        mobile.wait_for_timeout(650)
        mobile.screenshot(path=str(artifacts / 'mobile-home.png'),full_page=True)
        mark=mobile.locator('.hero-wordmark').bounding_box()
        assert mark['x'] >= 0 and mark['x'] + mark['width'] <= 390, 'Marca cortada no celular'
        for width in [320, 768, 1024, 1440]:
            mobile.set_viewport_size({'width':width,'height':900})
            mark=mobile.locator('.hero-wordmark').bounding_box()
            assert mark['x'] >= 0 and mark['x'] + mark['width'] <= width, f'Marca cortada em {width}px'
            image_box=mobile.locator('.hero-lettering').bounding_box()
            assert abs(image_box['width'] / image_box['height'] - 2142/734) < .01, f'Marca deformada em {width}px'
            assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow em {width}px'
        mobile.close()
        reduced=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce').new_page()
        reduced.goto('http://127.0.0.1:3001/')
        reduced.evaluate('document.fonts.ready')
        reduced.locator('.team-choice').filter(has_text='Leões').click()
        assert reduced.locator('input[value="lion"]').is_checked()
        assert reduced.evaluate('document.getAnimations().length') == 0, 'Movimento reduzido não respeitado'
        reduced.screenshot(path=str(artifacts / 'reduced-motion.png'),full_page=True)
        reduced.close()
        host.goto('http://127.0.0.1:3001/host')
        host.get_by_role('button', name='Criar conta', exact=True).click()
        host.get_by_label('NOME DO ANFITRIÃO').fill('teste_visual')
        host.get_by_label('SENHA', exact=True).fill('senha-local-de-teste')
        host.get_by_role('button', name='Criar minha conta').click()
        host.get_by_role('button', name='Criar partida').click()
        host.wait_for_url('**/host/*')
        host.locator('.pin-card strong').wait_for()
        pin=host.locator('.pin-card strong').inner_text().replace(' ','')
        room_url=host.url
        players=[]
        for name, team in [('Ana','Leões'),('Bia','Lobos')]:
            context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
            page=context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:3001/join')
            page.get_by_label('PIN DO JOGO', exact=True).fill(pin)
            page.get_by_label('COMO VOCÊ QUER SER CHAMADO?').fill(name)
            page.locator('.team-choice').filter(has_text=team).click()
            page.get_by_role('button', name='Entrar no desafio').click()
            page.wait_for_url('**/play/*')
            page.get_by_role('heading',name=team,exact=True).wait_for()
            players.append(page)
        host.wait_for_timeout(200)
        host.screenshot(path=str(artifacts / 'host-lobby.png'),full_page=True)
        assert host.locator('.lobby-bar').inner_text().startswith('2')
        host.get_by_role('button',name='Iniciar desafio').click()
        host.locator('#countdown').wait_for()
        assert host.evaluate("document.querySelector('#countdown').getAnimations().length > 0"), 'Contagem não animou'
        host.get_by_role('heading',name='Quem construiu a arca?').wait_for(timeout=8000)
        ana,bia=players
        ana.get_by_role('heading',name='Quem construiu a arca?').wait_for()
        ana.wait_for_timeout(650)
        ana.screenshot(path=str(artifacts / 'player-question.png'),full_page=True)
        host.screenshot(path=str(artifacts / 'host-question.png'),full_page=True)
        assert ana.locator('[data-command]').count()==0
        assert ana.locator('.pin-card').count()==0
        host.get_by_role('button',name='Encerrar partida',exact=True).click()
        ana.locator('[data-answer="A"]').click()
        ana.get_by_role('heading',name='Resposta enviada!').wait_for()
        host.wait_for_function("document.querySelector('.progress-line b')?.textContent === '1'")
        assert host.get_by_role('dialog').is_visible(), 'Atualização ao vivo fechou a confirmação'
        assert host.evaluate("document.querySelector('.host-question').getAnimations().length") == 0, 'Progresso repetiu a animação da pergunta'
        host.get_by_role('button',name='Continuar jogando').click()
        bia.locator('[data-answer="B"]').click()
        ana.get_by_role('heading',name='Boa, você acertou!').wait_for()
        bia.get_by_role('heading',name='Na próxima, a gente acerta.').wait_for()
        ana.reload()
        ana.get_by_role('heading',name='Boa, você acertou!').wait_for()
        host.get_by_role('button',name='Ver classificação').click()
        host.get_by_role('heading',name='Classificação',exact=True).wait_for()
        host.wait_for_timeout(1000)
        assert '100' in host.locator('.ranking-row').first.inner_text()
        ana.get_by_role('heading',name='Classificação',exact=True).wait_for()
        ana.screenshot(path=str(artifacts / 'player-ranking.png'),full_page=True)
        host.get_by_role('button',name='Encerrar partida',exact=True).click()
        host.get_by_role('dialog').get_by_role('button',name='Encerrar partida',exact=True).click()
        host.get_by_role('heading',name='Essa vitória é nossa.').wait_for()
        ana.get_by_role('heading',name='Essa vitória é nossa.').wait_for()
        unauthorized=browser.new_context().new_page()
        unauthorized.goto(room_url)
        unauthorized.get_by_role('heading',name='Vamos reconectar?').wait_for()
        for page in [host,*players]:
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Overflow horizontal'
        assert not errors, errors
        print('PASS: início, cadastro, lobby, dois celulares, sincronização, respostas, resultado, retomada, ranking, encerramento e acesso sem sessão.')
        print('PASS: sem erros JavaScript ou overflow nas telas verificadas.')
        print('PASS: fontes locais carregadas, contagem animada, progresso sem repetir entrada e movimento reduzido respeitado.')
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
    shutil.rmtree(folder)
