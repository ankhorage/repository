import { expect, test } from 'bun:test';

import { createGitHubHttpRepositoryReadGateway } from './createGitHubHttpRepositoryReadGateway.js';

test('reads repository metadata, immutable revision, tree, and raw file content', async () => {
  const urls: string[] = [];
  const gateway = createGitHubHttpRepositoryReadGateway(createFetchFixture(urls));
  const target = {
    owner: 'ankhorage',
    name: 'demo',
    url: 'https://github.com/ankhorage/demo',
  };

  expect(await gateway.inspectRepositoryAsync(target)).toEqual({
    id: '1',
    owner: 'ankhorage',
    name: 'demo',
    defaultBranch: 'main',
    url: 'https://github.com/ankhorage/demo',
  });
  expect(await gateway.resolveRevisionAsync(target, 'feature/read')).toEqual({
    commitSha: 'commit-sha',
    treeSha: 'tree-sha',
  });
  expect(await gateway.readTreeAsync(target, 'tree-sha')).toEqual({
    entries: [
      {
        path: 'src/index.ts',
        mode: '100644',
        type: 'blob',
        sha: 'blob-sha',
        size: 10,
      },
    ],
    truncated: false,
  });
  expect(
    Buffer.from(await gateway.readFileAsync(target, 'commit-sha', 'src/index.ts')).toString(),
  ).toBe('0123456789');
  expect(urls).toContain(
    'https://raw.githubusercontent.com/ankhorage/demo/commit-sha/src/index.ts',
  );
});

test('resolves an organization and returns every sorted repository page', async () => {
  const urls: string[] = [];
  const gateway = createGitHubHttpRepositoryReadGateway(createDiscoveryFetchFixture(urls), {
    waitAsync: () => Promise.resolve(),
  });
  const owner = await gateway.resolveOwnerAsync('ankhorage');
  const repositories = await gateway.listOwnerRepositoriesAsync(owner);

  expect(owner).toEqual({
    login: 'Ankhorage',
    type: 'organization',
    url: 'https://github.com/Ankhorage',
  });
  expect(repositories).toEqual([
    {
      id: '1',
      name: 'atlas',
      owner: 'Ankhorage',
      url: 'https://github.com/Ankhorage/atlas',
      visibility: 'public',
    },
    {
      id: '2',
      name: 'zora',
      owner: 'Ankhorage',
      url: 'https://github.com/Ankhorage/zora',
      visibility: 'public',
    },
  ]);
  expect(urls).toHaveLength(3);
});

test('retries a GitHub rate limit and returns a stable rate-limit error after its retry budget', async () => {
  let calls = 0;
  const gateway = createGitHubHttpRepositoryReadGateway(
    ((_input: string | URL | Request) => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response('', { status: 429, headers: { 'retry-after': '0' } })
          : Response.json({
              login: 'Ankhorage',
              type: 'Organization',
              html_url: 'https://github.com/Ankhorage',
            }),
      );
    }) as typeof fetch,
    { waitAsync: () => Promise.resolve() },
  );
  expect(await gateway.resolveOwnerAsync('ankhorage')).toMatchObject({ type: 'organization' });
  expect(calls).toBe(2);

  const rateLimitedGateway = createGitHubHttpRepositoryReadGateway(
    ((_input: string | URL | Request) =>
      Promise.resolve(
        new Response('', { status: 429, headers: { 'retry-after': '0' } }),
      )) as typeof fetch,
    { waitAsync: () => Promise.resolve() },
  );
  expect(rateLimitedGateway.resolveOwnerAsync('ankhorage')).rejects.toMatchObject({
    code: 'rate-limited',
    retryAfterMilliseconds: 0,
  });
});

