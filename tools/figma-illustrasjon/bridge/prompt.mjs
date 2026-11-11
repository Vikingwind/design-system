// Reads the prompt template, the review checklist and the rules from the
// entur-illustration skill, so the bridge follows the skill as it changes.

import fs from 'node:fs';
import path from 'node:path';

const NO_CORAL = '__NO_CORAL__';

function read(skillDir, file) {
  return fs.readFileSync(path.join(skillDir, file), 'utf8');
}

// The section under the first heading that starts with `title`, up to the
// next heading of the same or a higher level.
function section(markdown, title) {
  const lines = markdown.split('\n');
  const start = lines.findIndex(
    line => /^#+\s/.test(line) && line.replace(/^#+\s*/, '').startsWith(title),
  );
  if (start < 0) throw new Error(`Fant ikke «${title}» i skillen`);
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex(
    (line, i) =>
      i > start && /^#+\s/.test(line) && line.match(/^#+/)[0].length <= level,
  );
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

function codeBlock(markdown) {
  const match = markdown.match(/```text\n([\s\S]*?)```/);
  if (!match) throw new Error('Fant ingen ```text-blokk i skillen');
  return match[1].trim();
}

// Fills the bracketed slots of the prompt template in references/raster-first.md.
// An unknown slot stops the job: the template has changed and so must this.
// Without references (Figma's image generation takes a prompt only) the
// lines about attached images go, and the skill's line description comes in.
export function generationPrompt(
  skillDir,
  { kind, scene, peach, hasPhoto, references = true },
) {
  const md = read(skillDir, 'references/raster-first.md');
  const template = codeBlock(section(md, 'Prompt template'));
  const animal = kind === 'animal';
  const sentence = scene.trim().replace(/[.\s]+$/, '');

  const out = [];
  for (const line of template.split('\n')) {
    let drop = false;
    const filled = line.replace(/\[([^\]]+)\]/g, (_, slot) => {
      if (slot.startsWith('one sentence')) return sentence;
      // Every library animal has one small peach area (SKILL.md rules 18–19).
      if (slot === 'which')
        return (
          peach?.trim() ||
          (animal
            ? 'one small prop the animal holds, wears or has beside it (a collar, a ball, a ticket, a leaf), or one marking of its own (a chest patch, horns)'
            : 'one small prop in the scene, or no Peach at all if there is no prop')
        );
      // Coral: the library has none on animals, people or objects, only on
      // Entur staff uniforms and transport lines. The plugin draws neither,
      // so the coral sentence goes (below).
      if (slot.includes(' | '))
        return /Entur staff/.test(slot) ? NO_CORAL : slot.split(' | ')[0];
      if (slot.startsWith('Entur staff:')) {
        drop = true;
        return '';
      }
      if (slot.startsWith('Animals:')) {
        if (!animal) drop = true;
        return animal ? slot : '';
      }
      if (slot.startsWith('Optional for objects and animals:')) {
        if (!animal) return '';
        const rest = slot.slice(slot.indexOf(':') + 1).trim();
        return rest[0].toUpperCase() + rest.slice(1);
      }
      throw new Error(`Ukjent felt i promptmalen: [${slot}]`);
    });
    const plain = filled.replace(
      /[^.]*__NO_CORAL__[^.]*\.?/,
      ` No coral or red (#FF5959) anywhere, not on ${
        animal ? 'a comb, a wattle or a tongue' : 'lips, cheeks or clothes'
      } either.`,
    );
    if (!drop) out.push(plain.replace(/\s+$/, '').replace(/\.\.$/, '.'));
  }
  if (!references) return withoutReferences(out, md, animal).join('\n').trim();
  if (hasPhoto)
    out.push(
      '',
      "The last attached image is the user's own photo. Take only the subject, its pose and the situation from it, never its colours, line or style.",
    );
  return out.join('\n');
}

function withoutReferences(lines, md, animal) {
  // raster-first.md, «Fallback: Figma generate_image»: the line, spelled out.
  const cue = section(md, 'Fallback').match(/\("([^"]+)"\)/);
  return lines
    .filter(line => !line.startsWith('Use the references'))
    .map(line =>
      line.includes('attached reference images')
        ? `Line illustration in the style of the Entur Linje illustration library: hand-drawn${
            animal && cue ? `, ${cue[1]}` : ''
          }.`
        : line,
    );
}

// Rules, slips and checklist for the review, as the skill states them.
export function reviewBrief(skillDir) {
  const skill = read(skillDir, 'SKILL.md');
  const raster = read(skillDir, 'references/raster-first.md');
  const review = section(raster, '3. Review the PNG');
  return {
    rules: section(skill, 'Step 3'),
    review,
    editTemplate: codeBlock(review),
    checklist: section(skill, 'Step 5'),
  };
}
