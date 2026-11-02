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

test('keeps a permission denial with available primary quota distinct from rate limiting', async () => {
  let calls = 0;
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        Response.json(
          { message: 'Resource not accessible by integration' },
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '1', 'x-ratelimit-reset': '10' },
          },
        ),
      );
    }) as typeof fetch,
    { now: () => 10_000, waitAsync: () => Promise.resolve() },
  );
  expect(await requestFailureAsync(client)).toMatchObject({ code: 'permission-denied' });
  expect(calls).toBe(1);
});

test('does not replace a provider-required rate-limit wait beyond the retry budget with backoff', async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    }) as typeof fetch,
    { waitAsync: (milliseconds) => (waits.push(milliseconds), Promise.resolve()) },
  );

  expect(await requestFailureAsync(client)).toMatchObject({
    code: 'rate-limited',
    retryAfterMilliseconds: 120_000,
  });
  expect(calls).toBe(1);
  expect(waits).toEqual([]);
});

test('keeps an exhausted-primary reset deadline for HTTP 429 when it is later than Retry-After', async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        new Response('', {
          status: 429,
          headers: {
            'retry-after': '2',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '121',
          },
        }),
      );
    }) as typeof fetch,
    {
      now: () => 1_000,
      waitAsync: (milliseconds) => (waits.push(milliseconds), Promise.resolve()),
    },
  );

  expect(await requestFailureAsync(client)).toMatchObject({
    code: 'rate-limited',
    retryAfterMilliseconds: 120_000,
  });
  expect(calls).toBe(1);
  expect(waits).toEqual([]);
});

test('keeps Retry-After for HTTP 429 when it is later than an exhausted-primary reset deadline', async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        new Response('', {
          status: 429,
          headers: {
            'retry-after': '120',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '3',
          },
        }),
      );
    }) as typeof fetch,
    {
      now: () => 1_000,
      waitAsync: (milliseconds) => (waits.push(milliseconds), Promise.resolve()),
    },
  );

  expect(await requestFailureAsync(client)).toMatchObject({
    code: 'rate-limited',
    retryAfterMilliseconds: 120_000,
  });
  expect(calls).toBe(1);
  expect(waits).toEqual([]);
});

test('retries HTTP 429 after an exhausted-primary reset deadline when Retry-After is absent', async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response('', {
              status: 429,
              headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '3' },
            })
          : Response.json({ owner: 'public' }),
      );
    }) as typeof fetch,
    {
      now: () => 1_000,
      waitAsync: (milliseconds) => (waits.push(milliseconds), Promise.resolve()),
    },
  );

  expect(
    await client.requestJsonResponseAsync('https://api.github.com/users/ankhorage', 'owner'),
  ).toEqual({ link: null, value: { owner: 'public' } });
  expect(calls).toBe(2);
  expect(waits).toEqual([2_000]);
});

test('identifies a secondary limit despite available primary quota and reset metadata', async () => {
  let calls = 0;
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        Response.json(
          { message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' },
          {
            status: 403,
            headers: { 'x-ratelimit-remaining': '1', 'x-ratelimit-reset': '10' },
          },
        ),
      );
    }) as typeof fetch,
    { now: () => 10_000 },
  );

  expect(await requestFailureAsync(client)).toMatchObject({
    code: 'rate-limited',
    retryAfterMilliseconds: undefined,
  });
  expect(calls).toBe(1);
});

test('keeps a genuine GitHub permission denial distinct from a secondary rate limit', async () => {
  let calls = 0;
  const client = createGitHubHttpClient(((_input: string | URL | Request) => {
    calls += 1;
    return Promise.resolve(
      Response.json({ message: 'Resource not accessible by integration' }, { status: 403 }),
    );
  }) as typeof fetch);

  expect(await requestFailureAsync(client)).toMatchObject({ code: 'permission-denied' });
  expect(calls).toBe(1);
});

test('uses a primary reset delay only after primary quota exhaustion', async () => {
  let calls = 0;
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        new Response('', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '121' },
        }),
      );
    }) as typeof fetch,
    { now: () => 1_000, waitAsync: () => Promise.resolve() },
  );

  expect(await requestFailureAsync(client)).toMatchObject({
    code: 'rate-limited',
    retryAfterMilliseconds: 120_000,
  });
  expect(calls).toBe(1);
});

test('recognizes Retry-After as rate-limit evidence for HTTP 403', async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = createGitHubHttpClient(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response('', { status: 403, headers: { 'retry-after': '2' } })
          : Response.json({ owner: 'public' }),
      );
    }) as typeof fetch,
    { waitAsync: (milliseconds) => (waits.push(milliseconds), Promise.resolve()) },
  );

  const response = await client.requestJsonResponseAsync(
    'https://api.github.com/users/ankhorage',
    'owner',
  );
  expect(response).toEqual({ link: null, value: { owner: 'public' } });
  expect(calls).toBe(2);
  expect(waits).toEqual([2_000]);
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

async function requestFailureAsync(
  client: ReturnType<typeof createGitHubHttpClient>,
): Promise<unknown> {
  try {
    await client.requestJsonResponseAsync('https://api.github.com/users/ankhorage', 'owner');
    return undefined;
  } catch (error) {
    return error;
  }
}
