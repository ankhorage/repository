import type { GitHubRepositoryDiscoveryRepository } from './GitHubRepositoryDiscoveryResult.js';

/** The repositories GitHub exposes to one authenticated user under its currently granted access. */
export interface GitHubAuthenticatedUserRepositoryInventoryResult {
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
}
