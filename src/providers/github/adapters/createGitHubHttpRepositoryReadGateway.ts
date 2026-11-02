import { GitHubRepositoryDiscoveryError } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import type { GitHubRepositoryDiscoveryGateway } from '../ports/GitHubRepositoryDiscoveryGateway.js';
import type {
  GitHubRepositoryReadGateway,
  GitHubRepositoryReadMetadata,
  GitHubRepositoryReadTarget,
  GitHubRepositoryRevision,
  GitHubRepositoryTree,
  GitHubRepositoryTreeEntry,
} from '../ports/GitHubRepositoryReadGateway.js';
import { createGitHubHttpRepositoryDiscoveryGateway } from './createGitHubHttpRepositoryDiscoveryGateway.js';

type WaitAsync = (milliseconds: number, signal: AbortSignal | undefined) => Promise<void>;

/*** Create the read-only GitHub gateway used to materialize repository snapshots over HTTPS. */
export function createGitHubHttpRepositoryReadGateway(
  fetcher: typeof fetch = fetch,
  waitAsync: WaitAsync = waitForRetryAsync,
): GitHubRepositoryReadGateway & GitHubRepositoryDiscoveryGateway {
  const discoveryGateway = createGitHubHttpRepositoryDiscoveryGateway((url, subject, signal) =>
    requestJsonResponseAsync(fetcher, waitAsync, url, subject, signal),
  );
  return {
    inspectRepositoryAsync: (target) => inspectRepositoryAsync(fetcher, waitAsync, target),
    resolveRevisionAsync: (target, ref) => resolveRevisionAsync(fetcher, waitAsync, target, ref),
    readTreeAsync: (target, treeSha) => readTreeAsync(fetcher, waitAsync, target, treeSha),
    readFileAsync: (target, revision, path) => readFileAsync(fetcher, target, revision, path),
    ...discoveryGateway,
  };
}

const API_ORIGIN = 'https://api.github.com';
const RAW_ORIGIN = 'https://raw.githubusercontent.com';

/*** Read repository metadata without mutating provider state. */
async function inspectRepositoryAsync(
  fetcher: typeof fetch,
  waitAsync: WaitAsync,
  target: GitHubRepositoryReadTarget,
): Promise<GitHubRepositoryReadMetadata> {
  const value = await requestJsonAsync(
    fetcher,
    waitAsync,
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}`,
    'repository metadata',
  );
  const record = requireRecord(value, 'repository metadata');
  const defaultBranch = requireString(record.default_branch, 'repository default branch');
  const url = typeof record.html_url === 'string' ? record.html_url : target.url;
  return { defaultBranch, url };
}

/*** Resolve a branch, tag, or commit ref to an immutable commit and tree SHA. */
async function resolveRevisionAsync(
  fetcher: typeof fetch,
  waitAsync: WaitAsync,
  target: GitHubRepositoryReadTarget,
  ref: string,
): Promise<GitHubRepositoryRevision> {
  const value = await requestJsonAsync(
    fetcher,
    waitAsync,
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(
      target.name,
    )}/commits/${encodeURIComponent(ref)}`,
    'repository revision',
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
  waitAsync: WaitAsync,
  target: GitHubRepositoryReadTarget,
  treeSha: string,
): Promise<GitHubRepositoryTree> {
  const value = await requestJsonAsync(
    fetcher,
    waitAsync,
    `${API_ORIGIN}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(
      target.name,
    )}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    'repository tree',
  );
  const record = requireRecord(value, 'repository tree');
  if (!Array.isArray(record.tree)) throw new Error('GitHub returned an invalid repository tree.');
  return {
    entries: record.tree.map((entry) => parseTreeEntry(entry)),
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
    .map((segment) => encodeURIComponent(segment))
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
  const { size } = record;
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

/*** Request GitHub JSON with stable errors, bounded retries, and optional cancellation. */
async function requestJsonAsync(
  fetcher: typeof fetch,
  waitAsync: WaitAsync,
  url: string,
  subject: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return (await requestJsonResponseAsync(fetcher, waitAsync, url, subject, signal)).value;
}

/*** Request one JSON response while preserving pagination metadata at the transport boundary. */
async function requestJsonResponseAsync(
  fetcher: typeof fetch,
  waitAsync: WaitAsync,
  url: string,
  subject: string,
  signal: AbortSignal | undefined,
): Promise<{ readonly value: unknown; readonly link: string | null }> {
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    throwIfAborted(signal);
    let response: Response;
    try {
      response = await fetcher(url, { headers: requestHeaders(), signal });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw cancelledError();
      throw new GitHubRepositoryDiscoveryError('api-failure', 'GitHub request failed.');
    }
    if (response.ok) {
      try {
        return { value: await response.json(), link: response.headers.get('link') };
      } catch {
        throw new GitHubRepositoryDiscoveryError('api-failure', 'GitHub returned malformed JSON.');
      }
    }
    const requestFailure = requestError(response, subject);
    if (attempt === 2 || (requestFailure.code !== 'rate-limited' && response.status < 500)) {
      throw requestFailure;
    }
    await waitAsync(retryAfterMilliseconds(response, attempt), signal);
  }
  throw new GitHubRepositoryDiscoveryError(
    'api-failure',
    'GitHub request retry limit was exceeded.',
  );
}

/*** Calculate a retry delay from GitHub headers before exponential fallback. */
function retryAfterMilliseconds(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d+(?:\.\d+)?$/u.test(retryAfter)) return Number(retryAfter) * 1000;
  const reset = response.headers.get('x-ratelimit-reset');
  if (reset && /^\d+$/u.test(reset)) return Math.max(0, Number(reset) * 1000 - Date.now());
  return 250 * 2 ** attempt;
}

/*** Wait for a retry delay while allowing a caller to cancel promptly. */
function waitForRetryAsync(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(cancelledError());
      },
      { once: true },
    );
  });
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

/*** Convert one failed provider response into a credential-free discovery diagnostic. */
function requestError(response: Response, subject: string): GitHubRepositoryDiscoveryError {
  if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') {
    return new GitHubRepositoryDiscoveryError(
      'rate-limited',
      'GitHub rate limit reached. Retry after the reported delay.',
      retryAfterMilliseconds(response, 0),
    );
  }
  if (response.status === 404 && subject === 'owner') {
    return new GitHubRepositoryDiscoveryError('owner-not-found', 'GitHub owner was not found.');
  }
  if (response.status === 401 || response.status === 403) {
    return new GitHubRepositoryDiscoveryError(
      'permission-denied',
      'GitHub denied access to this resource.',
    );
  }
  return new GitHubRepositoryDiscoveryError(
    'api-failure',
    `GitHub ${subject} request failed with HTTP ${response.status}.`,
  );
}

/*** Identify a platform cancellation without depending on one runtime-specific error class. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/*** Construct the stable cancellation error returned from the GitHub adapter boundary. */
function cancelledError(): GitHubRepositoryDiscoveryError {
  return new GitHubRepositoryDiscoveryError(
    'cancelled',
    'GitHub repository discovery was cancelled.',
  );
}

/*** Throw the stable cancellation error before beginning a new provider request. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError();
}

/*** Narrow unknown JSON values to object records. */
function requireRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`GitHub returned invalid ${subject}.`);
  }
  return Object.fromEntries(Object.entries(value));
}

/*** Require a non-empty provider string field. */
function requireString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`GitHub returned invalid ${subject}.`);
  }
  return value;
}
