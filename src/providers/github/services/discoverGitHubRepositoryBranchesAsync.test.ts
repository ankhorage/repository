import { expect, test } from 'bun:test';

import { discoverGitHubRepositoryBranchesAsync } from '../../../github/index.js';

test('uses only request-scoped authentication for a private repository branch request', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  const authorizations: string[] = [];
  process.env.GITHUB_TOKEN = 'ambient-server-token';
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    authorizations.push(new Headers(init?.headers).get('authorization') ?? 'missing');
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    return Promise.resolve(
      url.endsWith('/repos/beindividualworld/com-be-individual')
        ? Response.json({
            id: 42,
            name: 'com-be-individual',
            owner: { login: 'beindividualworld' },
            default_branch: 'main',
            html_url: 'https://github.com/beindividualworld/com-be-individual',
          })
        : Response.json([{ name: 'main' }, { name: 'draft' }]),
    );
  }) as typeof fetch;
  try {
    const result = await discoverGitHubRepositoryBranchesAsync({
      url: 'https://github.com/beindividualworld/com-be-individual',
      authentication: { kind: 'user', accessToken: 'user-token' },
    });
    expect(result).toMatchObject({ branches: ['draft', 'main'] });
    expect(authorizations).toEqual(['Bearer user-token', 'Bearer user-token']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});
