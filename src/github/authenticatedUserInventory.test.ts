import { expect, test } from 'bun:test';

import { discoverGitHubAuthenticatedUserRepositoriesAsync } from './index.js';

test('fails closed for malformed public authenticated inventory credentials without network access', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const requests: unknown[] = [];
  process.env.GITHUB_TOKEN = 'ambient-server-token';
  globalThis.fetch = ((input: string | URL | Request) => {
    requests.push(input);
    return Promise.resolve(Response.json([]));
  }) as typeof fetch;
  try {
    for (const input of [
      undefined,
      null,
      {},
      { authentication: undefined },
      { authentication: null },
      { authentication: 'anonymous' },
      { authentication: 'environment' },
      { authentication: { kind: 'user', accessToken: '' } },
      { authentication: { kind: 'user', accessToken: '   ' } },
      { authentication: { kind: 'other', accessToken: 'token' } },
    ]) {
      await expectPermissionDeniedAsync(input);
    }
    expect(requests).toHaveLength(0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

/** Invoke the public export with JavaScript-shaped input and assert its fail-closed error boundary. */
async function expectPermissionDeniedAsync(input: unknown): Promise<void> {
  try {
    await discoverGitHubAuthenticatedUserRepositoriesAsync(
      input as Parameters<typeof discoverGitHubAuthenticatedUserRepositoriesAsync>[0],
    );
    throw new Error('Expected authenticated inventory to reject malformed credentials.');
  } catch (error) {
    expect(error).toMatchObject({ code: 'permission-denied' });
  }
}

test('keeps concurrent public authenticated inventories isolated from ambient credentials', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const authorizations: string[] = [];
  process.env.GITHUB_TOKEN = 'ambient-server-token';
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    authorizations.push(new Headers(init?.headers).get('authorization') ?? 'missing');
    return Promise.resolve(Response.json([]));
  }) as typeof fetch;
  try {
    await Promise.all([
      discoverGitHubAuthenticatedUserRepositoriesAsync({
        authentication: { kind: 'user', accessToken: 'user-a-token' },
      }),
      discoverGitHubAuthenticatedUserRepositoriesAsync({
        authentication: { kind: 'user', accessToken: 'user-b-token' },
      }),
    ]);
    expect(authorizations).toEqual(['Bearer user-a-token', 'Bearer user-b-token']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
