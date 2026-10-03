export interface GitHubRepositoryMaterializationOptions {
  readonly url: string;
  readonly ref?: string;
  readonly destinationPath?: string;
}
