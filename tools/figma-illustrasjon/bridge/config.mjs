import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');

// Outside the repository, so an API key can never be committed with the plugin.
export const configDir =
  process.env.ENTUR_ILLUSTRASJON_CONFIG_DIR ||
  path.join(os.homedir(), '.config', 'entur-illustrasjon');
export const configFile = path.join(configDir, 'config.json');

const DEFAULTS = {
  port: 7317,
  outputDir: path.join(os.homedir(), 'Documents', 'Entur-illustrasjoner'),
  skillDir: path.join(repoRoot, 'skills', 'entur-illustration'),
  libraryDir: path.join(
    repoRoot,
    'apps',
    'documentation',
    'src',
    'downloads',
    'illustrations',
  ),
  illustratorApp: '/Applications/Adobe Illustrator 2026/Adobe Illustrator.app',
  carriersFile: '',
  anthropicApiKey: '',
  anthropicBaseUrl: 'https://api.anthropic.com',
  reviewModel: 'claude-opus-5-5',
  pairingCode: '',
};

// The keys the user edits, written to a new config file with empty values.
const TEMPLATE_KEYS = [
  'anthropicApiKey',
  'carriersFile',
  'outputDir',
  'skillDir',
  'illustratorApp',
  'pairingCode',
];

function newPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function readFile() {
  if (!fs.existsSync(configFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (error) {
    throw new Error(`Config-fila er ikke gyldig JSON (${error.message})`);
  }
}

function writeFile(data) {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configFile, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(configFile, 0o600);
}

// Creates the config file on first run and gives it a pairing code; the
// file is read again for every job, so edits apply without a restart.
export function loadConfig() {
  let stored = readFile();
  if (!stored) {
    stored = Object.fromEntries(TEMPLATE_KEYS.map(key => [key, DEFAULTS[key]]));
  }
  if (!stored.pairingCode) {
    stored.pairingCode = newPairingCode();
    writeFile(stored);
  }
  const config = { ...DEFAULTS, ...stored };
  config.anthropicApiKey ||= process.env.ANTHROPIC_API_KEY || '';
  for (const key of ['outputDir', 'skillDir', 'libraryDir', 'carriersFile'])
    if (config[key]) config[key] = expandHome(config[key]);
  return config;
}

function expandHome(p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}
