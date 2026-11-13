export interface GitHubRepositoryOwner {
  readonly login: string;
  readonly type: 'organization' | 'user';
  readonly url: string;
}

export interface GitHubDiscoveredRepository {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly url: string;
  readonly visibility: 'internal' | 'private' | 'public';
}

/** Read-only provider boundary for GitHub owner resolution and repository discovery. */
export interface GitHubRepositoryDiscoveryGateway {
  resolveOwnerAsync(owner: string, signal?: AbortSignal): Promise<GitHubRepositoryOwner>;
  listOwnerRepositoriesAsync(
    owner: GitHubRepositoryOwner,
    signal?: AbortSignal,
  ): Promise<readonly GitHubDiscoveredRepository[]>;
}

/** Read-only provider boundary for the authenticated user's GitHub repository inventory. */
export interface GitHubAuthenticatedUserRepositoryInventoryGateway {
  listAuthenticatedUserRepositoriesAsync(
    signal?: AbortSignal,
  ): Promise<readonly GitHubDiscoveredRepository[]>;
}
