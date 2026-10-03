export interface GitHubRepositoryMaterializationResult {
  readonly rootPath: string;
  readonly revision: string;
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly url: string;
    readonly defaultBranch: string;
  };
  readonly cleanupAsync: () => Promise<void>;
}
