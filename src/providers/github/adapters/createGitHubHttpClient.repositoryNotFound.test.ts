import { expect, test } from 'bun:test';

import { createGitHubHttpClient } from './createGitHubHttpClient.js';

test('keeps a missing repository distinct from permission and rate-limit failures', async () => {
  const client = createGitHubHttpClient(((_input: string | URL | Request) =>
    Promise.resolve(new Response('', { status: 404 }))) as typeof fetch);
  const failure = await requestFailureAsync(client);
  expect(failure).toMatchObject({ code: 'repository-not-found' });
});

/** Request missing repository metadata and return the typed provider failure. */
async function requestFailureAsync(
  client: ReturnType<typeof createGitHubHttpClient>,
): Promise<unknown> {
  try {
    await client.requestJsonResponseAsync(
      'https://api.github.com/repos/owner/repository',
      'repository metadata',
    );
    throw new Error('Expected repository metadata request to fail.');
  } catch (error) {
    return error;
  }
}
