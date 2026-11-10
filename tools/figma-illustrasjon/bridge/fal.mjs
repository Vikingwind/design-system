// fal.ai queue API: submit, poll the status, fetch the result, download the image.
// https://fal.ai/docs/model-apis/model-endpoints/queue

// Per image, from fal's model page for nano-banana-2/edit (November 2026).
export const FAL_PRICE = { '0.5K': 0.06, '1K': 0.08, '2K': 0.12, '4K': 0.16 };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function dataUri(bytes, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function json(response, what) {
  const text = await response.text();
  if (response.status === 401)
    throw new Error('fal.ai godtok ikke nøkkelen. Sjekk falKey i config-fila.');
  if (response.status === 403 && /balance/i.test(text))
    throw new Error(
      'fal.ai-kontoen er tom for kreditt. Fyll på under fal.ai/dashboard/billing og prøv igjen; ingenting ble trukket.',
    );
  if (!response.ok)
    throw new Error(
      `fal.ai ${what}: HTTP ${response.status} ${text.slice(0, 400)}`,
    );
  return JSON.parse(text);
}

export async function falImage({ key, model, input, signal, onStatus }) {
  const headers = {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
  };
  const submitted = await json(
    await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal,
    }),
    'innsending',
  );
  const { status_url: statusUrl, response_url: responseUrl } = submitted;
  let last = '';
  try {
    for (;;) {
      await sleep(2000);
      const status = await json(
        await fetch(statusUrl, { headers, signal }),
        'status',
      );
      if (status.status === 'COMPLETED') {
        if (status.error) throw new Error(`fal.ai: ${status.error}`);
        break;
      }
      const label =
        status.status === 'IN_QUEUE'
          ? `i kø (plass ${status.queue_position ?? '?'})`
          : 'tegner';
      if (label !== last) onStatus?.(label);
      last = label;
    }
  } catch (error) {
    if (signal?.aborted && submitted.cancel_url)
      fetch(submitted.cancel_url, { method: 'PUT', headers }).catch(() => {});
    throw error;
  }
  const result = await json(
    await fetch(responseUrl, { headers, signal }),
    'resultat',
  );
  const url = result.images?.[0]?.url;
  if (!url) throw new Error('fal.ai sendte ikke noe bilde tilbake');
  const image = await fetch(url, { signal });
  if (!image.ok)
    throw new Error(`Kunne ikke laste ned utkastet: HTTP ${image.status}`);
  return {
    bytes: Buffer.from(await image.arrayBuffer()),
    description: result.description || '',
  };
}
