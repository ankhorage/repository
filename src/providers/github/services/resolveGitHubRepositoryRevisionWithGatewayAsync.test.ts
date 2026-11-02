import { expect, test } from 'bun:test';

import { GitHubRepositoryDiscoveryError } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import type { GitHubRepositoryReadGateway } from '../ports/GitHubRepositoryReadGateway.js';
import { resolveGitHubRepositoryRevisionWithGatewayAsync } from './resolveGitHubRepositoryRevisionWithGatewayAsync.js';

test.each([
  ['https://github.com/legacy/example', 'main'],
  ['https://github.com/legacy/example/tree/feature/read', 'feature/read'],
  ['https://github.com/legacy/example/tree/v1.2.3', 'v1.2.3'],
  ['https://github.com/legacy/example/commit/immutable-sha', 'immutable-sha'],
])('resolves %s to its immutable revision', async (url, expectedRef) => {
  const requests: string[] = [];
  const result = await resolveGitHubRepositoryRevisionWithGatewayAsync(
    { url },
    createGateway(requests),
  );
  expect(result).toEqual({
    repository: {
      id: '42',
      owner: 'canonical-owner',
      name: 'renamed-repository',
      url: 'https://github.com/canonical-owner/renamed-repository',
      defaultBranch: 'main',
    },
    revision: { commitSha: 'immutable-sha', ref: expectedRef },
  });
  expect(requests).toEqual([expectedRef]);
});

test('preserves typed GitHub failures and forwards cancellation without materialization calls', async () => {
  const permission = new GitHubRepositoryDiscoveryError(
    'permission-denied',
    'GitHub denied access to this resource.',
  );
  const rateLimit = new GitHubRepositoryDiscoveryError(
    'rate-limited',
    'GitHub rate limit reached. Retry after the reported delay.',
    1000,
  );
  const controller = new AbortController();
  controller.abort();
  await expectFailureAsync(
    () =>
      resolveGitHubRepositoryRevisionWithGatewayAsync(
        { url: 'https://github.com/owner/repository' },
        createGateway([], permission),
      ),
    (error) => expect(error).toBe(permission),
  );
  await expectFailureAsync(
    () =>
      resolveGitHubRepositoryRevisionWithGatewayAsync(
        { url: 'https://github.com/owner/repository' },
        createGateway([], rateLimit),
      ),
    (error) => expect(error).toBe(rateLimit),
  );
  await expectFailureAsync(
    () =>
      resolveGitHubRepositoryRevisionWithGatewayAsync(
        { url: 'https://github.com/owner/repository', signal: controller.signal },
        createGateway([]),
      ),
    (error) => expect(error).toMatchObject({ code: 'cancelled' }),
  );
});

/** Create a read gateway that records only revision requests and rejects materialization methods. */
function createGateway(requests: string[], revisionFailure?: Error): GitHubRepositoryReadGateway {
  return {
    inspectRepositoryAsync: (_target, signal) => {
      if (signal?.aborted)
        return Promise.reject(
          new GitHubRepositoryDiscoveryError(
            'cancelled',
            'GitHub repository operation was cancelled.',
          ),
        );
      return Promise.resolve({
        id: '42',
        owner: 'canonical-owner',
        name: 'renamed-repository',
        url: 'https://github.com/canonical-owner/renamed-repository',
        defaultBranch: 'main',
      });
    },
    resolveRevisionAsync: (_target, ref) => {
      requests.push(ref);
      return revisionFailure === undefined
        ? Promise.resolve({ commitSha: 'immutable-sha', treeSha: 'tree-sha' })
        : Promise.reject(revisionFailure);
    },
    readTreeAsync: () => Promise.reject(new Error('Revision resolution must not read a tree.')),
    readFileAsync: () => Promise.reject(new Error('Revision resolution must not read a file.')),
  };
}

/** Assert an async operation fails with the expected error while keeping rejection handling explicit. */
async function expectFailureAsync(
  operation: () => Promise<unknown>,
  verify: (error: unknown) => void,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    verify(error);
    return;
  }
  throw new Error('Expected the operation to fail.');
}
