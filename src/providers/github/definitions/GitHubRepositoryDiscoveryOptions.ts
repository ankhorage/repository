/** An explicit, request-scoped GitHub user credential supplied by the consuming host. */
export interface GitHubRepositoryUserAuthentication {
  readonly kind: 'user';
  readonly accessToken: string;
}

/** Explicit credential policy for GitHub operations that may be exposed through an application endpoint. */
export type GitHubRepositoryAuthentication =
  'anonymous' | 'environment' | GitHubRepositoryUserAuthentication;

/** Options for discovering the repositories visible under one GitHub owner source. */
export interface GitHubRepositoryDiscoveryOptions {
  readonly source: string;
  /** Defaults to anonymous access so a public discovery endpoint cannot inherit server credentials. */
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly signal?: AbortSignal;
}
