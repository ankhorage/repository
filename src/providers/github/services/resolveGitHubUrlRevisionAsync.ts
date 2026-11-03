import { GitHubRepositoryDiscoveryError } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import type {
  GitHubRepositoryReadGateway,
  GitHubRepositoryReadTarget,
} from '../ports/GitHubRepositoryReadGateway.js';
import type { ParsedGitHubRepositoryUrl } from './parseGitHubRepositoryUrl.js';

/** Resolve URL-derived ref candidates, falling back to the repository default branch. */
export async function resolveGitHubUrlRevisionAsync(
  gateway: Pick<GitHubRepositoryReadGateway, 'resolveRevisionAsync'>,
  parsed: ParsedGitHubRepositoryUrl,
  target: GitHubRepositoryReadTarget,
  defaultBranch: string,
  signal: AbortSignal | undefined,
): Promise<{ readonly commitSha: string; readonly treeSha: string; readonly ref: string }> {
  const candidates = parsed.refCandidates.length === 0 ? [defaultBranch] : parsed.refCandidates;
  for (const ref of candidates) {
    try {
      return { ...(await gateway.resolveRevisionAsync(target, ref, signal)), ref };
    } catch (error) {
      if (!isRefNotFoundError(error)) throw error;
    }
  }
  throw new Error('GitHub repository URL does not resolve to a branch, tag, or commit.');
}

/** Identify only ambiguous URL ref failures that may have a trailing repository path. */
function isRefNotFoundError(error: unknown): boolean {
  return (
    error instanceof GitHubRepositoryDiscoveryError &&
    error.code === 'api-failure' &&
    error.message.includes('HTTP 404')
  );
}
