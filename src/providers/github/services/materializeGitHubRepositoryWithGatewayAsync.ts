import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { GitHubRepositoryMaterializationOptions } from '../definitions/GitHubRepositoryMaterializationOptions.js';
import type { GitHubRepositoryMaterializationResult } from '../definitions/GitHubRepositoryMaterializationResult.js';
import type {
  GitHubRepositoryReadGateway,
  GitHubRepositoryReadTarget,
  GitHubRepositoryTreeEntry,
} from '../ports/GitHubRepositoryReadGateway.js';

/*** Materialize a GitHub repository through an injected read gateway for deterministic testing. */
export async function materializeGitHubRepositoryWithGatewayAsync(
  options: GitHubRepositoryMaterializationOptions,
  gateway: GitHubRepositoryReadGateway,
): Promise<GitHubRepositoryMaterializationResult> {
  const target = parseGitHubRepositoryUrl(options.url);
  const repository = await gateway.inspectRepositoryAsync(target);
  const ref = normalizeRef(options.ref) ?? repository.defaultBranch;
  const revision = await gateway.resolveRevisionAsync(target, ref);
  const tree = await gateway.readTreeAsync(target, revision.treeSha);
  const files = validateTree(tree.entries, tree.truncated);
  const rootPath = await createMaterializationRootAsync(options.destinationPath);

  try {
    await writeFileBatchesAsync(gateway, target, revision.commitSha, rootPath, files);
  } catch (error) {
    await rm(rootPath, { force: true, recursive: true });
    throw error;
  }

  return {
    rootPath,
    revision: revision.commitSha,
    repository: {
      owner: target.owner,
      name: target.name,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
    },
    cleanupAsync: () => rm(rootPath, { force: true, recursive: true }),
  };
}

const MAX_FILE_COUNT = 20_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const WRITE_BATCH_SIZE = 8;

/*** Parse the canonical GitHub repository URL accepted by repository materialization. */
function parseGitHubRepositoryUrl(value: string): GitHubRepositoryReadTarget {
  const url = parseRepositoryUrl(value);
  assertGitHubRepositoryUrl(url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) {
    throw new Error('Repository URL must use https://github.com/<owner>/<repository>.');
  }

  const owner = segments[0] ?? '';
  const repositorySegment = segments[1] ?? '';
  const name = repositorySegment.endsWith('.git')
    ? repositorySegment.slice(0, -4)
    : repositorySegment;
  assertRepositoryIdentity(owner, name);
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}

/*** Parse a repository URL while preserving the original parsing failure as the cause. */
function parseRepositoryUrl(value: string): URL {
  try {
    return new URL(value);
  } catch (error) {
    throw new Error('Repository URL must be a valid GitHub HTTPS URL.', { cause: error });
  }
}

/*** Reject non-GitHub origins, credentials, query strings, and fragments. */
function assertGitHubRepositoryUrl(url: URL): void {
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'github.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Repository URL must use https://github.com/<owner>/<repository>.');
  }
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

/*** Reject incomplete or unexpectedly large remote trees before downloading source bytes. */
function validateTree(
  entries: readonly GitHubRepositoryTreeEntry[],
  truncated: boolean,
): readonly GitHubRepositoryTreeEntry[] {
  if (truncated) {
    throw new Error('GitHub repository tree is truncated and cannot be materialized safely.');
  }
  const files = entries.filter((entry) => entry.type === 'blob');
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(`GitHub repository exceeds the ${MAX_FILE_COUNT} file materialization limit.`);
  }
  if (files.some((entry) => entry.mode === '120000')) {
    throw new Error('GitHub repository symbolic links are not supported by safe materialization.');
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
  return files;
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
