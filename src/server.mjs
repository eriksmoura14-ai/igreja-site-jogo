import http from 'node:http';
import { readFile, mkdir, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { Game, GameError } from './game.mjs';

const derive = promisify(scrypt);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const HOST_COOKIE = 'despertos_host', PLAYER_COOKIE = 'despertos_player';
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p.length === 2));
const cookie = (name, token, secure, maxAge = 604800) => `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };
async function body(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new GameError(413, 'Requisição muito grande.');
    chunks.push(chunk);
  }
  try { const v = JSON.parse(Buffer.concat(chunks).toString()); if (!v || Array.isArray(v) || typeof v !== 'object') throw Error(); return v; }
  catch { throw new GameError(400, 'Envie um objeto JSON válido.'); }
}
export function createApp({ game, secureCookies = process.env.COOKIE_SECURE === '1', publicOrigin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL } = {}) {
  const streams = new Map(), limits = new Map(); let globalStreams = 0;
  const rate = (req, group, limit) => {
    const key = `${req.socket.remoteAddress}:${group}`, now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until <= now) { entry = { until: now + 60000, n: 0 }; limits.set(key, entry); }
    if (++entry.n > limit) throw new GameError(429, 'Muitas tentativas. Aguarde um minuto.');
  };
  const actorFor = (req, roomId, role) => {
    if (role === 'host') return game.authenticateHost(cookies(req)[HOST_COOKIE]);
    if (role === 'player') return game.authenticatePlayer(cookies(req)[PLAYER_COOKIE], roomId);
    throw new GameError(400, 'Visão inválida.');
  };
  const publish = roomId => {
    for (const stream of streams.get(roomId) || []) {
      try {
        stream.actor.role === 'host' ? game.authenticateHost(stream.token) : game.authenticatePlayer(stream.token, roomId);
        const snapshot = game.snapshot(roomId, stream.actor);
        if (stream.res.writableLength > 128 * 1024) { stream.res.destroy(); continue; }
        stream.res.write(`id: ${snapshot.sequence}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      } catch { stream.res.write('event: revoked\ndata: {}\n\n'); stream.res.end(); }
    }
  };
  const server = http.createServer(async (req, res) => {
    const receivedAt = game.now();
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!['GET', 'POST'].includes(req.method)) throw new GameError(405, 'Método não permitido.');
      if (req.method === 'POST') {
        rate(req, 'write', 180);
        if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new GameError(415, 'Use application/json.');
        const expectedOrigin = publicOrigin || `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
        if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') throw new GameError(403, 'Origem não autorizada.');
      }
      if (url.pathname === '/api/health' && req.method === 'GET') {
        game.db.prepare('SELECT 1').get(); return json(res, 200, { status: 'ok' });
      }
      if (url.pathname === '/api/auth/me' && req.method === 'GET') {
        const actor = game.authenticateHost(cookies(req)[HOST_COOKIE]);
        return json(res, 200, { account: game.account(actor.id), rooms: game.myRooms(actor) });
      }
      if (['/api/auth/register', '/api/auth/login'].includes(url.pathname) && req.method === 'POST') {
        rate(req, 'auth', 15);
        const input = await body(req);
        const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
        if (!/^[a-z0-9_.-]{3,32}$/.test(username) || typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 128) throw new GameError(400, 'Use um nome de 3 a 32 letras/números e uma senha de 10 a 128 caracteres.');
        let account;
        if (url.pathname.endsWith('register')) {
          const salt = randomBytes(16).toString('hex');
          const password = `${salt}:${(await derive(input.password, salt, 64)).toString('hex')}`;
          account = game.addAccount(username, password);
        } else {
          const row = game.findAccount(username);
          const [salt, expected] = (row?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
          const candidate = await derive(input.password, salt, 64);
          if (!timingSafeEqual(Buffer.from(expected, 'hex'), candidate) || !row) throw new GameError(401, 'Nome ou senha incorretos.');
          account = game.account(row.id);
        }
        res.setHeader('Set-Cookie', cookie(HOST_COOKIE, game.session(account.id), secureCookies));
        return json(res, 200, { account });
      }
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        game.logout(cookies(req)[HOST_COOKIE]); res.setHeader('Set-Cookie', cookie(HOST_COOKIE, '', secureCookies, 0));
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        rate(req, 'create', 10);
        const actor = game.authenticateHost(cookies(req)[HOST_COOKIE]);
        await body(req); return json(res, 201, game.create(actor));
      }
      if (url.pathname === '/api/join' && req.method === 'POST') {
        rate(req, 'join', 30);
        const input = await body(req), joined = game.join(input.pin, input.name, input.team);
        res.setHeader('Set-Cookie', cookie(PLAYER_COOKIE, joined.token, secureCookies));
        publish(joined.roomId);
        return json(res, 201, { roomId: joined.roomId, playerId: joined.playerId });
      }
      if (url.pathname === '/api/player/leave' && req.method === 'POST') {
        res.setHeader('Set-Cookie', cookie(PLAYER_COOKIE, '', secureCookies, 0)); return json(res, 200, { ok: true });
      }
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9-]{36})\/(snapshot|events|commands)$/);
      if (match) {
        const [, roomId, route] = match;
        game.tick().forEach(publish);
        const role = url.searchParams.get('view');
        const actor = actorFor(req, roomId, role);
        const snapshot = game.snapshot(roomId, actor);
        if (route === 'snapshot' && req.method === 'GET') return json(res, 200, snapshot);
        if (route === 'events' && req.method === 'GET') {
          rate(req, 'stream', 60);
          const group = streams.get(roomId) || new Set();
          if (globalStreams >= 1000 || [...group].filter(s => s.actor.id === actor.id).length >= 4) throw new GameError(429, 'Limite de conexões atingido.');
          streams.set(roomId, group);
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          const stream = { res, actor, token: cookies(req)[role === 'host' ? HOST_COOKIE : PLAYER_COOKIE] }; group.add(stream); globalStreams++;
          res.write(`retry: 1500\nid: ${snapshot.sequence}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
          const heartbeat = setInterval(() => {
            try {
              // Sessões expiradas ou revogadas também perdem o stream existente.
              role === 'host' ? game.authenticateHost(stream.token) : game.authenticatePlayer(stream.token, roomId);
              game.snapshot(roomId, actor); res.write(': heartbeat\n\n');
            } catch { res.write('event: revoked\ndata: {}\n\n'); res.end(); }
          }, 15000);
          res.on('close', () => { clearInterval(heartbeat); group.delete(stream); globalStreams--; if (!group.size) streams.delete(roomId); });
          return;
        }
        if (route === 'commands' && req.method === 'POST') {
          const input = await body(req);
          const result = game.command(roomId, actor, input.action, input, receivedAt);
          publish(roomId); return json(res, 200, result);
        }
      }
      if (url.pathname.startsWith('/api/')) throw new GameError(404, 'Rota não encontrada.');
      if (req.method !== 'GET') throw new GameError(405, 'Método não permitido.');
      const files = { '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/mark.svg': ['mark.svg', 'image/svg+xml'] };
      let asset = files[url.pathname];
      if (!asset && (/^\/(host|play)\/[a-f0-9-]{36}$/.test(url.pathname) || ['/', '/host', '/join'].includes(url.pathname))) asset = ['index.html', 'text/html'];
      if (!asset) throw new GameError(404, 'Página não encontrada.');
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(await readFile(resolve(root, asset[0])));
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (!(error instanceof GameError)) console.error('Falha no servidor:', error.code || error.name);
      json(res, error.status || 500, { error: error instanceof GameError ? error.message : 'Não foi possível concluir. Tente novamente.' });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const timer = setInterval(() => {
    try { game.tick().forEach(publish); } catch (error) { console.error('Falha no relógio:', error.code || error.name); }
    for (const [key, entry] of limits) if (entry.until < Date.now()) limits.delete(key);
  }, 250);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  server.stopStreams = () => { for (const group of streams.values()) for (const stream of group) stream.res.end(); };
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.DB_PATH || '.data/despertos.sqlite');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const game = new Game(path); await chmod(path, 0o600);
  const server = createApp({ game });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Despertos iniciado na porta ${port}.`));
  const shutdown = () => { server.stopStreams(); server.close(() => { game.close(); process.exit(0); }); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
