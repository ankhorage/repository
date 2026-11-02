import { GitHubRepositoryDiscoveryError } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import type {
  GitHubDiscoveredRepository,
  GitHubRepositoryDiscoveryGateway,
  GitHubRepositoryOwner,
} from '../ports/GitHubRepositoryDiscoveryGateway.js';

type RequestJsonResponseAsync = (
  url: string,
  subject: string,
  signal: AbortSignal | undefined,
) => Promise<{ readonly value: unknown; readonly link: string | null }>;

const API_ORIGIN = 'https://api.github.com';

/** Create the discovery adapter from the shared GitHub HTTP requester. */
export function createGitHubHttpRepositoryDiscoveryGateway(
  requestJsonResponseAsync: RequestJsonResponseAsync,
): GitHubRepositoryDiscoveryGateway {
  return {
    resolveOwnerAsync: (owner, signal) =>
      resolveOwnerAsync(requestJsonResponseAsync, owner, signal),
    listOwnerRepositoriesAsync: (owner, signal) =>
      listOwnerRepositoriesAsync(requestJsonResponseAsync, owner, signal),
  };
}

/** Resolve a login through GitHub rather than inferring whether it names a user or organization. */
async function resolveOwnerAsync(
  requestJsonResponseAsync: RequestJsonResponseAsync,
  owner: string,
  signal: AbortSignal | undefined,
): Promise<GitHubRepositoryOwner> {
  const { value } = await requestJsonResponseAsync(
    `${API_ORIGIN}/users/${encodeURIComponent(owner)}`,
    'owner',
    signal,
  );
  const record = requireRecord(value, 'owner');
  const type = requireString(record.type, 'owner type');
  if (type !== 'User' && type !== 'Organization') {
    throw new GitHubRepositoryDiscoveryError(
      'api-failure',
      'GitHub returned an unsupported owner type.',
    );
  }
  return {
    login: requireString(record.login, 'owner login'),
    type: type === 'Organization' ? 'organization' : 'user',
    url: requireString(record.html_url, 'owner URL'),
  };
}

/** Read every page of repositories visible through GitHub's owner listing endpoints. */
async function listOwnerRepositoriesAsync(
  requestJsonResponseAsync: RequestJsonResponseAsync,
  owner: GitHubRepositoryOwner,
  signal: AbortSignal | undefined,
): Promise<readonly GitHubDiscoveredRepository[]> {
  const route = owner.type === 'organization' ? 'orgs' : 'users';
  let nextUrl: string | undefined =
    `${API_ORIGIN}/${route}/${encodeURIComponent(owner.login)}/repos?per_page=100&type=all&sort=full_name&direction=asc`;
  const repositories = new Map<string, GitHubDiscoveredRepository>();
  while (nextUrl !== undefined) {
    const page = await requestJsonResponseAsync(nextUrl, 'repository list', signal);
    if (!Array.isArray(page.value)) {
      throw new GitHubRepositoryDiscoveryError(
        'api-failure',
        'GitHub returned an invalid repository list.',
      );
    }
    for (const value of page.value) {
      const repository = parseDiscoveredRepository(value);
      repositories.set(repository.id, repository);
    }
    nextUrl = nextPageUrl(page.link);
  }
  return [...repositories.values()].sort(compareRepositories);
}

/** Parse one listed repository without exposing API-only response data to callers. */
function parseDiscoveredRepository(value: unknown): GitHubDiscoveredRepository {
  const record = requireRecord(value, 'repository');
  const { id } = record;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new GitHubRepositoryDiscoveryError(
      'api-failure',
      'GitHub returned an invalid repository ID.',
    );
  }
  const owner = requireRecord(record.owner, 'repository owner');
  return {
    id: String(id),
    name: requireString(record.name, 'repository name'),
    owner: requireString(owner.login, 'repository owner login'),
    url: requireString(record.html_url, 'repository URL'),
    visibility: record.private === true ? 'private' : 'public',
  };
}

/** Select the next GitHub pagination target while rejecting an unexpected cross-origin link. */
function nextPageUrl(link: string | null): string | undefined {
  if (!link) return undefined;
  const match = /<([^>]+)>;\s*rel="next"/u.exec(link);
  if (!match?.[1]) return undefined;
  const url = new URL(match[1]);
  if (url.origin !== API_ORIGIN) {
    throw new GitHubRepositoryDiscoveryError(
      'api-failure',
      'GitHub returned an invalid pagination URL.',
    );
  }
  return url.href;
}

/** Sort repository identities independently of the provider's page ordering. */
function compareRepositories(
  left: GitHubDiscoveredRepository,
  right: GitHubDiscoveredRepository,
): number {
  const leftIdentity = `${left.owner.toLowerCase()}/${left.name.toLowerCase()}`;
  const rightIdentity = `${right.owner.toLowerCase()}/${right.name.toLowerCase()}`;
  return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
}

/** Narrow unknown JSON values to object records. */
function requireRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GitHubRepositoryDiscoveryError('api-failure', `GitHub returned invalid ${subject}.`);
  }
  return Object.fromEntries(Object.entries(value));
}

/** Require a non-empty provider string field. */
function requireString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GitHubRepositoryDiscoveryError('api-failure', `GitHub returned invalid ${subject}.`);
  }
  return value;
}
