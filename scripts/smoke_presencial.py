from playwright.sync_api import sync_playwright
import time
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 host=b.new_context(); page=host.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:3000/host');page.get_by_role('button',name='Criar conta',exact=True).click()
 page.locator('#username').fill('smoke'+str(int(time.time())));page.locator('#password').fill('senha-presencial-123');page.get_by_role('button',name='Criar minha conta').click()
 page.locator('#create-room').click();page.locator('#team-count').wait_for();page.locator('#team-count').select_option('2')
 page.locator('[name=teamName]').nth(0).fill('Esperança');page.locator('[name=teamName]').nth(1).fill('Fé');page.get_by_role('button',name='Salvar equipes').click();page.wait_for_timeout(200)
 page.locator('#generate-display').click();page.locator('#display-link').wait_for(state='visible');link=page.locator('#display-link').get_attribute('href')
 display=b.new_context();screen=display.new_page();screen.on('pageerror',lambda e:errors.append(str(e)));screen.goto('http://127.0.0.1:3000'+link);screen.get_by_text('TELÃO · SOMENTE VISUALIZAÇÃO').wait_for()
 assert screen.locator('button').count()==0
 page.get_by_role('button',name='Iniciar desafio').click();page.get_by_role('button',name='Revelar resposta').wait_for();screen.get_by_text('As equipes respondem presencialmente.').wait_for()
 page.get_by_role('button',name='Revelar resposta').click();page.locator('[data-award=lion]').click();page.locator('[data-award=lion][aria-pressed=true]').wait_for();screen.get_by_text('1 ponto',exact=True).wait_for()
 assert screen.locator('button').count()==0
 page.screenshot(path='/tmp/presencial-organizador.png',full_page=True);screen.screenshot(path='/tmp/presencial-telao.png',full_page=True)
 page.locator('[data-award=lion]').click();screen.get_by_text('1 ponto',exact=True).wait_for(state='detached')
 page.get_by_role('button',name='Ver classificação').click();screen.get_by_role('heading',name='Classificação',exact=True).wait_for()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert not errors, errors
 print('PASS: organizador, 2 equipes personalizadas, telão isolado, sincronização, +1/desfazer, ranking, mobile, sem erros JS')
 b.close()
