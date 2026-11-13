import type { GitHubAuthenticatedUserRepositoryInventoryOptions } from '../definitions/GitHubAuthenticatedUserRepositoryInventoryOptions.js';
import type { GitHubAuthenticatedUserRepositoryInventoryResult } from '../definitions/GitHubAuthenticatedUserRepositoryInventoryResult.js';
import type { GitHubAuthenticatedUserRepositoryInventoryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';

/*** List authenticated-user repositories through an injected read-only GitHub inventory boundary. */
export async function discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync(
  options: GitHubAuthenticatedUserRepositoryInventoryOptions,
  gateway: GitHubAuthenticatedUserRepositoryInventoryGateway,
): Promise<GitHubAuthenticatedUserRepositoryInventoryResult> {
  return { repositories: await gateway.listAuthenticatedUserRepositoriesAsync(options.signal) };
}
