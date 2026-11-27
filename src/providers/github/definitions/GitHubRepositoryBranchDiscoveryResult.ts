/** Credential-free branch discovery data for one canonical GitHub repository. */
export interface GitHubRepositoryBranchDiscoveryResult {
  readonly repository: {
    readonly id: string;
    readonly owner: string;
    readonly name: string;
    readonly url: string;
    readonly defaultBranch: string;
  };
  readonly branches: readonly string[];
}
