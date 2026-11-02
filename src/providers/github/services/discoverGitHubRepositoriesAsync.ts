import { createGitHubHttpRepositoryReadGateway } from '../adapters/createGitHubHttpRepositoryReadGateway.js';
import type { GitHubRepositoryDiscoveryOptions } from '../definitions/GitHubRepositoryDiscoveryOptions.js';
import type { GitHubRepositoryDiscoveryResult } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import { discoverGitHubRepositoriesWithGatewayAsync } from './discoverGitHubRepositoriesWithGatewayAsync.js';

/** Discover accessible repositories through the canonical anonymous-capable GitHub HTTPS adapter. */
export function discoverGitHubRepositoriesAsync(
  options: GitHubRepositoryDiscoveryOptions,
): Promise<GitHubRepositoryDiscoveryResult> {
  return discoverGitHubRepositoriesWithGatewayAsync(
    options,
    createGitHubHttpRepositoryReadGateway(),
  );
}
