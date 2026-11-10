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

function insert(result, draft) {
  const section = figma.createSection();
  section.name = result.name;

  const row = modeFrames(result.name, result.svgs);
  for (const frame of row) {
    frame.setPluginData('aiFile', result.ai);
    frame.setPluginData('folder', result.dir);
  }
  if (draft) {
    const rect = figma.createRectangle();
    rect.name = `${result.name}-utkast`;
    rect.resize(row[0].width, row[0].height);
    rect.fills = [
      {
        type: 'IMAGE',
        imageHash: figma.createImage(draft).hash,
        scaleMode: 'FIT',
      },
    ];
    row.push(rect);
  }
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
  return section;
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
      const section = insert(msg.result, msg.draft);
      figma.notify(`${section.name} er satt inn i tre fargemoduser`);
      figma.ui.postMessage({ type: 'inserted', name: section.name });
    } else if (msg.type === 'notify') {
      figma.notify(msg.message, { error: Boolean(msg.error) });
    }
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: error.message });
  }
};
