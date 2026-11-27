import { expect, test } from 'bun:test';

import type { GitHubRepositoryBranchDiscoveryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import type { GitHubRepositoryReadGateway } from '../ports/GitHubRepositoryReadGateway.js';
import { discoverGitHubRepositoryBranchesWithGatewayAsync } from './discoverGitHubRepositoryBranchesWithGatewayAsync.js';

test('returns the canonical repository default branch with every visible branch name', async () => {
  const requests: { readonly owner: string; readonly name: string }[] = [];
  const result = await discoverGitHubRepositoryBranchesWithGatewayAsync(
    { url: 'https://github.com/alias/example' },
    createGateway(requests),
  );

  expect(requests).toEqual([{ owner: 'canonical-owner', name: 'canonical-repository' }]);
  expect(result).toEqual({
    repository: {
      id: '42',
      owner: 'canonical-owner',
      name: 'canonical-repository',
      url: 'https://github.com/canonical-owner/canonical-repository',
      defaultBranch: 'main',
    },
    branches: ['draft', 'feature/read', 'main'],
  });
});

/** Create a deterministic branch gateway whose metadata identity differs from the input URL. */
function createGateway(
  requests: { readonly owner: string; readonly name: string }[],
): Pick<GitHubRepositoryReadGateway, 'inspectRepositoryAsync'> &
  GitHubRepositoryBranchDiscoveryGateway {
  return {
    inspectRepositoryAsync: () =>
      Promise.resolve({
        id: '42',
        owner: 'canonical-owner',
        name: 'canonical-repository',
        url: 'https://github.com/canonical-owner/canonical-repository',
        defaultBranch: 'main',
      }),
    listRepositoryBranchesAsync: (target) => {
      requests.push(target);
      return Promise.resolve(['draft', 'feature/read']);
    },
  };
}
