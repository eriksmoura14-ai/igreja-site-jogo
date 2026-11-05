import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Build Output API: a Vercel encaminha as requisições, sem executar o SQLite.
let backend;
try {
  backend = new URL(process.env.GAME_SERVER_ORIGIN || '');
  if (backend.protocol !== 'https:' || backend.username || backend.password ||
      backend.pathname !== '/' || backend.search || backend.hash) throw Error();
  if (backend.hostname === process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      backend.hostname === process.env.VERCEL_URL) throw Error();
} catch {
  console.error('Defina GAME_SERVER_ORIGIN na Vercel com a origem HTTPS do servidor Render, sem caminho, usuário ou senha. Não use o endereço da própria Vercel.');
  process.exit(1);
}

const output = resolve('.vercel/output');
await mkdir(resolve(output, 'static'), { recursive: true });
await writeFile(resolve(output, 'config.json'), JSON.stringify({
  version: 3,
  routes: [{ src: '/(.*)', dest: `${backend.origin}/$1` }],
}, null, 2) + '\n');
console.log('Proxy da Vercel preparado. O servidor multiplayer e o SQLite continuam no Render.');
