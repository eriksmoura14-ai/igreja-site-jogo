// Somente opções enumeradas são persistidas; SVG e cores são gerados localmente.
export const avatarColors = {
  orange: { label: 'Laranja', color: '#ff9800' }, blue: { label: 'Azul', color: '#28baff' },
  green: { label: 'Verde', color: '#39dc87' }, purple: { label: 'Roxo', color: '#ad89ff' },
  pink: { label: 'Rosa', color: '#f57bb6' }, teal: { label: 'Turquesa', color: '#42c9c4' },
};
export const avatarSkins = {
  light: { label: 'Claro', color: '#f7d5b2' }, sand: { label: 'Dourado', color: '#dfab7b' },
  brown: { label: 'Castanho', color: '#ad714e' }, deep: { label: 'Escuro', color: '#704733' },
};
export const avatarFaces = { happy: 'Sorriso', focused: 'Determinado', wink: 'Piscando', glasses: 'Óculos' };
export const avatarAccessories = { none: 'Sem acessório', cap: 'Boné', crown: 'Coroa', headphones: 'Fones' };
export const defaultAvatar = Object.freeze({ color: 'orange', skin: 'sand', face: 'happy', accessory: 'none' });
const choices = { color: avatarColors, skin: avatarSkins, face: avatarFaces, accessory: avatarAccessories };

export function isAvatar(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 4 && Object.entries(choices).every(([key, values]) =>
      typeof value[key] === 'string' && Object.hasOwn(values, value[key])));
}
export function normalizeAvatar(value) {
  const source = isAvatar(value) ? value : defaultAvatar;
  return Object.fromEntries(Object.keys(choices).map(key => [key, source[key]]));
}
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function avatarSvg(value, label = 'Avatar do participante') {
  const a = normalizeAvatar(value), color = avatarColors[a.color].color, skin = avatarSkins[a.skin].color;
  const eyes = a.face === 'glasses'
    ? '<path d="M20 25h10v9H20zm14 0h10v9H34z" fill="none" stroke="#17212b" stroke-width="3"/><path d="M30 28h4" stroke="#17212b" stroke-width="3"/>'
    : `<path d="M22 27h5v5h-5z${a.face === 'wink' ? 'M36 29h7v3h-7z' : 'M37 27h5v5h-5z'}" fill="#17212b"/>`;
  const mouth = a.face === 'focused'
    ? '<path d="M25 39h14v3H25zM20 22h9v3h-9zM35 22h9v3h-9z" fill="#17212b"/>'
    : '<path d="M24 37h4v4h8v-4h4v7H24z" fill="#17212b"/>';
  const accessory = {
    none: '',
    cap: '<path d="M14 12h30v9H14zM10 19h34v4H10z" fill="#17497c"/><path d="M24 12h8v6h-8z" fill="#fff"/>',
    crown: '<path d="M13 7h7v5h8V5h8v7h8V7h7v14H13z" fill="#ffd45b"/><path d="M17 18h30v4H17z" fill="#c98a15"/>',
    headphones: '<path d="M12 18h5V9h30v9h5v19h-8V20h-3v-6H23v6h-3v17h-8z" fill="#e7eef5"/><path d="M12 25h5v12h-5zM47 25h5v12h-5z" fill="#384656"/>',
  }[a.accessory];
  return `<svg class="pixel-avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" shape-rendering="crispEdges" role="img" aria-label="${escape(label)}"><rect width="64" height="64" fill="${color}"/><path d="M8 64V54h10v-5h28v5h10v10z" fill="#23323f"/><path d="M26 47h12v10H26z" fill="${skin}"/><path d="M16 15h32v27h-5v7H21v-7h-5z" fill="${skin}"/><path d="M16 12h32v10H36v-4H21v8h-5z" fill="#35251f"/>${eyes}${mouth}${accessory}<path d="M27 58h10v6H27z" fill="${color}"/></svg>`;
}
