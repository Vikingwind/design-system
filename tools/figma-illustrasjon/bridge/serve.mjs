#!/usr/bin/env node
// Local bridge for the Figma plugin «Entur illustrasjon». Listens on
// 127.0.0.1 only, runs one job at a time. macOS, Node 24, no dependencies.
// Started by server.mjs, which starts it again when it exits with RESTART:
//
//   node tools/figma-illustrasjon/bridge/server.mjs

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { configFile, loadConfig } from './config.mjs';
import {
  figmaPrompt,
  illustratorDocuments,
  illustratorRunning,
  listReferences,
  reviewOnce,
  runJob,
} from './pipeline.mjs';

// The panel compares this with its own BRIDGE_VERSION (ui.html) and asks
// for a restart when an older bridge is still running. Bump both together
// when the panel and the bridge change what they send each other.
const VERSION = 7;
// server.mjs starts the bridge again when it exits with this code.
const RESTART = 75;
const supervised = process.env.ENTUR_BRIDGE_SUPERVISED === '1';
const MAX_BODY = 40 * 1024 * 1024;
const jobs = new Map();
let active = null;

async function status(config) {
  const traceScript = path.join(
    config.skillDir,
    'scripts',
    'illustrator-trace.mjs',
  );
  const running = illustratorRunning(config.illustratorApp);
  return {
    bridge: 'entur-illustrasjon',
    version: VERSION,
    platform: process.platform,
    skill: fs.existsSync(traceScript),
    library: fs.existsSync(config.libraryDir),
    illustrator: fs.existsSync(config.illustratorApp),
    illustratorRunning: running,
    // Asking a tracing Illustrator would wait for the trace to finish.
    illustratorDocuments:
      running && !active
        ? await illustratorDocuments(config.illustratorApp)
        : null,
    carriers: Boolean(
      config.carriersFile && fs.existsSync(config.carriersFile),
    ),
    anthropicKey: Boolean(config.anthropicApiKey),
    reviewModel: config.reviewModel,
    busy: Boolean(active),
  };
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function paired(req, config) {
  const given = Buffer.from(
    String(req.headers['x-bridge-code'] || '').toUpperCase(),
  );
  const expected = Buffer.from(config.pairingCode);
  return (
    given.length === expected.length && crypto.timingSafeEqual(given, expected)
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('For stor forespørsel'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function publicJob(job) {
  return {
    id: job.id,
    state: job.state,
    name: job.name,
    dir: job.dir,
    steps: job.steps,
    log: job.log.slice(-40),
    drafts: job.drafts.map(({ n, label }) => ({ n, label })),
    error: job.error,
    result: job.state === 'done' ? job.result : null,
    check:
      job.state === 'done' && job.check
        ? { ok: job.check.ok, findings: job.check.findings }
        : null,
  };
}

async function startJob(input, config) {
  if (active)
    throw Object.assign(new Error('En jobb kjører allerede'), { code: 409 });
  if (!['animal', 'person', 'object', 'transport'].includes(input.kind))
    throw Object.assign(new Error('Velg dyr, person, objekt eller transport'), {
      code: 400,
    });
  if (!input.image?.data)
    throw Object.assign(new Error('Legg ved utkastet fra Figma'), {
      code: 400,
    });
  if (!String(input.description || '').trim() && !input.name)
    throw Object.assign(new Error('Skriv en kort beskrivelse eller et navn'), {
      code: 400,
    });
  const job = {
    id: crypto.randomUUID(),
    state: 'running',
    input,
    steps: {},
    log: [],
    drafts: [],
    abort: new AbortController(),
  };
  jobs.set(job.id, job);
  active = job;
  runJob(job, config)
    .then(() => (job.state = 'done'))
    .catch(error => {
      job.state = job.abort.signal.aborted ? 'cancelled' : 'failed';
      job.error = error.message;
      for (const step of Object.values(job.steps))
        if (step.state === 'running') step.state = 'failed';
      console.error(`[${job.id.slice(0, 8)}] ${error.stack || error.message}`);
    })
    .finally(() => {
      active = null;
      console.log(`[${job.id.slice(0, 8)}] ${job.state}`);
      restartIfPending();
    });
  return job;
}

async function handle(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Code',
      'Access-Control-Max-Age': '600',
      ...(req.headers['access-control-request-private-network']
        ? { 'Access-Control-Allow-Private-Network': 'true' }
        : {}),
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (url.pathname === '/api/status')
      return send(res, 200, {
        bridge: 'entur-illustrasjon',
        version: VERSION,
        configError: error.message,
      });
    throw error;
  }
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/api/status')
    return send(res, 200, {
      ...(await status(config)),
      paired: paired(req, config),
    });

  // Library PNGs are public on linje.entur.no; served without the code so <img> can load them.
  if (parts[0] === 'api' && parts[1] === 'library' && req.method === 'GET') {
    const rel = decodeURIComponent(parts.slice(2).join('/'));
    const file = path.resolve(config.libraryDir, rel);
    if (
      !file.startsWith(path.resolve(config.libraryDir) + path.sep) ||
      !file.endsWith('.png') ||
      !fs.existsSync(file)
    )
      return send(res, 404, { error: 'Fant ikke bildet' });
    res.setHeader('Cache-Control', 'max-age=3600');
    return send(res, 200, fs.readFileSync(file), 'image/png');
  }

  if (!paired(req, config))
    return send(res, 401, { error: 'Feil eller manglende parkode' });

  if (url.pathname === '/api/references' && req.method === 'GET')
    return send(
      res,
      200,
      listReferences(config.libraryDir, url.searchParams.get('kind')),
    );

  const json = String(req.headers['content-type']).startsWith(
    'application/json',
  );

  if (url.pathname === '/api/prompt' && req.method === 'POST' && json) {
    const input = JSON.parse(await readBody(req));
    return send(res, 200, { prompt: figmaPrompt(config, input) });
  }

  if (url.pathname === '/api/review' && req.method === 'POST' && json) {
    const input = JSON.parse(await readBody(req));
    return send(res, 200, await reviewOnce(config, input));
  }

  if (url.pathname === '/api/restart' && req.method === 'POST') {
    if (!supervised)
      return send(res, 409, {
        error:
          'Broen er startet uten server.mjs. Start den på nytt i Terminal med node tools/figma-illustrasjon/bridge/server.mjs.',
      });
    if (active)
      return send(res, 409, {
        error: 'En jobb kjører. Prøv igjen når den er ferdig.',
      });
    send(res, 200, { restarting: true });
    restartSoon('pluginen ba om det');
    return;
  }

  if (url.pathname === '/api/jobs' && req.method === 'POST') {
    if (!String(req.headers['content-type']).startsWith('application/json'))
      return send(res, 415, { error: 'Forventet JSON' });
    const input = JSON.parse(await readBody(req));
    const job = await startJob(input, config);
    return send(res, 202, publicJob(job));
  }

  const job =
    parts[0] === 'api' && parts[1] === 'jobs' ? jobs.get(parts[2]) : null;
  if (parts[1] === 'jobs' && !job)
    return send(res, 404, { error: 'Fant ikke jobben' });

  if (job && parts.length === 3 && req.method === 'GET')
    return send(res, 200, publicJob(job));

  if (job && parts[3] === 'cancel' && req.method === 'POST') {
    job.abort.abort();
    return send(res, 200, publicJob(job));
  }

  // Opens the job's own .ai file in the configured Illustrator. The path comes
  // from the job, never from the request.
  if (job && parts[3] === 'open' && req.method === 'POST') {
    const file = job.state === 'done' ? job.result.ai : null;
    if (!file || !fs.existsSync(file))
      return send(res, 404, { error: 'Fant ikke Illustrator-fila' });
    await new Promise((resolve, reject) =>
      execFile('open', ['-a', config.illustratorApp, file], error =>
        error ? reject(error) : resolve(),
      ),
    );
    return send(res, 200, { opened: file });
  }

  if (job && parts[3] === 'check' && req.method === 'GET') {
    const picture = job.check?.picture;
    if (!picture || !fs.existsSync(picture))
      return send(res, 404, { error: 'Ingen sjekk for jobben' });
    return send(res, 200, fs.readFileSync(picture), 'image/png');
  }

  if (job && parts[3] === 'drafts' && req.method === 'GET') {
    const draft = job.drafts.find(d => d.n === Number(parts[4]));
    if (!draft) return send(res, 404, { error: 'Fant ikke utkastet' });
    return send(res, 200, fs.readFileSync(draft.file), 'image/png');
  }

  return send(res, 404, { error: 'Ukjent adresse' });
}

const config = loadConfig();
const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    // A system error carries a string code (ENOENT); only our own errors
    // carry an HTTP status.
    if (!res.headersSent)
      send(res, Number.isInteger(error.code) ? error.code : 500, {
        error: error.message,
      });
    else res.end();
  });
});

