import { createGitHubHttpRepositoryReadGateway } from '../adapters/createGitHubHttpRepositoryReadGateway.js';
import type { GitHubAuthenticatedUserRepositoryInventoryOptions } from '../definitions/GitHubAuthenticatedUserRepositoryInventoryOptions.js';
import type { GitHubAuthenticatedUserRepositoryInventoryResult } from '../definitions/GitHubAuthenticatedUserRepositoryInventoryResult.js';
import { GitHubRepositoryDiscoveryError } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import { discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync } from './discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync.js';

/***
 * List repositories GitHub makes available to one request-scoped authenticated user.
 *
 * The result represents the caller's current GitHub access, which can be partial when OAuth scope,
 * organization approval, SSO, or repository permissions restrict visibility.
 *
 * @security discoverGitHubAuthenticatedUserRepositoriesAsync.test.ts#fails closed for malformed public authenticated inventory credentials without network access
 */
export async function discoverGitHubAuthenticatedUserRepositoriesAsync(
  options: GitHubAuthenticatedUserRepositoryInventoryOptions,
): Promise<GitHubAuthenticatedUserRepositoryInventoryResult> {
  const authentication = requireUserAuthentication(options);
  const gateway = createGitHubHttpRepositoryReadGateway(fetch, {
    authentication,
  });
  return discoverGitHubAuthenticatedUserRepositoriesWithGatewayAsync(options, gateway);
}

/*** Refuse malformed runtime input before it can select the HTTP client's environment credentials. */
function requireUserAuthentication(
  options: GitHubAuthenticatedUserRepositoryInventoryOptions,
): GitHubAuthenticatedUserRepositoryInventoryOptions['authentication'] {
  const authentication = (options as { readonly authentication?: unknown } | null)?.authentication;
  if (
    typeof authentication !== 'object' ||
    authentication === null ||
    Array.isArray(authentication)
  )
    throw new GitHubRepositoryDiscoveryError(
      'permission-denied',
      'Authenticated repository inventory requires a user access token.',
    );
  const candidate = authentication as { readonly accessToken?: unknown; readonly kind?: unknown };
  if (
    candidate.kind !== 'user' ||
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken.trim() === ''
  )
    throw new GitHubRepositoryDiscoveryError(
      'permission-denied',
      'Authenticated repository inventory requires a user access token.',
    );
  return { kind: 'user', accessToken: candidate.accessToken };
}
