// Entur illustrasjon – prototype
// The UI talks to the local bridge; this side reads the selected image and
// places the traced SVGs as one frame per colour mode.

// palette.md: the surface each mode is drawn for.
const SURFACES = {
  standard: '#FFFFFF',
  darkmode: '#08091C',
  contrast: '#181C56',
};
const MODES = ['standard', 'darkmode', 'contrast'];

// The Illustration Library binds every colour to the variables in the
// collection "Illustration colors" (library Tokens-Illustration colors),
// which has a Light and a Dark mode. Standard and darkmode frames use the
// Standard variables, contrast the Contrast ones, and darkmode is the Dark
// mode, so a frame switches colours like a library component.
const LIBRARY = 'Tokens-Illustration colors';
const VARIABLE_KEYS = {
  'Animal/Standard/Line/Body': 'c4a3807746623384338234bebb55158d26254a9d',
  'Animal/Standard/Fill/Body': '86ea167577c9d57b36ddf8864a05713d13853766',
  'Animal/Standard/Fill/BodyShadow': 'fdcb539b577d320c90b770d52a47e880a99a0207',
  'Animal/Standard/Fill/Circle': 'cb61bb02ccb4114070b6fc9bae018ea0baa9aca4',
  'Animal/Standard/Fill/Highlight': 'c33b7e2226821c5f9e051ecfced183fb0cd6d9a4',
  'Animal/Contrast/Line/Body': '19256c8d16feaa57cdd7275bfb31041b82b8d281',
  'Animal/Contrast/Fill/Body': '2b4ac057bb2a0926839cf3a83f2e78566a2f8fef',
  'Animal/Contrast/Fill/BodyShadow': '5979d4ddce9a996d395bd5bb3bba3e12025dc8d5',
  'Animal/Contrast/Fill/Circle': '6466b65d71ed0e209f51bebcf04ac3b21b68740a',
  'Animal/Contrast/Fill/Highlight': '3ca2026fcd0f6d69c337608f97ff3c164d204de3',
  'People/Standard/Line/Default': '191e2d6aa67d3210f825d79a58e3a9ad0b98df54',
  'People/Standard/Fill/Default': '3d6e2615479d714ec058eae3ba2e4ab87835f68f',
  'People/Standard/Fill/Skin': '98b0fc4b0699fad3bf56cacc5366fc2f2031d361',
  'People/Standard/Fill/Highlight 1':
    'fa2fef38c1fc97bb04dde3a9dd8cbe37d7f83f18',
  'People/Standard/Fill/Highlight 2':
    '855806aab5ac92ca907feb6ee60e673b6de4ef06',
  'People/Standard/Fill/Highlight 3':
    'e6d4ef9ade0472110b9d84a259e5ee08e016ea66',
  'People/Contrast/Line/Default': 'd76a431b54f0acf20903a67ccbf4d01f1f18d04a',
  'People/Contrast/Fill/Default': '623a7dedbb47ce44b7f26940f359ad583cde6c03',
  'People/Contrast/Fill/Skin': '786a109a0f749d6d2b9363f1b2e0a805305c332b',
  'People/Contrast/Fill/Highlight 1':
    'de64f4e7666bdcb18c130786f6eb0b4c3f3cd971',
  'People/Contrast/Fill/Highlight 2':
    '9d2142dc548e4b3041701bc87af60ecca1190f2b',
  'People/Contrast/Fill/Highlight 3':
    'a604c2de4bf3ae53750f44f84ad785ee4940d136',
};
// The traced colours per mode (the skill's palette.md), standard first.
const PALETTE = {
  ink: ['#181C56', '#5E5F6C', '#626493'],
  paper: ['#FFFFFF', '#F2F2F5', '#FFFFFF'],
  tint: ['#EAEAF1', '#B3B4BD', '#BCBDD2'],
  lavender: ['#AEB7E2', '#AEB7E2', '#AEB7E2'],
  peach: ['#FFBF9E', '#FFBF9E', '#FFBF9E'],
  coral: ['#FF5959', '#FF9494', '#FF5959'],
};
// Which variable each colour takes. On animals the lines are outlined
// shapes (a width profile cannot be a Figma stroke); on people they are
// strokes, and ink fills (hair, a uniform) are Fill/Default. Everything in
// the Circle layer is the backdrop disc. In dark mode the library gives
// paper on clothes Ebony 30 (Fill/Cloth); a trace cannot tell skin from
// cloth, so all paper on people starts as Fill/Skin.
const ROLES = {
  animal: {
    group: 'Animal',
    circle: 'Fill/Circle',
    ink: ['Line/Body', 'Line/Body'],
    paper: 'Fill/Body',
    tint: 'Fill/BodyShadow',
    peach: 'Fill/Highlight',
  },
  person: {
    group: 'People',
    ink: ['Line/Default', 'Fill/Default'],
    paper: 'Fill/Skin',
    lavender: 'Fill/Highlight 2',
    peach: 'Fill/Highlight 1',
    coral: 'Fill/Highlight 3',
  },
};
const GAP = 40;
const PAD = 40;

