export interface GitHubRepositoryReadTarget {
  readonly owner: string;
  readonly name: string;
  readonly url: string;
}

export interface GitHubRepositoryReadMetadata {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly defaultBranch: string;
  readonly url: string;
}

export interface GitHubRepositoryRevision {
  readonly commitSha: string;
  readonly treeSha: string;
}

export interface GitHubRepositoryTreeEntry {
  readonly mode: string;
  readonly path: string;
  readonly sha: string;
  readonly size?: number;
  readonly type: 'blob' | 'tree' | 'commit';
}

export interface GitHubRepositoryTree {
  readonly entries: readonly GitHubRepositoryTreeEntry[];
  readonly truncated: boolean;
}

export interface GitHubRepositoryReadGateway {
  inspectRepositoryAsync(
    target: GitHubRepositoryReadTarget,
    signal?: AbortSignal,
  ): Promise<GitHubRepositoryReadMetadata>;
  resolveRevisionAsync(
    target: GitHubRepositoryReadTarget,
    ref: string,
    signal?: AbortSignal,
  ): Promise<GitHubRepositoryRevision>;
  readTreeAsync(
    target: GitHubRepositoryReadTarget,
    treeSha: string,
    signal?: AbortSignal,
  ): Promise<GitHubRepositoryTree>;
  readFileAsync(
    target: GitHubRepositoryReadTarget,
    revision: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
}
