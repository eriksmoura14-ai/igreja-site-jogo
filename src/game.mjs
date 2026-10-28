import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { questions, quizVersion, teams } from './questions.mjs';

export class GameError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new GameError(status, message); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
const DAY = 86_400_000;

// Uma única instância de Node por arquivo SQLite. Transações síncronas serializam
// as mudanças; UNIQUE protege PIN, respostas, lançamentos e recibos no banco.
export class Game {
  constructor(path, { now = Date.now, quiz = questions, countdownMs = 3000, pin = () => String(randomInt(100000, 1000000)) } = {}) {
    this.now = now; this.quiz = quiz; this.countdownMs = countdownMs; this.pin = pin;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, pin TEXT UNIQUE, host_id TEXT NOT NULL REFERENCES accounts(id), state TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, team TEXT NOT NULL, joined INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0, UNIQUE(room_id, name));
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, idx INTEGER NOT NULL, opens INTEGER NOT NULL, deadline INTEGER NOT NULL, closed INTEGER, eligible TEXT NOT NULL, UNIQUE(room_id, idx));
      CREATE TABLE IF NOT EXISTS answers (run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, player_id TEXT NOT NULL REFERENCES players(id), option_id TEXT NOT NULL, received INTEGER NOT NULL, PRIMARY KEY(run_id, player_id));
      CREATE TABLE IF NOT EXISTS points (run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, player_id TEXT NOT NULL REFERENCES players(id), points INTEGER NOT NULL, correct INTEGER NOT NULL, elapsed INTEGER NOT NULL, PRIMARY KEY(run_id, player_id));
      CREATE TABLE IF NOT EXISTS receipts (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, actor TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(room_id, actor, request_id));
      CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, version INTEGER NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS players_room ON players(room_id);
      CREATE INDEX IF NOT EXISTS runs_room ON runs(room_id);
      CREATE INDEX IF NOT EXISTS events_room ON events(room_id, sequence);
    `);
  }
  close() { this.db.close(); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  account(id) { return this.db.prepare('SELECT id, username FROM accounts WHERE id=?').get(id); }
  addAccount(username, password) {
    const id = randomUUID();
    try { this.db.prepare('INSERT INTO accounts VALUES (?, ?, ?)').run(id, username, password); }
    catch (e) { if (e.code?.startsWith('ERR_SQLITE') && this.findAccount(username)) fail(409, 'Este nome de anfitrião já está em uso.'); throw e; }
    return this.account(id);
  }
  findAccount(username) { return this.db.prepare('SELECT * FROM accounts WHERE username=?').get(username); }
  session(accountId) {
    const token = secret();
    this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), accountId, this.now() + 7 * DAY);
    return token;
  }
  authenticateHost(token) {
    const result = this.db.prepare('SELECT account_id FROM sessions WHERE token_hash=? AND expires>?').get(hash(token || ''), this.now());
    if (!result) fail(401, 'Entre na sua conta de anfitrião.');
    return { role: 'host', id: result.account_id };
  }
  logout(token) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token || '')); }
  authenticatePlayer(token, roomId) {
    const player = this.db.prepare('SELECT * FROM players WHERE token_hash=? AND room_id=? AND removed=0').get(hash(token || ''), roomId);
    if (!player) fail(401, 'Sua participação não foi encontrada. Entre com o PIN da sala.');
    return { role: 'player', id: player.id, roomId };
  }
  room(id) {
    const row = this.db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
    if (!row) fail(404, 'Sala não encontrada.');
    return { ...JSON.parse(row.state), hostId: row.host_id, pin: row.pin };
  }
  authorize(room, actor, hostOnly = false) {
    if (!actor || (actor.role === 'host' && actor.id !== room.hostId) || (actor.role === 'player' && (hostOnly || actor.roomId !== room.id))) fail(403, 'Você não tem permissão nesta sala.');
    if (actor.role === 'player' && !this.db.prepare('SELECT id FROM players WHERE id=? AND room_id=? AND removed=0').get(actor.id, room.id)) fail(403, 'Participação removida.');
    if (!['host', 'player'].includes(actor.role)) fail(403, 'Acesso negado.');
  }
  save(room, kind) {
    room.version++;
    const { hostId, pin, ...state } = room;
    this.db.prepare('UPDATE rooms SET state=?, pin=? WHERE id=?').run(JSON.stringify(state), pin, room.id);
    this.db.prepare('INSERT INTO events(room_id, version, kind, created) VALUES (?, ?, ?, ?)').run(room.id, room.version, kind, this.now());
  }
  create(actor) {
    if (actor?.role !== 'host' || !this.account(actor.id)) fail(401, 'Entre como anfitrião.');
    return this.tx(() => {
      if (this.db.prepare('SELECT count(*) AS n FROM rooms WHERE host_id=? AND pin IS NOT NULL').get(actor.id).n >= 5) fail(429, 'Encerre uma sala antes de criar outra.');
      if (this.db.prepare('SELECT count(*) AS n FROM rooms').get().n >= 500) fail(429, 'Limite de salas atingido.');
      let pin;
      for (let i = 0; i < 100; i++) {
        const candidate = this.pin();
        if (!this.db.prepare('SELECT id FROM rooms WHERE pin=?').get(candidate)) { pin = candidate; break; }
      }
      if (!pin) fail(503, 'Não foi possível reservar um PIN. Tente novamente.');
      const room = { id: randomUUID(), hostId: actor.id, pin, phase: 'LOBBY', version: 0, locked: false, index: -1, quizVersion, quiz: this.quiz, countdownAt: null, runId: null, created: this.now() };
      this.db.prepare('INSERT INTO rooms VALUES (?, ?, ?, ?, ?)').run(room.id, pin, actor.id, JSON.stringify(room), this.now() + DAY);
      this.save(room, 'room.created');
      return { roomId: room.id };
    });
  }
  join(pin, name, team) {
    if (!/^\d{6}$/.test(pin || '')) fail(400, 'Digite um PIN de seis números.');
    name = typeof name === 'string' ? name.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 24 || /[\p{Cc}\p{Cf}]/u.test(name)) fail(400, 'Use um nome de 2 a 24 caracteres.');
    if (!teams.some(t => t.id === team)) fail(400, 'Escolha uma das quatro equipes.');
    return this.tx(() => {
      const found = this.db.prepare('SELECT id FROM rooms WHERE pin=? AND expires>?').get(pin, this.now());
      if (!found) fail(404, 'PIN não encontrado ou partida encerrada.');
      const room = this.room(found.id);
      if (room.locked || room.phase !== 'LOBBY') fail(409, 'As entradas estão fechadas. Aguarde uma nova partida.');
      if (this.db.prepare('SELECT count(*) AS n FROM players WHERE room_id=? AND team=? AND removed=0').get(room.id, team).n >= 4) fail(409, 'Equipe completa. Escolha outra equipe.');
      if (this.db.prepare('SELECT id FROM players WHERE room_id=? AND lower(name)=lower(?)').get(room.id, name)) fail(409, 'Este nome já foi usado nesta sala. Escolha outro.');
      const id = randomUUID(), token = secret();
      this.db.prepare('INSERT INTO players(id, room_id, token_hash, name, team, joined) VALUES (?, ?, ?, ?, ?, ?)').run(id, room.id, hash(token), name, team, this.now());
      this.save(room, 'player.joined');
      return { roomId: room.id, playerId: id, token };
    });
  }
  open(room, at) {
    const q = room.quiz[room.index];
    const eligible = this.db.prepare('SELECT id FROM players WHERE room_id=? AND removed=0').all(room.id).map(p => p.id);
    room.runId = randomUUID(); room.phase = 'QUESTION_OPEN';
    this.db.prepare('INSERT INTO runs VALUES (?, ?, ?, ?, ?, NULL, ?)').run(room.runId, room.id, room.index, at, at + q.durationMs, JSON.stringify(eligible));
  }
  finishQuestion(room, at) {
    const run = this.db.prepare('SELECT * FROM runs WHERE id=?').get(room.runId);
    if (!run || run.closed !== null) return;
    const q = room.quiz[room.index];
    for (const answer of this.db.prepare('SELECT * FROM answers WHERE run_id=?').all(run.id)) {
      const correct = Number(answer.option_id === q.correctOptionId);
      this.db.prepare('INSERT INTO points VALUES (?, ?, ?, ?, ?)').run(run.id, answer.player_id, correct ? q.points : 0, correct, answer.received - run.opens);
    }
    this.db.prepare('UPDATE runs SET closed=? WHERE id=? AND closed IS NULL').run(at, run.id);
    room.phase = 'QUESTION_RESULT';
  }
  tick() {
    const changed = [];
    this.tx(() => {
      const at = this.now();
      this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(at);
      // Salas expiram após 24h; resultados autorizados ficam disponíveis por 7 dias.
      this.db.prepare('DELETE FROM rooms WHERE expires<=?').run(at - 7 * DAY);
      for (const row of this.db.prepare('SELECT id, expires FROM rooms WHERE pin IS NOT NULL').all()) {
        const room = this.room(row.id); let dirty = false;
        if (row.expires <= at) { room.phase = 'ENDED'; room.pin = null; room.locked = true; dirty = true; }
        else {
          if (room.phase === 'COUNTDOWN' && room.countdownAt <= at) { this.open(room, room.countdownAt); dirty = true; }
          if (room.phase === 'QUESTION_OPEN') {
            const run = this.db.prepare('SELECT deadline FROM runs WHERE id=?').get(room.runId);
            if (run.deadline <= at) { this.finishQuestion(room, run.deadline); dirty = true; }
          }
        }
        if (dirty) { this.save(room, 'clock.changed'); changed.push(room.id); }
      }
    });
    return changed;
  }
  command(roomId, actor, action, body, receivedAt = this.now()) {
    return this.tx(() => {
      const room = this.room(roomId);
      this.authorize(room, actor, action !== 'answer');
      if (!body || typeof body.requestId !== 'string' || !/^[\w-]{16,80}$/.test(body.requestId)) fail(400, 'Identificador de comando inválido.');
      const fingerprint = hash(JSON.stringify({ action, body }));
      const old = this.db.prepare('SELECT * FROM receipts WHERE room_id=? AND actor=? AND request_id=?').get(roomId, actor.id, body.requestId);
      if (old) {
        if (old.fingerprint !== fingerprint) fail(409, 'Este identificador já foi usado para outro comando.');
        return JSON.parse(old.result);
      }
      let result = { accepted: true };
      if (action === 'answer') {
        if (actor.role !== 'player') fail(403, 'Somente participantes podem responder.');
        if (typeof body.questionRunId !== 'string' || !['A', 'B', 'C', 'D'].includes(body.optionId)) fail(400, 'Alternativa ou pergunta inválida.');
        const run = this.db.prepare('SELECT * FROM runs WHERE id=? AND room_id=?').get(body.questionRunId, roomId);
        const previous = this.db.prepare('SELECT option_id FROM answers WHERE run_id=? AND player_id=?').get(body.questionRunId, actor.id);
        if (previous) {
          if (previous.option_id !== body.optionId) fail(409, 'Sua resposta já foi enviada e não pode ser alterada.');
          const receipt = { accepted: true, hasAnswered: true };
          this.db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?)').run(roomId, actor.id, body.requestId, fingerprint, JSON.stringify(receipt));
          return receipt;
        }
        if (!run || room.phase !== 'QUESTION_OPEN' || room.runId !== run.id || receivedAt < run.opens || receivedAt >= run.deadline || this.now() >= run.deadline || run.closed !== null) fail(409, 'O tempo desta pergunta terminou.');
        if (!JSON.parse(run.eligible).includes(actor.id)) fail(403, 'Você não participa desta pergunta.');
        this.db.prepare('INSERT INTO answers VALUES (?, ?, ?, ?)').run(run.id, actor.id, body.optionId, receivedAt);
        result = { accepted: true, hasAnswered: true };
        const active = JSON.parse(run.eligible).filter(id => this.db.prepare('SELECT id FROM players WHERE id=? AND removed=0').get(id));
        const count = this.db.prepare('SELECT count(*) AS n FROM answers a JOIN players p ON p.id=a.player_id WHERE run_id=? AND p.removed=0').get(run.id).n;
        if (active.length > 0 && count === active.length) this.finishQuestion(room, this.now());
      } else {
        if (body.expectedVersion !== room.version) fail(409, 'A sala foi atualizada. Confira a tela e tente novamente.');
        if (room.phase === 'ENDED' && action !== 'end') fail(409, 'A partida já terminou.');
        if (action === 'start') {
          if (room.phase !== 'LOBBY') fail(409, 'A partida já foi iniciada.');
          if (!this.db.prepare('SELECT id FROM players WHERE room_id=? AND removed=0').get(roomId)) fail(409, 'Espere pelo menos um participante entrar.');
          room.index = 0; room.phase = 'COUNTDOWN'; room.locked = true; room.countdownAt = this.now() + this.countdownMs;
        } else if (action === 'next') {
          if (room.phase === 'QUESTION_RESULT') room.phase = 'LEADERBOARD';
          else if (room.phase === 'LEADERBOARD') {
            if (room.index + 1 === room.quiz.length) { room.phase = 'ENDED'; room.pin = null; room.locked = true; }
            else { room.index++; room.phase = 'COUNTDOWN'; room.countdownAt = this.now() + this.countdownMs; }
          } else fail(409, 'Aguarde o resultado antes de avançar.');
        } else if (action === 'close') {
          if (room.phase !== 'QUESTION_OPEN') fail(409, 'Não há pergunta aberta.');
          this.finishQuestion(room, this.now());
        } else if (action === 'lock') {
          if (room.phase !== 'LOBBY' || typeof body.locked !== 'boolean') fail(409, 'As entradas só podem ser alteradas no lobby.');
          room.locked = body.locked;
        } else if (action === 'remove') {
          if (room.phase !== 'LOBBY' || typeof body.playerId !== 'string') fail(409, 'Remova participantes antes de iniciar.');
          const found = this.db.prepare('UPDATE players SET removed=1 WHERE id=? AND room_id=? AND removed=0').run(body.playerId, roomId);
          if (!found.changes) fail(404, 'Participante não encontrado.');
        } else if (action === 'end') { room.phase = 'ENDED'; room.locked = true; room.pin = null; }
        else fail(404, 'Comando não encontrado.');
      }
      this.save(room, action);
      this.db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?)').run(roomId, actor.id, body.requestId, fingerprint, JSON.stringify(result));
      return result;
    });
  }
  snapshot(roomId, actor) {
    const room = this.room(roomId); this.authorize(room, actor);
    const members = this.db.prepare('SELECT id, name, team FROM players WHERE room_id=? AND removed=0 ORDER BY joined, rowid').all(roomId);
    const ranking = teams.map((team, i) => {
      const totals = this.db.prepare('SELECT coalesce(sum(s.points),0) AS score, coalesce(sum(s.correct),0) AS correct FROM points s JOIN players p ON p.id=s.player_id WHERE p.room_id=? AND p.team=?').get(roomId, team.id);
      return { ...team, ...totals, order: i, count: members.filter(p => p.team === team.id).length };
    }).sort((a, b) => b.score - a.score || b.correct - a.correct || a.order - b.order).map((t, i, all) => ({ ...t, rank: all.findIndex(x => x.score === t.score && x.correct === t.correct) + 1 }));
    const sequence = this.db.prepare('SELECT max(sequence) AS n FROM events WHERE room_id=?').get(roomId).n || 0;
    const view = { roomId, role: actor.role, phase: room.phase, version: room.version, sequence, serverTime: this.now(), locked: room.locked, questionNumber: room.index + 1, totalQuestions: room.quiz.length, teams: ranking, countdownAt: room.countdownAt };
    if (actor.role === 'host') { view.pin = room.pin; view.players = members; }
    else { view.me = members.find(p => p.id === actor.id); }
    view.allowedActions = actor.role === 'player' ? [] : room.phase === 'LOBBY' ? ['start', 'lock', 'remove', 'end'] : room.phase === 'QUESTION_OPEN' ? ['close', 'end'] : ['QUESTION_RESULT', 'LEADERBOARD'].includes(room.phase) ? ['next', 'end'] : room.phase === 'COUNTDOWN' ? ['end'] : [];
    const run = room.runId ? this.db.prepare('SELECT * FROM runs WHERE id=?').get(room.runId) : null;
    if (run && !['LOBBY', 'COUNTDOWN', 'ENDED'].includes(room.phase)) {
      const q = room.quiz[room.index];
      view.question = { runId: run.id, text: q.text, options: q.options, difficulty: q.difficulty, maxPoints: q.points, opensAt: run.opens, deadlineAt: run.deadline };
      if (actor.role === 'host') {
        view.progress = { answered: this.db.prepare('SELECT count(*) AS n FROM answers WHERE run_id=?').get(run.id).n, total: JSON.parse(run.eligible).length };
      } else {
        const answer = this.db.prepare('SELECT option_id FROM answers WHERE run_id=? AND player_id=?').get(run.id, actor.id);
        view.hasAnswered = Boolean(answer); view.selectedOptionId = answer?.option_id || null;
      }
      if (run.closed !== null) {
        view.result = { correctOptionId: q.correctOptionId, reference: q.reference, explanation: q.explanation };
        if (actor.role === 'player') {
          const score = this.db.prepare('SELECT points, correct FROM points WHERE run_id=? AND player_id=?').get(run.id, actor.id);
          view.result.personal = { correct: Boolean(score?.correct), points: score?.points || 0, answered: view.hasAnswered };
        }
      }
    }
    return view;
  }
  myRooms(actor) {
    return this.db.prepare('SELECT id FROM rooms WHERE host_id=? ORDER BY expires DESC LIMIT 20').all(actor.id).map(({ id }) => {
      const room = this.room(id); return { id, pin: room.pin, phase: room.phase, created: room.created };
    });
  }
}
