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
import { parseGitHubRepositoryUrl } from './parseGitHubRepositoryUrl.js';
import { resolveGitHubUrlRevisionAsync } from './resolveGitHubUrlRevisionAsync.js';

/*** Materialize a GitHub repository through an injected read gateway for deterministic testing. */
export async function materializeGitHubRepositoryWithGatewayAsync(
  options: GitHubRepositoryMaterializationOptions,
  gateway: GitHubRepositoryReadGateway,
): Promise<GitHubRepositoryMaterializationResult> {
  const parsed = parseGitHubRepositoryUrl(options.url);
  const repository = await gateway.inspectRepositoryAsync(parsed.target, options.signal);
  const target = { owner: repository.owner, name: repository.name, url: repository.url };
  const explicitRef = normalizeRef(options.ref);
  const revision =
    explicitRef === undefined
      ? await resolveGitHubUrlRevisionAsync(
          gateway,
          parsed,
          target,
          repository.defaultBranch,
          options.signal,
        )
      : {
          ...(await gateway.resolveRevisionAsync(target, explicitRef, options.signal)),
          ref: explicitRef,
        };
  const tree = await gateway.readTreeAsync(target, revision.treeSha, options.signal);
  const validated = validateTree(tree.entries, tree.truncated);
  const rootPath = await createMaterializationRootAsync(options.destinationPath);

  try {
    await writeFileBatchesAsync(
      gateway,
      target,
      revision.commitSha,
      rootPath,
      validated.files,
      options.signal,
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
      owner: repository.owner,
      name: repository.name,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
    },
    cleanupAsync: () => rm(rootPath, { force: true, recursive: true }),
  };
}

const MAX_FILE_COUNT = 20_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const WRITE_BATCH_SIZE = 8;

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
  signal: AbortSignal | undefined,
): Promise<void> {
  const batches = Array.from({ length: Math.ceil(entries.length / WRITE_BATCH_SIZE) }, (_, index) =>
    entries.slice(index * WRITE_BATCH_SIZE, (index + 1) * WRITE_BATCH_SIZE),
  );
  for (const batch of batches) {
    await Promise.all(
      batch.map((entry) =>
        materializeFileAsync(gateway, target, revision, rootPath, entry, signal),
      ),
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
  signal: AbortSignal | undefined,
): Promise<void> {
  const destination = resolveMaterializationPath(rootPath, entry.path);
  const content = await gateway.readFileAsync(target, revision, entry.path, signal);
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
