import type { GitHubRepositoryAuthentication } from './GitHubRepositoryDiscoveryOptions.js';

/** Options for resolving a GitHub repository URL to one immutable revision. */
export interface GitHubRepositoryRevisionResolutionOptions {
  readonly url: string;
  /** Defaults to anonymous access so public resolution cannot inherit server credentials. */
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly signal?: AbortSignal;
}
