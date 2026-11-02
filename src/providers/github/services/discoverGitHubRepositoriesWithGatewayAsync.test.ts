import { expect, test } from 'bun:test';

import type { GitHubRepositoryDiscoveryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import { discoverGitHubRepositoriesWithGatewayAsync } from './discoverGitHubRepositoriesWithGatewayAsync.js';

test.each(['ankhorage', '@ankhorage', 'github.com/ankhorage', 'https://github.com/ankhorage'])(
  'normalizes the GitHub owner source %s',
  async (source) => {
    const requests: string[] = [];
    const result = await discoverGitHubRepositoriesWithGatewayAsync(
      { source },
      createGateway(requests),
    );

    expect(requests).toEqual(['ankhorage']);
    expect(result.owner).toEqual({
      login: 'Ankhorage',
      type: 'organization',
      url: 'https://github.com/Ankhorage',
    });
    expect(result.repositories.map((repository) => repository.name)).toEqual(['atlas', 'zora']);
  },
);

test('preselects a repository URL without narrowing the owner repository list', async () => {
  const result = await discoverGitHubRepositoriesWithGatewayAsync(
    { source: 'https://github.com/ankhorage/zora' },
    createGateway([]),
  );

  expect(result.selectedRepository?.name).toBe('zora');
  expect(result.repositories).toHaveLength(2);
});

test('rejects malformed and cancelled discovery before an adapter request', () => {
  const requests: string[] = [];
  const controller = new AbortController();
  controller.abort();

  expect(
    discoverGitHubRepositoriesWithGatewayAsync(
      { source: 'https://example.com/ankhorage' },
      createGateway(requests),
    ),
  ).rejects.toMatchObject({ code: 'invalid-source' });
  expect(
    discoverGitHubRepositoriesWithGatewayAsync(
      { source: 'ankhorage', signal: controller.signal },
      createGateway(requests),
    ),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(requests).toEqual([]);
});

function createGateway(requests: string[]): GitHubRepositoryDiscoveryGateway {
  return {
    resolveOwnerAsync: (owner) => {
      requests.push(owner);
      return Promise.resolve({
        login: 'Ankhorage',
        type: 'organization',
        url: 'https://github.com/Ankhorage',
      });
    },
    listOwnerRepositoriesAsync: () =>
      Promise.resolve([
        {
          id: '2',
          name: 'zora',
          owner: 'Ankhorage',
          url: 'https://github.com/Ankhorage/zora',
          visibility: 'public',
        },
        {
          id: '1',
          name: 'atlas',
          owner: 'Ankhorage',
          url: 'https://github.com/Ankhorage/atlas',
          visibility: 'public',
        },
      ]),
  };
}
