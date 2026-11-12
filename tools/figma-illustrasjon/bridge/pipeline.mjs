// One illustration job: style references → the designer's draft from Figma
// → trace in Illustrator with the skill's script. Only tools Entur has
// approved take part: Figma makes the draft, Illustrator traces it.

import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { generationPrompt, reviewBrief } from './prompt.mjs';
import { reviewDraft } from './review.mjs';

const CATEGORIES = {
  animal: ['Animals'],
  person: ['People', 'Entur staff'],
  // The library's hand gestures (Clapping, Thumbs up) are square status
  // motifs built like the objects, with Peach sparkle strokes.
  object: ['Objects', 'Hands'],
  transport: ['Transport'],
};
// Animals and objects share one construction: swelling lines, the backdrop
// disc and paper under each figure (the library binds both to the Animal
// colour variables).
const ANIMAL_BUILT = new Set(['animal', 'object']);
// SKILL.md Step 4b: the references to start from for each kind.
const DEFAULT_REFERENCES = {
  animal: ['Dog', 'Rabbit', 'Squirrel', 'Sheep'],
  person: [
    'Woman holding package',
    'Man checking the time',
    'Man and woman hugging',
    'Woman walking with luggage',
  ],
  object: ['Ticket', 'Calendar', 'Clock', 'Notification'],
  transport: ['Train', 'Bus', 'Tram', 'Boat'],
};

// File names in the library vary (Sheep-darkmode, Kitty_Dark, Hamster_default,
// Dog-1): pick by what the name contains, shortest name first.
function pick(files, { background, mode }) {
  return files
    .filter(file => {
      const n = file.toLowerCase();
      const m = n.includes('contrast')
        ? 'contrast'
        : n.includes('dark')
        ? 'darkmode'
        : 'standard';
      // Objects name the disc version «in circle», «_Circle» or «-circle».
      const disc = n.includes('background') || n.includes('circle');
      return m === mode && disc === background;
    })
    .sort((a, b) => a.length - b.length)[0];
}

function listDir(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

// Newer library motifs that are not in the documentation's downloads yet,
// exported from the Figma Illustration Library into the plugin
// (references/<Category>/<Motif>/PNG). Their ids and paths start with
// «plugin/»; a motif the downloads already have is taken from there.
const PLUGIN_REFERENCES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'references',
);
const PLUGIN = 'plugin/';

// A library path (an id, a thumb or a png) on disk, or null outside both.
export function libraryFile(libraryDir, rel) {
  const [root, inner] = rel.startsWith(PLUGIN)
    ? [PLUGIN_REFERENCES, rel.slice(PLUGIN.length)]
    : [path.resolve(libraryDir), rel];
  const file = path.resolve(root, inner);
  return file.startsWith(root + path.sep) ? file : null;
}

export function listReferences(libraryDir, kind) {
  const motifs = [];
  const seen = new Set();
  for (const [root, prefix] of [
    [libraryDir, ''],
    [PLUGIN_REFERENCES, PLUGIN],
  ]) {
    for (const category of CATEGORIES[kind] || []) {
      for (const motif of listDir(path.join(root, category)).sort()) {
        if (seen.has(`${category}/${motif}`)) continue;
        const pngDir = path.join(root, category, motif, 'PNG');
        const pngs = listDir(pngDir).filter(f => f.endsWith('.png'));
        const plain = pick(pngs, { background: false, mode: 'standard' });
        if (!plain) continue;
        seen.add(`${category}/${motif}`);
        const withDisc = pick(pngs, { background: true, mode: 'standard' });
        motifs.push({
          id: `${prefix}${category}/${motif}`,
          name: category === 'Entur staff' ? `${motif} staff` : motif,
          category,
          isNew: Boolean(prefix),
          thumb: `${prefix}${category}/${motif}/PNG/${plain}`,
          png: `${prefix}${category}/${motif}/PNG/${
            ANIMAL_BUILT.has(kind) && withDisc ? withDisc : plain
          }`,
          isDefault: DEFAULT_REFERENCES[kind].includes(motif),
        });
      }
    }
  }
  // The newest motifs first, so the panel shows them without scrolling.
  return motifs.sort((a, b) => b.isNew - a.isNew);
}

