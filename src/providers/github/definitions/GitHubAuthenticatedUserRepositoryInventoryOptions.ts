import type { GitHubRepositoryUserAuthentication } from './GitHubRepositoryDiscoveryOptions.js';

/** Options for listing repositories accessible to one authenticated GitHub user. */
export interface GitHubAuthenticatedUserRepositoryInventoryOptions {
  /** The consuming host supplies this credential for only this inventory request. */
  readonly authentication: GitHubRepositoryUserAuthentication;
  readonly signal?: AbortSignal;
}