figma.showUI(__html__, { width: 380, height: 680, themeColors: true });

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function imagePaint(node) {
  if (!('fills' in node) || !Array.isArray(node.fills)) return null;
  return (
    node.fills.find(paint => paint.type === 'IMAGE' && paint.imageHash) || null
  );
}

function selectedImage() {
  for (const node of figma.currentPage.selection) {
    const paint = imagePaint(node);
    if (paint) return { node, hash: paint.imageHash };
  }
  return null;
}

function postSelection() {
  const found = selectedImage();
  figma.ui.postMessage({
    type: 'selection',
    image: found ? { name: found.node.name } : null,
  });
}

function modeFrames(name, svgs) {
  return MODES.map(mode => {
    const frame = figma.createNodeFromSvg(svgs[mode]);
    frame.name = mode === 'standard' ? name : `${name}-${mode}`;
    frame.fills = [{ type: 'SOLID', color: rgb(SURFACES[mode]) }];
    return frame;
  });
}

function hexOf(color) {
  return (
    '#' +
    [color.r, color.g, color.b]
      .map(v =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

const imported = new Map();
async function variable(name) {
  if (!imported.has(name))
    imported.set(
      name,
      figma.variables.importVariableByKeyAsync(VARIABLE_KEYS[name]),
    );
  return imported.get(name);
}

// Binds every solid fill and stroke of one mode frame to its library
// variable. Colours outside the palette stay as they are and are reported.
async function bindColours(frame, kind, mode) {
  const roles = ROLES[kind] || ROLES.animal;
  const index = MODES.indexOf(mode);
  const set = mode === 'contrast' ? 'Contrast' : 'Standard';
  const byHex = {};
  for (const [colour, values] of Object.entries(PALETTE))
    if (roles[colour] && !byHex[values[index]]) byHex[values[index]] = colour;
  const circle = frame.children.find(child => child.name === 'Circle');
  const inCircle = node => {
    for (let n = node; n && n !== frame; n = n.parent)
      if (n === circle) return true;
    return false;
  };
  let bound = 0;
  const left = new Set();
  const nodes = frame.findAll(node => 'fills' in node);
  for (const node of nodes) {
    for (const prop of ['fills', 'strokes']) {
      const paints = node[prop];
      if (!Array.isArray(paints) || !paints.length) continue;
      const next = [];
      for (const paint of paints) {
        let role = null;
        if (paint.type === 'SOLID') {
          const colour = byHex[hexOf(paint.color)];
          if (roles.circle && inCircle(node)) role = roles.circle;
          else if (colour === 'ink') role = roles.ink[prop === 'fills' ? 1 : 0];
          else if (colour) role = roles[colour];
          if (!role) left.add(hexOf(paint.color));
        }
        if (!role) {
          next.push(paint);
          continue;
        }
        const v = await variable(`${roles.group}/${set}/${role}`);
        // The variable carries its own alpha (the dark disc), so the paint
        // itself stays opaque.
        next.push(
          figma.variables.setBoundVariableForPaint(
            Object.assign({}, paint, { opacity: 1 }),
            'color',
            v,
          ),
        );
        bound++;
      }
      node[prop] = next;
    }
  }
  const any = await variable(`${roles.group}/${set}/${roles.paper}`);
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    any.variableCollectionId,
  );
  const modeName = mode === 'darkmode' ? 'Dark' : 'Light';
  const target = collection.modes.find(m => m.name === modeName);
  if (target)
    frame.setExplicitVariableModeForCollection(collection, target.modeId);
  return { bound, left: [...left] };
}

// One status line for all three frames; the frames keep their hex colours
// if the library cannot be reached.
async function bindAll(frames, kind) {
  try {
    let bound = 0;
    const left = new Set();
    for (let i = 0; i < frames.length; i++) {
      const r = await bindColours(frames[i], kind, MODES[i]);
      bound += r.bound;
      r.left.forEach(hex => left.add(hex));
    }
    return { ok: true, bound, left: [...left] };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function place(section, nodes, y) {
  let x = PAD;
  let height = 0;
  for (const node of nodes) {
    section.appendChild(node);
    node.x = x;
    node.y = y;
    x += node.width + GAP;
    height = Math.max(height, node.height);
  }
  return { width: x - GAP + PAD, height };
}

function imageRect(name, bytes, size) {
  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(size.width, size.height);
  rect.fills = [
    {
      type: 'IMAGE',
      imageHash: figma.createImage(bytes).hash,
      scaleMode: 'FIT',
    },
  ];
  return rect;
}

async function insert(result, draft, check) {
  const section = figma.createSection();
  section.name = result.name;

  const row = modeFrames(result.name, result.svgs);
  for (const frame of row) {
    frame.setPluginData('aiFile', result.ai);
    frame.setPluginData('folder', result.dir);
  }
  const binding = await bindAll(row, result.kind);
  if (draft) row.push(imageRect(`${result.name}-utkast`, draft, row[0]));
  // What the check against the draft found, boxed and numbered as in the panel.
  if (check) row.push(imageRect(`${result.name}-sjekk`, check, row[0]));
  const first = place(section, row, PAD);
  let width = first.width;
  let height = PAD + first.height + PAD;

  if (result.compare && result.compare.svgs) {
    const library = modeFrames(
      `Bibliotek – ${result.compare.name}`,
      result.compare.svgs,
    );
    const second = place(section, library, height - PAD + GAP);
    width = Math.max(width, second.width);
    height += GAP + second.height;
  }

  section.resizeWithoutConstraints(width, height);
  const center = figma.viewport.center;
  section.x = Math.round(center.x - width / 2);
  section.y = Math.round(center.y - height / 2);
  figma.currentPage.selection = [section];
  figma.viewport.scrollAndZoomIntoView([section]);
  return { section, binding };
}

function bindingText(binding) {
  if (!binding.ok)
    return `Fargene er ikke koblet til variablene (${binding.message}). Er biblioteket ${LIBRARY} slått på i fila?`;
  const left = binding.left.length
    ? ` Uten variabel: ${binding.left.join(', ')}.`
    : '';
  return `${binding.bound} farger er koblet til ${LIBRARY}.${left}`;
}

figma.on('selectionchange', postSelection);

figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'ready') {
      postSelection();
      const code = await figma.clientStorage.getAsync('bridgeCode');
      figma.ui.postMessage({ type: 'stored-code', code: code || '' });
    } else if (msg.type === 'save-code') {
      await figma.clientStorage.setAsync('bridgeCode', msg.code);
    } else if (msg.type === 'get-selected-image') {
      const found = selectedImage();
      if (!found) throw new Error('Marker et lag med et bilde først');
      const bytes = await figma.getImageByHash(found.hash).getBytesAsync();
      figma.ui.postMessage({
        type: 'selected-image',
        name: found.node.name,
        bytes,
      });
    } else if (msg.type === 'insert') {
      const { section, binding } = await insert(
        msg.result,
        msg.draft,
        msg.check,
      );
      figma.notify(
        `${section.name} er satt inn i tre fargemoduser. ${bindingText(
          binding,
        )}`,
        { error: !binding.ok, timeout: 8000 },
      );
      figma.ui.postMessage({
        type: 'inserted',
        name: section.name,
        binding: bindingText(binding),
      });
    } else if (msg.type === 'notify') {
      figma.notify(msg.message, { error: Boolean(msg.error) });
    }
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: error.message });
  }
};
