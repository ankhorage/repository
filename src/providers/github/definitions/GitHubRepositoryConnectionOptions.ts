import type { GitHubRepositoryVisibility } from './GitHubRepositoryVisibility.js';

export interface GitHubRepositoryConnectionOptions {
  readonly projectPath?: string;
  readonly owner?: string;
  readonly name?: string;
  readonly visibility?: GitHubRepositoryVisibility;
}