test('maps an aborted request to a stable cancellation error', () => {
  const controller = new AbortController();
  controller.abort();
  const gateway = createGitHubHttpRepositoryReadGateway(((_input: string | URL | Request) =>
    Promise.reject(new DOMException('Aborted', 'AbortError'))) as typeof fetch);
  expect(gateway.resolveOwnerAsync('ankhorage', controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
});

test.each([
  [
    'metadata',
    (gateway: ReturnType<typeof createGitHubHttpRepositoryReadGateway>) =>
      gateway.inspectRepositoryAsync(target()),
  ],
  [
    'revision',
    (gateway: ReturnType<typeof createGitHubHttpRepositoryReadGateway>) =>
      gateway.resolveRevisionAsync(target(), 'main'),
  ],
  [
    'tree',
    (gateway: ReturnType<typeof createGitHubHttpRepositoryReadGateway>) =>
      gateway.readTreeAsync(target(), 'tree-sha'),
  ],
  [
    'discovery',
    (gateway: ReturnType<typeof createGitHubHttpRepositoryReadGateway>) =>
      gateway.resolveOwnerAsync('ankhorage'),
  ],
])('times out a hanging %s request', (_subject, request) => {
  const gateway = createGitHubHttpRepositoryReadGateway(
    ((_input: string | URL | Request) => new Promise<Response>(() => undefined)) as typeof fetch,
    { timeoutMilliseconds: 0 },
  );
  expect(request(gateway)).rejects.toMatchObject({ code: 'timeout' });
});

test('retries a secondary rate limit but does not retry a permission-only 403', () => {
  let secondaryCalls = 0;
  const secondaryGateway = createGitHubHttpRepositoryReadGateway(
    ((_input: string | URL | Request) => {
      secondaryCalls += 1;
      return Promise.resolve(
        secondaryCalls === 1
          ? new Response('', { status: 403, headers: { 'retry-after': '0' } })
          : Response.json({
              login: 'Ankhorage',
              type: 'Organization',
              html_url: 'https://github.com/Ankhorage',
            }),
      );
    }) as typeof fetch,
    { waitAsync: () => Promise.resolve() },
  );
  expect(secondaryGateway.resolveOwnerAsync('ankhorage')).resolves.toMatchObject({
    type: 'organization',
  });
  expect(secondaryCalls).toBe(2);

  let permissionCalls = 0;
  const permissionGateway = createGitHubHttpRepositoryReadGateway(((
    _input: string | URL | Request,
  ) => {
    permissionCalls += 1;
    return Promise.resolve(new Response('', { status: 403 }));
  }) as typeof fetch);
  expect(permissionGateway.resolveOwnerAsync('ankhorage')).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(permissionCalls).toBe(1);
});

test('cancels during response processing and retry waits', () => {
  const responseController = new AbortController();
  const responseGateway = createGitHubHttpRepositoryReadGateway(((_input: string | URL | Request) =>
    Promise.resolve({
      ok: true,
      headers: new Headers(),
      json: () => new Promise(() => undefined),
    } as Response)) as typeof fetch);
  const responseRequest = responseGateway.resolveOwnerAsync('ankhorage', responseController.signal);
  responseController.abort();
  expect(responseRequest).rejects.toMatchObject({ code: 'cancelled' });

  const retryController = new AbortController();
  const retryGateway = createGitHubHttpRepositoryReadGateway(((_input: string | URL | Request) =>
    Promise.resolve(
      new Response('', { status: 429, headers: { 'retry-after': '10' } }),
    )) as typeof fetch);
  const retryRequest = retryGateway.resolveOwnerAsync('ankhorage', retryController.signal);
  retryController.abort();
  expect(retryRequest).rejects.toMatchObject({ code: 'cancelled' });
});

/** Create a stable repository target used by HTTP gateway behavior tests. */
function target(): { readonly owner: string; readonly name: string; readonly url: string } {
  return { owner: 'ankhorage', name: 'demo', url: 'https://github.com/ankhorage/demo' };
}

function createFetchFixture(urls: string[]): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = requestUrl(input);
    urls.push(url);
    return Promise.resolve(responseForUrl(url));
  }) as typeof fetch;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function responseForUrl(url: string): Response {
  if (url.endsWith('/repos/ankhorage/demo')) {
    return Response.json({
      id: 1,
      name: 'demo',
      owner: { login: 'ankhorage' },
      default_branch: 'main',
      html_url: 'https://github.com/ankhorage/demo',
    });
  }
  if (url.endsWith('/repos/ankhorage/demo/commits/feature%2Fread')) {
    return Response.json({
      sha: 'commit-sha',
      commit: { tree: { sha: 'tree-sha' } },
    });
  }
  if (url.endsWith('/repos/ankhorage/demo/git/trees/tree-sha?recursive=1')) {
    return Response.json({
      truncated: false,
      tree: [
        {
          path: 'src/index.ts',
          mode: '100644',
          type: 'blob',
          sha: 'blob-sha',
          size: 10,
        },
      ],
    });
  }
  if (url.endsWith('/ankhorage/demo/commit-sha/src/index.ts')) {
    return new Response('0123456789');
  }
  return new Response('', { status: 404 });
}

function createDiscoveryFetchFixture(urls: string[]): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = requestUrl(input);
    urls.push(url);
    if (url.endsWith('/users/ankhorage')) {
      return Promise.resolve(
        Response.json({
          login: 'Ankhorage',
          type: 'Organization',
          html_url: 'https://github.com/Ankhorage',
        }),
      );
    }
    if (url.includes('page=2')) {
      return Promise.resolve(
        Response.json([
          {
            id: 2,
            name: 'zora',
            owner: { login: 'Ankhorage' },
            html_url: 'https://github.com/Ankhorage/zora',
            private: false,
          },
        ]),
      );
    }
    return Promise.resolve(
      Response.json(
        [
          {
            id: 1,
            name: 'atlas',
            owner: { login: 'Ankhorage' },
            html_url: 'https://github.com/Ankhorage/atlas',
            private: false,
          },
        ],
        {
          headers: {
            link: '<https://api.github.com/orgs/Ankhorage/repos?per_page=100&type=all&sort=full_name&direction=asc&page=2>; rel="next"',
          },
        },
      ),
    );
  }) as typeof fetch;
}