// The library's three SVG modes of a motif, for comparison in Figma; null
// when the motif has no SVGs (the plugin's own references are PNG only).
function librarySvgs(libraryDir, id, background) {
  const dir = path.join(libraryFile(libraryDir, id) || '', 'SVG');
  const svgs = listDir(dir).filter(f => f.endsWith('.svg'));
  const out = {};
  for (const mode of ['standard', 'darkmode', 'contrast']) {
    const file =
      pick(svgs, { background, mode }) ||
      pick(svgs, { background: !background, mode });
    if (!file) return null;
    out[mode] = cleanSvg(fs.readFileSync(path.join(dir, file), 'latin1'));
  }
  return out;
}

// Illustrator's export carries an XML prolog and XMP metadata Figma does not need.
function cleanSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
    .trim();
}

// Words left out when the name comes from the description.
const FILLER = /^(en|et|ei|som|og|i|på|a|an|the|that|who|and|in|on)$/i;

function safeName(name, scene) {
  const words = scene.split(/\s+/).filter(w => !FILLER.test(w));
  const base = (name || words.slice(0, 3).join(' '))
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/Æ/g, 'Ae')
    .replace(/Ø/g, 'O')
    .replace(/Å/g, 'A')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return base || 'Illustrasjon';
}

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);
}

// The trace script decodes 8-bit RGB(A), non-interlaced PNGs only (for the underlay mask).
function traceablePng(bytes) {
  const sig = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== sig) return false;
  const depth = bytes[24];
  const type = bytes[25];
  const interlace = bytes[28];
  return depth === 8 && (type === 2 || type === 6) && interlace === 0;
}

function sipsToPng(input, output, maxSize) {
  const args = ['-s', 'format', 'png'];
  if (maxSize) args.push('-Z', String(maxSize));
  execFileSync('sips', [...args, input, '--out', output], { stdio: 'ignore' });
}

// A draft with a transparent background traces as one dark square: Image
// Trace reads clear pixels as black. Composite it on white first. sips
// decodes to a 32-bit BMP, so no PNG decoder is needed; the result is
// written as an 8-bit RGB PNG.
function flattenOnWhite(file, dir) {
  const png = fs.readFileSync(file);
  if (png[25] !== 4 && png[25] !== 6) return false;
  const bmpFile = path.join(dir, 'utkast-rgba.bmp');
  execFileSync('sips', ['-s', 'format', 'bmp', file, '--out', bmpFile], {
    stdio: 'ignore',
  });
  const b = fs.readFileSync(bmpFile);
  fs.rmSync(bmpFile);
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const hr = b.readInt32LE(22);
  const bytes = b.readUInt16LE(28) / 8;
  const h = Math.abs(hr);
  const stride = Math.ceil((w * bytes) / 4) * 4;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = hr > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const p = off + row * stride + x * bytes;
      const a = bytes === 4 ? b[p + 3] / 255 : 1;
      const q = y * (w * 3 + 1) + 1 + x * 3;
      raw[q] = Math.round(b[p + 2] * a + 255 * (1 - a));
      raw[q + 1] = Math.round(b[p + 1] * a + 255 * (1 - a));
      raw[q + 2] = Math.round(b[p] * a + 255 * (1 - a));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
  return true;
}

