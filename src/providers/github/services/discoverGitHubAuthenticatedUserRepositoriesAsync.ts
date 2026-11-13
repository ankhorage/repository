import { createGitHubHttpRepositoryReadGateway } from '../adapters/createGitHubHttpRepositoryReadGateway.js';
import type { GitHubAuthenticatedUserRepositoryInventoryOptions } from '../definitions/GitHubAuthenticatedUserRepositoryInventoryOptions.js';
import type { GitHubAuthenticatedUserRepositoryInventoryResult } from '../definitions/GitHubAuthenticatedUserRepositoryInventoryResult.js';
import { discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync } from './discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync.js';

/***
 * List repositories GitHub makes available to one request-scoped authenticated user.
 *
 * The result represents the caller's current GitHub access, which can be partial when OAuth scope,
 * organization approval, SSO, or repository permissions restrict visibility.
 *
 * @security
 */
export async function discoverGitHubAuthenticatedUserRepositoriesAsync(
  options: GitHubAuthenticatedUserRepositoryInventoryOptions,
): Promise<GitHubAuthenticatedUserRepositoryInventoryResult> {
  const gateway = createGitHubHttpRepositoryReadGateway(fetch, {
    authentication: options.authentication,
  });
  return discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync(options, gateway);
}
