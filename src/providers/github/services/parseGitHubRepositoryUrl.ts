import type { GitHubRepositoryReadTarget } from '../ports/GitHubRepositoryReadGateway.js';

export interface ParsedGitHubRepositoryUrl {
  readonly target: GitHubRepositoryReadTarget;
  readonly refCandidates: readonly string[];
}

/** Parse a normal GitHub repository, tree, blob, or commit URL into repository and ref intent. */
export function parseGitHubRepositoryUrl(value: string): ParsedGitHubRepositoryUrl {
  const url = parseRepositoryUrl(value);
  assertGitHubRepositoryUrl(url);
  const segments = decodePathSegments(url);
  if (segments.length < 2) throw invalidRepositoryUrl();
  const [owner = '', repositorySegment = '', route] = segments;
  const name = repositorySegment.endsWith('.git')
    ? repositorySegment.slice(0, -4)
    : repositorySegment;
  assertRepositoryIdentity(owner, name);
  const routeSegments = segments.slice(3);
  if (route === undefined)
    return {
      target: { owner, name, url: `https://github.com/${owner}/${name}` },
      refCandidates: [],
    };
  if (route === 'commit') {
    if (routeSegments.length !== 1) throw invalidRepositoryUrl();
    return {
      target: { owner, name, url: `https://github.com/${owner}/${name}` },
      refCandidates: [routeSegments[0] ?? ''],
    };
  }
  if (route !== 'tree' && route !== 'blob') throw invalidRepositoryUrl();
  if (routeSegments.length === 0) throw invalidRepositoryUrl();
  return {
    target: { owner, name, url: `https://github.com/${owner}/${name}` },
    refCandidates: createRefCandidates(routeSegments),
  };
}

/** Parse a repository URL while preserving the original parsing failure as the cause. */
function parseRepositoryUrl(value: string): URL {
  try {
    return new URL(value);
  } catch (error) {
    throw new Error('Repository URL must be a valid GitHub HTTPS URL.', { cause: error });
  }
}

/** Reject non-GitHub origins and embedded credentials while ignoring normal page query/anchor state. */
function assertGitHubRepositoryUrl(url: URL): void {
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'github.com' ||
    url.username !== '' ||
    url.password !== ''
  )
    throw invalidRepositoryUrl();
}

/** Decode normal GitHub path segments and reject malformed encoded paths. */
function decodePathSegments(url: URL): readonly string[] {
  try {
    return url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch (error) {
    throw new Error('Repository URL contains an invalid encoded path.', { cause: error });
  }
}

/** Build longest-first ref candidates so slash-containing branch/tag names resolve like GitHub URLs. */
function createRefCandidates(segments: readonly string[]): readonly string[] {
  return Array.from({ length: segments.length }, (_, index) =>
    segments.slice(0, segments.length - index).join('/'),
  );
}

/** Create the consistent public error for unsupported GitHub URL shapes. */
function invalidRepositoryUrl(): Error {
  return new Error('Repository URL must be a GitHub repository, tree, blob, or commit HTTPS URL.');
}

/** Validate canonical GitHub owner and repository path segments. */
function assertRepositoryIdentity(owner: string, name: string): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u.test(owner))
    throw new Error('GitHub repository owner is invalid.');
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(name) || name === '.' || name === '..')
    throw new Error('GitHub repository name is invalid.');
}