// A Linje draft is mostly white or transparent paper and a pale disc; a photo
// has almost none. Measured on a 64 px BMP from sips, which needs no PNG decoder.
function paperShare(file, dir) {
  const bmp = path.join(dir, 'kontroll.bmp');
  execFileSync(
    'sips',
    ['-s', 'format', 'bmp', '-Z', '64', file, '--out', bmp],
    {
      stdio: 'ignore',
    },
  );
  const b = fs.readFileSync(bmp);
  fs.rmSync(bmp);
  const offset = b.readUInt32LE(10);
  const width = b.readInt32LE(18);
  const height = Math.abs(b.readInt32LE(22));
  const bytes = b.readUInt16LE(28) / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  let paper = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = offset + y * stride + x * bytes;
      const clear = bytes === 4 && b[i + 3] < 20;
      if (clear || (b[i] >= 225 && b[i + 1] >= 225 && b[i + 2] >= 225)) paper++;
    }
  return paper / (width * height);
}

function checkDraft(file, dir) {
  const out = execFileSync(
    'sips',
    ['-g', 'pixelWidth', '-g', 'pixelHeight', file],
    {
      encoding: 'utf8',
    },
  );
  const [w, h] = [/pixelWidth: (\d+)/, /pixelHeight: (\d+)/].map(r =>
    Number(out.match(r)[1]),
  );
  if (Math.abs(w / h - 1) > 0.05)
    throw new Error(
      `Utkastet er ${w} × ${h} px. Tracen trenger et kvadratisk utkast, ellers blir motivet strukket.`,
    );
  if (paperShare(file, dir) < 0.3)
    throw new Error(
      'Bildet ser ut som et foto, ikke et strekutkast i Linje-stil. Lag utkastet i Figma med prompten først, og spor det.',
    );
}

