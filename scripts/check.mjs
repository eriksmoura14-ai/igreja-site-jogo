import { spawnSync } from 'node:child_process';
for (const file of ['src/questions.mjs', 'src/game.mjs', 'src/server.mjs', 'public/app.js', 'public/motion.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Sintaxe validada. Execute npm test para validar motor e HTTP.');
