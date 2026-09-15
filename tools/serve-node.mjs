import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = process.argv[2];

if (app !== 'api' && app !== 'worker') {
  console.error('usage: node tools/serve-node.mjs <api|worker>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(root, 'dist/apps', app, 'main.js');
const webpackCli = resolve(root, 'node_modules/.bin/webpack-cli');
const children = [];

const mtime = (file) => (existsSync(file) ? statSync(file).mtimeMs : 0);

const spawnChild = (command, args, options) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    ...options,
  });

  children.push(child);
  return child;
};

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const initialMtime = mtime(outfile);
const startedAt = Date.now();

const webpack = spawnChild(
  webpackCli,
  ['build', '--watch', '--config-node-env', 'development'],
  {
    cwd: resolve(root, 'apps', app),
    env: { ...process.env, NODE_ENV: 'development' },
  },
);

webpack.on('exit', (code) => {
  shutdown(code ?? 1);
});

const waitForCompile = async () => {
  while (true) {
    const current = mtime(outfile);
    const elapsed = Date.now() - startedAt;

    if (current !== initialMtime) {
      return;
    }

    // Cached watch compile may not rewrite dist; start from the existing bundle.
    if (current > 0 && elapsed > 1_500) {
      return;
    }

    if (elapsed > 120_000) {
      throw new Error(`Timed out waiting for ${outfile}`);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
};

await waitForCompile();

const node = spawnChild(process.execPath, [
  '--enable-source-maps',
  '--watch',
  '--watch-preserve-output',
  `--watch-path=${resolve(root, 'dist/apps', app)}`,
  outfile,
], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development' },
});

node.on('exit', (code, signal) => {
  if (signal) {
    return;
  }

  if (code && code !== 0) {
    console.error(`[${app}] process exited with code ${code}, waiting for the next compile...`);
  }
});