// After an update the bridge's own code changes on disk: start it again so
// the panel and the bridge speak the same version. A running job finishes
// first.
let restartPending = null;
function restartSoon(reason) {
  if (!supervised) {
    console.log(
      `Broens kode er endret (${reason}). Stopp med Ctrl+C og start den på nytt.`,
    );
    return;
  }
  restartPending = reason;
  restartIfPending();
}
function restartIfPending() {
  if (!restartPending || active) return;
  console.log(`Starter på nytt: ${restartPending}`);
  setTimeout(() => process.exit(RESTART), 150);
}
let changeTimer = null;
fs.watch(path.dirname(fileURLToPath(import.meta.url)), (event, file) => {
  if (!file || !file.endsWith('.mjs')) return;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => restartSoon('koden er oppdatert'), 800);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} er opptatt: broen kjører trolig allerede i et annet vindu. Bruk den, eller stopp den med Ctrl+C der og start på nytt.`,
    );
    process.exit(1);
  }
  throw error;
});

server.listen(config.port, '127.0.0.1', async () => {
  const s = await status(config);
  const yes = ok => (ok ? 'ja' : 'NEI');
  console.log(
    `Entur illustrasjon – bro v${VERSION} på http://localhost:${config.port}`,
  );
  console.log(`Config:   ${configFile}`);
  console.log(
    `Parkode:  ${config.pairingCode}  (lim inn i pluginen første gang)`,
  );
  console.log(`Skill:    ${config.skillDir}  ${yes(s.skill)}`);
  console.log(
    `Bibliotek:${' '}${yes(s.library)}   Illustrator: ${yes(
      s.illustrator,
    )} (kjører: ${yes(s.illustratorRunning)}, åpne dokumenter: ${
      s.illustratorDocuments ?? '?'
    })`,
  );
  console.log(
    `Carriers: ${config.carriersFile || '(ikke satt)'}  ${yes(s.carriers)}`,
  );
  if (s.anthropicKey)
    console.log(
      'Anthropic-nøkkel: ja (vurdering over API-et, utenom godkjente verktøy)',
    );
  if (process.platform !== 'darwin')
    console.log('Advarsel: tracen krever macOS og Illustrator.');
});
