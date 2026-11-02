import { createGitHubHttpRepositoryReadGateway } from '../adapters/createGitHubHttpRepositoryReadGateway.js';
import type { GitHubRepositoryRevisionResolutionOptions } from '../definitions/GitHubRepositoryRevisionResolutionOptions.js';
import type { GitHubRepositoryRevisionResolutionResult } from '../definitions/GitHubRepositoryRevisionResolutionResult.js';
import { resolveGitHubRepositoryRevisionWithGatewayAsync } from './resolveGitHubRepositoryRevisionWithGatewayAsync.js';

/** Resolve a GitHub URL to its verified identity and immutable commit without materializing it. */
export function resolveGitHubRepositoryRevisionAsync(
  options: GitHubRepositoryRevisionResolutionOptions,
): Promise<GitHubRepositoryRevisionResolutionResult> {
  return resolveGitHubRepositoryRevisionWithGatewayAsync(
    options,
    createGitHubHttpRepositoryReadGateway(fetch, {
      authentication: options.authentication ?? 'anonymous',
    }),
  );
}
