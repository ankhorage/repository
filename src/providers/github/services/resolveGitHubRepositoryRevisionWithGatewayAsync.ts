import type { GitHubRepositoryRevisionResolutionOptions } from '../definitions/GitHubRepositoryRevisionResolutionOptions.js';
import type { GitHubRepositoryRevisionResolutionResult } from '../definitions/GitHubRepositoryRevisionResolutionResult.js';
import type { GitHubRepositoryReadGateway } from '../ports/GitHubRepositoryReadGateway.js';
import { parseGitHubRepositoryUrl } from './parseGitHubRepositoryUrl.js';
import { resolveGitHubUrlRevisionAsync } from './resolveGitHubUrlRevisionAsync.js';

/** Resolve a GitHub URL through an injected read gateway for deterministic testing. */
export async function resolveGitHubRepositoryRevisionWithGatewayAsync(
  options: GitHubRepositoryRevisionResolutionOptions,
  gateway: Pick<GitHubRepositoryReadGateway, 'inspectRepositoryAsync' | 'resolveRevisionAsync'>,
): Promise<GitHubRepositoryRevisionResolutionResult> {
  const parsed = parseGitHubRepositoryUrl(options.url);
  const metadata = await gateway.inspectRepositoryAsync(parsed.target, options.signal);
  const target = { owner: metadata.owner, name: metadata.name, url: metadata.url };
  const revision = await resolveGitHubUrlRevisionAsync(
    gateway,
    parsed,
    target,
    metadata.defaultBranch,
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
    revision: { commitSha: revision.commitSha, ref: revision.ref },
  };
}
