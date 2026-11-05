import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/build-vercel.mjs', import.meta.url);

async function fixture(t) {
  const cwd = await mkdtemp(resolve(tmpdir(), 'despertos-vercel-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return {
    cwd,
    build: (origin, extra = {}) => spawnSync(process.execPath, [script.pathname], {
      cwd, encoding: 'utf8',
      env: { ...process.env, GAME_SERVER_ORIGIN: origin, ...extra },
    }),
  };
}

test('Vercel: build encaminha páginas, API com query e SSE para o mesmo backend, sem publicar arquivos privados', async t => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.build('https://backend.example.com/');
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await readFile(resolve(f.cwd, '.vercel/output/config.json'), 'utf8'));
    assert.equal(config.version, 3);
    assert.equal(config.routes.length, 1);
    const route = config.routes[0];
    for (const path of ['/', '/host', '/join', '/api/auth/login', '/api/rooms/room/events?view=player', '/fonts/anton-latin-400-normal.woff2']) {
      assert.equal(path.replace(new RegExp(`^${route.src}$`), route.dest), `https://backend.example.com${path}`);
    }
    assert.deepEqual(await readdir(resolve(f.cwd, '.vercel/output/static')), []);
    assert.deepEqual(await readdir(f.cwd), ['.vercel']);
  }
});

test('Vercel: configuração incompleta ou com credenciais, caminho ou origem circular falha antes de gerar o deploy', async t => {
  const f = await fixture(t);
  for (const origin of ['', 'not-a-url', 'http://backend.example.com', 'https://user:password@backend.example.com', 'https://backend.example.com/api', 'https://backend.example.com/?token=secret', 'https://backend.example.com/#fragment', 'https://demo.vercel.app']) {
    const result = f.build(origin, { VERCEL_PROJECT_PRODUCTION_URL: 'demo.vercel.app' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GAME_SERVER_ORIGIN/);
    assert.equal(result.stderr.includes('user:password'), false);
    assert.deepEqual(await readdir(f.cwd), []);
  }
});
