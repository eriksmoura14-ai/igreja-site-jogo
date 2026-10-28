// Apenas apresentação: relógio, respostas e transições da partida continuam no servidor.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set();
let observer;
let rankingMemory;
const ease = 'cubic-bezier(.2,.8,.2,1)';

function animate(element, keyframes, options = {}) {
  if (!element || reduced.matches || !element.animate) return;
  const animation = element.animate(keyframes, { duration: 360, easing: ease, ...options });
  running.add(animation);
  animation.finished.then(() => running.delete(animation), () => running.delete(animation));
  return animation;
}
const enter = (element, delay = 0) => animate(element, [
  { opacity: 0, translate: '0 16px' },
  { opacity: 1, translate: '0 0' },
], { delay, duration: 440, fill: 'backwards' });

reduced.addEventListener('change', () => {
  if (!reduced.matches) return;
  for (const animation of running) animation.cancel();
  running.clear();
  observer?.disconnect();
  document.querySelectorAll('.celebration-layer').forEach(element => element.remove());
});

export function animatePage() {
  observer?.disconnect();
  if (reduced.matches) return;
  document.querySelectorAll('.hero-wordmark, .hero h2, .hero-description, .entry-card, .dashboard-heading, .create-card, .join-page .section-intro, .auth-page h1').forEach((element, index) => enter(element, Math.min(index * 65, 200)));
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      enter(entry.target);
      observer.unobserve(entry.target);
    }
  }, { threshold: .12 });
  document.querySelectorAll('.how-grid article, .difficulty-strip, .hero-stats, .rooms-section').forEach(element => observer.observe(element));
}

export function animateCountdown(element) {
  animate(element, [
    { opacity: .45, scale: '.8' },
    { opacity: 1, scale: '1.06', offset: .65 },
    { opacity: 1, scale: '1' },
  ], { duration: 330 });
}

export function animateSelection(element) {
  animate(element?.querySelector('.icon'), [
    { scale: '1' }, { scale: '1.18', offset: .45 }, { scale: '1' },
  ], { duration: 280 });
}

export function animateTap(element) {
  animate(element, [{ scale: '.97' }, { scale: '1' }], { duration: 150 });
}

export function animateToast(element) { enter(element); }

function celebrate() {
  if (reduced.matches) return;
  const layer = document.createElement('div');
  layer.className = 'celebration-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const animations = [];
  // Efeito limitado, sem interação nem som. Removido após cada comemoração.
  for (let i = 0; i < 24; i++) {
    const particle = document.createElement('span');
    particle.className = `celebration-particle color-${i % 4}`;
    layer.append(particle);
    const x = 5 + (i * 29 % 90);
    const animation = animate(particle, [
      { translate: `${x}vw -24px`, rotate: '0deg', opacity: 0 },
      { opacity: .9, offset: .08 },
      { translate: `${x + (i % 2 ? 7 : -7)}vw 92vh`, rotate: `${i % 2 ? 360 : -300}deg`, opacity: 0 },
    ], { duration: 1600 + i % 4 * 150, delay: i % 6 * 45, easing: 'cubic-bezier(.2,.5,.5,1)', fill: 'both' });
    if (animation) animations.push(animation.finished.catch(() => {}));
  }
  Promise.all(animations).then(() => layer.remove());
}

export function animateRoom(snapshot, { sceneChanged = false, previous } = {}) {
  if (sceneChanged) {
    // Os controles ficam disponíveis assim que aparecem.
    enter(document.querySelector('.host-question, .player-question, .countdown-screen, .result-screen, .player-result, .player-wait, .leaderboard, .lobby-heading'));
    document.querySelectorAll('.answer-grid .answer-option, .player-answers .answer-option, .lobby-team').forEach((element, index) => enter(element, index * 45));
    animateCountdown(document.querySelector('#countdown'));
    animate(document.querySelector('.result-icon, .answer-sent > .icon'), [
      { scale: '.7', opacity: 0 }, { scale: '1.08', opacity: 1, offset: .7 }, { scale: '1', opacity: 1 },
    ], { duration: 440 });
  }

  if (snapshot.phase === 'LOBBY' && previous?.phase === 'LOBBY') {
    const newcomers = snapshot.players?.filter(player => !previous.players?.some(old => old.id === player.id)) || [];
    for (const player of newcomers) {
      const remove = document.querySelector(`[data-remove="${CSS.escape(player.id)}"]`);
      enter(remove?.closest('li'));
    }
  }

  const rows = document.querySelectorAll('.ranking-row');
  if (rows.length) {
    const old = rankingMemory?.roomId === snapshot.roomId ? rankingMemory.teams : new Map();
    rows.forEach((row, index) => {
      const id = row.dataset.teamId;
      const last = old.get(id);
      const bar = row.querySelector('[data-width]');
      const width = Number(bar.dataset.width);
      if (sceneChanged) {
        const distance = last ? (last.index - index) * (row.getBoundingClientRect().height + 13) : 18;
        animate(row, [{ opacity: .35, translate: `0 ${distance}px` }, { opacity: 1, translate: '0 0' }], { duration: 600, delay: index * 55, fill: 'backwards' });
        animate(bar, [{ width: `${last?.width || 0}%` }, { width: `${width}%` }], { duration: 750, delay: index * 55 });
      }
    });
    rankingMemory = { roomId: snapshot.roomId, teams: new Map([...rows].map((row, index) => [row.dataset.teamId, { index, width: Number(row.querySelector('[data-width]').dataset.width) }])) };
  }

  const justEnded = snapshot.phase === 'ENDED' && previous?.phase !== 'ENDED';
  const personalWin = snapshot.me && snapshot.teams.find(team => team.id === snapshot.me.team)?.rank === 1;
  const justCorrect = snapshot.phase === 'QUESTION_RESULT' && previous?.phase !== 'QUESTION_RESULT' && snapshot.result?.personal?.correct;
  if (sceneChanged && (justCorrect || (justEnded && (snapshot.role === 'host' || personalWin) && snapshot.teams[0].score > 0))) celebrate();
}
