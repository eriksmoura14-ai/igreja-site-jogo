import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Game } from '../src/game.mjs';
import { questions } from '../src/questions.mjs';

function fixture(t, options = {}) {
  let clock = 100000;
  const game = new Game(options.path || ':memory:', { now: () => clock, ...options });
  const host = { role: 'host', id: game.addAccount('anfitriao', 'test-only').id };
  const room = game.create(host).roomId;
  const player = (name = 'Ana', team = 'lion', roomId = room) => {
    const pin = game.room(roomId).pin, p = game.join(pin, name, team);
    return { ...p, actor: game.authenticatePlayer(p.token, roomId) };
  };
  const command = (action, data = {}, actor = host, roomId = room) => game.command(roomId, actor, action, { requestId: randomUUID(), expectedVersion: game.room(roomId).version, ...data });
  const start = () => { command('start'); clock += 3000; game.tick(); };
  const snapshot = actor => game.snapshot(room, actor || host);
  t.after(() => game.close());
  return { game, host, room, player, command, start, snapshot, advance: ms => { clock += ms; }, now: () => clock };
}
const denied = status => error => { assert.equal(error.status, status); return true; };

test('banco com 50 perguntas, distribuição 10/25/15, quatro opções e referências', () => {
  assert.equal(questions.length, 50);
  assert.deepEqual(questions.reduce((a, q) => ({ ...a, [q.difficulty]: (a[q.difficulty] || 0) + 1 }), {}), { easy: 10, medium: 25, hard: 15 });
  assert.equal(new Set(questions.map(q => q.id)).size, 50);
  for (const q of questions) {
    assert.deepEqual(q.options.map(o => o.id), ['A', 'B', 'C', 'D']);
    assert.ok(q.options.some(o => o.id === q.correctOptionId));
    assert.ok(q.reference && q.explanation && q.durationMs === 30000);
  }
});
test('anfitrião e participante recebem projeções diferentes e nenhum gabarito durante a pergunta', t => {
  const f = fixture(t), a = f.player(), b = f.player('Bia', 'wolf'); f.start();
  const host = f.snapshot(), player = f.snapshot(a.actor);
  assert.equal(host.question.runId, player.question.runId);
  assert.equal(host.question.deadlineAt, player.question.deadlineAt);
  assert.ok(host.players && host.pin && host.progress);
  assert.equal(player.players, undefined); assert.equal(player.pin, undefined); assert.equal(player.progress, undefined);
  for (const view of [host, player]) {
    const text = JSON.stringify(view);
    for (const key of ['correctOptionId', 'explanation', 'reference', 'hostId', 'token_hash', 'password']) assert.equal(text.includes(`"${key}"`), false);
    assert.equal(view.result, undefined);
  }
  const receipt = f.command('answer', { questionRunId: player.question.runId, optionId: 'A', score: 999999, correct: true, playerId: b.playerId }, a.actor);
  assert.deepEqual(receipt, { accepted: true, hasAnswered: true });
  assert.equal(f.snapshot(a.actor).hasAnswered, true); assert.equal(f.snapshot(b.actor).hasAnswered, false);
  assert.equal(f.snapshot().progress.answered, 1); assert.equal(f.snapshot().teams[0].score, 0);
});
test('PIN e role enviados pelo cliente não dão controle; credenciais ficam restritas à sala', t => {
  const f = fixture(t), a = f.player();
  const otherHost = { role: 'host', id: f.game.addAccount('outro', 'test-only').id }, otherRoom = f.game.create(otherHost).roomId;
  assert.throws(() => f.command('start', { role: 'host' }, a.actor), denied(403));
  assert.throws(() => f.game.snapshot(otherRoom, a.actor), denied(403));
  assert.throws(() => f.game.snapshot(f.room, otherHost), denied(403));
  assert.throws(() => f.game.authenticatePlayer(a.token, otherRoom), denied(401));
  assert.throws(() => f.game.authenticateHost(f.game.room(f.room).pin), denied(401));
});
test('comandos administrativos são idempotentes, validam fase e versão', t => {
  const f = fixture(t); f.player();
  const payload = { requestId: randomUUID(), expectedVersion: f.game.room(f.room).version };
  const result = f.game.command(f.room, f.host, 'start', payload);
  const version = f.game.room(f.room).version;
  assert.deepEqual(f.game.command(f.room, f.host, 'start', payload), result);
  assert.equal(f.game.room(f.room).version, version);
  assert.throws(() => f.game.command(f.room, f.host, 'end', payload), denied(409));
  assert.throws(() => f.command('start'), denied(409));
  assert.throws(() => f.command('next'), denied(409));
  assert.throws(() => f.command('end', { expectedVersion: 0 }), denied(409));
});
test('uma resposta por jogador, reenvio seguro, sem troca nem identidade arbitrária', t => {
  const f = fixture(t), a = f.player(), b = f.player('Bia'); f.start();
  const run = f.snapshot().question.runId, data = { questionRunId: run, optionId: 'A' };
  f.command('answer', data, a.actor); f.command('answer', data, a.actor);
  assert.equal(f.snapshot().progress.answered, 1);
  assert.throws(() => f.command('answer', { ...data, optionId: 'B' }, a.actor), denied(409));
  assert.throws(() => f.command('answer', { ...data, optionId: 'Z' }, b.actor), denied(400));
  assert.throws(() => f.command('answer', { ...data, questionRunId: randomUUID() }, b.actor), denied(409));
  f.command('answer', data, b.actor);
  assert.equal(f.snapshot().phase, 'QUESTION_RESULT');
  assert.equal(f.snapshot().teams.find(t => t.id === 'lion').score, 200);
  f.command('answer', data, a.actor);
  assert.equal(f.snapshot().teams.find(t => t.id === 'lion').score, 200);
  assert.equal(f.game.db.prepare('SELECT count(*) AS n FROM points').get().n, 2);
});
test('prazo é exclusivo; callback atrasado não aceita resposta fora do tempo', t => {
  const f = fixture(t), a = f.player(), b = f.player('Bia'); f.start();
  const run = f.snapshot().question.runId;
  f.advance(29999); f.command('answer', { questionRunId: run, optionId: 'A' }, a.actor);
  f.advance(1);
  assert.throws(() => f.command('answer', { questionRunId: run, optionId: 'A' }, b.actor), denied(409));
  f.game.tick(); f.game.tick();
  assert.equal(f.snapshot().phase, 'QUESTION_RESULT');
  assert.equal(f.snapshot().teams.find(t => t.id === 'lion').score, 100);
  assert.equal(f.snapshot(b.actor).result.personal.answered, false);
});
test('quatro integrantes por equipe, bloqueio, remoção revoga retomada e libera vaga', t => {
  const f = fixture(t), a = f.player();
  for (let i = 0; i < 3; i++) f.player(`Pessoa ${i}`);
  assert.throws(() => f.player('Extra'), denied(409));
  f.command('remove', { playerId: a.playerId });
  assert.throws(() => f.game.authenticatePlayer(a.token, f.room), denied(401));
  assert.throws(() => f.snapshot(a.actor), denied(403));
  f.player('Nova pessoa');
  f.command('lock', { locked: true });
  assert.throws(() => f.player('Bia', 'wolf'), denied(409));
  f.command('lock', { locked: false });
  f.player('Bia', 'wolf'); f.start();
  assert.throws(() => f.player('Caio', 'wolf'), denied(409));
  assert.throws(() => f.command('lock', { locked: false }), denied(409));
  assert.throws(() => f.command('remove', { playerId: a.playerId }), denied(409));
});
test('reconexão conserva identidade, resposta e prazo; desconexão não encerra pergunta', t => {
  const f = fixture(t), a = f.player(), b = f.player('Bia'); f.start();
  const before = f.snapshot(a.actor);
  f.command('answer', { questionRunId: before.question.runId, optionId: 'A' }, a.actor);
  f.advance(10000); f.game.tick();
  const resumed = f.game.authenticatePlayer(a.token, f.room), after = f.snapshot(resumed);
  assert.equal(resumed.id, a.playerId); assert.equal(after.hasAnswered, true);
  assert.equal(after.question.deadlineAt, before.question.deadlineAt); assert.equal(after.phase, 'QUESTION_OPEN');
  assert.equal(f.snapshot().progress.total, 2); assert.equal(f.snapshot(b.actor).hasAnswered, false);
});
test('reinício recupera contagem e pergunta vencida sem reiniciar tempo nem duplicar pontos', t => {
  const dir = mkdtempSync(join(tmpdir(), 'despertos-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'game.sqlite'); let clock = 100000;
  let game = new Game(path, { now: () => clock });
  const host = { role: 'host', id: game.addAccount('host', 'test-only').id }, hostToken = game.session(host.id), room = game.create(host).roomId;
  const a = game.join(game.room(room).pin, 'Ana', 'lion'), b = game.join(game.room(room).pin, 'Bia', 'wolf');
  game.command(room, host, 'start', { requestId: randomUUID(), expectedVersion: game.room(room).version });
  const countdownAt = game.snapshot(room, host).countdownAt; game.close();
  clock += 4000; game = new Game(path, { now: () => clock }); game.tick();
  const view = game.snapshot(room, game.authenticatePlayer(a.token, room));
  assert.equal(view.question.opensAt, countdownAt);
  game.command(room, game.authenticatePlayer(a.token, room), 'answer', { requestId: randomUUID(), questionRunId: view.question.runId, optionId: 'A' });
  const deadline = view.question.deadlineAt; game.close(); clock += 40000;
  game = new Game(path, { now: () => clock }); game.tick(); game.tick();
  assert.equal(game.authenticateHost(hostToken).id, host.id);
  assert.equal(game.snapshot(room, host).teams.find(t => t.id === 'lion').score, 100);
  assert.equal(game.snapshot(room, game.authenticatePlayer(b.token, room)).result.personal.points, 0);
  assert.equal(game.db.prepare('SELECT deadline FROM runs WHERE id=?').get(view.question.runId).deadline, deadline);
  assert.equal(game.db.prepare('SELECT count(*) AS n FROM points').get().n, 1); game.close();
});
test('PIN é reservado de forma única e pode ser liberado ao encerrar', t => {
  let pins = ['123456', '123456', '654321'];
  const f = fixture(t, { pin: () => pins.shift() || '654321' });
  assert.equal(f.game.room(f.room).pin, '123456');
  const second = f.game.create(f.host).roomId; assert.equal(f.game.room(second).pin, '654321');
  f.command('end'); assert.equal(f.game.room(f.room).pin, null);
  assert.throws(() => f.game.join('123456', 'Ana', 'lion'), denied(404));
});
test('partida completa: 50 perguntas, pontuação por nível, ranking por equipe e empate compartilhado', t => {
  const f = fixture(t), a = f.player(), b = f.player('Bia', 'wolf'); f.start();
  for (let i = 0; i < 50; i++) {
    assert.equal(f.snapshot().questionNumber, i + 1);
    const run = f.snapshot().question.runId;
    f.command('answer', { questionRunId: run, optionId: questions[i].correctOptionId }, a.actor);
    f.command('answer', { questionRunId: run, optionId: questions[i].correctOptionId }, b.actor);
    assert.equal(f.snapshot().phase, 'QUESTION_RESULT'); f.command('next');
    assert.equal(f.snapshot().phase, 'LEADERBOARD'); f.command('next');
    if (i < 49) { f.advance(3000); f.game.tick(); }
  }
  const final = f.snapshot(); assert.equal(final.phase, 'ENDED'); assert.equal(final.pin, null);
  assert.equal(final.teams[0].score, 10500); assert.equal(final.teams[1].score, 10500);
  assert.equal(final.teams[0].rank, 1); assert.equal(final.teams[1].rank, 1);
  assert.equal(f.game.db.prepare('SELECT count(*) AS n FROM points').get().n, 100);
});
test('encerrar no meio descarta pergunta aberta, mantém acertos anteriores e bloqueia ingresso', t => {
  const f = fixture(t), a = f.player(), b = f.player('Bia', 'wolf'), pin = f.game.room(f.room).pin; f.start();
  f.command('answer', { questionRunId: f.snapshot().question.runId, optionId: 'A' }, a.actor);
  f.command('close'); assert.equal(f.snapshot().teams[0].score, 100);
  f.command('next'); f.command('next'); f.advance(3000); f.game.tick();
  f.command('answer', { questionRunId: f.snapshot().question.runId, optionId: 'B' }, a.actor); f.command('end');
  assert.equal(f.snapshot().teams[0].score, 100);
  assert.throws(() => f.game.join(pin, 'Caio', 'eagle'), denied(404));
  assert.equal(f.snapshot(b.actor).phase, 'ENDED');
});
test('salas expiram após 24 horas e não aceitam novos participantes', t => {
  const f = fixture(t), a = f.player(), pin = f.game.room(f.room).pin;
  f.advance(86400000); f.game.tick();
  assert.equal(f.snapshot(a.actor).phase, 'ENDED');
  assert.throws(() => f.game.join(pin, 'Bia', 'wolf'), denied(404));
});
