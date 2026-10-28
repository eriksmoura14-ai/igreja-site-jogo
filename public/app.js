/* Cada página recebe somente a projeção autorizada pelo servidor. */
import { animatePage, animateRoom, animateCountdown, animateSelection, animateTap, animateToast } from './motion.js';

const app = document.querySelector('#app');
const catalog = [
  { id: 'lion', name: 'Leões', label: 'Equipe 1' },
  { id: 'wolf', name: 'Lobos', label: 'Equipe 2' },
  { id: 'eagle', name: 'Águias', label: 'Equipe 3' },
  { id: 'crown', name: 'Realeza', label: 'Equipe 4' },
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  crown: '<path d="m4 8 5 5 3-8 3 8 5-5-2 12H6z"/><path d="M7 23h10"/>',
  lion: '<path d="m12 2 4 2 4 1 1 5 1 4-3 4-2 4-5-1-5 1-2-4-3-4 1-4 1-5 4-1z"/><path d="M7 9v5l5 4 5-4V9M8 10h1m6 0h1m-6 3 2 2 2-2m-2 2v3"/>',
  wolf: '<path d="m5 3 5 5h4l5-5 2 11-9 9-9-9z"/><path d="m7 12 3 2m7-2-3 2m-5 3 3 2 3-2"/>',
  eagle: '<path d="M3 5c5 0 8 1 10 5l3-2 5 3-4 2-2 6-4 3v-6L3 12l5-1z"/><path d="m3 5 4 4m-4 7 5 2m7-7h1"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-2-4"/>',
  phone: '<rect x="6" y="2" width="12" height="21" rx="2"/><path d="M10 19h4"/>',
  trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 3v5m-5 2h10"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  book: '<path d="M4 3h13l3 3v17H4zm4 5h7m-4-2v7m-4 6h9"/>',
  check: '<path d="m5 13 5 5L21 6"/>',
  lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${icons[name] || icons.crown}</svg>`;
const logo = () => `<a class="brand" href="/" aria-label="Despertos, início"><img class="brand-crown" src="/mark.svg" width="35" height="30" alt=""><span class="brand-lockup"><img class="brand-lettering" src="/brand/despertos-wordmark.ffe9732aa666.png" width="2142" height="734" alt=""><small>DESAFIO BÍBLICO</small></span></a>`;
const footer = () => '<footer><span>CONGRESSO DE JOVENS <b> / </b> DESPERTOS</span><span>FOCO <i>+</i> CONHECIMENTO <i>+</i> UNIÃO <i>=</i> VITÓRIA</span></footer>';
function shell(content, { host = false, player = false, nav = '', motion = true } = {}) {
  app.innerHTML = `<div class="site ${host ? 'host-site' : ''} ${player ? 'player-site' : ''}"><header>${logo()}<nav>${nav || `<a href="/join" class="nav-link">Entrar no jogo</a><a href="/host" class="nav-host">${icon('crown')} Sou anfitrião</a>`}</nav></header>${content}${footer()}</div>`;
  if (motion) animatePage();
}
function toast(text, good = false) {
  const el = document.querySelector('#toast'); el.textContent = text; el.className = good ? 'success' : ''; el.hidden = false;
  animateToast(el);
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 6500);
}
async function api(path, data) {
  const res = await fetch(path, data === undefined ? { credentials: 'same-origin' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin' });
  const value = await res.json();
  if (!res.ok) { const error = new Error(value.error || 'Não foi possível conectar.'); error.status = res.status; throw error; }
  return value;
}
function joinForm() {
  return `<form id="join-form"><label for="pin">PIN DO JOGO</label><input id="pin" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" placeholder="000 000" required autocomplete="off"><label for="nickname">COMO VOCÊ QUER SER CHAMADO?</label><input id="nickname" name="name" placeholder="Seu nome ou apelido" minlength="2" maxlength="24" required autocomplete="nickname"><fieldset><legend>ESCOLHA SUA EQUIPE <span>ATÉ 4 POR EQUIPE</span></legend><div class="team-grid">${catalog.map(t => `<label class="team-choice team-${t.id}"><input type="radio" name="team" value="${t.id}" required>${icon(t.id)}<strong>${t.name}</strong><span>${t.label}</span></label>`).join('')}</div></fieldset><button class="button primary full" type="submit">Entrar no desafio ${icon('arrow')}</button><p class="form-note">O PIN aparece na tela do anfitrião.</p></form>`;
}
function bindJoin() {
  document.querySelector('#join-form').addEventListener('submit', async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    const data = Object.fromEntries(new FormData(e.target));
    try { const result = await api('/api/join', data); location.assign(`/play/${result.roomId}`); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
}
function landing() {
  shell(`<main class="landing"><section class="hero"><div class="eyebrow"><span class="live-dot"></span> UM DESAFIO. QUATRO EQUIPES. UM PROPÓSITO.</div><div class="hero-wordmark"><img class="hero-crown" src="/mark.svg" alt="" width="84" height="70"><h1><span class="sr-only">DESPERTOS</span><img class="hero-lettering" src="/brand/despertos-wordmark.ffe9732aa666.png" width="2142" height="734" alt="" decoding="async" fetchpriority="high"></h1><div>DESAFIO BÍBLICO</div></div><h2>Conheça a Palavra.<br>Viva o <em>propósito.</em></h2><p class="hero-description">Sua fé em ação. Sua equipe em sintonia.<br>Prepare-se para um desafio que vai além das respostas.</p><div class="hero-stats"><div><strong>50</strong><span>PERGUNTAS</span></div><div><strong>04</strong><span>EQUIPES</span></div><div><strong>01</strong><span>PROPÓSITO</span></div></div><blockquote>“Lâmpada para os meus pés é a tua palavra,<br>e luz para o meu caminho.”<cite>SALMOS 119:105</cite></blockquote><div class="hero-outline" aria-hidden="true">✧</div></section><section class="entry-card"><div class="card-topline"><span>O DESAFIO COMEÇA AQUI</span>${icon('phone')}</div><h2>Pronto para despertar?</h2><p>Entre com o PIN e venha jogar com sua equipe.</p>${joinForm()}</section></main><section class="how-section"><div class="section-intro"><span class="eyebrow orange">SIMPLES DE JOGAR. DIFÍCIL DE ESQUECER.</span><h2>Como funciona<span class="orange">?</span></h2></div><div class="how-grid">${[['people', 'Forme sua equipe', 'Escolha um dos quatro times e una forças.'], ['phone', 'Responda no celular', 'Quatro alternativas. Uma resposta. 30 segundos.'], ['trophy', 'Acumule pontos', 'Cada acerto soma pontos para toda a equipe.'], ['crown', 'Vença o desafio', 'Conhecimento e união levam ao topo.']].map(([ico, title, text], i) => `<article><div class="step-icon">${icon(ico)}<b>0${i + 1}</b></div><h3>${title}</h3><p>${text}</p></article>`).join('')}</div></section><section class="difficulty-strip">${icon('book')}<div><strong>Cada pergunta, um novo desafio.</strong><span>50 perguntas bíblicas, do primeiro passo à grande descoberta.</span></div><div class="level easy">FÁCIL <b>10</b><small>100 pts</small></div><div class="level medium">MÉDIO <b>25</b><small>200 pts</small></div><div class="level hard">DIFÍCIL <b>15</b><small>300 pts</small></div></section>`);
  bindJoin();
}
function joinPage() {
  shell(`<main class="join-page"><div class="section-intro"><span class="eyebrow orange">SEU CELULAR É SEU CONTROLE</span><h1>Encontre sua equipe.<br>Entre no <em>desafio.</em></h1></div><section class="entry-card"><h2>Vamos jogar?</h2><p>Use o PIN que está na tela do anfitrião.</p>${joinForm()}</section></main>`, { player: true });
  bindJoin();
}
let authMode = 'login';
async function hostHome() {
  let me;
  try { me = await api('/api/auth/me'); }
  catch (error) { if (error.status !== 401) toast(error.message); }
  if (!me) return authPage();
  shell(`<main class="dashboard"><div class="eyebrow orange">PAINEL DO ANFITRIÃO</div><div class="dashboard-heading"><div><h1>Seu palco. <em>O nosso desafio.</em></h1><p>Olá, ${esc(me.account.username)}. Reúna as equipes e dê início ao jogo.</p></div><button id="logout" class="button quiet">Sair da conta</button></div><section class="create-card"><div class="large-crown">${icon('crown')}</div><div><span class="eyebrow">DESPERTOS • EDIÇÃO BÍBLICA</span><h2>Uma nova partida,<br>um novo propósito.</h2><p>50 perguntas · 4 equipes · Até 16 participantes</p><p class="muted">Os participantes entram pelo PIN. Você controla o ritmo.</p></div><button id="create-room" class="button primary">Criar partida ${icon('arrow')}</button></section><section class="rooms-section"><h2>Suas partidas</h2>${me.rooms.length ? me.rooms.map(r => `<a class="room-row" href="/host/${r.id}"><div>${icon('crown')}<span><strong>${r.pin ? `Sala ${esc(r.pin)}` : 'Partida encerrada'}</strong><small>${new Date(r.created).toLocaleDateString('pt-BR')}</small></span></div><span class="badge">${phaseName(r.phase)}</span>${icon('arrow')}</a>`).join('') : '<div class="empty-state">Sua primeira história começa com uma nova partida.</div>'}</section></main>`, { host: true, nav: '<span class="host-tag">CONTROLE DO ANFITRIÃO</span>' });
  document.querySelector('#logout').onclick = async () => { await api('/api/auth/logout', {}); hostHome(); };
  document.querySelector('#create-room').onclick = async e => {
    e.currentTarget.disabled = true;
    try { const room = await api('/api/rooms', {}); location.assign(`/host/${room.roomId}`); }
    catch (error) { toast(error.message); e.currentTarget.disabled = false; }
  };
}
function authPage() {
  shell(`<main class="auth-page"><section><span class="eyebrow orange">QUEM CONDUZ TAMBÉM INSPIRA.</span><h1>Prepare o palco.<br><em>Desperte sua galera.</em></h1><p>Crie uma sala, compartilhe o PIN e acompanhe cada conquista das equipes.</p><div class="auth-art">${icon('crown')}</div></section><section class="entry-card"><div class="auth-tabs"><button data-mode="login" class="${authMode === 'login' ? 'active' : ''}">Entrar</button><button data-mode="register" class="${authMode === 'register' ? 'active' : ''}">Criar conta</button></div><h2>${authMode === 'login' ? 'Bem-vindo de volta.' : 'Vamos começar?'}</h2><p>Sua conta guarda o controle das suas partidas.</p><form id="auth-form"><label for="username">NOME DO ANFITRIÃO</label><input id="username" name="username" required pattern="[a-zA-Z0-9_.-]{3,32}" minlength="3" maxlength="32" autocomplete="username" placeholder="Seu usuário"><label for="password">SENHA</label><input id="password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" placeholder="Pelo menos 10 caracteres"><button class="button primary full">${authMode === 'login' ? 'Entrar como anfitrião' : 'Criar minha conta'} ${icon('arrow')}</button></form><a class="back-link" href="/join">Quero participar de um jogo</a></section></main>`, { host: true });
  document.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { authMode = b.dataset.mode; authPage(); }; });
  document.querySelector('#auth-form').onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try { await api(`/api/auth/${authMode}`, Object.fromEntries(new FormData(e.target))); hostHome(); }
    catch (error) { toast(error.message); button.disabled = false; }
  };
}
function phaseName(phase) { return ({ LOBBY: 'No lobby', COUNTDOWN: 'Prepare-se', QUESTION_OPEN: 'Valendo!', QUESTION_RESULT: 'Resultado', LEADERBOARD: 'Classificação', ENDED: 'Encerrada' })[phase]; }
const difficulty = q => `<span class="difficulty ${q.difficulty}">${({ easy: 'FÁCIL', medium: 'MÉDIO', hard: 'DIFÍCIL' })[q.difficulty]}</span>`;
let current, stream, offset = 0, pending = false, pendingCommand = null;
function teamCards(s, host = false) {
  return `<div class="lobby-teams">${catalog.map(t => {
    const team = s.teams.find(x => x.id === t.id), players = (s.players || []).filter(p => p.team === t.id);
    return `<article class="lobby-team team-${t.id}"><div class="lobby-team-head">${icon(t.id)}<div><small>${t.label.toUpperCase()}</small><h3>${t.name}</h3></div><span>${team.count}<small> / 4</small></span></div>${host ? `<ul>${players.map(p => `<li><span>${esc(p.name)}</span>${s.phase === 'LOBBY' ? `<button data-remove="${p.id}" aria-label="Remover ${esc(p.name)}">×</button>` : ''}</li>`).join('')}${Array.from({ length: 4 - players.length }, () => '<li class="empty-slot">Aguardando participante<span>+</span></li>').join('')}</ul>` : `<div class="team-slots">${Array.from({ length: 4 }, (_, i) => `<span class="${i < team.count ? 'filled' : ''}"></span>`).join('')}</div>`}</article>`;
  }).join('')}</div>`;
}
function leaderboard(s, final = false) {
  const leaders = s.teams.filter(t => t.rank === 1 && t.count > 0);
  return `<div class="leaderboard"><div class="leaderboard-title">${icon('crown')}<div><span class="eyebrow orange">${final ? 'O CONHECIMENTO NOS TROUXE ATÉ AQUI' : 'CADA ACERTO FAZ A DIFERENÇA'}</span><h1>${final ? 'Essa vitória é nossa.' : 'Classificação'}</h1></div>${!final ? '<span class="live-badge"><i></i> AO VIVO</span>' : ''}</div>${final ? `<div class="winner-line">${leaders.length > 1 ? 'Vitória compartilhada' : 'Equipe vencedora'}: <strong>${leaders.map(t => esc(t.name)).join(' + ') || 'Sem participantes'}</strong></div>` : ''}<div class="ranking-list">${s.teams.map(t => `<article data-team-id="${t.id}" class="ranking-row team-${t.id} ${s.me?.team === t.id ? 'my-team' : ''}"><strong class="rank-number">${t.rank}<small>º</small></strong>${icon(t.id)}<div class="ranking-info"><div><strong>${esc(t.name)} ${s.me?.team === t.id ? '<span class="you-tag">SUA EQUIPE</span>' : ''}</strong><span><b>${t.score.toLocaleString('pt-BR')}</b> pts</span></div><div class="score-track"><span data-width="${s.teams[0].score ? Math.round(t.score / s.teams[0].score * 100) : 0}"></span></div><small>${t.correct} acertos · ${t.count} participantes</small></div></article>`).join('')}</div><p class="form-note">Pontos por equipe. Em caso de empate: mais acertos; persistindo, a posição é compartilhada.</p></div>`;
}
function hostView(s) {
  let content = '';
  const top = `<div class="game-top"><a href="/host" class="back-link">← Minhas partidas</a><span class="host-tag">${icon('crown')} PAINEL DO ANFITRIÃO</span><span class="connection" id="connection">Conectado</span></div>`;
  if (s.phase === 'LOBBY') {
    content = `<div class="lobby-heading"><div><span class="eyebrow orange">O PRÓXIMO PASSO É JUNTOS.</span><h1>Reúna sua equipe.</h1><p>Entre no endereço abaixo, digite o PIN e escolha seu time.</p><div class="join-address" id="join-address"></div></div><div class="pin-card"><span>PIN DO JOGO</span><strong>${esc(s.pin.slice(0, 3))} ${esc(s.pin.slice(3))}</strong><button id="copy-pin">Copiar PIN ${icon('phone')}</button></div></div><div class="lobby-bar"><h2>${s.players.length}<span> / 16 participantes</span></h2><button id="lock" class="button quiet">${icon('lock')} ${s.locked ? 'Liberar entradas' : 'Bloquear entradas'}</button></div>${teamCards(s, true)}<div class="host-controls"><p>${icon('people')} Até 4 integrantes por equipe. Todos respondem no próprio celular.</p><button data-command="start" class="button primary" ${s.players.length ? '' : 'disabled'}>Iniciar desafio ${icon('arrow')}</button></div><div class="rules-inline"><span>50 PERGUNTAS</span><span>30 SEGUNDOS POR PERGUNTA</span><span>100 / 200 / 300 PONTOS POR ACERTO</span></div>`;
  } else if (s.phase === 'COUNTDOWN') {
    content = `<section class="countdown-screen"><span class="eyebrow orange">PERGUNTA ${s.questionNumber} DE ${s.totalQuestions}</span><h1>Foco na Palavra.</h1><div class="countdown-number" id="countdown">3</div><p>Equipes, preparem seus celulares.</p></section>`;
  } else if (s.phase === 'QUESTION_OPEN') {
    content = `<div class="question-meta"><span>PERGUNTA <b>${s.questionNumber}</b> / ${s.totalQuestions}</span>${difficulty(s.question)}<span>${s.question.maxPoints} PONTOS POR ACERTO</span><div class="timer" id="timer">30<small>s</small></div></div><section class="host-question"><h1>${esc(s.question.text)}</h1><div class="answer-grid">${s.question.options.map(o => `<div class="answer-option option-${o.id}"><b>${o.id}</b><span>${esc(o.text)}</span>${icon(({ A: 'eagle', B: 'wolf', C: 'lion', D: 'crown' })[o.id])}</div>`).join('')}</div><div class="progress-line"><span>${icon('people')} <b>${s.progress.answered}</b> de ${s.progress.total} respostas recebidas</span><button data-command="close" class="button quiet">Encerrar pergunta</button></div><div class="time-track"><span id="time-fill"></span></div></section>`;
  } else if (s.phase === 'QUESTION_RESULT') {
    const option = s.question.options.find(o => o.id === s.result.correctOptionId);
    content = `<section class="result-screen"><div class="result-icon">${icon('check')}</div><span class="eyebrow green">CONHECIMENTO QUE TRANSFORMA</span><h1>Essa é a resposta!</h1><p>${esc(s.question.text)}</p><div class="correct-answer"><b>${esc(option.id)}</b><strong>${esc(option.text)}</strong></div><blockquote>${esc(s.result.explanation)}<cite>${esc(s.result.reference)}</cite></blockquote><button data-command="next" class="button green-button">Ver classificação ${icon('arrow')}</button></section>`;
  } else if (['LEADERBOARD', 'ENDED'].includes(s.phase)) {
    content = leaderboard(s, s.phase === 'ENDED') + `<div class="ranking-controls">${s.phase === 'ENDED' ? '<a class="button primary" href="/host">Criar outra partida →</a>' : `<span>Pergunta ${s.questionNumber} de ${s.totalQuestions} concluída</span><button class="button primary" data-command="next">${s.questionNumber === s.totalQuestions ? 'Ver pódio final' : 'Próxima pergunta'} ${icon('arrow')}</button>`}</div>`;
  }
  shell(`<main class="game-main">${top}${content}${s.phase !== 'ENDED' ? '<button id="end-game" class="end-game">Encerrar partida</button>' : ''}</main><dialog id="end-dialog"><h2>Encerrar o desafio?</h2><p>Os pontos já conquistados serão mantidos. Uma pergunta ainda aberta será descartada.</p><div><button id="cancel-end" class="button quiet">Continuar jogando</button><button id="confirm-end" class="button primary">Encerrar partida</button></div></dialog>`, { host: true, motion: false, nav: '<span class="nav-note">CONHEÇA A PALAVRA. VIVA O PROPÓSITO.</span>' });
  const address = document.querySelector('#join-address'); if (address) address.textContent = `${location.host}/join`;
  document.querySelector('#copy-pin')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(s.pin); toast('PIN copiado!', true); } catch { toast(`PIN: ${s.pin}`); }
  });
  document.querySelector('#lock')?.addEventListener('click', () => command('lock', { locked: !s.locked }));
  document.querySelectorAll('[data-command]').forEach(b => { b.onclick = () => command(b.dataset.command); });
  document.querySelectorAll('[data-remove]').forEach(b => { b.onclick = () => command('remove', { playerId: b.dataset.remove }); });
  document.querySelector('#end-game')?.addEventListener('click', () => document.querySelector('#end-dialog').showModal());
  document.querySelector('#cancel-end')?.addEventListener('click', () => document.querySelector('#end-dialog').close());
  document.querySelector('#confirm-end')?.addEventListener('click', () => command('end'));
}
function playerView(s) {
  const team = catalog.find(t => t.id === s.me.team), ownTeam = s.teams.find(t => t.id === team.id);
  const top = `<div class="player-identity team-${team.id}"><div>${icon(team.id)}<span><small>${team.label} • ${team.name}</small><strong>${esc(s.me.name)}</strong></span></div><span class="connection" id="connection">Conectado</span></div>`;
  let content;
  if (s.phase === 'LOBBY') {
    content = `<section class="player-wait team-${team.id}"><div class="player-emblem">${icon(team.id)}</div><span class="eyebrow">VOCÊ ESTÁ NA EQUIPE</span><h1>${team.name}</h1><p>Agora é com vocês.<br>Aguarde o anfitrião iniciar o desafio.</p><div class="waiting-pill"><i></i> ESPERANDO O JOGO COMEÇAR</div></section><div class="player-instructions"><h2>Seu celular é seu controle.</h2><p>Leia a pergunta e toque em uma das quatro alternativas. Cada acerto vale pontos para sua equipe.</p><div><span>01<br><b>Leia</b></span><span>02<br><b>Responda</b></span><span>03<br><b>Some pontos</b></span></div></div>`;
  } else if (s.phase === 'COUNTDOWN') {
    content = `<section class="countdown-screen"><span class="eyebrow orange">PERGUNTA ${s.questionNumber} DE ${s.totalQuestions}</span><h1>É hora de despertar.</h1><div class="countdown-number" id="countdown">3</div><p>Uma equipe. Um propósito.</p></section>`;
  } else if (s.phase === 'QUESTION_OPEN') {
    content = `<div class="player-question-meta"><span>PERGUNTA ${s.questionNumber} / ${s.totalQuestions}</span>${difficulty(s.question)}<div class="timer" id="timer">30<small>s</small></div></div><section class="player-question"><h1>${esc(s.question.text)}</h1>${s.hasAnswered ? `<div class="answer-sent">${icon('check')}<h2>Resposta enviada!</h2><p>Você marcou <strong>${esc(s.selectedOptionId)}</strong>.<br>Respire. Aguarde o resultado.</p><span class="waiting-pill"><i></i> VAMOS JUNTOS, ${team.name.toUpperCase()}!</span></div>` : `<p class="tap-hint">Toque para escolher. Sua resposta não poderá ser alterada.</p><div class="player-answers">${s.question.options.map(o => `<button class="answer-option option-${o.id}" data-answer="${o.id}"><b>${o.id}</b><span>${esc(o.text)}</span></button>`).join('')}</div>`}<div class="time-track"><span id="time-fill"></span></div></section>`;
  } else if (s.phase === 'QUESTION_RESULT') {
    const right = s.result.personal.correct, option = s.question.options.find(o => o.id === s.result.correctOptionId);
    content = `<section class="player-result ${right ? 'is-correct' : 'is-wrong'}"><div class="result-icon">${right ? icon('check') : '<span>×</span>'}</div><span class="eyebrow">${right ? 'CONHECIMENTO QUE SOMA' : 'CADA PERGUNTA É UM APRENDIZADO'}</span><h1>${right ? 'Boa, você acertou!' : s.result.personal.answered ? 'Na próxima, a gente acerta.' : 'O tempo acabou.'}</h1><div class="personal-points">+${s.result.personal.points}<small> PONTOS PARA ${team.name.toUpperCase()}</small></div><p>A resposta certa é:</p><div class="correct-answer"><b>${option.id}</b><strong>${esc(option.text)}</strong></div><blockquote>${esc(s.result.explanation)}<cite>${esc(s.result.reference)}</cite></blockquote><span class="waiting-pill"><i></i> AGUARDE O ANFITRIÃO</span></section>`;
  } else if (s.phase === 'LEADERBOARD' || s.phase === 'ENDED') {
    content = `<div class="my-standing team-${team.id}">${icon(team.id)}<span>SUA EQUIPE ESTÁ EM <strong>${ownTeam.rank}º</strong></span><b>${ownTeam.score} pts</b></div>${leaderboard(s, s.phase === 'ENDED')}${s.phase === 'ENDED' ? '<a href="/join" class="button primary full">Entrar em outro desafio →</a>' : '<p class="player-await">Aguarde o anfitrião para a próxima pergunta.</p>'}`;
  }
  shell(`<main class="player-main">${top}${content}</main>`, { player: true, motion: false, nav: '<span class="player-tag">SEU CONTROLE</span>' });
  document.querySelectorAll('[data-answer]').forEach(b => { b.onclick = () => command('answer', { optionId: b.dataset.answer, questionRunId: s.question.runId }); });
}
function render(s) {
  if (current && s.sequence < current.sequence) return;
  const previous = current;
  offset = s.serverTime - Date.now();
  // O SSE e o recibo HTTP podem trazer a mesma versão: não remontar a tela.
  if (current && s.sequence === current.sequence && s.version === current.version) { updateTime(); return; }
  const sceneChanged = !previous || previous.phase !== s.phase || previous.questionNumber !== s.questionNumber || Boolean(previous.hasAnswered) !== Boolean(s.hasAnswered);
  const focusId = document.activeElement?.id;
  const keepDialog = previous?.phase === s.phase && document.querySelector('#end-dialog')?.open;
  current = s; offset = s.serverTime - Date.now();
  s.role === 'host' ? hostView(s) : playerView(s);
  document.querySelectorAll('[data-width]').forEach(el => { el.style.width = `${el.dataset.width}%`; });
  updateTime();
  if (keepDialog) document.querySelector('#end-dialog')?.showModal();
  if (focusId && previous?.phase === s.phase) document.getElementById(focusId)?.focus({ preventScroll: true });
  animateRoom(s, { sceneChanged, previous });
}
function updateTime() {
  if (!current) return;
  const now = Date.now() + offset;
  const countdown = document.querySelector('#countdown');
  if (countdown) {
    const number = String(Math.max(1, Math.ceil((current.countdownAt - now) / 1000)));
    if (countdown.textContent !== number) { countdown.textContent = number; animateCountdown(countdown); }
  }
  if (!current.question || current.phase !== 'QUESTION_OPEN') return;
  const left = Math.max(0, current.question.deadlineAt - now), timer = document.querySelector('#timer');
  if (timer) { timer.replaceChildren(document.createTextNode(String(Math.ceil(left / 1000))), Object.assign(document.createElement('small'), { textContent: 's' })); timer.classList.toggle('urgent', left < 6000); }
  const fill = document.querySelector('#time-fill'); if (fill) fill.style.width = `${100 * left / (current.question.deadlineAt - current.question.opensAt)}%`;
  if (!left) document.querySelectorAll('[data-answer]').forEach(b => { b.disabled = true; });
}
async function command(action, extra = {}) {
  if (pending) return;
  pending = true;
  // Reenvio após falha de rede usa a mesma chave e o mesmo payload.
  const candidate = { action, expectedVersion: current.version, ...extra };
  if (!pendingCommand || JSON.stringify(pendingCommand.candidate) !== JSON.stringify(candidate)) pendingCommand = { candidate, body: { ...candidate, requestId: crypto.randomUUID() } };
  const payload = pendingCommand.body;
  const controls = [...document.querySelectorAll('[data-answer], [data-command], #lock, #confirm-end')].filter(button => !button.disabled);
  controls.forEach(button => { button.disabled = true; });
  try {
    await api(`/api/rooms/${current.roomId}/commands?view=${current.role}`, payload);
    pendingCommand = null;
    const fresh = await api(`/api/rooms/${current.roomId}/snapshot?view=${current.role}`); render(fresh);
  } catch (error) {
    toast(error.message);
    if (error.status) pendingCommand = null;
    try { render(await api(`/api/rooms/${current.roomId}/snapshot?view=${current.role}`)); } catch { /* A reconexão restaura o snapshot. */ }
  } finally {
    pending = false;
    controls.forEach(button => { if (button.isConnected) button.disabled = false; });
    updateTime();
  }
}
async function roomPage(role, id) {
  shell('<main class="loading-screen"><span class="waiting-pill"><i></i> CONECTANDO AO DESAFIO</span></main>');
  try {
    render(await api(`/api/rooms/${id}/snapshot?view=${role}`));
    stream = new EventSource(`/api/rooms/${id}/events?view=${role}`);
    stream.addEventListener('snapshot', e => render(JSON.parse(e.data)));
    stream.addEventListener('revoked', () => { stream.close(); errorPage('Seu acesso à sala foi encerrado.', role); });
    stream.onopen = () => { const status = document.querySelector('#connection'); if (status) { status.textContent = 'Conectado'; status.classList.remove('offline'); } };
    stream.onerror = () => { const status = document.querySelector('#connection'); if (status) { status.textContent = 'Reconectando…'; status.classList.add('offline'); } document.querySelectorAll('[data-answer], [data-command]').forEach(b => { b.disabled = true; }); };
  } catch (error) { errorPage(error.message, role); }
}
function errorPage(message, role) {
  shell(`<main class="error-screen">${icon('lock')}<h1>Vamos reconectar?</h1><p>${esc(message)}</p><a class="button primary" href="${role === 'host' ? '/host' : '/join'}">${role === 'host' ? 'Entrar como anfitrião' : 'Entrar com PIN'} ${icon('arrow')}</a></main>`);
}
setInterval(updateTime, 200);
app.addEventListener('change', event => {
  if (event.target.matches('input[name="team"]')) animateSelection(event.target.closest('.team-choice'));
});
app.addEventListener('pointerdown', event => {
  const button = event.target.closest('.button, [data-answer]');
  if (button && !button.disabled) animateTap(button);
});
const path = location.pathname;
const room = path.match(/^\/(host|play)\/([a-f0-9-]{36})$/);
if (room) roomPage(room[1] === 'host' ? 'host' : 'player', room[2]);
else if (path === '/host') hostHome();
else if (path === '/join') joinPage();
else landing();
