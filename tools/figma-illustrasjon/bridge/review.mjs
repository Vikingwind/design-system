// Automatic review of a draft with Claude (vision) against the skill's
// checklist. Raw HTTP to the Messages API, since the bridge has no dependencies.

const API_VERSION = '2026-10-21';
// USD per million tokens: input, output, cache write, cache read (Nov 2026).
const PRICES = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.1],
};
// Models that take the server-side refusal fallback.
const FALLBACK_MODELS = [
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
];

const SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    deviations: { type: 'array', items: { type: 'string' } },
    edit_prompt: { type: 'string' },
    fix_reference: { type: 'integer' },
  },
  required: ['approved', 'deviations', 'edit_prompt', 'fix_reference'],
  additionalProperties: false,
};

function system(brief) {
  return `You review drafts from an image model for the Entur Linje illustration library before they are traced into vector strokes. You compare the draft with library illustrations of the same kind and list every deviation from the library's style rules, then write the edit prompt that fixes them.

Judge only what a raster draft can show. Line construction (live strokes, width profiles, Roughen), layers, file names and colour modes are handled when the draft is traced; ignore those checklist items. Near-white noise in the background is invisible after tracing and is not a deviation.

The rules, from the skill:

${brief.rules}

The review step and the edit template, from the skill:

${brief.review}

The checklist used on the finished illustration, from the skill:

${brief.checklist}

Answer in JSON:
- approved: true when nothing is left that an edit round should fix.
- deviations: every deviation you see, one short sentence each, in Norwegian Bokmål for a designer. Empty when approved.
- edit_prompt: the edit template filled in for this draft, in English: what to keep, then only the changes, numbered. The draft is sent as the first image and the reference you pick as the second. Adapt the last line to the subject: people keep no eyes and no mouth, only the nose; animals keep their small dot eye and nose. Empty when approved.
- fix_reference: the number of the style reference that best shows the fix (1 is the first), or 0 when none does.`;
}

export async function reviewDraft({
  apiKey,
  baseUrl,
  model,
  brief,
  kind,
  scene,
  references,
  draft,
  draftMime = 'image/png',
  draftOnly = false,
  signal,
}) {
  const content = [];
  references.forEach((ref, i) => {
    content.push({
      type: 'text',
      text: `Style reference ${i + 1}: ${ref.name} (library)`,
    });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: ref.bytes.toString('base64'),
      },
    });
  });
  // The system prompt and references stay the same between rounds; only the draft changes.
  content[content.length - 1].cache_control = { type: 'ephemeral' };
  content.push({ type: 'text', text: 'The draft to review:' });
  content.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: draftMime,
      data: draft.toString('base64'),
    },
  });
  content.push({
    type: 'text',
    text: `Subject: ${
      {
        animal: 'an animal',
        person: 'a person',
        object: 'an object',
        transport: 'a vehicle',
      }[kind] ||
      'a person'
    }. Scene asked for: ${scene}\nReview the draft against the references and the rules.${
      draftOnly
        ? '\nThe edit runs on the draft alone, in an image tool that takes one image and a prompt: describe each fix in words, without pointing to another image, and set fix_reference to 0.'
        : ''
    }`,
  });

  const body = {
    model,
    max_tokens: 16000,
    system: system(brief),
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content }],
  };
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
  };
  if (FALLBACK_MODELS.includes(model)) {
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  if (response.status === 401)
    throw new Error(
      'Anthropic godtok ikke nøkkelen. Sjekk anthropicApiKey i config-fila.',
    );
  if (/credit balance/i.test(text))
    throw new Error(
      'Anthropic-kontoen har ikke kreditt. Fyll på under console.anthropic.com (Plans & Billing), eller la Claude Code vurdere utkastet.',
    );
  if (!response.ok)
    throw new Error(`Claude: HTTP ${response.status} ${text.slice(0, 400)}`);
  const message = JSON.parse(text);
  if (message.stop_reason === 'refusal')
    throw new Error('Claude avslo vurderingen');
  if (message.stop_reason === 'max_tokens')
    throw new Error('Claude-vurderingen ble kuttet (max_tokens)');
  const out = message.content.find(block => block.type === 'text');
  if (!out) throw new Error('Claude sendte ikke noe svar');
  return { ...JSON.parse(out.text), cost: cost(message) };
}

function cost(message) {
  const price = PRICES[message.model];
  const u = message.usage || {};
  if (!price) return null;
  return (
    ((u.input_tokens || 0) * price[0] +
      (u.output_tokens || 0) * price[1] +
      (u.cache_creation_input_tokens || 0) * price[2] +
      (u.cache_read_input_tokens || 0) * price[3]) /
    1e6
  );
}
