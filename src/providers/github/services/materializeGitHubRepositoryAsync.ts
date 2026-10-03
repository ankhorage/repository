import { createGitHubHttpRepositoryReadGateway } from '../adapters/createGitHubHttpRepositoryReadGateway.js';
import type { GitHubRepositoryMaterializationOptions } from '../definitions/GitHubRepositoryMaterializationOptions.js';
import type { GitHubRepositoryMaterializationResult } from '../definitions/GitHubRepositoryMaterializationResult.js';
import { materializeGitHubRepositoryWithGatewayAsync } from './materializeGitHubRepositoryWithGatewayAsync.js';

/*** Materialize one GitHub repository URL into an isolated local filesystem snapshot. */
export async function materializeGitHubRepositoryAsync(
  options: GitHubRepositoryMaterializationOptions,
): Promise<GitHubRepositoryMaterializationResult> {
  return materializeGitHubRepositoryWithGatewayAsync(
    options,
    createGitHubHttpRepositoryReadGateway(),
  );
}
