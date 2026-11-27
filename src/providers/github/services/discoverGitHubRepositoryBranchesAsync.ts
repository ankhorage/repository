import { createGitHubHttpRepositoryReadGateway } from '../adapters/createGitHubHttpRepositoryReadGateway.js';
import type { GitHubRepositoryBranchDiscoveryOptions } from '../definitions/GitHubRepositoryBranchDiscoveryOptions.js';
import type { GitHubRepositoryBranchDiscoveryResult } from '../definitions/GitHubRepositoryBranchDiscoveryResult.js';
import { discoverGitHubRepositoryBranchesWithGatewayAsync } from './discoverGitHubRepositoryBranchesWithGatewayAsync.js';

/** Discover visible GitHub branches through explicit request-scoped authentication. */
export function discoverGitHubRepositoryBranchesAsync(
  options: GitHubRepositoryBranchDiscoveryOptions,
): Promise<GitHubRepositoryBranchDiscoveryResult> {
  return discoverGitHubRepositoryBranchesWithGatewayAsync(
    options,
    createGitHubHttpRepositoryReadGateway(fetch, {
      authentication: options.authentication ?? 'anonymous',
    }),
  );
}
