import { expect, test } from 'bun:test';

import { createGitHubHttpRepositoryDiscoveryGateway } from './createGitHubHttpRepositoryDiscoveryGateway.js';

test('returns every sorted repository branch page without exposing branch metadata', async () => {
  const urls: string[] = [];
  const gateway = createGitHubHttpRepositoryDiscoveryGateway((url) => {
    urls.push(url);
    return Promise.resolve(
      url.includes('page=2')
        ? { value: [{ name: 'feature/read', protected: false }], link: null }
        : {
            value: [{ name: 'main' }, { name: 'draft' }],
            link: '<https://api.github.com/repos/ankhorage/atlas/branches?per_page=100&page=2>; rel="next"',
          },
    );
  });

  expect(await gateway.listRepositoryBranchesAsync({ owner: 'ankhorage', name: 'atlas' })).toEqual([
    'draft',
    'feature/read',
    'main',
  ]);
  expect(urls).toEqual([
    'https://api.github.com/repos/ankhorage/atlas/branches?per_page=100',
    'https://api.github.com/repos/ankhorage/atlas/branches?per_page=100&page=2',
  ]);
});
