import time
import zxingcpp
from PIL import Image
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 host=b.new_context(permissions=['clipboard-read','clipboard-write']);page=host.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:3000/host');page.get_by_role('button',name='Criar conta',exact=True).click()
 page.locator('#username').fill('imersivo'+str(time.time_ns()));page.locator('#password').fill('senha-presencial-123');page.get_by_role('button',name='Criar minha conta').click();page.locator('#create-room').click()
 page.locator('.display-tools summary').click();page.locator('#generate-display').click();page.locator('#display-invite').wait_for(state='visible')
 qr=page.locator('#display-qr');qr.screenshot(path='/tmp/immersive-qr.png'); decoded=zxingcpp.read_barcode(Image.open('/tmp/immersive-qr.png'));assert decoded
 link=page.locator('#display-link').get_attribute('href');assert decoded.text==link
 page.locator('#copy-display').click();assert page.evaluate('navigator.clipboard.readText()')==link
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/immersive-mobile-qr.png',full_page=True)
 display=b.new_context(viewport={'width':1920,'height':1080});screen=display.new_page();screen.on('pageerror',lambda e:errors.append(str(e)));screen.goto(decoded.text);screen.locator('.display-mode').wait_for()
 assert screen.locator('button').count()==0
 page.get_by_role('button',name='Iniciar desafio').click();screen.locator('.phase-question_open').wait_for();screen.wait_for_timeout(800);screen.screenshot(path='/tmp/immersive-question.png',full_page=True)
 assert page.locator('#display-qr').get_attribute('src').startswith('data:image/png')
 page.get_by_role('button',name='Revelar resposta').click();screen.locator('.reveal-emblem').wait_for();page.locator('[data-award=lion]').click();screen.locator('[data-team-id=lion] .arena-score').filter(has_text='1').wait_for();screen.wait_for_timeout(900);screen.screenshot(path='/tmp/immersive-result.png',full_page=True)
 assert screen.locator('button').count()==0
 # Changing OS preference cancels effects and keeps content/controls usable.
 screen.emulate_media(reduced_motion='reduce');screen.wait_for_timeout(100)
 assert screen.locator('.celebration-layer').count()==0
 assert screen.locator('.arena-atmosphere span').first.evaluate('(el)=>getComputedStyle(el).animationName')=='none'
 page.get_by_role('button',name='Ver classificação').click();screen.get_by_role('heading',name='Classificação',exact=True).wait_for()
 assert page.locator('#display-link').get_attribute('href')==link
 page.on('dialog',lambda d:d.accept());page.locator('#end-presencial').click();screen.get_by_role('heading',name='Classificação final').wait_for();screen.screenshot(path='/tmp/immersive-final.png',full_page=True)
 assert not errors,errors
 print('PASS: QR renderizado decodificado e aberto, clipboard, 4 equipes, mobile 390px, telão 1920px, sincronização, efeitos, movimento reduzido, convite preservado e final')
 b.close()
