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

test('falls back from a missing longest URL ref candidate to a shorter ref', async () => {
  const requests: string[] = [];
  const result = await resolveGitHubRepositoryRevisionWithGatewayAsync(
    { url: 'https://github.com/owner/repository/blob/main/src/index.ts' },
    createGateway(requests, refNotFoundError(), 'main'),
  );

  expect(requests).toEqual(['main/src/index.ts', 'main/src', 'main']);
  expect(result.revision.ref).toBe('main');
});

test('propagates an unexpected revision error without trying a shorter URL ref candidate', async () => {
  const requests: string[] = [];
  const unexpected = new Error('GitHub response schema is invalid.');

  await expectFailureAsync(
    () =>
      resolveGitHubRepositoryRevisionWithGatewayAsync(
        { url: 'https://github.com/owner/repository/blob/main/src/index.ts' },
        createGateway(requests, unexpected),
      ),
    (error) => expect(error).toBe(unexpected),
  );
  expect(requests).toEqual(['main/src/index.ts']);
});

test.each([
  [
    'rate-limit',
    new GitHubRepositoryDiscoveryError(
      'rate-limited',
      'GitHub rate limit reached. Retry after the reported delay.',
      1000,
    ),
  ],
  [
    'permission denial',
    new GitHubRepositoryDiscoveryError(
      'permission-denied',
      'GitHub denied access to this resource.',
    ),
  ],
  ['timeout', new GitHubRepositoryDiscoveryError('timeout', 'GitHub request timed out.')],
  [
    'cancellation',
    new GitHubRepositoryDiscoveryError('cancelled', 'GitHub repository operation was cancelled.'),
  ],
])('does not fall back after a %s failure', async (_name, failure) => {
  const requests: string[] = [];
  await expectFailureAsync(
    () =>
      resolveGitHubRepositoryRevisionWithGatewayAsync(
        { url: 'https://github.com/owner/repository/blob/main/src/index.ts' },
        createGateway(requests, failure),
      ),
    (error) => expect(error).toBe(failure),
  );
  expect(requests).toEqual(['main/src/index.ts']);
});

test('reports a URL that has no resolvable ref candidates after genuine 404 responses', async () => {
  const requests: string[] = [];
  await expectFailureAsync(
    () =>
      resolveGitHubRepositoryRevisionWithGatewayAsync(
        { url: 'https://github.com/owner/repository/blob/main/src/index.ts' },
        createGateway(requests, refNotFoundError()),
      ),
    (error) =>
      expect(error).toMatchObject({
        message: 'GitHub repository URL does not resolve to a branch, tag, or commit.',
      }),
  );
  expect(requests).toEqual(['main/src/index.ts', 'main/src', 'main']);
});

/** Create a read gateway that records only revision requests and rejects materialization methods. */
function createGateway(
  requests: string[],
  revisionFailure?: Error,
  acceptedRef?: string,
): GitHubRepositoryReadGateway {
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
      if (acceptedRef === ref)
        return Promise.resolve({ commitSha: 'immutable-sha', treeSha: 'tree-sha' });
      return revisionFailure === undefined
        ? Promise.resolve({ commitSha: 'immutable-sha', treeSha: 'tree-sha' })
        : Promise.reject(revisionFailure);
    },
    readTreeAsync: () => Promise.reject(new Error('Revision resolution must not read a tree.')),
    readFileAsync: () => Promise.reject(new Error('Revision resolution must not read a file.')),
  };
}

function refNotFoundError(): GitHubRepositoryDiscoveryError {
  return new GitHubRepositoryDiscoveryError(
    'api-failure',
    'GitHub repository revision request failed with HTTP 404.',
  );
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
