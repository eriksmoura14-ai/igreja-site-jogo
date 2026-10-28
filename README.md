# Despertos — Desafio Bíblico

Jogo bíblico multiplayer ao vivo, inspirado na experiência de anfitrião e participantes do Kahoot. Uma partida tem um servidor autoritativo e duas interfaces distintas: painel do anfitrião e controle do participante no celular.

**Quer abrir o site sem instalar nada?** Use o deploy preparado no Render:

[![Deploy no Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/eriksmoura14-ai/igreja-site-jogo)

O botão abre a criação do serviço na sua conta Render. Ele não é o endereço do jogo já publicado. O Blueprint usa o plano gratuito de demonstração, sem disco persistente; contas e partidas podem ser perdidas ao reiniciar ou publicar uma nova versão. Confira o plano e os valores exibidos pelo Render antes de confirmar qualquer contratação.

## Publicar no Render

1. Abra **[Deploy no Render](https://render.com/deploy?repo=https://github.com/eriksmoura14-ai/igreja-site-jogo)** e faça login, preferencialmente com a conta GitHub que tem acesso ao repositório.
2. Autorize o acesso do Render a `eriksmoura14-ai/igreja-site-jogo`, se solicitado. Se o botão não importar um repositório privado, use **New → Blueprint**, conecte o repositório, escolha a branch `main` e o arquivo `render.yaml`.
3. Revise o serviço `despertos-jogo` e o plano **Free**. Crie/aplique o Blueprint. A configuração já instala, valida e inicia o servidor Node; não escolha **Static Site**.
4. Aguarde o build e o deploy terminarem com sucesso. Abra o endereço HTTPS que o painel do Render realmente atribuir ao serviço. Não é necessário escolher ou adivinhar esse endereço antecipadamente.
5. Nesse endereço, abra `/host` para criar sua conta e a partida; os celulares entram no mesmo domínio, em `/join`.

O `render.yaml` configura Node 24.19.0, uma instância, `npm start`, health check em `/api/health` e cookies Secure. A origem HTTPS é obtida automaticamente de `RENDER_EXTERNAL_URL`, fornecida pelo Render. Se conectar um domínio próprio, configure `PUBLIC_ORIGIN` com essa origem exata, sem barra final (ex.: `https://jogo.suaigreja.com.br`).

O `render.yaml` habilita o deploy automático dos novos commits da branch `main`. Se o serviço foi criado como Blueprint com sincronização automática, o Render pode aplicar essa configuração ao sincronizar o arquivo. Um serviço criado manualmente precisa ter **Auto-Deploy** habilitado no painel. A alteração no GitHub não confirma que o Render já a aplicou. Publique fora do horário do jogo, pois um deploy reinicia o processo e, no plano gratuito, pode apagar dados. A opção **Manual Deploy → Deploy latest commit** continua disponível no painel.

### Demonstração gratuita versus dados persistentes

O Blueprint gratuito serve para experimentar as telas e o multiplayer. O serviço pode ficar suspenso quando ocioso, demorar a acordar e não preserva o SQLite em reinícios/deploys. Não use essa modalidade como garantia de conservação de resultados de um evento.

Para manter dados entre deploys, antes de criar o Blueprint altere o serviço para um plano de web service que aceite disco persistente (por exemplo, `starter`), adicione o bloco abaixo no mesmo nível de `envVars`, e mude `DB_PATH` para `/var/data/despertos.sqlite`:

```yaml
    plan: starter
    disk:
      name: despertos-data
      mountPath: /var/data
      sizeGB: 1
```

Essa modalidade envolve cobrança de serviço e disco; confira os valores atuais na conta Render. Não foi contratado nenhum recurso pago. O disco deve existir e estar montado antes da primeira inicialização com esse `DB_PATH`. Mudar o caminho não migra automaticamente os dados de uma demonstração anterior. Mantenha apenas uma instância e não rode o mesmo SQLite em serviços diferentes.

Se o deploy falhar, confira **Logs** no serviço: o build deve executar os testes, e o início deve registrar “Despertos iniciado na porta …”. O Render define `PORT` automaticamente. Envie o texto do erro, sem senhas ou tokens, para diagnosticar. O status remoto só estará validado depois que o Render concluir o deploy e o domínio atribuído responder.

### Por que Render nesta versão?

O backend depende de um processo Node contínuo, de um relógio compartilhado e do SQLite local. A arquitetura atual se encaixa em um Web Service do Render. Para hospedar tudo na Vercel, seria necessário adaptar o backend e adotar armazenamento e sincronização apropriados ao modelo de execução; simplesmente importar este repositório como site estático não coloca o jogo multiplayer em funcionamento.

## Executar

Requisito: **Node.js 24** (inclui `node:sqlite`). Não há dependências de produção ou serviços externos. O projeto já tem todos os arquivos necessários; não exige compilação.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm start
```

O servidor usa a porta `3000`. Para desenvolver com reinício automático, use `npm run dev`. Anfitrião e celulares precisam acessar o mesmo servidor. Para jogar em uma rede local, use o IP dessa máquina; em hospedagem pública, configure um domínio HTTPS.

## Como jogar

1. Abra `/host`, crie sua conta de anfitrião e clique em **Criar partida**.
2. Mostre o lobby e o PIN no computador ou projetor. O PIN localiza a sala; não dá acesso aos controles.
3. Cada participante abre `/join`, informa PIN e apelido e escolhe uma equipe.
4. O anfitrião inicia a partida. Cada celular recebe a pergunta e quatro botões; não recebe controles administrativos.
5. A pergunta fecha quando todos respondem, ao atingir o prazo ou por comando do anfitrião. Então aparecem a resposta correta, a explicação e a referência bíblica.
6. O anfitrião avança ao ranking e, depois, à próxima pergunta. Após a pergunta 50, aparece a classificação final.

Recarregar a página restaura a mesma identidade e o prazo original, enquanto os cookies de sessão permanecerem no navegador. A conta permite retomar o painel em outro dispositivo. O participante deve manter seu navegador e cookies; apelido e PIN não recuperam uma identidade anterior.

## Regras desta implementação

- Quatro equipes: Leões (laranja), Lobos (azul), Águias (verde) e Realeza (roxo).
- Até quatro integrantes por equipe, total de 16; o anfitrião pode iniciar com equipes incompletas.
- Cada participante responde individualmente. Os acertos somam pontos à equipe.
- 50 perguntas: 10 fáceis (100 pontos), 25 médias (200) e 15 difíceis (300).
- 30 segundos por pergunta; três segundos de preparação entre perguntas.
- Pontuação fixa por dificuldade, sem bônus por velocidade. Esta é uma decisão própria para concretizar a referência enviada.
- Uma resposta por participante e pergunta, sem alteração após envio. O servidor verifica a alternativa e o prazo; informações de pontos ou identidade enviadas pelo cliente são ignoradas.
- Desempate: pontuação, depois número de acertos; persistindo, a colocação é compartilhada.
- Entrada apenas no lobby. Iniciar bloqueia novos participantes. Remoção e bloqueio manual estão disponíveis no lobby.
- Desconectar não altera o prazo nem fecha a pergunta. Encerrar a partida descarta a pergunta ainda aberta e conserva os pontos de perguntas já fechadas.
- Salas expiram em 24 horas; seus dados permanecem acessíveis por sessão autorizada durante sete dias adicionais, até a limpeza automática.

O banco inicial em `src/questions.mjs` foi preparado para esta implementação, com perguntas, explicações e referências. Ele é versionado e congelado na criação de cada sala. Não é conteúdo importado do Kahoot nem uma reprodução de sua arquitetura privada. O exemplo da imagem sobre “o discípulo amado” não foi copiado como pergunta factual, pois o trecho citado não identifica nominalmente esse discípulo.

## Arquitetura e dados

- `src/game.mjs`: motor independente de HTTP, relógio injetável, fases, regras e projeções por papel.
- `src/server.mjs`: API HTTP, autenticação, cookies HttpOnly, sincronização SSE e arquivos da interface.
- `public/`: interfaces responsivas, sem bibliotecas nem recursos externos.
- `test/`: testes de domínio e integração HTTP/SSE, incluindo duas salas e dois jogadores.
- `.github/workflows/ci.yml`: validação automática em Node 24.

## Tipografia e animações

Seguindo a referência visual, a marca usa **Road Rage**, com traços de pincel; os títulos usam **Montserrat Bold 700**; os textos usam **Poppins**, com pesos de 400 a 800 e itálico para citações. **Bebas Neue Regular** é usada nos números do cronômetro, PIN e placar. Os arquivos WOFF2 ficam em `public/fonts/`, incluindo os acentos do português; não há requisições ao Google Fonts. As famílias são distribuídas sob SIL Open Font License 1.1, com as licenças preservadas nessa pasta. `font-synthesis: none` impede que o navegador simule negrito ou itálico ausentes nos arquivos.

Road Rage aproxima o aspecto pincelado da marca na imagem. A referência não identifica a fonte ou o arquivo original desse lettering; esta implementação não afirma reproduzi-lo exatamente.

As fontes vieram dos pacotes Fontsource 5.3.0. O script opcional `python3 scripts/vendor_fonts.py` reproduz a importação e verifica o SHA-512 de cada pacote antes de gravar os arquivos. Ele não é necessário no build/deploy: os arquivos já estão no Git.

`public/type-motion.css` define as fontes e os estados visuais. `public/motion.js` concentra os efeitos: entrada de conteúdo, revelação ao rolar, escolha de equipe, toque nos botões, contagem regressiva, alternativas em sequência, confirmação de resposta, barras/posições do ranking e confetes breves em acertos e vitórias. As animações são decorativas e não atrasam respostas nem alteram o cronômetro do servidor.

Snapshots repetidos não remontam a tela nem reiniciam efeitos. A preferência **reduzir movimento** do sistema desativa as animações e as comemorações; mudar essa preferência também cancela efeitos em andamento. Os testes em Chromium verificam fontes carregadas, celular/desktop, contagem animada, progresso sem repetir a entrada da pergunta e movimento reduzido.

As tabelas SQLite guardam contas, hashes das sessões, salas, elenco, perguntas executadas, elegibilidade, respostas, lançamentos de pontos, recibos idempotentes e sequência durável de eventos. As transações e restrições únicas impedem resposta e pontuação duplicadas. Os eventos são anunciados **após o commit**; ao reconectar, SSE envia um snapshot atual filtrado pelo papel, em vez de reproduzir eventos privados antigos.

O anfitrião autentica com usuário e senha (hash com scrypt). Cada participante recebe uma credencial aleatória própria em cookie HttpOnly. O servidor autoriza cada snapshot, conexão e comando e não expõe gabaritos enquanto a pergunta está aberta. Existe separação entre anfitrião autenticado e conteúdo do quiz; este MVP oferece um quiz comum a todas as contas, sem editor de autoria.

## Configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de rede |
| `DB_PATH` | `.data/despertos.sqlite` | Arquivo persistente SQLite |
| `COOKIE_SECURE` | `0` | Defina `1` em HTTPS para cookies Secure |
| `PUBLIC_ORIGIN` | `RENDER_EXTERNAL_URL` no Render; senão, origem da requisição | Origem pública exata, como `https://jogo.exemplo.com`, especialmente atrás de proxy |

Não coloque senhas, sessões ou o banco de dados no Git. `.data/` está ignorado. Não há credenciais externas obrigatórias. Contas são criadas pela interface, e a inscrição de novos anfitriões é aberta.

## Hospedagem

Execute **um processo Node** por banco SQLite em um disco local persistente. Processos não sobrevivem ao reinício do ambiente; execute novamente `npm start`. O servidor recupera contagens e perguntas vencidas sem reiniciar seus prazos. Os dados sobrevivem a reinícios desde que o arquivo do banco seja preservado. Backups devem incluir um snapshot consistente de SQLite, considerando WAL.

Em um proxy reverso, habilite HTTPS, `COOKIE_SECURE=1`, `PUBLIC_ORIGIN` com a origem pública, conexões SSE longas e buffering desabilitado para `/api/rooms/*/events`. Os heartbeats são enviados a cada 15 segundos. Não use hospedagem de arquivos estáticos, GitHub Pages ou múltiplas réplicas para esta versão. Publicar os arquivos no GitHub não hospeda o servidor do jogo.

Esta versão não inclui recuperação de senha, editor de quizzes, convite por QR, transferência de identidade do participante entre dispositivos ou garantia de escala. Os limites atuais incluem cinco salas ativas por anfitrião, 500 salas retidas e 1.000 streams globais; não são uma capacidade comprovada por teste de carga. Limites de tentativas são locais ao processo e agrupados pelo IP visto pelo servidor, inclusive atrás de proxies. Ajuste-os à topologia antes de ampliar o uso.

## Validação

`npm test` usa bancos temporários e não altera partidas reais. Verifica uma partida completa com as 50 perguntas, pontos por dificuldade, empates, reconexão, reinício durante a contagem/pergunta, PIN único, timeout exato, duplicidade, isolamento entre salas, autorização, CSRF, proteção dos arquivos e eventos SSE sem vazamento de gabarito.

No ambiente gerenciado, se o terminal negar abertura de portas (`listen EPERM`) ou impedir conexão com o proxy, execute os testes e os comandos de rede com a permissão de rede do executor. Não remova o proxy nem desabilite TLS.

O teste visual opcional `python3 scripts/smoke_browser.py` requer Playwright para Python e Chromium em `/usr/bin/chromium`, disponíveis no ambiente preparado. Usa a porta local `3001`, cria um banco temporário e simula um anfitrião e dois celulares. Verifica cadastro, ingresso, sincronização, respostas, reconexão, ranking, encerramento e proteção do painel. Salva capturas em `/tmp/despertos-*.png`. Esses requisitos são apenas do teste visual, não da aplicação.
