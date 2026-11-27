import type { GitHubRepositoryAuthentication } from './GitHubRepositoryDiscoveryOptions.js';

/** Options for discovering branches visible for one explicit GitHub repository URL. */
export interface GitHubRepositoryBranchDiscoveryOptions {
  readonly url: string;
  /** Defaults to anonymous access so a public branch endpoint cannot inherit server credentials. */
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly signal?: AbortSignal;
}
