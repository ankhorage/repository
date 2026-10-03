export interface GitHubRepositoryMaterializationResult {
  readonly rootPath: string;
  readonly revision: string;
  readonly diagnostics: readonly GitHubRepositoryMaterializationDiagnostic[];
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly url: string;
    readonly defaultBranch: string;
  };
  readonly cleanupAsync: () => Promise<void>;
}

export interface GitHubRepositoryMaterializationDiagnostic {
  readonly code: 'symlink-skipped';
  readonly severity: 'warning';
  readonly path: string;
  readonly message: string;
}
