import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Game } from '../src/game.mjs';
import { createApp } from '../src/server.mjs';

async function fixture(t, options = {}) {
  let now = 100000;
  const game = new Game(':memory:', { now: () => now });
  const server = createApp({ game, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.stopStreams(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); game.close(); });
  async function request(path, data, cookie, extra = {}) {
    const res = await fetch(`${base}${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    const value = await res.json();
    return { res, value, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const auth = await request('/api/auth/register', { username: 'anfitriao', password: 'senha-de-teste-123' });
  assert.equal(auth.res.status, 200);
  const created = await request('/api/rooms', {}, auth.cookie); const roomId = created.value.roomId;
  const snapshot = await request(`/api/rooms/${roomId}/snapshot?view=host`, undefined, auth.cookie);
  const a = await request('/api/join', { pin: snapshot.value.pin, name: 'Ana', team: 'lion', role: 'host' });
  const b = await request('/api/join', { pin: snapshot.value.pin, name: 'Bia', team: 'wolf' });
  const command = async (action, extra = {}, cookie = auth.cookie, view = 'host', id = roomId) => {
    const s = await request(`/api/rooms/${id}/snapshot?view=host`, undefined, auth.cookie);
    return request(`/api/rooms/${id}/commands?view=${view}`, { action, requestId: randomUUID(), expectedVersion: s.value.version, ...extra }, cookie);
  };
  return { game, server, request, command, host: auth.cookie, a: a.cookie, b: b.cookie, roomId, base, advance: ms => { now += ms; } };
}
test('HTTP: autorização, login, cookies HttpOnly, CSRF e assets sem gabarito', async t => {
  const f = await fixture(t), path = `/api/rooms/${f.roomId}`;
  assert.equal((await f.request(`${path}/snapshot?view=host`, undefined, f.a)).res.status, 401);
  assert.equal((await f.request(`${path}/commands?view=player`, { action: 'start', requestId: randomUUID(), role: 'host' }, f.a)).res.status, 403);
  assert.equal((await f.request(`${path}/events?view=host`, undefined, f.a)).res.status, 401);
  assert.equal((await f.request(`${path}/snapshot?view=player`, undefined)).res.status, 401);
  assert.equal((await f.request('/api/rooms', {}, f.host, { Origin: 'https://outro.example' })).res.status, 403);
  assert.equal((await f.request('/api/auth/login', { username: 'anfitriao', password: 'senha-errada-123' })).res.status, 401);
  const login = await f.request('/api/auth/login', { username: 'anfitriao', password: 'senha-de-teste-123' });
  assert.equal(login.res.status, 200); assert.match(login.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await f.request('/api/rooms', {}, f.a)).res.status, 401);
  for (const path of ['/', '/join', '/host', `/host/${f.roomId}`, `/play/${f.roomId}`, '/app.js', '/motion.js', '/styles.css', '/type-motion.css']) {
    const response = await fetch(`${f.base}${path}`);
    assert.equal(response.status, 200); assert.ok(response.headers.get('content-security-policy'));
    assert.equal((await response.text()).includes('Quem construiu a arca?'), false);
  }
  for (const path of ['/src/questions.mjs', '/.data/despertos.sqlite', '/.git/config', '/package.json']) assert.equal((await fetch(`${f.base}${path}`)).status, 404);
  for (const name of ['bebas-neue-latin-400-normal', 'poppins-latin-400-normal']) {
    const font = await fetch(`${f.base}/fonts/${name}.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0, 4).toString(), 'wOF2');
  }
  assert.equal((await fetch(`${f.base}/fonts/arquivo-inexistente.woff2`)).status, 404);
});
test('HTTP: duas salas, respostas simultâneas, recibo seguro e resultado único', async t => {
  const f = await fixture(t), path = `/api/rooms/${f.roomId}`;
  const second = await f.request('/api/rooms', {}, f.host);
  assert.equal((await f.request(`/api/rooms/${second.value.roomId}/snapshot?view=player`, undefined, f.a)).res.status, 401);
  assert.equal((await f.command('start')).res.status, 200); f.advance(3000);
  const snap = await f.request(`${path}/snapshot?view=player`, undefined, f.a);
  const run = snap.value.question.runId;
  const results = await Promise.all([f.a, f.b].map(cookie => f.request(`${path}/commands?view=player`, { action: 'answer', requestId: randomUUID(), questionRunId: run, optionId: 'A' }, cookie)));
  for (const result of results) { assert.equal(result.res.status, 200); assert.deepEqual(result.value, { accepted: true, hasAnswered: true }); }
  assert.equal(f.game.db.prepare('SELECT count(*) AS n FROM points').get().n, 2);
  const after = await f.request(`${path}/snapshot?view=player`, undefined, f.a);
  assert.equal(after.value.phase, 'QUESTION_RESULT'); assert.equal(after.value.result.correctOptionId, 'A');
  assert.equal(after.value.result.personal.points, 100);
});
test('SSE: snapshot autorizado, resposta privada e reconexão com estado atual', async t => {
  const f = await fixture(t), path = `/api/rooms/${f.roomId}`;
  await f.command('start'); f.advance(3000);
  const controller = new AbortController();
  const response = await fetch(`${f.base}${path}/events?view=player`, { headers: { Cookie: f.a }, signal: controller.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  let buffer = '';
  async function next() {
    while (!buffer.includes('\n\n')) { const part = await reader.read(); assert.equal(part.done, false); buffer += new TextDecoder().decode(part.value); }
    const end = buffer.indexOf('\n\n'), frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    return JSON.parse(frame.split('\n').find(l => l.startsWith('data: ')).slice(6));
  }
  const initial = await next(); assert.equal(initial.result, undefined); assert.equal(initial.role, 'player');
  await f.command('answer', { questionRunId: initial.question.runId, optionId: 'A' }, f.a, 'player');
  const changed = await next(); assert.equal(changed.hasAnswered, true); assert.equal(changed.result, undefined); assert.equal(changed.players, undefined);
  assert.ok(changed.sequence > initial.sequence); assert.equal(changed.question.deadlineAt, initial.question.deadlineAt);
  controller.abort(); await reader.cancel().catch(() => {});
  const resumed = await f.request(`${path}/snapshot?view=player`, undefined, f.a);
  assert.equal(resumed.value.me.id, initial.me.id); assert.equal(resumed.value.hasAnswered, true);
  await f.request('/api/auth/logout', {}, f.host);
  assert.equal((await f.request(`${path}/snapshot?view=host`, undefined, f.host)).res.status, 401);
});
test('HTTP: validação de payload, limite de tamanho e ingresso sem autenticação administrativa', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/join', { pin: 'abc', name: 'Ana', team: 'lion' })).res.status, 400);
  assert.equal((await f.request('/api/join', { pin: '123456', name: 'A', team: 'lion' })).res.status, 400);
  assert.equal((await f.request('/api/join', { pin: '123456', name: 'Ana', team: 'inventada' })).res.status, 400);
  assert.equal((await f.request('/api/join', { name: 'a'.repeat(9000) })).res.status, 413);
  const response = await fetch(`${f.base}/api/join`, { method: 'POST', body: '{}' }); assert.equal(response.status, 415);
  assert.deepEqual((await f.request('/api/health')).value, { status: 'ok' });
});

test('Render: origem HTTPS automática atrás do proxy, cookies Secure e proteção de origem', async t => {
  const before = process.env.RENDER_EXTERNAL_URL;
  let f;
  try {
    process.env.RENDER_EXTERNAL_URL = 'https://despertos-teste.onrender.com';
    f = await fixture(t, { secureCookies: true });
  } finally {
    if (before === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = before;
  }
  const credentials = { username: 'anfitriao', password: 'senha-de-teste-123' };
  const login = await f.request('/api/auth/login', credentials, undefined, { Origin: 'https://despertos-teste.onrender.com', Host: 'upstream.internal' });
  assert.equal(login.res.status, 200);
  assert.match(login.res.headers.get('set-cookie'), /; Secure/);
  assert.equal((await f.request('/api/rooms', {}, login.cookie, { Origin: 'https://despertos-teste.onrender.com', Host: 'upstream.internal' })).res.status, 201);
  assert.equal((await f.request('/api/rooms', {}, login.cookie, { Origin: 'https://outro.onrender.com' })).res.status, 403);
});

test('PUBLIC_ORIGIN explícita tem prioridade sobre o domínio automático do Render', async t => {
  const f = await fixture(t, { secureCookies: true, publicOrigin: 'https://jogo.exemplo.com' });
  const credentials = { username: 'anfitriao', password: 'senha-de-teste-123' };
  const login = await f.request('/api/auth/login', credentials, undefined, { Origin: 'https://jogo.exemplo.com' });
  assert.equal(login.res.status, 200);
  assert.equal((await f.request('/api/auth/login', credentials, undefined, { Origin: 'https://despertos-teste.onrender.com' })).res.status, 403);
});
