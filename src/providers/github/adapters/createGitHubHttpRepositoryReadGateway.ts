import type { GitHubRepositoryDiscoveryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import type {
  GitHubRepositoryReadGateway,
  GitHubRepositoryReadMetadata,
  GitHubRepositoryReadTarget,
  GitHubRepositoryRevision,
  GitHubRepositoryTree,
  GitHubRepositoryTreeEntry,
} from '../ports/GitHubRepositoryReadGateway.js';
import type { GitHubHttpClientOptions } from './createGitHubHttpClient.js';
import { createGitHubHttpClient } from './createGitHubHttpClient.js';
import { createGitHubHttpRepositoryDiscoveryGateway } from './createGitHubHttpRepositoryDiscoveryGateway.js';

const API_ORIGIN = 'https://api.github.com';
const RAW_ORIGIN = 'https://raw.githubusercontent.com';

/*** Create the read-only GitHub gateway used to materialize repository snapshots over HTTPS. */
export function createGitHubHttpRepositoryReadGateway(
  fetcher: typeof fetch = fetch,
  options: GitHubHttpClientOptions = {},
): GitHubRepositoryReadGateway & GitHubRepositoryDiscoveryGateway {
  const client = createGitHubHttpClient(fetcher, options);
  const discoveryGateway = createGitHubHttpRepositoryDiscoveryGateway((url, subject, signal) =>
    client.requestJsonResponseAsync(url, subject, signal),
  );
  return {
    inspectRepositoryAsync: (target, signal) => inspectRepositoryAsync(client, target, signal),
    resolveRevisionAsync: (target, ref, signal) =>
      resolveRevisionAsync(client, target, ref, signal),
    readTreeAsync: (target, treeSha, signal) => readTreeAsync(client, target, treeSha, signal),
    readFileAsync: (target, revision, path, signal) =>
      readFileAsync(client, target, revision, path, signal),
    ...discoveryGateway,
  };
}

/*** Read repository metadata without mutating provider state. */
async function inspectRepositoryAsync(
  client: ReturnType<typeof createGitHubHttpClient>,
  target: GitHubRepositoryReadTarget,
  signal: AbortSignal | undefined,
): Promise<GitHubRepositoryReadMetadata> {
  const value = await client.requestJsonResponseAsync(
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}`,
    'repository metadata',
    signal,
  );
  const record = requireRecord(value.value, 'repository metadata');
  const defaultBranch = requireString(record.default_branch, 'repository default branch');
  const url = typeof record.html_url === 'string' ? record.html_url : target.url;
  return { defaultBranch, url };
}

/*** Resolve a branch, tag, or commit ref to an immutable commit and tree SHA. */
async function resolveRevisionAsync(
  client: ReturnType<typeof createGitHubHttpClient>,
  target: GitHubRepositoryReadTarget,
  ref: string,
  signal: AbortSignal | undefined,
): Promise<GitHubRepositoryRevision> {
  const value = await client.requestJsonResponseAsync(
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}/commits/${encodeURIComponent(ref)}`,
    'repository revision',
    signal,
  );
  const record = requireRecord(value.value, 'repository revision');
  const commit = requireRecord(record.commit, 'repository commit');
  const tree = requireRecord(commit.tree, 'repository commit tree');
  return {
    commitSha: requireString(record.sha, 'repository commit SHA'),
    treeSha: requireString(tree.sha, 'repository tree SHA'),
  };
}

/*** Read the complete recursive tree for one immutable Git tree SHA. */
async function readTreeAsync(
  client: ReturnType<typeof createGitHubHttpClient>,
  target: GitHubRepositoryReadTarget,
  treeSha: string,
  signal: AbortSignal | undefined,
): Promise<GitHubRepositoryTree> {
  const value = await client.requestJsonResponseAsync(
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    'repository tree',
    signal,
  );
  const record = requireRecord(value.value, 'repository tree');
  if (!Array.isArray(record.tree)) throw new Error('GitHub returned an invalid repository tree.');
  return {
    entries: record.tree.map((entry) => parseTreeEntry(entry)),
    truncated: record.truncated === true,
  };
}

/*** Read one file from an immutable GitHub revision without executing repository code. */
async function readFileAsync(
  client: ReturnType<typeof createGitHubHttpClient>,
  target: GitHubRepositoryReadTarget,
  revision: string,
  path: string,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return client.requestBytesAsync(
    `${RAW_ORIGIN}/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}/${encodeURIComponent(revision)}/${encodedPath}`,
    'repository file',
    signal,
  );
}

/*** Parse one Git tree item while rejecting malformed provider responses. */
function parseTreeEntry(value: unknown): GitHubRepositoryTreeEntry {
  const record = requireRecord(value, 'repository tree entry');
  const type = requireString(record.type, 'repository tree entry type');
  if (type !== 'blob' && type !== 'tree' && type !== 'commit')
    throw new Error(`GitHub returned an unsupported repository tree entry type: ${type}.`);
  const { size } = record;
  if (size !== undefined && (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0))
    throw new Error('GitHub returned an invalid repository tree entry size.');
  return {
    mode: requireString(record.mode, 'repository tree entry mode'),
    path: requireString(record.path, 'repository tree entry path'),
    sha: requireString(record.sha, 'repository tree entry SHA'),
    type,
    ...(size === undefined ? {} : { size }),
  };
}

/*** Narrow unknown JSON values to object records. */
function requireRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`GitHub returned invalid ${subject}.`);
  return Object.fromEntries(Object.entries(value));
}

/*** Require a non-empty provider string field. */
function requireString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`GitHub returned invalid ${subject}.`);
  return value;
}
