# Despertos — Desafio Bíblico

Jogo bíblico multiplayer ao vivo, inspirado na experiência de anfitrião e participantes do Kahoot. Uma partida tem um servidor autoritativo e duas interfaces distintas: painel do anfitrião e controle do participante no celular.

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

As tabelas SQLite guardam contas, hashes das sessões, salas, elenco, perguntas executadas, elegibilidade, respostas, lançamentos de pontos, recibos idempotentes e sequência durável de eventos. As transações e restrições únicas impedem resposta e pontuação duplicadas. Os eventos são anunciados **após o commit**; ao reconectar, SSE envia um snapshot atual filtrado pelo papel, em vez de reproduzir eventos privados antigos.

O anfitrião autentica com usuário e senha (hash com scrypt). Cada participante recebe uma credencial aleatória própria em cookie HttpOnly. O servidor autoriza cada snapshot, conexão e comando e não expõe gabaritos enquanto a pergunta está aberta. Existe separação entre anfitrião autenticado e conteúdo do quiz; este MVP oferece um quiz comum a todas as contas, sem editor de autoria.

## Configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de rede |
| `DB_PATH` | `.data/despertos.sqlite` | Arquivo persistente SQLite |
| `COOKIE_SECURE` | `0` | Defina `1` em HTTPS para cookies Secure |
| `PUBLIC_ORIGIN` | Origem derivada da requisição | Origem pública exata, como `https://jogo.exemplo.com`, especialmente atrás de proxy |

Não coloque senhas, sessões ou o banco de dados no Git. `.data/` está ignorado. Não há credenciais externas obrigatórias. Contas são criadas pela interface, e a inscrição de novos anfitriões é aberta.

## Hospedagem

Execute **um processo Node** por banco SQLite em um disco local persistente. Processos não sobrevivem ao reinício do ambiente; execute novamente `npm start`. O servidor recupera contagens e perguntas vencidas sem reiniciar seus prazos. Os dados sobrevivem a reinícios desde que o arquivo do banco seja preservado. Backups devem incluir um snapshot consistente de SQLite, considerando WAL.

Em um proxy reverso, habilite HTTPS, `COOKIE_SECURE=1`, `PUBLIC_ORIGIN` com a origem pública, conexões SSE longas e buffering desabilitado para `/api/rooms/*/events`. Os heartbeats são enviados a cada 15 segundos. Não use hospedagem de arquivos estáticos, GitHub Pages ou múltiplas réplicas para esta versão. Publicar os arquivos no GitHub não hospeda o servidor do jogo.

Esta versão não inclui recuperação de senha, editor de quizzes, convite por QR, transferência de identidade do participante entre dispositivos ou garantia de escala. Os limites atuais incluem cinco salas ativas por anfitrião, 500 salas retidas e 1.000 streams globais; não são uma capacidade comprovada por teste de carga. Limites de tentativas são locais ao processo e agrupados pelo IP visto pelo servidor, inclusive atrás de proxies. Ajuste-os à topologia antes de ampliar o uso.

## Validação

`npm test` usa bancos temporários e não altera partidas reais. Verifica uma partida completa com as 50 perguntas, pontos por dificuldade, empates, reconexão, reinício durante a contagem/pergunta, PIN único, timeout exato, duplicidade, isolamento entre salas, autorização, CSRF, proteção dos arquivos e eventos SSE sem vazamento de gabarito.

No ambiente gerenciado, se o terminal negar abertura de portas (`listen EPERM`) ou impedir conexão com o proxy, execute os testes e os comandos de rede com a permissão de rede do executor. Não remova o proxy nem desabilite TLS.

O teste visual opcional `python3 scripts/smoke_browser.py` requer Playwright para Python e Chromium em `/usr/bin/chromium`, disponíveis no ambiente preparado. Usa a porta local `3001`, cria um banco temporário e simula um anfitrião e dois celulares. Verifica cadastro, ingresso, sincronização, respostas, reconexão, ranking, encerramento e proteção do painel. Salva capturas em `/tmp/despertos-*.png`. Esses requisitos são apenas do teste visual, não da aplicação.
