import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const npmCli = process.env.npm_execpath;
const canRunNpmCli = Boolean(npmCli && existsSync(npmCli));
const children = [];
let shuttingDown = false;

function start(label, scriptArgs) {
  const child = canRunNpmCli
    ? spawn(process.execPath, [npmCli, ...scriptArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })
    : spawn(
        process.platform === 'win32' ? `npm ${scriptArgs.join(' ')}` : 'npm',
        process.platform === 'win32' ? [] : scriptArgs,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
          shell: process.platform === 'win32',
        },
      );
  const prefix = `[${label}]`;
  const forward = (stream, target) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) target.write(`${prefix} ${line}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix} exited with code ${code ?? 'unknown'}`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.killed) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 150);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('TeamAI control plane starting…');
console.log('  API   http://127.0.0.1:4310');
console.log('  Web   http://127.0.0.1:5173');
start('api', ['run', 'dev', '-w', '@teamai/server']);
start('web', ['run', 'dev', '-w', '@teamai/web']);
