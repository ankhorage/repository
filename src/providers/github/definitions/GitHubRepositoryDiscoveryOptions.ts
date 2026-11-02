/** Options for discovering the repositories visible under one GitHub owner source. */
export interface GitHubRepositoryDiscoveryOptions {
  readonly source: string;
  readonly signal?: AbortSignal;
}
