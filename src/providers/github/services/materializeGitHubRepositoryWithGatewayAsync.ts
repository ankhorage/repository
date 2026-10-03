import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { GitHubRepositoryMaterializationOptions } from '../definitions/GitHubRepositoryMaterializationOptions.js';
import type { GitHubRepositoryMaterializationResult } from '../definitions/GitHubRepositoryMaterializationResult.js';
import type {
  GitHubRepositoryReadGateway,
  GitHubRepositoryReadTarget,
  GitHubRepositoryRevision,
  GitHubRepositoryTreeEntry,
} from '../ports/GitHubRepositoryReadGateway.js';

/*** Materialize a GitHub repository through an injected read gateway for deterministic testing. */
export async function materializeGitHubRepositoryWithGatewayAsync(
  options: GitHubRepositoryMaterializationOptions,
  gateway: GitHubRepositoryReadGateway,
): Promise<GitHubRepositoryMaterializationResult> {
  const parsed = parseGitHubRepositoryUrl(options.url);
  const repository = await gateway.inspectRepositoryAsync(parsed.target);
  const explicitRef = normalizeRef(options.ref);
  const revision =
    explicitRef === undefined
      ? await resolveUrlRevisionAsync(gateway, parsed, repository.defaultBranch)
      : await gateway.resolveRevisionAsync(parsed.target, explicitRef);
  const tree = await gateway.readTreeAsync(parsed.target, revision.treeSha);
  const validated = validateTree(tree.entries, tree.truncated);
  const rootPath = await createMaterializationRootAsync(options.destinationPath);

  try {
    await writeFileBatchesAsync(
      gateway,
      parsed.target,
      revision.commitSha,
      rootPath,
      validated.files,
    );
  } catch (error) {
    await rm(rootPath, { force: true, recursive: true });
    throw error;
  }

  return {
    rootPath,
    revision: revision.commitSha,
    diagnostics: validated.diagnostics,
    repository: {
      owner: parsed.target.owner,
      name: parsed.target.name,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
    },
    cleanupAsync: () => rm(rootPath, { force: true, recursive: true }),
  };
}

const MAX_FILE_COUNT = 20_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const WRITE_BATCH_SIZE = 8;

interface ParsedGitHubRepositoryUrl {
  readonly target: GitHubRepositoryReadTarget;
  readonly refCandidates: readonly string[];
}

/*** Parse a normal GitHub repository, tree, blob, or commit URL into repository and ref intent. */
function parseGitHubRepositoryUrl(value: string): ParsedGitHubRepositoryUrl {
  const url = parseRepositoryUrl(value);
  assertGitHubRepositoryUrl(url);
  const segments = decodePathSegments(url);
  if (segments.length < 2) {
    throw invalidRepositoryUrl();
  }

  const owner = segments[0] ?? '';
  const repositorySegment = segments[1] ?? '';
  const name = repositorySegment.endsWith('.git')
    ? repositorySegment.slice(0, -4)
    : repositorySegment;
  assertRepositoryIdentity(owner, name);

  const route = segments[2];
  const routeSegments = segments.slice(3);
  if (route === undefined) {
    return {
      target: { owner, name, url: `https://github.com/${owner}/${name}` },
      refCandidates: [],
    };
  }
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

/*** Parse a repository URL while preserving the original parsing failure as the cause. */
function parseRepositoryUrl(value: string): URL {
  try {
    return new URL(value);
  } catch (error) {
    throw new Error('Repository URL must be a valid GitHub HTTPS URL.', { cause: error });
  }
}

/*** Reject non-GitHub origins and embedded credentials while ignoring normal page query/anchor state. */
function assertGitHubRepositoryUrl(url: URL): void {
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'github.com' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw invalidRepositoryUrl();
  }
}

/*** Decode normal GitHub path segments and reject malformed encoded paths. */
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

/*** Build longest-first ref candidates so slash-containing branch/tag names resolve like GitHub URLs. */
function createRefCandidates(segments: readonly string[]): readonly string[] {
  return Array.from({ length: segments.length }, (_, index) =>
    segments.slice(0, segments.length - index).join('/'),
  );
}

/*** Resolve URL-derived ref candidates, falling back to the repository default branch. */
async function resolveUrlRevisionAsync(
  gateway: GitHubRepositoryReadGateway,
  parsed: ParsedGitHubRepositoryUrl,
  defaultBranch: string,
): Promise<GitHubRepositoryRevision> {
  if (parsed.refCandidates.length === 0) {
    return gateway.resolveRevisionAsync(parsed.target, defaultBranch);
  }

  for (const candidate of parsed.refCandidates) {
    try {
      return await gateway.resolveRevisionAsync(parsed.target, candidate);
    } catch {
      // GitHub tree/blob URLs can contain both slash-containing refs and trailing repository paths.
    }
  }
  throw new Error('GitHub repository URL does not resolve to a branch, tag, or commit.');
}

