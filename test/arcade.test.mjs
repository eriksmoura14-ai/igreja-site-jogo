import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Game } from '../src/game.mjs';
import { avatarSvg, defaultAvatar } from '../shared/avatars.mjs';

const denied = status => error => error.status === status;
function fixture(t) {
  let clock = 100000;
  const game = new Game(':memory:', { now: () => clock });
  t.after(() => game.close());
  const host = { role: 'host', id: game.addAccount('host', 'test-only').id };
  const room = game.create(host).roomId;
  const command = (action, data = {}, actor = host) => game.command(room, actor, action, { requestId: randomUUID(), expectedVersion: game.room(room).version, ...data });
  const player = (name, team = 'lion', avatar) => {
    const joined = game.join(game.room(room).pin, name, team, avatar);
    return game.authenticatePlayer(joined.token, room);
  };
  const start = () => { command('start'); clock += 3000; game.tick(); };
  return { game, host, room, command, player, start, advance: ms => { clock += ms; }, snapshot: actor => game.snapshot(room, actor || host) };
}

test('pontuação: somente o anfitrião escolhe o modo no lobby, isolado por sala', t => {
  const f = fixture(t), player = f.player('Ana');
  assert.equal(f.snapshot().scoringMode, 'fixed');
  assert.throws(() => f.command('settings', { scoringMode: 'speed' }, player), denied(403));
  assert.throws(() => f.command('settings', { scoringMode: 'unlimited' }), denied(400));
  f.command('settings', { scoringMode: 'speed' });
  assert.equal(f.snapshot(player).scoringMode, 'speed');
  const other = f.game.create(f.host).roomId;
  assert.equal(f.game.snapshot(other, f.host).scoringMode, 'fixed');
  f.start();
  assert.throws(() => f.command('settings', { scoringMode: 'fixed' }), denied(409));
  assert.equal(f.snapshot().scoringMode, 'speed');
});

test('rapidez: primeiro, intermediário e último acertos recebem 100%, 75% e 50%; erros não alteram a ordem', t => {
  const f = fixture(t), wrong = f.player('Erro', 'wolf'), a = f.player('Ana'), b = f.player('Bia'), c = f.player('Caio');
  f.command('settings', { scoringMode: 'speed' }); f.start();
  const run = f.snapshot().question.runId;
  const answer = (actor, optionId) => f.command('answer', { questionRunId: run, optionId, points: 999999, receivedAt: 0, answerOrder: 1 }, actor);
  answer(wrong, 'B'); f.advance(1000);
  assert.deepEqual(answer(a, 'A'), { accepted: true, hasAnswered: true });
  answer(a, 'A');
  assert.equal(f.snapshot(a).result, undefined);
  assert.equal(f.snapshot(b).hasAnswered, false);
  assert.equal(f.snapshot().teams[0].score, 0);
  // Mesmo milissegundo: a ordem de aceitação no servidor desempata os acertos.
  answer(b, 'A'); answer(c, 'A');
  assert.deepEqual([a, b, c, wrong].map(actor => f.snapshot(actor).result.personal.points), [100, 75, 50, 0]);
  assert.equal(f.snapshot().teams.find(team => team.id === 'lion').score, 225);
  answer(a, 'A');
  assert.equal(f.game.db.prepare('SELECT count(*) AS n FROM points').get().n, 4);
  assert.equal(f.snapshot(a).result.personal.points, 100);
});

test('rapidez: um único acerto recebe o máximo, e ausência ou prazo encerrado não pontuam', t => {
  const f = fixture(t), a = f.player('Ana'), b = f.player('Bia', 'wolf');
  f.command('settings', { scoringMode: 'speed' }); f.start();
  f.advance(29000);
  f.command('answer', { questionRunId: f.snapshot().question.runId, optionId: 'A' }, a);
  f.advance(1000); f.game.tick(); f.game.tick();
  assert.equal(f.snapshot(a).result.personal.points, 100);
  assert.equal(f.snapshot(b).result.personal.points, 0);
  assert.equal(f.snapshot(b).result.personal.answered, false);
});

