export type GitHubOwnerType = 'organization' | 'user';

export interface GitHubRepositoryDiscoveryRepository {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly url: string;
  readonly visibility: GitHubRepositoryVisibility;
}

export interface GitHubRepositoryDiscoveryResult {
  readonly owner: {
    readonly login: string;
    readonly type: GitHubOwnerType;
    readonly url: string;
  };
  readonly repositories: readonly GitHubRepositoryDiscoveryRepository[];
  readonly selectedRepository?: GitHubRepositoryDiscoveryRepository;
}

export type GitHubRepositoryDiscoveryErrorCode =
  | 'api-failure'
  | 'cancelled'
  | 'invalid-source'
  | 'owner-not-found'
  | 'permission-denied'
  | 'rate-limited'
  | 'timeout';

/** A stable, credential-free error reported by GitHub repository discovery. */
export class GitHubRepositoryDiscoveryError extends Error {
  public constructor(
    public readonly code: GitHubRepositoryDiscoveryErrorCode,
    message: string,
    public readonly retryAfterMilliseconds?: number,
  ) {
    super(message);
    this.name = 'GitHubRepositoryDiscoveryError';
  }
}
import type { GitHubRepositoryVisibility } from './GitHubRepositoryVisibility.js';