/*** Create the consistent public error for unsupported GitHub URL shapes. */
function invalidRepositoryUrl(): Error {
  return new Error(
    'Repository URL must be a GitHub repository, tree, blob, or commit HTTPS URL.',
  );
}

/*** Validate canonical GitHub owner and repository path segments. */
function assertRepositoryIdentity(owner: string, name: string): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u.test(owner)) {
    throw new Error('GitHub repository owner is invalid.');
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(name) || name === '.' || name === '..') {
    throw new Error('GitHub repository name is invalid.');
  }
}

/*** Normalize an optional requested ref while rejecting an explicitly empty value. */
function normalizeRef(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized === '') throw new Error('GitHub repository ref must not be empty.');
  return normalized;
}

/*** Reject incomplete or unexpectedly large remote trees while safely omitting symbolic links. */
function validateTree(
  entries: readonly GitHubRepositoryTreeEntry[],
  truncated: boolean,
): {
  readonly files: readonly GitHubRepositoryTreeEntry[];
  readonly diagnostics: GitHubRepositoryMaterializationResult['diagnostics'];
} {
  if (truncated) {
    throw new Error('GitHub repository tree is truncated and cannot be materialized safely.');
  }
  const symlinks = entries.filter((entry) => entry.type === 'blob' && entry.mode === '120000');
  const files = entries.filter((entry) => entry.type === 'blob' && entry.mode !== '120000');
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(`GitHub repository exceeds the ${MAX_FILE_COUNT} file materialization limit.`);
  }
  const totalBytes = files.reduce((sum, entry) => {
    if (entry.size === undefined) {
      throw new Error(`GitHub repository file size is missing for ${entry.path}.`);
    }
    return sum + entry.size;
  }, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('GitHub repository exceeds the 256 MiB materialization limit.');
  }
  return {
    files,
    diagnostics: symlinks.map((entry) => ({
      code: 'symlink-skipped',
      severity: 'warning',
      path: entry.path,
      message: 'Symbolic link skipped during safe GitHub repository materialization.',
    })),
  };
}

/*** Create either an isolated temporary root or one explicitly requested empty destination. */
async function createMaterializationRootAsync(
  destinationPath: string | undefined,
): Promise<string> {
  if (destinationPath === undefined) {
    return mkdtemp(join(tmpdir(), 'ankhorage-repository-'));
  }
  const rootPath = resolve(destinationPath);
  await mkdir(dirname(rootPath), { recursive: true });
  await mkdir(rootPath);
  return rootPath;
}

/*** Download and write bounded groups so large repositories do not fan out unbounded requests. */
async function writeFileBatchesAsync(
  gateway: GitHubRepositoryReadGateway,
  target: GitHubRepositoryReadTarget,
  revision: string,
  rootPath: string,
  entries: readonly GitHubRepositoryTreeEntry[],
): Promise<void> {
  const batches = Array.from({ length: Math.ceil(entries.length / WRITE_BATCH_SIZE) }, (_, index) =>
    entries.slice(index * WRITE_BATCH_SIZE, (index + 1) * WRITE_BATCH_SIZE),
  );
  for (const batch of batches) {
    await Promise.all(
      batch.map((entry) => materializeFileAsync(gateway, target, revision, rootPath, entry)),
    );
  }
}

/*** Materialize one ordinary Git blob beneath the isolated root and preserve executable mode. */
async function materializeFileAsync(
  gateway: GitHubRepositoryReadGateway,
  target: GitHubRepositoryReadTarget,
  revision: string,
  rootPath: string,
  entry: GitHubRepositoryTreeEntry,
): Promise<void> {
  const destination = resolveMaterializationPath(rootPath, entry.path);
  const content = await gateway.readFileAsync(target, revision, entry.path);
  if (entry.size !== content.byteLength) {
    throw new Error(`GitHub repository file size changed while reading ${entry.path}.`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);
  if (entry.mode === '100755') await chmod(destination, 0o755);
}

/*** Resolve one provider path while rejecting traversal outside the materialization root. */
function resolveMaterializationPath(rootPath: string, repositoryPath: string): string {
  if (
    repositoryPath.trim() === '' ||
    repositoryPath.includes('\\') ||
    repositoryPath.startsWith('/') ||
    repositoryPath.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`Unsafe GitHub repository path: ${repositoryPath}.`);
  }
  const destination = resolve(rootPath, ...repositoryPath.split('/'));
  const child = relative(rootPath, destination);
  if (child === '' || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Unsafe GitHub repository path: ${repositoryPath}.`);
  }
  return destination;
}
