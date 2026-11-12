// Reads the prompt template, the review checklist and the rules from the
// entur-illustration skill, so the bridge follows the skill as it changes.

import fs from 'node:fs';
import path from 'node:path';

const NO_CORAL = '__NO_CORAL__';

// What a [For …:] slot's label names, per kind.
const KIND_WORDS = {
  animal: /\banimals?\b/i,
  person: /\b(people|persons?)\b/i,
  object: /\bobjects?\b/i,
  transport: /\b(vehicles?|transport)\b/i,
};

// Peach on a library object is a small detail of it, never the object itself
// (Objects in the library and the square .ai): motion or sparkle strokes
// around a bell, a paper plane or a ticket; the band and rings on top of a
// calendar; the stub stripes of a ticket; a clock's hour marks; a card's chip.
// The library's five vehicles (Transport, Transportmidler-modified.ai) carry
// no Peach: white body, ink windows, a coral line under them.
const VEHICLE_PEACH =
  'nothing on the vehicle itself; leave Peach out unless the scene has one small prop beside it';
const OBJECT_PEACH =
  'one small detail of the object, never the whole object: a few short motion or sparkle strokes around it, a band or tab on it (the top of a calendar, the stub of a ticket), small marks (the hour marks of a clock) or a chip on a card';

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
  const object = kind === 'object';
  const vehicle = kind === 'transport';
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
            : object
            ? OBJECT_PEACH
            : vehicle
            ? VEHICLE_PEACH
            : 'one small prop in the scene, or no Peach at all if there is no prop')
        );
      // Coral: the library has none on animals, people or objects, only on
      // Entur staff uniforms and the line under a vehicle. A vehicle takes
      // the option for its line; the plugin draws no staff, so for the rest
      // the coral sentence goes (below).
      if (slot.includes(' | ')) {
        const options = slot.split(' | ');
        if (vehicle) {
          const line = options.find(o => /vehicle/.test(o));
          if (line) return line;
        }
        return /Entur staff/.test(slot) ? NO_CORAL : options[0];
      }
      if (slot.startsWith('Entur staff:')) {
        drop = true;
        return '';
      }
      if (slot.startsWith('Animals:')) {
        if (!animal) drop = true;
        return animal ? slot : '';
      }
      // [For objects: …], [Optional for objects and animals: …]: the text
      // without its label, for the kinds the label names; nothing for others.
      const scoped = slot.match(/^(?:Optional for|For) ([^:]+):\s*([\s\S]+)$/);
      if (scoped) {
        if (!KIND_WORDS[kind]?.test(scoped[1])) return '';
        const rest = scoped[2].trim();
        return rest[0].toUpperCase() + rest.slice(1);
      }
      throw new Error(`Ukjent felt i promptmalen: [${slot}]`);
    });
    const plain = filled.replace(
      /[^.]*__NO_CORAL__[^.]*\.?/,
      ` No coral or red (#FF5959) anywhere, not on ${
        animal
          ? 'a comb, a wattle or a tongue'
          : object
          ? 'the object or any detail of it'
          : 'lips, cheeks or clothes'
      } either.`,
    );
    // An empty slot leaves two spaces between its neighbours.
    const text = plain
      .replace(/(\S) {2,}/g, '$1 ')
      .replace(/\s+$/, '')
      .replace(/\.\.$/, '.');
    // A bullet whose only slot was for another kind goes with it.
    if (!drop && text !== '-') out.push(text);
  }
  // Objects swell like animals (SKILL.md rule 1), so they get the same line.
  if (!references)
    return withoutReferences(out, md, animal || object)
      .join('\n')
      .trim();
  if (hasPhoto)
    out.push(
      '',
      "The last attached image is the user's own photo. Take only the subject, its pose and the situation from it, never its colours, line or style.",
    );
  return out.join('\n');
}

function withoutReferences(lines, md, swelling) {
  // raster-first.md, «Fallback: Figma generate_image»: the line, spelled out.
  const cue = section(md, 'Fallback').match(/\("([^"]+)"\)/);
  return lines
    .filter(line => !line.startsWith('Use the references'))
    .map(line =>
      line.includes('attached reference images')
        ? `Line illustration in the style of the Entur Linje illustration library: hand-drawn${
            swelling && cue ? `, ${cue[1]}` : ''
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
