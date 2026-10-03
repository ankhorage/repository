import type {
  GitHubRepositoryReadGateway,
  GitHubRepositoryReadMetadata,
  GitHubRepositoryReadTarget,
  GitHubRepositoryRevision,
  GitHubRepositoryTree,
  GitHubRepositoryTreeEntry,
} from '../ports/GitHubRepositoryReadGateway.js';

/*** Create the read-only GitHub gateway used to materialize repository snapshots over HTTPS. */
export function createGitHubHttpRepositoryReadGateway(
  fetcher: typeof fetch = fetch,
): GitHubRepositoryReadGateway {
  return {
    inspectRepositoryAsync: target => inspectRepositoryAsync(fetcher, target),
    resolveRevisionAsync: (target, ref) => resolveRevisionAsync(fetcher, target, ref),
    readTreeAsync: (target, treeSha) => readTreeAsync(fetcher, target, treeSha),
    readFileAsync: (target, revision, path) =>
      readFileAsync(fetcher, target, revision, path),
  };
}

const API_ORIGIN = 'https://api.github.com';
const RAW_ORIGIN = 'https://raw.githubusercontent.com';

/*** Read repository metadata without mutating provider state. */
async function inspectRepositoryAsync(
  fetcher: typeof fetch,
  target: GitHubRepositoryReadTarget,
): Promise<GitHubRepositoryReadMetadata> {
  const value = await requestJsonAsync(
    fetcher,
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}`,
  );
  const record = requireRecord(value, 'repository metadata');
  const defaultBranch = requireString(record.default_branch, 'repository default branch');
  const url = typeof record.html_url === 'string' ? record.html_url : target.url;
  return { defaultBranch, url };
}

/*** Resolve a branch, tag, or commit ref to an immutable commit and tree SHA. */
async function resolveRevisionAsync(
  fetcher: typeof fetch,
  target: GitHubRepositoryReadTarget,
  ref: string,
): Promise<GitHubRepositoryRevision> {
  const value = await requestJsonAsync(
    fetcher,
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(
      target.name,
    )}/commits/${encodeURIComponent(ref)}`,
  );
  const record = requireRecord(value, 'repository revision');
  const commit = requireRecord(record.commit, 'repository commit');
  const tree = requireRecord(commit.tree, 'repository commit tree');
  return {
    commitSha: requireString(record.sha, 'repository commit SHA'),
    treeSha: requireString(tree.sha, 'repository tree SHA'),
  };
}

/*** Read the complete recursive tree for one immutable Git tree SHA. */
async function readTreeAsync(
  fetcher: typeof fetch,
  target: GitHubRepositoryReadTarget,
  treeSha: string,
): Promise<GitHubRepositoryTree> {
  const value = await requestJsonAsync(
    fetcher,
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(
      target.name,
    )}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
  );
  const record = requireRecord(value, 'repository tree');
  if (!Array.isArray(record.tree)) throw new Error('GitHub returned an invalid repository tree.');
  return {
    entries: record.tree.map(entry => parseTreeEntry(entry)),
    truncated: record.truncated === true,
  };
}

/*** Read one file from an immutable GitHub revision without executing repository code. */
async function readFileAsync(
  fetcher: typeof fetch,
  target: GitHubRepositoryReadTarget,
  revision: string,
  path: string,
): Promise<Uint8Array> {
  const encodedPath = path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  const response = await fetcher(
    `${RAW_ORIGIN}/${encodeURIComponent(target.owner)}/${encodeURIComponent(
      target.name,
    )}/${encodeURIComponent(revision)}/${encodedPath}`,
    { headers: requestHeaders(), signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw requestError(response, 'repository file');
  return new Uint8Array(await response.arrayBuffer());
}

/*** Parse one Git tree item while rejecting malformed provider responses. */
function parseTreeEntry(value: unknown): GitHubRepositoryTreeEntry {
  const record = requireRecord(value, 'repository tree entry');
  const type = requireString(record.type, 'repository tree entry type');
  if (type !== 'blob' && type !== 'tree' && type !== 'commit') {
    throw new Error(`GitHub returned an unsupported repository tree entry type: ${type}.`);
  }
  const size = record.size;
  if (size !== undefined && (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)) {
    throw new Error('GitHub returned an invalid repository tree entry size.');
  }
  return {
    mode: requireString(record.mode, 'repository tree entry mode'),
    path: requireString(record.path, 'repository tree entry path'),
    sha: requireString(record.sha, 'repository tree entry SHA'),
    type,
    ...(size === undefined ? {} : { size }),
  };
}

/*** Request GitHub JSON with stable safe errors and optional standard token authentication. */
async function requestJsonAsync(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    headers: requestHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw requestError(response, 'repository metadata');
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new Error('GitHub returned malformed JSON.', { cause: error });
  }
}

/*** Build GitHub request headers without exposing credentials to callers or errors. */
function requestHeaders(): Readonly<Record<string, string>> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': '@ankhorage/repository',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/*** Convert one failed provider response into a credential-free diagnostic. */
function requestError(response: Response, subject: string): Error {
  return new Error(`GitHub ${subject} request failed with HTTP ${response.status}.`);
}

/*** Narrow unknown JSON values to object records. */
function requireRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`GitHub returned invalid ${subject}.`);
  }
  return value as Record<string, unknown>;
}

/*** Require a non-empty provider string field. */
function requireString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`GitHub returned invalid ${subject}.`);
  }
  return value;
}
