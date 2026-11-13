import { expect, test } from 'bun:test';

import {
  discoverGitHubRepositoriesAsync,
  materializeGitHubRepositoryAsync,
  resolveGitHubRepositoryRevisionAsync,
} from './index.js';

test('keeps public GitHub entrypoints request-scoped across user and anonymous operations', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const requests: { readonly authorization: string | null; readonly url: string }[] = [];
  process.env.GITHUB_TOKEN = 'ambient-server-token';
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    requests.push({ url, authorization: new Headers(init?.headers).get('authorization') });
    return Promise.resolve(responseForUrl(url));
  }) as typeof fetch;
  try {
    await discoverGitHubRepositoriesAsync({
      source: 'user-a',
      authentication: { kind: 'user', accessToken: 'token-a' },
    });
    await resolveGitHubRepositoryRevisionAsync({
      url: 'https://github.com/user-b/demo',
      authentication: { kind: 'user', accessToken: 'token-b' },
    });
    const materialized = await materializeGitHubRepositoryAsync({
      url: 'https://github.com/user-a/demo',
      authentication: { kind: 'user', accessToken: 'token-a' },
    });
    await materialized.cleanupAsync();
    await discoverGitHubRepositoriesAsync({ source: 'anonymous' });

    expect(requests.filter((request) => request.url.includes('/users/user-a')).map(header)).toEqual(
      ['Bearer token-a', 'Bearer token-a'],
    );
    expect(
      requests.filter((request) => request.url.includes('/repos/user-b/demo')).map(header),
    ).toEqual(['Bearer token-b', 'Bearer token-b']);
    expect(requests.filter((request) => request.url.includes('user-a/demo')).map(header)).toEqual([
      'Bearer token-a',
      'Bearer token-a',
      'Bearer token-a',
      'Bearer token-a',
    ]);
    expect(
      requests.filter((request) => request.url.includes('/users/anonymous')).map(header),
    ).toEqual([null, null]);
    expect(JSON.stringify(requests)).not.toContain('ambient-server-token');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

/*** Return only the deterministic provider fields consumed by the public GitHub entrypoints. */
function responseForUrl(url: string): Response {
  if (url.includes('/users') && url.includes('/repos')) return Response.json([]);
  if (url.includes('/users/'))
    return Response.json({ login: url.split('/').at(-1), type: 'User', html_url: url });
  if (url.includes('/commits/'))
    return Response.json({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } });
  if (url.includes('/git/trees/'))
    return Response.json({
      tree: [{ mode: '100644', path: 'package.json', sha: 'blob-sha', size: 6, type: 'blob' }],
      truncated: false,
    });
  if (url.includes('/repos/'))
    return Response.json({
      id: 1,
      name: 'demo',
      owner: { login: url.split('/').at(-2) },
      default_branch: 'main',
      html_url: 'https://github.com/user-a/demo',
    });
  return new Response('source');
}

/*** Read the URL from a Fetch invocation without changing the request passed to GitHub. */
function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/*** Project recorded authorization headers without ever recording credentials in test diagnostics. */
function header(request: { readonly authorization: string | null }): string | null {
  return request.authorization;
}
