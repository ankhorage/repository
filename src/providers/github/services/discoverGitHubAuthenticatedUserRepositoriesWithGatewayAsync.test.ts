import { expect, test } from 'bun:test';

import type { GitHubAuthenticatedUserRepositoryInventoryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import { discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync } from './discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync.js';

test('uses the dedicated authenticated-user inventory boundary without an owner lookup', async () => {
  let calls = 0;
  const result = await discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync(
    { authentication: { kind: 'user', accessToken: 'user-token' } },
    createGateway(() => {
      calls += 1;
    }),
  );

  expect(calls).toBe(1);
  expect(result.repositories.map((repository) => repository.owner)).toEqual([
    'an-owner',
    'a-collaborator',
    'an-organization',
  ]);
});

test('passes cancellation to the authenticated-user inventory boundary', async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  await discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync(
    { authentication: { kind: 'user', accessToken: 'user-token' }, signal: controller.signal },
    {
      listAuthenticatedUserRepositoriesAsync: (signal) => {
        receivedSignal = signal;
        return Promise.resolve([]);
      },
    },
  );
  expect(receivedSignal).toBe(controller.signal);
});

/** Create a multi-owner inventory fixture with no owner-resolution capability. */
function createGateway(onList: () => void): GitHubAuthenticatedUserRepositoryInventoryGateway {
  return {
    listAuthenticatedUserRepositoriesAsync: () => {
      onList();
      return Promise.resolve([
        {
          id: '1',
          name: 'owned',
          owner: 'an-owner',
          url: 'https://github.com/an-owner/owned',
          visibility: 'private',
        },
        {
          id: '2',
          name: 'collaboration',
          owner: 'a-collaborator',
          url: 'https://github.com/a-collaborator/collaboration',
          visibility: 'public',
        },
        {
          id: '3',
          name: 'team',
          owner: 'an-organization',
          url: 'https://github.com/an-organization/team',
          visibility: 'internal',
        },
      ]);
    },
  };
}
