import type { GitHubRepositoryAuthentication } from './GitHubRepositoryDiscoveryOptions.js';

export interface GitHubRepositoryMaterializationOptions {
  readonly url: string;
  readonly ref?: string;
  readonly destinationPath?: string;
  /** Defaults to anonymous access so public materialization cannot inherit server credentials. */
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly signal?: AbortSignal;
}
