/** A verified GitHub repository identity and the immutable revision selected from its URL. */
export interface GitHubRepositoryRevisionResolutionResult {
  readonly repository: {
    readonly id: string;
    readonly owner: string;
    readonly name: string;
    readonly url: string;
    readonly defaultBranch: string;
  };
  readonly revision: {
    readonly commitSha: string;
    readonly ref: string;
  };
}
