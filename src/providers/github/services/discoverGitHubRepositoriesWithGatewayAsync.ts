import type { GitHubRepositoryDiscoveryOptions } from '../definitions/GitHubRepositoryDiscoveryOptions.js';
import {
  GitHubRepositoryDiscoveryError,
  type GitHubRepositoryDiscoveryResult,
} from '../definitions/GitHubRepositoryDiscoveryResult.js';
import type { GitHubRepositoryDiscoveryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';

interface ParsedGitHubSource {
  readonly owner: string;
  readonly selectedRepositoryName?: string;
}

/** Discover every accessible repository for a normalized GitHub owner source. */
export async function discoverGitHubRepositoriesWithGatewayAsync(
  options: GitHubRepositoryDiscoveryOptions,
  gateway: GitHubRepositoryDiscoveryGateway,
): Promise<GitHubRepositoryDiscoveryResult> {
  const source = parseGitHubSource(options.source);
  throwIfAborted(options.signal);
  const owner = await gateway.resolveOwnerAsync(source.owner, options.signal);
  const repositories = [...(await gateway.listOwnerRepositoriesAsync(owner, options.signal))].sort(
    compareRepositories,
  );
  const selectedRepository = source.selectedRepositoryName
    ? repositories.find(
        (repository) =>
          repository.name.toLowerCase() === source.selectedRepositoryName?.toLowerCase(),
      )
    : undefined;
  return { owner, repositories, ...(selectedRepository ? { selectedRepository } : {}) };
}

/** Preserve a deterministic canonical owner/name ordering across gateway implementations. */
function compareRepositories(
  left: { readonly owner: string; readonly name: string },
  right: { readonly owner: string; readonly name: string },
): number {
  const leftIdentity = `${left.owner.toLowerCase()}/${left.name.toLowerCase()}`;
  const rightIdentity = `${right.owner.toLowerCase()}/${right.name.toLowerCase()}`;
  return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
}

/** Parse supported owner and repository source forms without accepting arbitrary GitHub pages. */
function parseGitHubSource(value: string): ParsedGitHubSource {
  const trimmed = value.trim();
  if (trimmed === '') throw invalidSource();
  if (isOwnerTokenSource(trimmed)) return { owner: normalizeOwner(trimmed) };
  return parseGitHubUrlSource(trimmed);
}

/** Identify a bare owner form before interpreting the remaining input as a URL. */
function isOwnerTokenSource(value: string): boolean {
  return !value.includes('/') && !value.includes(':');
}

/** Parse supported GitHub owner and repository URLs without accepting arbitrary GitHub pages. */
function parseGitHubUrlSource(value: string): ParsedGitHubSource {
  const url = parseSourceUrl(value);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com')
    throw invalidSource();
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
    throw invalidSource();
  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (segments.length < 1 || segments.length > 2) throw invalidSource();
  const [owner = '', repository = undefined] = segments;
  const normalizedOwner = normalizeOwner(owner);
  const selectedRepositoryName =
    repository === undefined ? undefined : normalizeRepositoryName(repository);
  return { owner: normalizedOwner, ...(selectedRepositoryName ? { selectedRepositoryName } : {}) };
}

/** Parse a scheme-less GitHub host form as HTTPS while retaining strict URL validation. */
function parseSourceUrl(value: string): URL {
  try {
    return new URL(value.startsWith('github.com/') ? `https://${value}` : value);
  } catch {
    throw new GitHubRepositoryDiscoveryError('invalid-source', 'GitHub source is invalid.');
  }
}

/** Validate an owner token accepted by GitHub's owner routes. */
function normalizeOwner(value: string): string {
  const normalized = value.startsWith('@') ? value.slice(1) : value;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/u.test(normalized)) {
    throw invalidSource();
  }
  return normalized;
}

/** Validate a repository segment while retaining GitHub's case-insensitive identity. */
function normalizeRepositoryName(value: string): string {
  const normalized = value.endsWith('.git') ? value.slice(0, -4) : value;
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(normalized) || normalized === '.' || normalized === '..') {
    throw invalidSource();
  }
  return normalized;
}

/** Decode one path segment and surface malformed encodings as an invalid source. */
function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw invalidSource();
  }
}

/** Construct the stable caller-facing invalid-source error. */
function invalidSource(): GitHubRepositoryDiscoveryError {
  return new GitHubRepositoryDiscoveryError(
    'invalid-source',
    'GitHub source must be an owner, github.com owner URL, or GitHub repository URL.',
  );
}

/** Stop before starting an adapter request when cancellation has already been requested. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new GitHubRepositoryDiscoveryError(
      'cancelled',
      'GitHub repository discovery was cancelled.',
    );
  }
}
