import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Game } from '../src/game.mjs';
import { createApp } from '../src/server.mjs';

test('presencial: configuração, pontuação idempotente, isolamento e telão', async t => {
  let now = 1000;
  const game = new Game(':memory:', { now: () => now }); t.after(() => game.close());
  const host = { role: 'host', id: game.addAccount('organizador','unused').id };
  const created = game.create(host, { mode: 'presencial' });
  const other = game.create(host, { mode: 'presencial' });
  const snap = () => game.snapshot(created.roomId, host);
  const cmd = (action, extra = {}, actor = host) => game.command(created.roomId, actor, action, { requestId: randomUUID(), expectedVersion: snap().version, ...extra });
  const display = game.authenticateDisplay(created.displayToken, created.roomId);
  assert.throws(() => game.authenticateDisplay(created.displayToken, other.roomId), { status:401 });
  for (const names of [[], ['Um'], ['Um','um'], ['a','Equipe'], ['1','2','3','4','5']]) assert.throws(() => cmd('teams',{names}), {status:400});
  cmd('teams', { names:['Esperança','Fé'] });
  assert.equal(snap().teams.length, 2);
  assert.deepEqual(snap().teams.map(t => t.name), ['Esperança','Fé']);
  const colors = snap().teams.map(t => t.color);
  assert.throws(() => game.join(snap().pin, 'Ana', 'lion'), {status:403});
  assert.throws(() => cmd('start', {}, display), {status:403});
  cmd('start'); now += 3000; game.tick();
  const open = game.snapshot(created.roomId, display);
  assert.equal(open.phase,'QUESTION_OPEN'); assert.equal(open.result,undefined);
  assert.equal(open.players,undefined); assert.equal(open.pin,undefined); assert.deepEqual(open.allowedActions,[]);
  now += 120000; game.tick(); assert.equal(snap().phase,'QUESTION_OPEN');
  assert.throws(() => cmd('award',{teamId:'lion',correct:true,questionRunId:open.question.runId}), {status:409});
  cmd('close');
  assert.equal(game.snapshot(created.roomId, display).result.correctOptionId,'A');
  const payload = {requestId:randomUUID(),expectedVersion:snap().version,teamId:'lion',correct:true,questionRunId:open.question.runId};
  game.command(created.roomId,host,'award',payload); game.command(created.roomId,host,'award',payload);
  cmd('award',{teamId:'lion',correct:true,questionRunId:open.question.runId});
  assert.equal(snap().teams[0].score,1);
  cmd('award',{teamId:'lion',correct:false,questionRunId:open.question.runId}); assert.equal(snap().teams[0].score,0);
  cmd('award',{teamId:'wolf',correct:true,questionRunId:open.question.runId});
  assert.equal(game.snapshot(other.roomId,host).teams[0].score,0);
  cmd('next'); assert.throws(() => cmd('award',{teamId:'lion',correct:true,questionRunId:open.question.runId}), {status:409});
  const rotated = cmd('display');
  assert.throws(() => game.snapshot(created.roomId,display), {status:403});
  assert.throws(() => game.authenticateDisplay(created.displayToken,created.roomId), {status:401});
  assert.equal(game.snapshot(created.roomId,game.authenticateDisplay(rotated.displayToken,created.roomId)).role,'display');
  cmd('end'); assert.equal(snap().teams.find(t => t.id === 'wolf').score,1);
  assert.deepEqual([...snap().teams].sort((a,b) => a.order-b.order).map(t => t.color),colors);
});

test('HTTP presencial: criação padrão, cookie do telão, SSE filtrado e comandos proibidos', async t => {
  const game = new Game(':memory:');
  const server = createApp({game}); await new Promise(r => server.listen(0,'127.0.0.1',r));
  t.after(async () => {server.stopStreams(); server.closeAllConnections(); await new Promise(r=>server.close(r)); game.close();});
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path,data,cookie) => fetch(base+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const auth = await req('/api/auth/register',{username:'presencial',password:'senha-presencial-123'});
  const host = auth.headers.get('set-cookie').split(';')[0];
  const created = await (await req('/api/rooms',{},host)).json(); const path=`/api/rooms/${created.roomId}`;
  const state = await (await req(path+'/snapshot?view=host',null,host)).json(); assert.equal(state.mode,'presencial');
  assert.equal((await req(path+'/snapshot?view=display')).status,401);
  assert.equal((await req(path+'/display-session',{token:'wrong'})).status,401);
  const session = await req(path+'/display-session',{token:created.displayToken});
  assert.equal(session.status,200); assert.match(session.headers.get('set-cookie'),/HttpOnly/);
  const display = session.headers.get('set-cookie').split(';')[0];
  const view = await (await req(path+'/snapshot?view=display',null,display)).json();
  assert.equal(view.displayHash,undefined); assert.equal(view.players,undefined); assert.deepEqual(view.allowedActions,[]);
  for(const role of ['display','host','player']) assert.ok((await req(path+`/commands?view=${role}`,{action:'start',requestId:randomUUID(),expectedVersion:state.version},display)).status>=400);
  const events = await req(path+'/events?view=display',null,display);
  const reader=events.body.getReader(); const frame=new TextDecoder().decode((await reader.read()).value);
  assert.match(frame,/"role":"display"/); assert.equal(frame.includes('displayHash'),false); await reader.cancel();
});

test('presencial: quatro equipes, 50 perguntas e recuperação após reinício', async t => {
  const {mkdtempSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'presencial-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'game.sqlite'); let now=1000; let game=new Game(file,{now:()=>now});
  t.after(()=>game.close());
  const host={role:'host',id:game.addAccount('host','unused').id};
  const {roomId,displayToken}=game.create(host,{mode:'presencial'});
  const snap=()=>game.snapshot(roomId,host);
  const cmd=(action,extra={})=>game.command(roomId,host,action,{requestId:randomUUID(),expectedVersion:snap().version,...extra});
  cmd('teams',{names:['Primeira','Segunda','Terceira','Quarta']});cmd('start');
  for(let i=0;i<50;i++) {
    now+=3000;game.tick(); const run=snap().question.runId;cmd('close');
    cmd('award',{teamId:'lion',correct:true,questionRunId:run});
    if(i===0){game.close();game=new Game(file,{now:()=>now});assert.equal(snap().teams[0].score,1);assert.equal(game.authenticateDisplay(displayToken,roomId).role,'display');}
    cmd('next');cmd('next');
  }
  assert.equal(snap().phase,'ENDED');assert.equal(snap().teams[0].score,50);
  assert.equal(snap().podium[0].name,'Primeira');
});
