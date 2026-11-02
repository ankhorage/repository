import { expect, test } from 'bun:test';

import { createGitHubHttpClient } from './createGitHubHttpClient.js';

test('omits inherited environment credentials for explicit anonymous requests', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'not-for-public-discovery';
  const headers: Headers[] = [];
  try {
    const client = createGitHubHttpClient(
      ((_input: string | URL | Request, init?: RequestInit) => {
        headers.push(new Headers(init?.headers));
        return Promise.resolve(Response.json({ owner: 'public' }));
      }) as typeof fetch,
      { authentication: 'anonymous' },
    );
    await client.requestJsonResponseAsync('https://api.github.com/users/ankhorage', 'owner');
    expect(headers).toHaveLength(1);
    expect(headers[0]?.has('authorization')).toBe(false);
  } finally {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

test('cancels an in-flight request through its combined fetch signal', () => {
  const controller = new AbortController();
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      })) as typeof fetch,
  );
  const request = client.requestJsonResponseAsync(
    'https://api.github.com/users/ankhorage',
    'owner',
    controller.signal,
  );
  controller.abort();
  expect(request).rejects.toMatchObject({ code: 'cancelled' });
});

test('retries a secondary limit using a valid GitHub reset header', () => {
  let calls = 0;
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response('', { status: 403, headers: { 'x-ratelimit-reset': '10' } })
          : Response.json({ owner: 'public' }),
      );
    }) as typeof fetch,
    { now: () => 10_000, waitAsync: () => Promise.resolve() },
  );
  expect(
    client.requestJsonResponseAsync('https://api.github.com/users/ankhorage', 'owner'),
  ).resolves.toEqual({
    link: null,
    value: { owner: 'public' },
  });
  expect(calls).toBe(2);
});

test('times out while GitHub response processing is still pending', () => {
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) =>
      Promise.resolve({
        headers: new Headers(),
        json: () => new Promise(() => undefined),
        ok: true,
      } as Response)) as typeof fetch,
    { timeoutMilliseconds: 0 },
  );
  expect(
    client.requestJsonResponseAsync('https://api.github.com/users/ankhorage', 'owner'),
  ).rejects.toMatchObject({ code: 'timeout' });
});
