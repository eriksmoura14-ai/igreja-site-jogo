# Despertos — Desafio Bíblico presencial

Modo presencial: somente o organizador controla a partida. As 50 perguntas e as cores originais foram preservadas.

## Como jogar presencialmente

1. Abra `/host`, entre ou crie sua conta e clique em **Criar partida**.
2. Escolha de **duas a quatro equipes**, personalize os nomes (2 a 24 caracteres, sem repetição) e clique em **Salvar equipes**.
3. Clique em **Gerar novo link do telão** e depois em **Abrir telão**. Abra esse link no computador do projetor. Ele concede somente visualização; gerar outro link revoga o anterior. Recarregar o telão conserva o acesso por cookie.
4. Inicie o desafio. As equipes respondem presencialmente; o organizador decide quando **Revelar resposta**. Não há fechamento automático por tempo neste modo.
5. Marque as equipes que acertaram: cada uma recebe **um ponto por pergunta**, independentemente da dificuldade. Clique novamente para desfazer um lançamento antes de avançar. Repetições de envio não duplicam pontos.
6. Veja a classificação e avance à próxima pergunta. Empates compartilham a colocação. Após as 50 perguntas, finalize para ver a classificação final.

O telão acompanha perguntas, revelações e placar ao vivo, sem controles e sem acesso ao gabarito antes da revelação. Não há ingresso de jogadores por celular nas novas partidas. Salas antigas do modo online permanecem compatíveis.

## Executar e validar

Requisito: Node.js 24. Sem credenciais externas para executar o jogo.

```sh
npm ci --cache /tmp/despertos-npm-cache --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm start
```

O servidor atende na porta 3000 e usa SQLite em `.data/despertos.sqlite`. Preserve esse arquivo para retomar partidas após reinício. Execute somente uma instância por banco. `npm run dev` ativa o reinício ao editar. Os testes usam bancos temporários e incluem o fluxo presencial completo, permissões do telão, isolamento entre salas, pontuação e recuperação após reinício. O teste opcional `python3 scripts/smoke_presencial.py` requer Playwright Python, Chromium em `/usr/bin/chromium` e um servidor local na porta 3000 com banco de teste; cria uma conta e uma sala de teste, valida organizador/telão em sessões separadas e grava capturas em `/tmp/presencial-*.png`.

## Publicar no Render

O `render.yaml` mantém um Web Service Node 24 gratuito, com instalação pelo lockfile, validação, testes, `npm start` e health check `/api/health`. Os commits em `main` acionam publicação automática **se o serviço já estiver conectado com Auto-Deploy ativo**.

Para criar o serviço: abra [Deploy no Render](https://render.com/deploy?repo=https://github.com/eriksmoura14-ai/igreja-site-jogo), conecte o repositório e aplique o Blueprint na branch `main`. Para um serviço existente sem publicação automática, use **Manual Deploy → Deploy latest commit**. Confirme o sucesso nos logs e no domínio HTTPS atribuído pelo Render.

No plano gratuito, o serviço pode suspender quando ocioso e o SQLite pode ser perdido em reinícios/deploys. Para conservar resultados de eventos, é necessário configurar um plano com disco persistente e `DB_PATH` apontando para o disco; confira os custos na conta Render antes de contratar. Nenhum recurso pago foi solicitado.

## Configuração

- `PORT`: 3000 por padrão; o Render define automaticamente.
- `HOST`: `0.0.0.0`.
- `DB_PATH`: `.data/despertos.sqlite` por padrão.
- `COOKIE_SECURE`: `1` em HTTPS; `0` para desenvolvimento local HTTP.
- `PUBLIC_ORIGIN`: origem HTTPS exata em domínio próprio. No Render, usa automaticamente `RENDER_EXTERNAL_URL`.

Sessões do organizador e do telão usam cookies HttpOnly. O link do telão contém uma credencial de leitura no fragmento, removida da barra após abrir. Compartilhe somente com quem deve acompanhar a partida. As alterações de estado são transacionais e persistidas antes dos eventos SSE.

## Arquivos principais

- `src/questions.mjs`: perguntas originais, preservadas.
- `src/game.mjs`: regras, autorização, pontuação e persistência.
- `src/server.mjs`: HTTP, autenticação, SSE e arquivos estáticos.
- `public/app.js`: organizador e telão; estilos, fontes e marca originais preservados.
- `test/presencial.test.mjs`: testes do modo presencial.
- `docs/visual-reference.md`: referências visuais existentes.
