import type { GitHubRepositoryBranchDiscoveryOptions } from '../definitions/GitHubRepositoryBranchDiscoveryOptions.js';
import type { GitHubRepositoryBranchDiscoveryResult } from '../definitions/GitHubRepositoryBranchDiscoveryResult.js';
import type { GitHubRepositoryBranchDiscoveryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import type { GitHubRepositoryReadGateway } from '../ports/GitHubRepositoryReadGateway.js';
import { parseGitHubRepositoryUrl } from './parseGitHubRepositoryUrl.js';

/** Discover branches against verified repository metadata rather than caller-provided identity. */
export async function discoverGitHubRepositoryBranchesWithGatewayAsync(
  options: GitHubRepositoryBranchDiscoveryOptions,
  gateway: Pick<GitHubRepositoryReadGateway, 'inspectRepositoryAsync'> &
    GitHubRepositoryBranchDiscoveryGateway,
): Promise<GitHubRepositoryBranchDiscoveryResult> {
  const parsed = parseGitHubRepositoryUrl(options.url);
  const metadata = await gateway.inspectRepositoryAsync(parsed.target, options.signal);
  const discoveredBranches = await gateway.listRepositoryBranchesAsync(
    { owner: metadata.owner, name: metadata.name },
    options.signal,
  );
  return {
    repository: {
      id: metadata.id,
      owner: metadata.owner,
      name: metadata.name,
      url: metadata.url,
      defaultBranch: metadata.defaultBranch,
    },
    branches: includeDefaultBranch(discoveredBranches, metadata.defaultBranch),
  };
}

/** Retain the repository's authoritative default branch even if an incomplete provider page omits it. */
function includeDefaultBranch(
  branches: readonly string[],
  defaultBranch: string,
): readonly string[] {
  return [...new Set([...branches, defaultBranch])].sort((left, right) =>
    left.localeCompare(right),
  );
}
