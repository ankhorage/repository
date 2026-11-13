import { expect, test } from 'bun:test';

import type { GitHubDiscoveredRepository } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import { createGitHubHttpRepositoryReadGateway } from './createGitHubHttpRepositoryReadGateway.js';

interface Request {
  readonly authorization: string | null;
  readonly url: string;
}

test('lists the authenticated user inventory across pages with stable ID deduplication and ordering', async () => {
  const requests: Request[] = [];
  const gateway = createGitHubHttpRepositoryReadGateway(createInventoryFetch(requests), {
    authentication: { kind: 'user', accessToken: 'user-token' },
  });

  expect(await gateway.listAuthenticatedUserRepositoriesAsync()).toEqual(expectedRepositories());
  expect(requests.map((request) => request.authorization)).toEqual([
    'Bearer user-token',
    'Bearer user-token',
  ]);
  expect(requests[0]?.url).toBe(
    'https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100',
  );
});

test('keeps interleaved authenticated inventories isolated from environment and each other', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'environment-token-must-not-leak';
  const authorizations: string[] = [];
  try {
    await Promise.all([
      createEmptyInventoryGateway(
        'user-a-token',
        authorizations,
      ).listAuthenticatedUserRepositoriesAsync(),
      createEmptyInventoryGateway(
        'user-b-token',
        authorizations,
      ).listAuthenticatedUserRepositoriesAsync(),
      createEmptyInventoryGateway(
        undefined,
        authorizations,
      ).listAuthenticatedUserRepositoriesAsync(),
    ]);
    expect(authorizations).toEqual(['Bearer user-a-token', 'Bearer user-b-token', 'missing']);
  } finally {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

/** Create a request-capturing paginated inventory HTTP adapter fixture. */
function createInventoryFetch(requests: Request[]): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    requests.push({ authorization: new Headers(init?.headers).get('authorization'), url });
    return Promise.resolve(url.includes('page=2') ? secondInventoryPage() : firstInventoryPage());
  }) as typeof fetch;
}

/** Create an inventory gateway whose empty response records only its effective authorization header. */
function createEmptyInventoryGateway(accessToken: string | undefined, authorizations: string[]) {
  return createGitHubHttpRepositoryReadGateway(
    ((_input: string | URL | Request, init?: RequestInit) => {
      authorizations.push(new Headers(init?.headers).get('authorization') ?? 'missing');
      return Promise.resolve(Response.json([]));
    }) as typeof fetch,
    {
      authentication: accessToken ? { kind: 'user', accessToken } : 'anonymous',
    },
  );
}

/** Return the first page including the authenticated-user pagination link. */
function firstInventoryPage(): Response {
  return Response.json(
    [
      repositoryResponse(1, 'owned', 'an-owner', 'private'),
      repositoryResponse(2, 'old-name', 'a-collaborator', 'public'),
    ],
    {
      headers: {
        link: '<https://api.github.com/user/repos?visibility=all&affiliation=owner%2Ccollaborator%2Corganization_member&per_page=100&page=2>; rel="next"',
      },
    },
  );
}

/** Return the page whose duplicate ID supersedes the first page's stale representation. */
function secondInventoryPage(): Response {
  return Response.json([
    repositoryResponse(3, 'team', 'an-organization', 'internal'),
    repositoryResponse(2, 'collaboration', 'a-collaborator', 'public'),
  ]);
}

/** Return the expected canonical owner/name order after stable ID deduplication. */
function expectedRepositories(): readonly GitHubDiscoveredRepository[] {
  return [
    discoveredRepository('2', 'collaboration', 'a-collaborator', 'public'),
    discoveredRepository('3', 'team', 'an-organization', 'internal'),
    discoveredRepository('1', 'owned', 'an-owner', 'private'),
  ];
}

/** Create a GitHub REST repository record. */
function repositoryResponse(
  id: number,
  name: string,
  owner: string,
  visibility: 'internal' | 'private' | 'public',
): Record<string, unknown> {
  return {
    id,
    name,
    owner: { login: owner },
    html_url: `https://github.com/${owner}/${name}`,
    private: visibility === 'private',
    visibility,
  };
}

/** Create the public inventory model expected from a REST record. */
function discoveredRepository(
  id: string,
  name: string,
  owner: string,
  visibility: 'internal' | 'private' | 'public',
): GitHubDiscoveredRepository {
  return { id, name, owner, url: `https://github.com/${owner}/${name}`, visibility };
}

/** Extract the URL without modifying the fetch request under test. */
function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}
