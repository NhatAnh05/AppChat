import { spawn } from 'node:child_process';
const processes = [
  spawn(process.execPath, ['server/media-server.mjs'], {stdio:'inherit'}),
  spawn(process.execPath, ['server/call-signaling.mjs'], {stdio:'inherit'}),
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run','dev'], {stdio:'inherit', shell: process.platform === 'win32'}),
];
const stop = () => { for (const p of processes) p.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of processes) p.on('exit', (code) => { if (code && code !== 0) {stop(); process.exitCode=code;} });