export function illustratorRunning(app) {
  try {
    execFileSync('pgrep', ['-f', `${app}/Contents/MacOS/`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function loadReferences(config, kind, ids) {
  const all = listReferences(config.libraryDir, kind);
  const chosen = ids?.length
    ? ids
    : all.filter(m => m.isDefault).map(m => m.id);
  const references = chosen
    .map(id => all.find(m => m.id === id))
    .filter(Boolean)
    .slice(0, 4)
    .map(m => ({
      ...m,
      bytes: fs.readFileSync(libraryFile(config.libraryDir, m.png)),
    }));
  if (references.length < 2) throw new Error('Velg minst to stilreferanser');
  return references;
}

export function figmaPrompt(config, { kind, description, peach }) {
  return generationPrompt(config.skillDir, {
    kind,
    scene: description,
    peach,
    references: false,
  });
}

// One review of a draft made outside the bridge (Figma's image generation):
// the edit prompt is for a tool that takes the draft alone.
export async function reviewOnce(config, input) {
  if (!config.anthropicApiKey)
    throw new Error('Anthropic-nøkkelen mangler i config-fila');
  if (!input.image?.data) throw new Error('Legg ved utkastet');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entur-illustrasjon-'));
  try {
    const original = path.join(tmp, 'utkast');
    fs.writeFileSync(original, Buffer.from(input.image.data, 'base64'));
    const png = path.join(tmp, 'utkast.png');
    sipsToPng(original, png, 2048);
    const verdict = await reviewDraft({
      apiKey: config.anthropicApiKey,
      baseUrl: config.anthropicBaseUrl,
      model: config.reviewModel,
      brief: reviewBrief(config.skillDir),
      kind: input.kind,
      scene: input.description,
      references: loadReferences(config, input.kind, input.references),
      draft: fs.readFileSync(png),
      draftOnly: true,
    });
    return verdict;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export async function runJob(job, config) {
  const { input } = job;
  const ctx = {
    log: message => job.log.push({ t: Date.now(), message }),
    step: (key, state, detail) => {
      job.steps[key] = { state, detail };
    },
    check: () => {
      if (job.abort.signal.aborted) throw new Error('Avbrutt');
    },
  };
  const { log, step, check } = ctx;

  const name = safeName(input.name, input.description);
  const dir = path.join(config.outputDir, `${name}-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  job.name = name;
  job.dir = dir;
  log(`Mappe: ${dir}`);

  // 1. Style references
  step('references', 'running');
  const references = loadReferences(config, input.kind, input.references);
  step('references', 'done', references.map(r => r.name).join(', '));

  // 2. The draft the designer made with Figma's image generation, traced as it is.
  if (!input.image?.data) throw new Error('Legg ved utkastet som skal spores');
  const ext = (input.image.mime || 'image/png')
    .split('/')[1]
    .replace('jpeg', 'jpg');
  const original = path.join(dir, `bilde-original.${ext}`);
  fs.writeFileSync(original, Buffer.from(input.image.data, 'base64'));
  const png = path.join(dir, 'bilde.png');
  sipsToPng(original, png);
  if (flattenOnWhite(png, dir))
    log('Utkastet hadde gjennomsiktig bakgrunn: lagt på hvitt før tracen');
  checkDraft(png, dir);
  const draft = fs.readFileSync(png);
  saveDraft(job, dir, draft, 'Utkast fra Figma');
  step('draft', 'done', 'fra Figma');

  // 3. Trace
  check();
  check();
  await trace(job, config, ctx, { dir, name, draft });

  // 4. Check the trace against the draft: nothing lost, nothing added.
  check();
  job.check = await checkTrace(job, config, ctx, { dir, name });

  const read = suffix =>
    cleanSvg(fs.readFileSync(path.join(dir, `${name}${suffix}.svg`), 'latin1'));
  job.result = {
    name,
    kind: input.kind,
    dir,
    ai: path.join(dir, `${name}.ai`),
    svgs: {
      standard: read(''),
      darkmode: read('-darkmode'),
      contrast: read('-contrast'),
    },
    // The first chosen reference that has the three SVG modes.
    compare: input.compare
      ? references
          .map(r => ({
            name: r.name,
            svgs: librarySvgs(
              config.libraryDir,
              r.id,
              ANIMAL_BUILT.has(input.kind),
            ),
          }))
          .find(c => c.svgs) || null
      : null,
  };
  fs.writeFileSync(
    path.join(dir, 'jobb.json'),
    `${JSON.stringify(
      {
        input: { ...input, image: input.image ? '(bilde)' : null },
        references: references.map(r => r.png),
        log: job.log,
      },
      null,
      2,
    )}\n`,
  );
}

// The skill's trace-check.mjs compares the traced SVG with the draft and
// lists what went missing or was added, with a picture of where. An older
// skill without the script only skips the step.
async function checkTrace(job, config, { step, log }, { dir, name }) {
  const script = path.join(config.skillDir, 'scripts', 'trace-check.mjs');
  if (!fs.existsSync(script)) {
    step('check', 'skipped');
    log('Sjekk mot utkastet: skillen har ikke trace-check.mjs ennå');
    return null;
  }
  step('check', 'running');
  const draftFile = path.join(dir, 'utkast-endelig.png');
  const svg = path.join(dir, `${name}.svg`);
  // Strips an object's trace turns to paper on purpose are not missing tint.
  const args = [script, draftFile, svg, '--out', dir, '--json'];
  if (job.input.kind === 'object') args.push('--object');
  if (job.input.kind === 'transport') args.push('--vehicle');
  try {
    const out = await new Promise((resolve, reject) =>
      execFile(
        process.execPath,
        args,
        { timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) =>
          error
            ? reject(new Error(stderr.trim() || error.message))
            : resolve(stdout),
      ),
    );
    const report = JSON.parse(out.trim().split('\n').pop());
    const n = report.findings.length;
    step('check', 'done', n ? `${n} avvik` : 'ingen avvik');
    log(`Sjekk mot utkastet: ${n ? `${n} avvik` : 'ingen avvik'}`);
    return report;
  } catch (error) {
    // The check helps; it never stops a finished trace.
    step('check', 'failed', error.message.slice(0, 200));
    log(`Sjekk mot utkastet feilet: ${error.message.slice(0, 300)}`);
    return null;
  }
}

async function trace(job, config, { step, log }, { dir, name, draft }) {
  const { input } = job;
  step('trace', 'running', 'Illustrator');
  let draftFile = path.join(dir, 'utkast-endelig.png');
  fs.writeFileSync(draftFile, draft);
  let underlay = ANIMAL_BUILT.has(input.kind);
  if (!traceablePng(draft)) {
    const converted = path.join(dir, 'utkast-endelig-rgb.png');
    sipsToPng(draftFile, converted);
    draftFile = converted;
    if (!traceablePng(fs.readFileSync(converted))) {
      underlay = false;
      log('Utkastet er ikke en 8-bit RGB-PNG: sporer uten papirunderlag');
    }
  }
  const script = path.join(config.skillDir, 'scripts', 'illustrator-trace.mjs');
  const args = [
    script,
    draftFile,
    '--out',
    dir,
    '--name',
    name,
    '--app',
    config.illustratorApp,
  ];
  if (ANIMAL_BUILT.has(input.kind)) {
    args.push('--construction', 'animals');
    // An object has no eyes or nose, so its dark dots stay plain ink, and
    // the disc showing through its gaps and empty rings gets no tint.
    // --no-features stays for a skill from before --object.
    if (input.kind === 'object') args.push('--object', '--no-features');
    // Off for a draft with no disc behind the motif, as some library
    // animals and objects are drawn.
    if (input.backdrop !== false) args.push('--backdrop');
    if (underlay) args.push('--underlay');
    if (config.carriersFile && fs.existsSync(config.carriersFile))
      args.push('--carriers', config.carriersFile);
    else log('Ingen carriers-fil: linjene får ikke breddeprofil');
  }
  // A vehicle: the body gets paper under it, and the dark file gets the
  // library's vehicle and window colours. An older skill ignores the flag.
  if (input.kind === 'transport') args.push('--vehicle');
  await runTrace(job, args, log);
  step('trace', 'done');
}

function saveDraft(job, dir, bytes, label) {
  const n = job.drafts.length + 1;
  const file = path.join(dir, `utkast-${n}.png`);
  fs.writeFileSync(file, bytes);
  job.drafts.push({ n, label, file });
}

function runTrace(job, args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const onAbort = () => child.kill();
    job.abort.signal.addEventListener('abort', onAbort, { once: true });
    let stderr = '';
    child.stdout.on('data', chunk => {
      for (const line of String(chunk).split('\n'))
        if (line.trim()) log(`Trace: ${line.trim().slice(0, 300)}`);
    });
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => {
      job.abort.signal.removeEventListener('abort', onAbort);
      if (job.abort.signal.aborted) reject(new Error('Avbrutt'));
      else if (code === 0) resolve();
      else reject(new Error(traceError(stderr, code)));
    });
  });
}

// osascript's message, and the line of the trace script's ExtendScript that
// failed, are the useful part of its stack trace.
function traceError(stderr, code) {
  if (/-1712/.test(stderr))
    return 'Illustrator brukte mer enn 30 minutter, og trace-scriptet ga opp. Lukk store dokumenter i Illustrator og prøv igjen; det som ble ferdig, ligger i mappa.';
  const message = stderr.match(/execution error: ([^\r\n]*)/)?.[1];
  const line = stderr.match(/Line: (\d+)/)?.[1];
  const source = stderr.match(/->\s*([^\r\n]*)/)?.[1] || '';
  const hint = /\bdisc\b|\bring\b|\brim\b|cleared|backdrop/i.test(source)
    ? '. Feilen kom i steget for bakgrunnssirkelen. Har utkastet ingen sirkel bak dyret, slå av Bakgrunnssirkel og prøv igjen.'
    : '';
  return `Trace feilet i Illustrator${
    line ? ` (linje ${line} i trace-scriptet)` : ` (kode ${code})`
  }: ${message || stderr.trim().slice(-400)}${hint}`;
}

export function illustratorDocuments(app) {
  return new Promise(resolve => {
    execFile(
      'osascript',
      ['-e', `tell application ${JSON.stringify(app)} to count documents`],
      { timeout: 4000 },
      (error, stdout) => resolve(error ? null : Number(stdout.trim())),
    );
  });
}
