#!/usr/bin/env node
// Starts the bridge for the Figma plugin «Entur illustrasjon» (serve.mjs)
// and starts it again when it asks to: after an update changed its code,
// or when the panel's «Start broen på nytt» button asked. Ctrl+C stops it.
//
//   node tools/figma-illustrasjon/bridge/server.mjs

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// serve.mjs exits with this code to be started again.
const RESTART = 75;
const serve = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'serve.mjs',
);

let child = null;
let stopping = false;

function start() {
  child = spawn(process.execPath, [serve], {
    stdio: 'inherit',
    env: { ...process.env, ENTUR_BRIDGE_SUPERVISED: '1' },
  });
  child.on('exit', code => {
    if (!stopping && code === RESTART) {
      console.log('\nStarter broen på nytt …\n');
      start();
    } else process.exit(code ?? 0);
  });
}

// Ctrl+C reaches the bridge as well; this side waits for it to stop.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });

start();
