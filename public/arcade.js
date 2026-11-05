import { avatarColors, avatarSkins, avatarFaces, avatarAccessories, normalizeAvatar, avatarSvg } from './avatars.js';
import { animateAvatar } from './motion.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function avatarPicker() {
  return `<fieldset class="avatar-picker"><legend>SEU AVATAR <span>DO SEU JEITO</span></legend><div class="avatar-preview-row"><div id="avatar-preview"></div><div><strong>Esse é você no jogo.</strong><p>Seu avatar acompanha você e sua equipe.</p></div></div><details class="avatar-options"><summary>Personalizar avatar</summary><div class="avatar-controls"><div><span class="avatar-control-label">Cor do avatar</span><div class="avatar-swatches">${Object.entries(avatarColors).map(([id, option]) => `<button type="button" class="avatar-swatch color-${id}" data-avatar-color="${id}" aria-label="Cor ${option.label}" aria-pressed="false"></button>`).join('')}</div></div><div><span class="avatar-control-label">Tom de pele</span><div class="avatar-swatches">${Object.entries(avatarSkins).map(([id, option]) => `<button type="button" class="avatar-swatch skin-${id}" data-avatar-skin="${id}" aria-label="Tom de pele ${option.label.toLowerCase()}" aria-pressed="false"></button>`).join('')}</div></div><label for="avatar-face">Expressão<select id="avatar-face" aria-label="Expressão">${Object.entries(avatarFaces).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><label for="avatar-accessory">Acessório<select id="avatar-accessory" aria-label="Acessório">${Object.entries(avatarAccessories).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label></div></details></fieldset>`;
}

export function bindAvatarPicker(form) {
  let avatar;
  try { avatar = normalizeAvatar(JSON.parse(localStorage.getItem('despertos-avatar'))); }
  catch { avatar = normalizeAvatar(); }
  const preview = form.querySelector('#avatar-preview');
  function update(animate = true) {
    preview.innerHTML = avatarSvg(avatar, 'Prévia do seu avatar');
    form.querySelectorAll('[data-avatar-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.avatarColor === avatar.color)));
    form.querySelectorAll('[data-avatar-skin]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.avatarSkin === avatar.skin)));
    form.querySelector('#avatar-face').value = avatar.face;
    form.querySelector('#avatar-accessory').value = avatar.accessory;
    try { localStorage.setItem('despertos-avatar', JSON.stringify(avatar)); } catch { /* A personalização funciona sem armazenamento local. */ }
    if (animate) animateAvatar(preview);
  }
  form.querySelectorAll('[data-avatar-color], [data-avatar-skin]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.avatarColor) avatar.color = button.dataset.avatarColor;
    if (button.dataset.avatarSkin) avatar.skin = button.dataset.avatarSkin;
    update();
  }));
  for (const key of ['face', 'accessory']) form.querySelector(`#avatar-${key}`).addEventListener('change', event => {
    avatar[key] = event.target.value;
    update();
  });
  update(false);
  return () => normalizeAvatar(avatar);
}

export function scoringDescription(mode) {
  return mode === 'speed'
    ? 'Primeiro acerto: 100% dos pontos. Último acerto: 50%. Os demais ficam entre esses valores. Erros: zero.'
    : 'Todos os acertos valem os mesmos pontos: 100, 200 ou 300, conforme a dificuldade.';
}

export function scoringSettings(snapshot) {
  return `<section class="scoring-settings" aria-labelledby="scoring-title"><div><span class="arcade-label">GAME MODE</span><h2 id="scoring-title">Como vamos pontuar?</h2><p id="scoring-description">${scoringDescription(snapshot.scoringMode)}</p></div><label for="scoring-mode">Modo de pontuação<select id="scoring-mode" aria-label="Modo de pontuação" aria-describedby="scoring-description"><option value="fixed" ${snapshot.scoringMode !== 'speed' ? 'selected' : ''}>Pontos fixos</option><option value="speed" ${snapshot.scoringMode === 'speed' ? 'selected' : ''}>Ordem dos acertos</option></select></label></section>`;
}

export function podiumMarkup(snapshot) {
  const groups = new Map();
  for (const team of snapshot.podium || []) {
    if (!groups.has(team.rank)) groups.set(team.rank, []);
    groups.get(team.rank).push(team);
  }
  if (!groups.size) return '';
  return `<section class="podium" aria-labelledby="podium-title"><h2 id="podium-title" class="arcade-label">PÓDIO FINAL</h2><div class="podium-stages" role="list">${[...groups].sort(([a], [b]) => a - b).map(([rank, teams]) => `<div class="podium-stage" data-rank="${rank}" role="listitem"><div class="podium-teams">${teams.map(team => `<article class="podium-team team-${esc(team.id)}"><div class="podium-avatars">${team.members.map(player => `<span title="${esc(player.name)}">${avatarSvg(player.avatar, `Avatar de ${player.name}`)}</span>`).join('')}</div><h3>${esc(team.name)}</h3><strong>${team.score.toLocaleString('pt-BR')} <small>pts</small></strong></article>`).join('')}</div><div class="podium-block"><span class="podium-medal">${rank}º</span><span>${teams.length > 1 ? 'COLOCAÇÃO COMPARTILHADA' : `${rank}º LUGAR`}</span></div></div>`).join('')}</div></section>`;
}
