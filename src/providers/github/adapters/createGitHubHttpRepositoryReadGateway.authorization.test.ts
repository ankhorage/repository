import { expect, test } from 'bun:test';

import { createGitHubHttpRepositoryReadGateway } from './createGitHubHttpRepositoryReadGateway.js';

test('uses request-scoped authorization for metadata, revision, tree, and raw file reads', async () => {
  const headers: Headers[] = [];
  const gateway = createGitHubHttpRepositoryReadGateway(
    ((input: string | URL | Request, init?: RequestInit) => {
      headers.push(new Headers(init?.headers));
      return Promise.resolve(responseForUrl(requestUrl(input)));
    }) as typeof fetch,
    { authentication: { kind: 'user', accessToken: 'user-token' } },
  );
  const target = { owner: 'ankhorage', name: 'demo', url: 'https://github.com/ankhorage/demo' };

  await gateway.inspectRepositoryAsync(target);
  await gateway.resolveRevisionAsync(target, 'main');
  await gateway.readTreeAsync(target, 'tree-sha');
  await gateway.readFileAsync(target, 'commit-sha', 'src/index.ts');

  expect(headers.map((header) => header.get('authorization'))).toEqual([
    'Bearer user-token',
    'Bearer user-token',
    'Bearer user-token',
    'Bearer user-token',
  ]);
});

/*** Return the smallest valid response for each GitHub read boundary. */
function responseForUrl(url: string): Response {
  if (url.endsWith('/repos/ankhorage/demo'))
    return Response.json({
      id: 1,
      name: 'demo',
      owner: { login: 'ankhorage' },
      default_branch: 'main',
      html_url: 'https://github.com/ankhorage/demo',
    });
  if (url.includes('/commits/'))
    return Response.json({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } });
  if (url.includes('/git/trees/')) return Response.json({ tree: [], truncated: false });
  return new Response('source');
}

/*** Extract a URL from the fetch input without changing the request under test. */
function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}