test('avatares: opções validadas, retomada preservada e pódio respeita empates sem equipes vazias', t => {
  const f = fixture(t);
  const avatar = { color: 'purple', skin: 'deep', face: 'glasses', accessory: 'crown' };
  for (const bad of [null, [], '<svg onload=alert(1)>', { ...avatar, color: 'url(javascript:alert(1))' }, { ...avatar, html: '<script>' }]) {
    assert.throws(() => f.player('Inválido', 'lion', bad), denied(400));
  }
  const a = f.player('Ana', 'lion', avatar), b = f.player('Bia', 'wolf');
  assert.deepEqual(f.snapshot(a).me.avatar, avatar);
  assert.deepEqual(f.snapshot(b).me.avatar, defaultAvatar);
  assert.equal(f.snapshot(a).players, undefined);
  assert.equal(f.snapshot(a).podium, undefined);
  f.start(); const run = f.snapshot().question.runId;
  for (const player of [a, b]) f.command('answer', { questionRunId: run, optionId: 'A' }, player);
  f.command('end');
  const podium = f.snapshot(a).podium;
  assert.equal(podium.length, 2);
  assert.deepEqual(podium.map(team => team.rank), [1, 1]);
  assert.deepEqual(podium[0].members[0], { name: 'Ana', avatar });
  assert.equal(JSON.stringify(podium).includes('token'), false);
  const svg = avatarSvg(avatar, '<script>alert(1)</script>');
  assert.equal(svg.includes('<script>'), false);
  assert.equal(svg.includes('onload'), false);
});

test('SQLite: migra jogadores antigos e conserva avatares, modo e ordem dos acertos após reinício', t => {
  const folder = mkdtempSync(join(tmpdir(), 'despertos-arcade-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, 'game.sqlite'); let clock = 100000;
  let game = new Game(path, { now: () => clock });
  const host = { role: 'host', id: game.addAccount('host', 'test-only').id };
  const room = game.create(host).roomId;
  const legacy = game.join(game.room(room).pin, 'Antigo', 'lion');
  const old = game.room(room); delete old.scoringMode;
  game.db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(old), room);
  game.close();
  const db = new DatabaseSync(path); db.exec('ALTER TABLE players DROP COLUMN avatar'); db.close();
  game = new Game(path, { now: () => clock });
  assert.deepEqual(game.snapshot(room, game.authenticatePlayer(legacy.token, room)).me.avatar, defaultAvatar);
  assert.equal(game.room(room).scoringMode, 'fixed');
  const avatar = { color: 'blue', skin: 'brown', face: 'wink', accessory: 'headphones' };
  const custom = game.join(game.room(room).pin, 'Novo', 'wolf', avatar);
  const command = (action, extra = {}, actor = host) => game.command(room, actor, action, { requestId: randomUUID(), expectedVersion: game.room(room).version, ...extra });
  command('settings', { scoringMode: 'speed' }); command('start'); clock += 3000; game.tick();
  let run = game.snapshot(room, host).question.runId;
  command('answer', { questionRunId: run, optionId: 'A' }, game.authenticatePlayer(legacy.token, room));
  game.close(); clock += 1000;
  game = new Game(path, { now: () => clock });
  try {
    const actor = game.authenticatePlayer(custom.token, room);
    assert.deepEqual(game.snapshot(room, actor).me.avatar, avatar);
    assert.equal(game.room(room).scoringMode, 'speed');
    command('answer', { questionRunId: run, optionId: 'A' }, actor);
    assert.equal(game.snapshot(room, actor).result.personal.points, 50);
    assert.equal(game.snapshot(room, game.authenticatePlayer(legacy.token, room)).result.personal.points, 100);
  } finally { game.close(); }
});
